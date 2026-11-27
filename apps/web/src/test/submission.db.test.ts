// @vitest-environment node
import { createHash, randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Client } from "pg";
import { PROJECTION_CHANGED_CHANNEL, prisma } from "@bloody-roar/database";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { computeDeliveryHash, type DeliveryManifest } from "@bloody-roar/shared/escrow";
import { execute, loadSchema } from "./graphql-execute";
vi.mock("../lib/escrow/chain-time", () => ({ readChainTime: async () => new Date() }));
const randomHex = (n: number) => `0x${randomBytes(n).toString("hex")}`;
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const CREATE = `mutation($issue: ID!, $id: ID, $text: String!) { createSubmissionDraft(issueId: $issue, submissionId: $id, description: $text) { id status deliveryHash } }`;
const PREPARE = `mutation($id: ID!) { prepareSubmitWork(submissionId: $id) { intentId data args { name value } } }`;
const CHANGES = `mutation($id: ID!, $notes: String! = "please revise") { requestChanges(submissionId: $id, notes: $notes) { id changesRequested } }`;
describe.skipIf(!process.env.TEST_DATABASE_URL)("Submission on the test database", () => {
  let client: Awaited<ReturnType<typeof prisma.user.create>>, developer: typeof client, outsider: typeof client;
  let tokenId = "", issueId = "", escrowIdHash = "";
  beforeAll(async () => {
    assertTestDatabase(process.env.TEST_DATABASE_URL);
    const contract = randomHex(20); vi.stubEnv("CHAIN_ID", "31337"); vi.stubEnv("ESCROW_ADDRESS", contract); await loadSchema();
    client = await prisma.user.create({ data: { walletAddress: randomHex(20), role: "CLIENT" } });
    developer = await prisma.user.create({ data: { walletAddress: randomHex(20), role: "DEVELOPER" } });
    outsider = await prisma.user.create({ data: { walletAddress: randomHex(20), role: "DEVELOPER" } });
    tokenId = (await prisma.token.create({ data: { name: "Submission test", symbol: "SUB", address: randomHex(20), decimals: 6, chainId: 31337 } })).id;
    issueId = (await prisma.issue.create({ data: { title: "Submission race", description: "Verify immutable signed delivery manifests", category: "BUG_FIX", status: "IN_PROGRESS", clientId: client.id, developerId: developer.id, tokenId, bountyAmount: "100", requiredSkills: [] } })).id;
    escrowIdHash = randomHex(32); const deadline = new Date(Date.now() + 86400_000);
    await prisma.escrowProjection.create({ data: { issueId, escrowKey: `test-${issueId}`, escrowIdHash, chainId: 31337, contractAddress: contract, client: client.walletAddress, developer: developer.walletAddress, arbiter: randomHex(20), feeRecipient: randomHex(20), amountRaw: "100000000", depositedAt: new Date(), deliveryDeadline: deadline, reviewDeadline: deadline, termsHash: randomHex(32), phase: "FUNDED", lastProjectedBlock: 1n } });
  }, 60_000);
  afterAll(async () => {
    if (issueId) {
      await prisma.notification.deleteMany({ where: { data: { path: ["issueId"], equals: issueId } } });
      await prisma.transactionIntent.deleteMany({ where: { issueId } });
      await prisma.escrowProjection.deleteMany({ where: { escrowIdHash } });
      await prisma.issue.deleteMany({ where: { id: issueId } });
    }
    if (tokenId) await prisma.token.deleteMany({ where: { id: tokenId } });
    await prisma.user.deleteMany({ where: { id: { in: [client.id, developer.id, outsider.id] } } });
    await prisma.$disconnect();
  }, 60_000);
  it("keeps prepared manifests immutable and rejects outsiders", async () => {
    const draft = await execute(CREATE, { user: developer, db: prisma }, { issue: issueId, text: "first delivery" });
    expect(draft.errors).toBeUndefined();
    const initial = draft.data?.createSubmissionDraft as { id: string; deliveryHash: string };
    const prepared = await execute(PREPARE, { user: developer, db: prisma }, { id: initial.id });
    expect(prepared.errors).toBeUndefined();
    const changed = await execute(CREATE, { user: developer, db: prisma }, { issue: issueId, id: initial.id, text: "revised delivery" });
    expect(changed.errors).toBeUndefined();
    const next = changed.data?.createSubmissionDraft as { id: string; deliveryHash: string };
    expect(next.id).not.toBe(initial.id); expect(next.deliveryHash).not.toBe(initial.deliveryHash);
    const original = await prisma.submission.findUniqueOrThrow({ where: { id: initial.id } });
    expect(original.status).toBe("SUPERSEDED");
    expect(original.supersededAt).toBeInstanceOf(Date);
    expect(await prisma.submission.count({ where: { issueId, developerId: developer.id, status: "DRAFT" } })).toBe(1);
    expect(original.deliveryHash).toBe(initial.deliveryHash);
    expect(computeDeliveryHash(original.manifest as DeliveryManifest)).toBe(initial.deliveryHash);
    const denied = await execute(`query($id: String!) { submissions(issueId: $id) { id } }`, { user: outsider, db: prisma }, { id: issueId });
    expect(denied.errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
    await prisma.submission.update({ where: { id: initial.id }, data: { status: "SUBMITTED" } });
    const list = `query($id: String!) { submissions(issueId: $id) { status } }`;
    for (const [user, expected] of [[client, ["SUBMITTED"]], [developer, ["DRAFT", "SUBMITTED"]], [{ ...outsider, role: "ADMIN" }, ["DRAFT", "SUBMITTED"]]] as const) {
      const visible = await execute(list, { user, db: prisma }, { id: issueId });
      expect(visible.errors).toBeUndefined();
      expect((visible.data?.submissions as { status: string }[]).map((row) => row.status).sort()).toEqual(expected);
    }
    await prisma.escrowProjection.update({ where: { escrowIdHash }, data: { deliveryHash: initial.deliveryHash } });
    expect((await execute(CHANGES, { user: outsider, db: prisma }, { id: initial.id })).errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
    const emitted: [string, string, { type?: string; content?: string; conversationId?: string; unreadDelta?: number }][] = [];
    (global as Record<string, unknown>).__socketIO = { to: (room: string) => ({ emit: (event: string, payload: { type?: string; content?: string; conversationId?: string; unreadDelta?: number }) => emitted.push([room, event, payload]) }) };
    const listener = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    const projectionEvents: string[] = [];
    await listener.connect(); listener.on("notification", (msg) => projectionEvents.push(msg.payload ?? "")); await listener.query(`LISTEN ${PROJECTION_CHANGED_CHANNEL}`);
    expect((await execute(CHANGES, { user: client, db: prisma }, { id: initial.id })).errors).toBeUndefined();
    expect(await prisma.notification.count({ where: { userId: developer.id, type: "CHANGES_REQUESTED", data: { path: ["issueId"], equals: issueId } } })).toBe(1);
    expect((await execute(CHANGES, { user: client, db: prisma }, { id: initial.id })).errors).toBeUndefined();
    await new Promise((resolve) => setTimeout(resolve, 200)); await listener.end();
    expect(projectionEvents.filter((payload) => payload.includes(issueId))).toEqual([]);
    const conversation = await prisma.conversation.findFirstOrThrow({ where: { issueId, kind: "ISSUE_WORK" } });
    expect(emitted.map(([room, event, payload]) => [room, event, payload.type ?? payload.conversationId, payload.content ?? payload.unreadDelta])).toEqual([
      [`conv:${conversation.id}`, "message:new", "SYSTEM", "Changes requested"], [`user:${developer.id}`, "inbox:update", conversation.id, 1]]);
    expect((await prisma.message.findMany({ where: { issueId, type: "SYSTEM" } })).map((m) => ({ content: m.content, senderId: m.senderId, clientMessageId: m.clientMessageId })))
      .toEqual([{ content: "Changes requested", senderId: client.id, clientMessageId: `changes:${initial.id}:${sha("please revise")}:sys` }]);
    expect((await execute(CHANGES, { user: client, db: prisma }, { id: initial.id, notes: "also fix the tests" })).errors).toBeUndefined();
    expect((await prisma.message.findMany({ where: { issueId, type: "SYSTEM" }, select: { clientMessageId: true } })).map((m) => m.clientMessageId).sort())
      .toEqual([`changes:${initial.id}:${sha("also fix the tests")}:sys`, `changes:${initial.id}:${sha("please revise")}:sys`].sort());
  }, 60_000);
  it("preserves every prepared hash when edit and prepare race", async () => {
    const created = await execute(CREATE, { user: developer, db: prisma }, { issue: issueId, text: "parallel original" });
    expect(created.errors).toBeUndefined();
    const id = (created.data?.createSubmissionDraft as { id: string }).id;
    const [prepared, edited] = await Promise.all([
      execute(PREPARE, { user: developer, db: prisma }, { id }),
      execute(CREATE, { user: developer, db: prisma }, { issue: issueId, id, text: "parallel revision" }),
    ]);
    expect(!prepared.errors || !edited.errors).toBe(true);
    if (!prepared.errors) {
      const intentId = (prepared.data?.prepareSubmitWork as { intentId: string }).intentId;
      const intent = await prisma.transactionIntent.findUniqueOrThrow({ where: { id: intentId } });
      const deliveryHash = (intent.args as { deliveryHash: string }).deliveryHash;
      const saved = await prisma.submission.findFirst({ where: { issueId, deliveryHash } });
      expect(saved).not.toBeNull();
      expect(computeDeliveryHash(saved!.manifest as DeliveryManifest)).toBe(deliveryHash);
    }
  }, 60_000);

  it("masks a leaked key in the delivery description before hashing and saving it", async () => {
    const key = randomBytes(32).toString("hex");
    const draft = await execute(CREATE, { user: developer, db: prisma }, { issue: issueId, text: `delivery notes PRIVATE_KEY=0x${key}` });
    expect(draft.errors).toBeUndefined();
    const id = (draft.data?.createSubmissionDraft as { id: string }).id;
    const row = await prisma.submission.findUniqueOrThrow({ where: { id } });
    expect(row.description).toContain("[REDACTED]");
    expect(row.description).not.toContain(key);
    const manifest = row.manifest as { descriptionSha256: string };
    expect(manifest.descriptionSha256).toBe(createHash("sha256").update(row.description ?? "", "utf8").digest("hex"));
  });
  it("keeps only the latest draft when submissionId is omitted", async () => {
    const first = await execute(CREATE, { user: developer, db: prisma }, { issue: issueId, text: "draft without id A" });
    const second = await execute(CREATE, { user: developer, db: prisma }, { issue: issueId, text: "draft without id B" });
    expect(first.errors).toBeUndefined();
    expect(second.errors).toBeUndefined();
    const firstId = (first.data?.createSubmissionDraft as { id: string }).id;
    const secondId = (second.data?.createSubmissionDraft as { id: string }).id;
    const old = await prisma.submission.findUniqueOrThrow({ where: { id: firstId } });
    expect(old.status).toBe("SUPERSEDED");
    expect(old.supersededAt).toBeInstanceOf(Date);
    expect(await prisma.submission.findMany({ where: { issueId, developerId: developer.id, status: "DRAFT" }, select: { id: true } }))
      .toEqual([{ id: secondId }]);
  });

  it("rolls back superseding earlier drafts if creating the replacement fails", async () => {
    const created = await execute(CREATE, { user: developer, db: prisma }, { issue: issueId, text: "rollback original" });
    expect(created.errors).toBeUndefined();
    const id = (created.data?.createSubmissionDraft as { id: string }).id;
    const original = await prisma.submission.findUniqueOrThrow({ where: { id } });
    const failingDb = prisma.$extends({ query: { submission: { create() { throw new Error("Replacement creation failed"); } } } });
    const failed = await execute(CREATE, { user: developer, db: failingDb }, { issue: issueId, text: "replacement must fail" });
    expect(failed.errors).toBeDefined();
    expect(await prisma.submission.findUniqueOrThrow({ where: { id } })).toEqual(original);
    expect(await prisma.submission.count({ where: { issueId, developerId: developer.id, status: "DRAFT" } })).toBe(1);
  });

  it("never leaves two drafts after concurrent new-draft requests", async () => {
    const results = await Promise.all([
      execute(CREATE, { user: developer, db: prisma }, { issue: issueId, text: "concurrent draft A" }),
      execute(CREATE, { user: developer, db: prisma }, { issue: issueId, text: "concurrent draft B" }),
    ]);
    expect(results.some((result) => !result.errors)).toBe(true);
    expect(await prisma.submission.count({ where: { issueId, developerId: developer.id, status: "DRAFT" } })).toBe(1);
  });
});
