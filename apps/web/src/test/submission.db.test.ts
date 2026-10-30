// @vitest-environment node
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@bloody-roar/database";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { computeDeliveryHash, type DeliveryManifest } from "@bloody-roar/shared/escrow";
import { execute, loadSchema } from "./graphql-execute";
vi.mock("../lib/escrow/chain-time", () => ({ readChainTime: async () => new Date() }));
const randomHex = (n: number) => `0x${randomBytes(n).toString("hex")}`;
const CREATE = `mutation($issue: ID!, $id: ID, $text: String!) { createSubmissionDraft(issueId: $issue, submissionId: $id, description: $text) { id status deliveryHash } }`;
const PREPARE = `mutation($id: ID!) { prepareSubmitWork(submissionId: $id) { intentId data args { name value } } }`;
const CHANGES = `mutation($id: ID!) { requestChanges(submissionId: $id, notes: "please revise") { id changesRequested } }`;
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
    expect(original.deliveryHash).toBe(initial.deliveryHash);
    expect(computeDeliveryHash(original.manifest as DeliveryManifest)).toBe(initial.deliveryHash);
    const denied = await execute(`query($id: String!) { submissions(issueId: $id) { id } }`, { user: outsider, db: prisma }, { id: issueId });
    expect(denied.errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
    await prisma.submission.update({ where: { id: initial.id }, data: { status: "SUBMITTED" } });
    await prisma.escrowProjection.update({ where: { escrowIdHash }, data: { deliveryHash: initial.deliveryHash } });
    expect((await execute(CHANGES, { user: outsider, db: prisma }, { id: initial.id })).errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
    expect((await execute(CHANGES, { user: client, db: prisma }, { id: initial.id })).errors).toBeUndefined();
    expect(await prisma.notification.count({ where: { userId: developer.id, type: "CHANGES_REQUESTED", data: { path: ["issueId"], equals: issueId } } })).toBe(1);
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
});
