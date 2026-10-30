// @vitest-environment node
import { createHash, randomBytes } from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@bloody-roar/database";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { canonicalJson, computeEvidenceManifestHash, type EvidenceManifest } from "@bloody-roar/shared/escrow";
import { localUploadPath } from "../lib/storage";
import { execute, loadSchema } from "./graphql-execute";

const clock = vi.hoisted(() => ({ now: new Date("2030-01-01T00:00:00Z") }));
vi.mock("../lib/escrow/chain-time", () => ({ readChainTime: async () => clock.now }));
const hex = (n: number) => `0x${randomBytes(n).toString("hex")}`;
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const CREATE = `mutation($issue: ID!, $statement: String!, $files: [ID!], $chat: EvidenceChatRangeInput) {
  createEvidenceManifest(issueId: $issue, statement: $statement, attachmentIds: $files, chatRange: $chat) { id manifestHash storageKey side }
}`;
const PREPARE = (name: string) => `mutation($issue: ID!, $manifest: ID!) { ${name}(issueId: $issue, manifestId: $manifest) { intentId method data } }`;

describe.skipIf(!process.env.TEST_DATABASE_URL)("dispute evidence on test database", () => {
  let client: Awaited<ReturnType<typeof prisma.user.create>>, developer: typeof client, outsider: typeof client;
  let issueId = "", tokenId = "", escrowIdHash = "", attachmentId = "", invalidId = "", message1 = "", message2 = "";
  const keys: string[] = [];
  beforeAll(async () => {
    assertTestDatabase(process.env.TEST_DATABASE_URL);
    const contract = hex(20); vi.stubEnv("CHAIN_ID", "31337"); vi.stubEnv("ESCROW_ADDRESS", contract); await loadSchema();
    client = await prisma.user.create({ data: { walletAddress: hex(20), role: "CLIENT" } });
    developer = await prisma.user.create({ data: { walletAddress: hex(20), role: "DEVELOPER" } });
    outsider = await prisma.user.create({ data: { walletAddress: hex(20), role: "DEVELOPER" } });
    tokenId = (await prisma.token.create({ data: { name: "Evidence", symbol: "EVD", address: hex(20), decimals: 6, chainId: 31337 } })).id;
    issueId = (await prisma.issue.create({ data: { title: "Evidence issue", description: "Dispute evidence test", category: "BUG_FIX", status: "IN_PROGRESS", clientId: client.id, developerId: developer.id, tokenId, bountyAmount: "100", requiredSkills: [] } })).id;
    escrowIdHash = hex(32);
    await prisma.escrowProjection.create({ data: { issueId, escrowKey: `evidence-${issueId}`, escrowIdHash, chainId: 31337, contractAddress: contract, client: client.walletAddress, developer: developer.walletAddress, arbiter: hex(20), feeRecipient: hex(20), amountRaw: "100000000", depositedAt: clock.now, deliveryDeadline: clock.now, reviewDeadline: clock.now, termsHash: hex(32), phase: "FUNDED", lastProjectedBlock: 1n } });
    attachmentId = (await prisma.attachment.create({ data: { issueId, uploaderId: client.id, fileName: "proof.txt", fileUrl: "/proof.txt", fileSize: 5, fileMime: "text/plain", purpose: "EVIDENCE", status: "ATTACHED", sha256: hash("proof") } })).id;
    invalidId = (await prisma.attachment.create({ data: { issueId, uploaderId: developer.id, fileName: "wrong.txt", fileUrl: "/wrong.txt", fileSize: 5, fileMime: "text/plain", purpose: "EVIDENCE", status: "ATTACHED", sha256: hash("proof") } })).id;
    message1 = (await prisma.message.create({ data: { issueId, senderId: client.id, content: "first message", createdAt: new Date("2029-12-31T00:00:00Z") } })).id;
    message2 = (await prisma.message.create({ data: { issueId, senderId: developer.id, content: "second message", createdAt: new Date("2029-12-31T00:01:00Z") } })).id;
  }, 60_000);
  afterAll(async () => {
    for (const key of keys) { const file = localUploadPath(key); if (file) await unlink(file.destination).catch(() => {}); }
    if (issueId) {
      await prisma.transactionIntent.deleteMany({ where: { issueId } });
      await prisma.evidenceManifest.deleteMany({ where: { issueId } });
      await prisma.escrowProjection.deleteMany({ where: { escrowIdHash } });
      await prisma.message.deleteMany({ where: { issueId } });
      await prisma.attachment.deleteMany({ where: { issueId } });
      await prisma.issue.deleteMany({ where: { id: issueId } });
    }
    if (tokenId) await prisma.token.deleteMany({ where: { id: tokenId } });
    await prisma.user.deleteMany({ where: { id: { in: [client?.id, developer?.id, outsider?.id].filter(Boolean) } } });
    await prisma.$disconnect();
  }, 60_000);
  const call = (user: typeof client, statement: string, files: string[] = [], chat?: { fromMessageId: string; toMessageId: string }) =>
    execute(CREATE, { user, db: prisma }, { issue: issueId, statement, files, ...(chat ? { chat } : {}) });
  it("masks and hashes evidence, canonical chat and files, idempotently", async () => {
    const statement = `Evidence statement ${"0x" + "ab".repeat(32)}`;
    const variables = { fromMessageId: message1, toMessageId: message2 };
    const result = await call(client, statement, [attachmentId], variables);
    expect(result.errors).toBeUndefined();
    const output = result.data?.createEvidenceManifest as { id: string; manifestHash: string; storageKey: string; side: string };
    keys.push(output.storageKey);
    expect(output.side).toBe("CLIENT");
    const saved = await prisma.evidenceManifest.findUniqueOrThrow({ where: { id: output.id } });
    const manifest = saved.manifest as EvidenceManifest;
    expect(manifest.statement.text).toContain("[REDACTED]");
    expect(manifest.statement.sha256).toBe(hash(manifest.statement.text));
    const messages = await prisma.message.findMany({ where: { issueId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    expect(manifest.chatRange?.transcriptSha256).toBe(hash(canonicalJson(messages.map(({ id, senderId, content, createdAt }) => ({ id, senderId, content, createdAt: createdAt.toISOString() })))));
    expect(manifest.files).toEqual([{ key: "/proof.txt", sha256: hash("proof"), mime: "text/plain", size: 5, name: "proof.txt" }]);
    expect(computeEvidenceManifestHash(manifest)).toBe(output.manifestHash);
    expect(await readFile(localUploadPath(output.storageKey)!.destination, "utf8")).toBe(canonicalJson(manifest));
    const duplicate = await call(client, statement, [attachmentId], variables);
    expect((duplicate.data?.createEvidenceManifest as { id: string }).id).toBe(output.id);
    const prep = await execute(PREPARE("prepareRaiseDispute"), { user: client, db: prisma }, { issue: issueId, manifest: output.id });
    expect(prep.errors).toBeUndefined();
    expect((prep.data?.prepareRaiseDispute as { method: string }).method).toBe("raiseDispute");
    expect((await execute(PREPARE("prepareRaiseDispute"), { user: developer, db: prisma }, { issue: issueId, manifest: output.id })).errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
  }, 60_000);
  it("rejects outsiders, bad files, invalid ranges and late counter evidence", async () => {
    expect((await call(outsider, "valid statement")).errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
    expect((await call(client, "valid statement", [invalidId])).errors?.[0]?.extensions?.code).toBe("INVALID_ATTACHMENT");
    expect((await call(client, "valid statement", [], { fromMessageId: message2, toMessageId: message1 })).errors).toBeDefined();
    await prisma.escrowProjection.update({ where: { escrowIdHash }, data: { phase: "DISPUTED", disputeRaisedBy: client.walletAddress, disputeRaisedAt: clock.now } });
    expect((await call(client, "valid statement")).errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
    const response = await call(developer, "counter evidence statement");
    expect(response.errors).toBeUndefined();
    const manifest = response.data?.createEvidenceManifest as { id: string; storageKey: string };
    keys.push(manifest.storageKey);
    expect((await execute(PREPARE("prepareSubmitCounterpartyEvidence"), { user: developer, db: prisma }, { issue: issueId, manifest: manifest.id })).errors).toBeUndefined();
    clock.now = new Date(clock.now.getTime() + 72 * 3600_000);
    expect((await call(developer, "counter evidence statement")).errors).toBeDefined();
    expect((await execute(PREPARE("prepareSubmitCounterpartyEvidence"), { user: developer, db: prisma }, { issue: issueId, manifest: manifest.id })).errors).toBeDefined();
  }, 60_000);
});
