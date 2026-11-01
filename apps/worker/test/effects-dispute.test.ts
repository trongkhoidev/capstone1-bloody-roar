import { afterAll, beforeAll, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { prisma } from "@bloody-roar/database";
import { keccakUtf8, type FoldEffect, type Hex } from "@bloody-roar/shared/escrow";
import { applyFoldEffects } from "../src/effects";
import { captureDisputeUndo, captureResolvedUndo, undoDispute, undoResolved } from "../src/indexer/undo";

const hex = (n: number) => `0x${randomBytes(n).toString("hex")}` as Hex;
const chainId = 731000001, contractAddress = hex(20), escrowIdHash = keccakUtf8(hex(32));
let client: Awaited<ReturnType<typeof prisma.user.create>>, developer: typeof client, admin: typeof client;
let issueId = "", tokenId = "";
const evidenceHash = hex(32), counterHash = hex(32), initialHash = hex(32), finalHash = hex(32);
const timestamp = 1_900_000_000n;
const meta = (name: string, seconds = timestamp) => ({ chainId, contractAddress, chainEventId: `dispute-${name}-${escrowIdHash}`, escrowIdHash, blockNumber: 101n, blockHash: hex(32), txHash: hex(32), txIndex: 0, logIndex: 0, blockTimestamp: seconds });
let raiseManifest = "", counterManifest = "";
beforeAll(async () => {
  assertTestDatabase(process.env.TEST_DATABASE_URL);
  client = await prisma.user.create({ data: { walletAddress: hex(20), role: "CLIENT" } });
  developer = await prisma.user.create({ data: { walletAddress: hex(20), role: "DEVELOPER" } });
  admin = await prisma.user.create({ data: { walletAddress: hex(20), role: "ADMIN" } });
  tokenId = (await prisma.token.create({ data: { name: "Dispute", symbol: "DSP", address: hex(20), decimals: 6, chainId } })).id;
  issueId = (await prisma.issue.create({ data: { title: "Dispute test", description: "Event projection", category: "BUG_FIX", status: "IN_PROGRESS", bountyAmount: "100", tokenId, clientId: client.id, developerId: developer.id, requiredSkills: [] } })).id;
  const date = new Date(Number(timestamp) * 1000);
  await prisma.escrowProjection.create({ data: { issueId, escrowKey: `dispute-${issueId}`, escrowIdHash, chainId, contractAddress, client: client.walletAddress, developer: developer.walletAddress, arbiter: hex(20), feeRecipient: hex(20), amountRaw: "100", depositedAt: date, deliveryDeadline: date, reviewDeadline: date, termsHash: hex(32), phase: "FUNDED", lastProjectedBlock: 100n } });
  raiseManifest = (await prisma.evidenceManifest.create({ data: { issueId, side: "CLIENT", submittedById: client.id, manifest: { statement: { text: "Detailed evidence statement" } }, manifestHash: evidenceHash, storageKey: "manifest-raise" } })).id;
  counterManifest = (await prisma.evidenceManifest.create({ data: { issueId, side: "DEVELOPER", submittedById: developer.id, manifest: {}, manifestHash: counterHash, storageKey: "manifest-counter" } })).id;
});
afterAll(async () => {
  await prisma.notification.deleteMany({ where: { userId: { in: [client.id, developer.id, admin.id] }, data: { path: ["issueId"], equals: issueId } } });
  await prisma.reconciliationFinding.deleteMany({ where: { escrowIdHash } });
  await prisma.rulingRecord.deleteMany({ where: { escrowIdHash } });
  await prisma.dispute.deleteMany({ where: { issueId } });
  await prisma.evidenceManifest.deleteMany({ where: { issueId } });
  await prisma.transactionIntent.deleteMany({ where: { issueId } });
  await prisma.claimableBalance.deleteMany({ where: { chainId, contractAddress } });
  await prisma.escrowProjection.deleteMany({ where: { escrowIdHash } });
  await prisma.issue.deleteMany({ where: { id: issueId } });
  await prisma.token.deleteMany({ where: { id: tokenId } });
  await prisma.user.deleteMany({ where: { id: { in: [client.id, developer.id, admin.id] } } });
  await prisma.$disconnect();
});
test("dispute effects follow chain events and reverse in order", async () => {
  const raised: Extract<FoldEffect, { kind: "DISPUTE_RAISED" }> = { kind: "DISPUTE_RAISED", escrowIdHash, raisedBy: client.walletAddress as Hex, evidenceManifestHash: evidenceHash };
  const counter: Extract<FoldEffect, { kind: "COUNTERPARTY_EVIDENCE_SUBMITTED" }> = { kind: "COUNTERPARTY_EVIDENCE_SUBMITTED", escrowIdHash, submittedBy: developer.walletAddress as Hex, evidenceManifestHash: counterHash };
  const initial: Extract<FoldEffect, { kind: "INITIAL_RULING_POSTED" }> = { kind: "INITIAL_RULING_POSTED", escrowIdHash, arbiter: hex(20), clientBps: 3000, decisionHash: initialHash, challengeEndsAt: timestamp + 7n * 86400n };
  const challenged: Extract<FoldEffect, { kind: "RULING_CHALLENGED" }> = { kind: "RULING_CHALLENGED", escrowIdHash, challengedBy: client.walletAddress as Hex, challengedAt: timestamp };
  const final: Extract<FoldEffect, { kind: "FINAL_RULING_POSTED" }> = { kind: "FINAL_RULING_POSTED", escrowIdHash, arbiter: hex(20), clientBps: 7000, decisionHash: finalHash, noticeEndsAt: timestamp + 86400n };
  const effects = [raised, counter, initial, challenged, final] as const;
  const snapshots: Awaited<ReturnType<typeof captureDisputeUndo>>[] = [];
  for (const [index, effect] of effects.entries()) {
    const m = meta(String(index));
    snapshots.push(await prisma.$transaction(async (tx) => { const before = await captureDisputeUndo(tx, escrowIdHash); await applyFoldEffects(tx, [effect], m); return before; }));
    const dispute = await prisma.dispute.findUniqueOrThrow({ where: { issueId } });
    if (index === 0) {
      expect(dispute).toMatchObject({ status: "OPEN", phase: "DISPUTED", raisedById: client.id, reason: "Detailed evidence statement", evidenceManifestHash: evidenceHash });
      expect((await prisma.issue.findUniqueOrThrow({ where: { id: issueId } })).status).toBe("DISPUTED");
      expect((await prisma.evidenceManifest.findUniqueOrThrow({ where: { id: raiseManifest } })).onChainEventId).toBe(m.chainEventId);
      expect(await prisma.notification.count({ where: { type: "DISPUTE_RAISED", data: { path: ["chainEventId"], equals: m.chainEventId } } })).toBeGreaterThanOrEqual(2);
    }
    if (index === 1) { expect(dispute.counterpartyEvidenceHash).toBe(counterHash); expect((await prisma.evidenceManifest.findUniqueOrThrow({ where: { id: counterManifest } })).disputeId).toBe(dispute.id); }
    if (index === 2) { expect(dispute).toMatchObject({ status: "PROPOSED", proposedClientBps: 3000 }); expect(await prisma.reconciliationFinding.count({ where: { escrowIdHash, kind: "UNKNOWN_DECISION_HASH" } })).toBe(1); }
    if (index === 3) expect(dispute).toMatchObject({ status: "CHALLENGED", challengedById: client.id });
    if (index === 4) expect(dispute).toMatchObject({ status: "FINAL_RULING", finalClientBps: 7000 });
  }
  expect(await prisma.rulingRecord.count({ where: { escrowIdHash } })).toBe(2);
  const resolution: Extract<FoldEffect, { kind: "ESCROW_RESOLVED" }> = { kind: "ESCROW_RESOLVED", escrowIdHash, resolution: "RULING", client: client.walletAddress as Hex, developer: developer.walletAddress as Hex, feeRecipient: hex(20), clientAmount: 70n, developerAmount: 29n, platformFee: 1n, decisionHash: finalHash };
  const resolvedMeta = meta("resolved");
  const resolvedUndo = await prisma.$transaction(async (tx) => { const before = await captureResolvedUndo(tx, resolution); await applyFoldEffects(tx, [resolution], resolvedMeta); return before; });
  expect((await prisma.dispute.findUniqueOrThrow({ where: { issueId } })).status).toBe("RESOLVED");
  expect(await prisma.notification.count({ where: { type: "DISPUTE_RESOLVED", data: { path: ["issueId"], equals: issueId } } })).toBe(2);
  expect(await prisma.notification.count({ where: { type: "ESCROW_RESOLVED", data: { path: ["issueId"], equals: issueId } } })).toBe(0);
  await prisma.$transaction((tx) => undoResolved(tx, resolvedMeta.chainEventId, resolvedUndo, chainId, contractAddress));
  expect((await prisma.dispute.findUniqueOrThrow({ where: { issueId } })).status).toBe("FINAL_RULING");
  for (let i = effects.length - 1; i >= 0; i--) await prisma.$transaction((tx) => undoDispute(tx, meta(String(i)).chainEventId, snapshots[i]!));
  expect(await prisma.dispute.findUnique({ where: { issueId } })).toBeNull();
  expect((await prisma.issue.findUniqueOrThrow({ where: { id: issueId } })).status).toBe("IN_PROGRESS");
  expect((await prisma.evidenceManifest.findUniqueOrThrow({ where: { id: raiseManifest } })).onChainEventId).toBeNull();
  expect(await prisma.rulingRecord.count({ where: { escrowIdHash } })).toBe(0);
  expect(await prisma.reconciliationFinding.count({ where: { escrowIdHash } })).toBe(0);
});
