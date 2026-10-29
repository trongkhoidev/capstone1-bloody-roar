import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { computeDeliveryHash } from "@bloody-roar/shared/escrow";
import { execute, loadSchema } from "./graphql-execute";

beforeAll(loadSchema, 60_000);
const actor = { id: "developer", walletAddress: "0x1111111111111111111111111111111111111111", role: "DEVELOPER", isBanned: false };
const mutation = `mutation($issue: ID!, $id: ID, $text: String, $files: [ID!]) { createSubmissionDraft(issueId: $issue, submissionId: $id, description: $text, attachmentIds: $files) { id status } }`;
let issue: { id: string; developerId: string; status: string; githubRepo: string | null };
let projection: { phase: string; developer: string; deliveryDeadline: Date };
let existing: null | { id: string; issueId: string; developerId: string; status: string };
let files: Array<{ id: string; fileUrl: string; sha256: string; fileMime: string; fileSize: number }>;
function db() {
  const tx = { $queryRaw: vi.fn().mockResolvedValue([]), issue: { findUnique: vi.fn(async () => issue) },
    escrowProjection: { findUnique: vi.fn(async () => projection) },
    submission: { findUnique: vi.fn(async () => existing), create: vi.fn(async ({ data }) => data), update: vi.fn(async ({ data, where }) => ({ ...data, id: where.id })) },
    attachment: { findMany: vi.fn(async () => files) } };
  return { tx, $transaction: vi.fn(async (fn: (value: typeof tx) => unknown) => fn(tx)) };
}
async function run(database = db(), variables: Record<string, unknown> = {}) {
  return execute(mutation, { user: actor, db: database }, { issue: "issue", text: "finished", ...variables });
}
beforeEach(() => {
  issue = { id: "issue", developerId: actor.id, status: "IN_PROGRESS", githubRepo: null };
  projection = { phase: "FUNDED", developer: actor.walletAddress, deliveryDeadline: new Date(Date.now() + 60_000) };
  existing = null;
  files = [];
});
describe("createSubmissionDraft", () => {
  it("creates a draft with the canonical delivery manifest", async () => {
    const database = db(); const result = await run(database);
    expect(result.errors).toBeUndefined();
    const data = database.tx.submission.create.mock.calls[0]![0].data;
    expect(data.status).toBe("DRAFT");
    expect(data.manifest).toEqual({ issueId: "issue", submissionId: data.id, descriptionSha256: createHash("sha256").update("finished").digest("hex"), prUrl: "", commitSha: "", attachments: [] });
    expect(data.deliveryHash).toBe(computeDeliveryHash(data.manifest));
  });
  it("allows editing a draft and changes its hash", async () => {
    existing = { id: "draft", issueId: "issue", developerId: actor.id, status: "DRAFT" };
    const database = db(); const result = await run(database, { id: "draft", text: "revised" });
    expect(result.errors).toBeUndefined();
    expect(database.tx.submission.update.mock.calls[0]![0].data.manifest.submissionId).toBe("draft");
  });
  it("rejects a different developer, invalid phase, and expired deadline", async () => {
    issue.developerId = "other"; expect((await run()).errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
    issue.developerId = actor.id; projection.phase = "DISPUTED"; expect((await run()).errors?.[0]?.extensions?.code).toBe("INVALID_PHASE");
    projection.phase = "FUNDED"; projection.deliveryDeadline = new Date(Date.now() - 1000); expect((await run()).errors?.[0]?.extensions?.code).toBe("DEADLINE_PASSED");
  });
  it("rejects editing a submitted version and unattached files", async () => {
    existing = { id: "old", issueId: "issue", developerId: actor.id, status: "SUBMITTED" };
    expect((await run(db(), { id: "old" })).errors?.[0]?.extensions?.code).toBe("SUBMISSION_NOT_DRAFT");
    expect((await run(db(), { files: ["missing"] })).errors?.[0]?.extensions?.code).toBe("INVALID_ATTACHMENT");
  });
});

describe("prepareSubmitWork", () => {
  const query = `mutation($id: ID!) { prepareSubmitWork(submissionId: $id) { method data args { name value } } }`;
  const contract = "0x2222222222222222222222222222222222222222";
  const hash = `0x${"ab".repeat(32)}`;
  function prepareDb() {
    const draft = { id: "draft", issueId: "issue", developerId: actor.id, status: "DRAFT", deliveryHash: hash, manifest: {} };
    const chain = { ...projection, escrowKey: "escrow-1", chainId: 31337, contractAddress: contract };
    const tx = { $queryRaw: vi.fn().mockResolvedValue([]), submission: { findUnique: vi.fn(async () => draft) },
      issue: { findUnique: vi.fn(async () => issue) }, escrowProjection: { findUnique: vi.fn(async () => chain) },
      transactionIntent: { create: vi.fn(async () => ({ id: "intent" })) } };
    return { draft, chain, tx, $transaction: vi.fn(async (fn: (value: typeof tx) => unknown) => fn(tx)) };
  }
  beforeEach(() => { vi.stubEnv("CHAIN_ID", "31337"); vi.stubEnv("ESCROW_ADDRESS", contract); });
  it("prepares the hash for the configured escrow", async () => {
    const database = prepareDb(); const result = await execute(query, { user: actor, db: database }, { id: "draft" });
    expect(result.errors).toBeUndefined();
    expect(result.data?.prepareSubmitWork).toMatchObject({ method: "submitWork", args: [{ name: "escrowId", value: "escrow-1" }, { name: "deliveryHash", value: hash }] });
    expect(database.tx.transactionIntent.create).toHaveBeenCalledOnce();
  });
  it("rejects an expired deadline and a wrong contract", async () => {
    const database = prepareDb(); database.chain.deliveryDeadline = new Date(Date.now() - 1000);
    expect((await execute(query, { user: actor, db: database }, { id: "draft" })).errors?.[0]?.extensions?.code).toBe("DEADLINE_PASSED");
    database.chain.deliveryDeadline = new Date(Date.now() + 60_000); database.chain.contractAddress = actor.walletAddress;
    expect((await execute(query, { user: actor, db: database }, { id: "draft" })).errors?.[0]?.extensions?.code).toBe("ESCROW_CHAIN_MISMATCH");
    expect(database.tx.transactionIntent.create).not.toHaveBeenCalled();
  });
});

describe("requestChanges", () => {
  const query = `mutation($id: ID!, $notes: String!) { requestChanges(submissionId: $id, notes: $notes) { id status } }`;
  const client = { ...actor, id: "client", walletAddress: "0x2222222222222222222222222222222222222222" };
  function reviewDb() {
    const submission = { id: "draft", issueId: "issue", developerId: actor.id, status: "SUBMITTED", deliveryHash: "0xaaa", issue: { clientId: client.id } };
    const chain = { phase: "FUNDED", client: client.walletAddress, deliveryHash: "0xaaa" };
    const tx = { $queryRaw: vi.fn().mockResolvedValue([]), $executeRaw: vi.fn().mockResolvedValue(1),
      submission: { findUnique: vi.fn(async () => submission), update: vi.fn(async () => submission) },
      escrowProjection: { findUnique: vi.fn(async () => chain) },
      notification: { createMany: vi.fn(async () => ({ count: 1 })), findUniqueOrThrow: vi.fn(async () => ({ id: "notification" })) } };
    return { submission, chain, tx, $transaction: vi.fn(async (fn: (value: typeof tx) => unknown) => fn(tx)) };
  }
  it("records notes and notifies the developer", async () => {
    const database = reviewDb();
    const result = await execute(query, { user: client, db: database }, { id: "draft", notes: "please revise" });
    expect(result.errors).toBeUndefined();
    expect(database.tx.submission.update.mock.calls[0]![0].data).toMatchObject({ changesRequested: true, reviewNotes: "please revise" });
    expect(database.tx.notification.createMany.mock.calls[0]![0].data[0]).toMatchObject({ userId: actor.id, type: "CHANGES_REQUESTED" });
    expect(database.tx.$executeRaw).toHaveBeenCalledOnce();
  });
  it("rejects a non-client or a superseded delivery", async () => {
    const database = reviewDb();
    expect((await execute(query, { user: actor, db: database }, { id: "draft", notes: "revise" })).errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
    database.chain.deliveryHash = "0xbb";
    expect((await execute(query, { user: client, db: database }, { id: "draft", notes: "revise" })).errors?.[0]?.extensions?.code).toBe("SUBMISSION_NOT_REVIEWABLE");
    expect(database.tx.notification.createMany).not.toHaveBeenCalled();
  });
});
