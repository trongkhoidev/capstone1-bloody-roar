import { describe } from "bun:test";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { prisma } from "@bloody-roar/database";
import { keccakUtf8, type FoldEffect, type Hex } from "@bloody-roar/shared/escrow";
import { applyFoldEffects } from "../src/effects";
import { captureResolvedUndo, undoResolved } from "../src/indexer/undo";

describe.skipIf(!process.env.TEST_DATABASE_URL)("database", () => {

const address = () => `0x${randomBytes(20).toString("hex")}` as Hex;
const chainId = 730000001, contractAddress = address();
let client: Awaited<ReturnType<typeof prisma.user.create>>, developer: typeof client, fee: typeof client;
let tokenId = "";
const issueIds: string[] = [];
const escrowHashes: string[] = [];
const eventIds: string[] = [];
beforeAll(async () => {
  assertTestDatabase(process.env.TEST_DATABASE_URL);
  client = await prisma.user.create({ data: { walletAddress: address(), role: "CLIENT" } });
  developer = await prisma.user.create({ data: { walletAddress: address(), role: "DEVELOPER" } });
  fee = await prisma.user.create({ data: { walletAddress: address() } });
  tokenId = (await prisma.token.create({ data: { name: "Resolution test", symbol: "RES", address: address(), decimals: 6, chainId } })).id;
});
afterAll(async () => {
  await prisma.notification.deleteMany({ where: { userId: { in: [client.id, developer.id, fee.id] } } });
  await prisma.claimableBalance.deleteMany({ where: { chainId, contractAddress } });
  await prisma.settlementProposal.deleteMany({ where: { escrowIdHash: { in: escrowHashes } } });
  await prisma.escrowProjection.deleteMany({ where: { chainId, contractAddress } });
  await prisma.issue.deleteMany({ where: { id: { in: issueIds } } });
  await prisma.token.deleteMany({ where: { id: tokenId } });
  await prisma.user.deleteMany({ where: { id: { in: [client.id, developer.id, fee.id] } } });
  await prisma.$disconnect();
});
const kinds = ["RELEASE", "MISSED_DELIVERY_REFUND", "REVIEW_TIMEOUT", "SETTLEMENT", "RULING", "ARBITER_TIMEOUT_SPLIT"] as const;
for (const kind of kinds) test(`resolves ${kind} using the amounts in the event`, async () => {
  const issue = await prisma.issue.create({ data: { title: kind, description: "resolution", category: "BUG_FIX", status: "IN_PROGRESS", bountyAmount: "100", tokenId, clientId: client.id, developerId: developer.id, requiredSkills: [] } });
  issueIds.push(issue.id);
  const key = `resolution-${issue.id}`, escrowIdHash = keccakUtf8(key), deadline = new Date(Date.now() + 86400_000);
  escrowHashes.push(escrowIdHash);
  if (kind === "SETTLEMENT") await prisma.settlementProposal.create({ data: { escrowIdHash, proposer: client.walletAddress, clientBps: 2000, status: "PENDING", proposedEventId: `proposal-${issue.id}` } });
  await prisma.escrowProjection.create({ data: { issueId: issue.id, escrowKey: key, escrowIdHash, chainId, contractAddress, client: client.walletAddress, developer: developer.walletAddress, arbiter: address(), feeRecipient: fee.walletAddress, amountRaw: "100", depositedAt: new Date(), deliveryDeadline: deadline, reviewDeadline: deadline, termsHash: `0x${"11".repeat(32)}`, phase: "FUNDED", lastProjectedBlock: 100n } });
  const amounts = kind === "MISSED_DELIVERY_REFUND" ? [100n, 0n, 0n] as const : [20n, 78n, 2n] as const;
  const effect: Extract<FoldEffect, { kind: "ESCROW_RESOLVED" }> = { kind: "ESCROW_RESOLVED", escrowIdHash, resolution: kind, client: client.walletAddress as Hex, developer: developer.walletAddress as Hex, feeRecipient: fee.walletAddress as Hex, clientAmount: amounts[0], developerAmount: amounts[1], platformFee: amounts[2], decisionHash: `0x${"00".repeat(32)}` };
  const meta = { chainId, contractAddress, chainEventId: `resolution-${issue.id}`, escrowIdHash, blockNumber: 101n, blockHash: `0x${"11".repeat(32)}` as Hex, txHash: `0x${"22".repeat(32)}` as Hex, txIndex: 0, logIndex: 0, blockTimestamp: BigInt(Math.floor(Date.now() / 1000)) };
  eventIds.push(meta.chainEventId);
  const before = await prisma.claimableBalance.findMany({ where: { chainId, contractAddress } });
  const undo = await prisma.$transaction(async (tx) => { const snapshot = await captureResolvedUndo(tx, effect); await applyFoldEffects(tx, [effect], meta); return snapshot; });
  expect(await prisma.issue.findUniqueOrThrow({ where: { id: issue.id } })).toMatchObject({ status: "COMPLETED", outcome: kind });
  const balances = await prisma.claimableBalance.findMany({ where: { chainId, contractAddress } });
  for (const [user, amount] of [[client, amounts[0]], [developer, amounts[1]], [fee, amounts[2]]] as const) {
    const prior = before.find((b) => b.address === user.walletAddress)?.amountRaw.toFixed() ?? "0";
    const current = balances.find((b) => b.address === user.walletAddress)?.amountRaw.toFixed();
    expect(BigInt(current ?? "0") - BigInt(prior)).toBe(amount);
    expect(await prisma.notification.count({ where: { userId: user.id, type: "FUNDS_CLAIMABLE", dedupeKey: { startsWith: meta.chainEventId } } })).toBe(amount > 0n ? 1 : 0);
  }
  expect(await prisma.notification.count({ where: { type: kind === "RULING" || kind === "ARBITER_TIMEOUT_SPLIT" ? "DISPUTE_RESOLVED" : "ESCROW_RESOLVED", dedupeKey: { startsWith: meta.chainEventId } } })).toBe(2);
  await prisma.$transaction((tx) => undoResolved(tx, meta.chainEventId, undo, chainId, contractAddress));
  expect(await prisma.issue.findUniqueOrThrow({ where: { id: issue.id } })).toMatchObject({ status: "IN_PROGRESS", outcome: null });
  const restored = await prisma.claimableBalance.findMany({ where: { chainId, contractAddress } });
  for (const balance of restored) expect(balance.amountRaw.toFixed()).toBe(before.find((b) => b.address === balance.address)?.amountRaw.toFixed() ?? "0");
  expect(await prisma.notification.count({ where: { dedupeKey: { startsWith: meta.chainEventId } } })).toBe(0);
});
test("an external escrow still credits and notifies known recipients", async () => {
  const escrowIdHash = keccakUtf8(`external-${randomBytes(8).toString("hex")}`);
  const deadline = new Date(Date.now() + 86400_000);
  await prisma.escrowProjection.create({ data: { escrowIdHash, chainId, contractAddress, client: client.walletAddress, developer: developer.walletAddress,
    arbiter: address(), feeRecipient: fee.walletAddress, amountRaw: "100", depositedAt: new Date(), deliveryDeadline: deadline, reviewDeadline: deadline,
    termsHash: `0x${"11".repeat(32)}`, phase: "FUNDED", orphan: true, lastProjectedBlock: 100n } });
  const effect: Extract<FoldEffect, { kind: "ESCROW_RESOLVED" }> = { kind: "ESCROW_RESOLVED", escrowIdHash, resolution: "RELEASE", client: client.walletAddress as Hex,
    developer: developer.walletAddress as Hex, feeRecipient: fee.walletAddress as Hex, clientAmount: 0n, developerAmount: 98n, platformFee: 2n, decisionHash: `0x${"00".repeat(32)}` };
  const meta = { chainId, contractAddress, chainEventId: `external-${escrowIdHash}`, escrowIdHash, blockNumber: 101n, blockHash: `0x${"11".repeat(32)}` as Hex,
    txHash: `0x${"22".repeat(32)}` as Hex, txIndex: 0, logIndex: 0, blockTimestamp: BigInt(Math.floor(Date.now() / 1000)) };
  const undo = await prisma.$transaction(async (tx) => { const snapshot = await captureResolvedUndo(tx, effect); await applyFoldEffects(tx, [effect], meta); return snapshot; });
  expect(await prisma.notification.count({ where: { type: "FUNDS_CLAIMABLE", dedupeKey: { startsWith: meta.chainEventId } } })).toBe(2);
  await prisma.$transaction((tx) => undoResolved(tx, meta.chainEventId, undo, chainId, contractAddress));
  expect(await prisma.notification.count({ where: { dedupeKey: { startsWith: meta.chainEventId } } })).toBe(0);
});

test("a release counts toward the developer's completed tasks, and undo takes it back", async () => {
  const before = await prisma.user.findUniqueOrThrow({ where: { id: developer.id } });
  const issue = await prisma.issue.create({ data: { title: "reputation", description: "reputation", category: "BUG_FIX", status: "IN_PROGRESS", bountyAmount: "100", tokenId, clientId: client.id, developerId: developer.id, requiredSkills: [] } });
  issueIds.push(issue.id);
  const key = `reputation-${issue.id}`, escrowIdHash = keccakUtf8(key), deadline = new Date(Date.now() + 86400_000);
  escrowHashes.push(escrowIdHash);
  await prisma.escrowProjection.create({ data: { issueId: issue.id, escrowKey: key, escrowIdHash, chainId, contractAddress, client: client.walletAddress, developer: developer.walletAddress,
    arbiter: address(), feeRecipient: fee.walletAddress, amountRaw: "100", depositedAt: new Date(), deliveryDeadline: deadline, reviewDeadline: deadline,
    termsHash: `0x${"11".repeat(32)}`, phase: "FUNDED", lastProjectedBlock: 100n } });
  const effect: Extract<FoldEffect, { kind: "ESCROW_RESOLVED" }> = { kind: "ESCROW_RESOLVED", escrowIdHash, resolution: "RELEASE", client: client.walletAddress as Hex,
    developer: developer.walletAddress as Hex, feeRecipient: fee.walletAddress as Hex, clientAmount: 0n, developerAmount: 98n, platformFee: 2n, decisionHash: `0x${"00".repeat(32)}` };
  const meta = { chainId, contractAddress, chainEventId: `reputation-${issue.id}`, escrowIdHash, blockNumber: 101n, blockHash: `0x${"11".repeat(32)}` as Hex,
    txHash: `0x${"22".repeat(32)}` as Hex, txIndex: 0, logIndex: 0, blockTimestamp: BigInt(Math.floor(Date.now() / 1000)) };
  eventIds.push(meta.chainEventId);
  const undo = await prisma.$transaction(async (tx) => { const snapshot = await captureResolvedUndo(tx, effect); await applyFoldEffects(tx, [effect], meta); return snapshot; });
  expect((await prisma.user.findUniqueOrThrow({ where: { id: developer.id } })).completedTaskCount).toBe(before.completedTaskCount + 1);

  await prisma.$transaction((tx) => undoResolved(tx, meta.chainEventId, undo, chainId, contractAddress));
  expect((await prisma.user.findUniqueOrThrow({ where: { id: developer.id } })).completedTaskCount).toBe(before.completedTaskCount);
});

for (const [raiser, clientBps, loser] of [["client", 0, "client"], ["developer", 10_000, "developer"], ["client", 5_000, null], ["developer", 0, null]] as const)
  test(`a ruling of ${clientBps} on a dispute raised by the ${raiser} marks ${loser ?? "nobody"} as having lost`, async () => {
    const parties = { client: await prisma.user.create({ data: { walletAddress: address(), role: "CLIENT" } }), developer: await prisma.user.create({ data: { walletAddress: address(), role: "DEVELOPER" } }) };
    const issue = await prisma.issue.create({ data: { title: "Ruled dispute", description: "ruling", category: "BUG_FIX", status: "DISPUTED", bountyAmount: "100", tokenId, clientId: parties.client.id, developerId: parties.developer.id, requiredSkills: [] } });
    issueIds.push(issue.id);
    const key = `ruling-${issue.id}`, escrowIdHash = keccakUtf8(key), deadline = new Date(Date.now() + 86400_000), decisionHash = `0x${randomBytes(32).toString("hex")}` as Hex;
    escrowHashes.push(escrowIdHash);
    await prisma.escrowProjection.create({ data: { issueId: issue.id, escrowKey: key, escrowIdHash, chainId, contractAddress, client: parties.client.walletAddress, developer: parties.developer.walletAddress, arbiter: address(), feeRecipient: fee.walletAddress, amountRaw: "100", depositedAt: new Date(), deliveryDeadline: deadline, reviewDeadline: deadline, termsHash: `0x${"11".repeat(32)}`, phase: "FINAL_RULING", lastProjectedBlock: 100n } });
    await prisma.dispute.create({ data: { issueId: issue.id, reason: "ruling test", raisedById: parties[raiser].id, status: "OPEN" } });
    await prisma.rulingRecord.create({ data: { escrowIdHash, kind: "FINAL", clientBps, decisionHash, arbiter: address(), postedAt: new Date(), noticeEndsAt: new Date(), chainEventId: `ruling-record-${issue.id}` } });
    const effect: Extract<FoldEffect, { kind: "ESCROW_RESOLVED" }> = { kind: "ESCROW_RESOLVED", escrowIdHash, resolution: "RULING", client: parties.client.walletAddress as Hex, developer: parties.developer.walletAddress as Hex, feeRecipient: fee.walletAddress as Hex, clientAmount: 10n, developerAmount: 90n, platformFee: 0n, decisionHash };
    const meta = { chainId, contractAddress, chainEventId: `ruling-${issue.id}`, escrowIdHash, blockNumber: 101n, blockHash: `0x${"11".repeat(32)}` as Hex, txHash: `0x${"22".repeat(32)}` as Hex, txIndex: 0, logIndex: 0, blockTimestamp: BigInt(Math.floor(Date.now() / 1000)) };
    eventIds.push(meta.chainEventId);
    const lost = async () => Object.fromEntries(await Promise.all((["client", "developer"] as const).map(async (side) => [side, (await prisma.user.findUniqueOrThrow({ where: { id: parties[side].id } })).disputesLost])));
    const undo = await prisma.$transaction(async (tx) => { const snapshot = await captureResolvedUndo(tx, effect); await applyFoldEffects(tx, [effect], meta); return snapshot; });
    expect(await lost()).toEqual({ client: loser === "client" ? 1 : 0, developer: loser === "developer" ? 1 : 0 });
    await prisma.$transaction((tx) => undoResolved(tx, meta.chainEventId, undo, chainId, contractAddress));
    expect(await lost()).toEqual({ client: 0, developer: 0 });
    await prisma.notification.deleteMany({ where: { userId: { in: [parties.client.id, parties.developer.id] } } });
    await prisma.rulingRecord.deleteMany({ where: { escrowIdHash } });
    await prisma.dispute.deleteMany({ where: { issueId: issue.id } });
    await prisma.escrowProjection.deleteMany({ where: { escrowIdHash } });
    await prisma.claimableBalance.deleteMany({ where: { chainId, contractAddress, address: { in: [parties.client.walletAddress, parties.developer.walletAddress] } } });
    await prisma.issue.deleteMany({ where: { id: issue.id } });
    await prisma.user.deleteMany({ where: { id: { in: [parties.client.id, parties.developer.id] } } });
  });

});
