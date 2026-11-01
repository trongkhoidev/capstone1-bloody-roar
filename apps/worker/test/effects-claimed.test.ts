import { afterAll, beforeAll, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { prisma } from "@bloody-roar/database";
import type { FoldEffect, Hex } from "@bloody-roar/shared/escrow";
import { applyFoldEffects } from "../src/effects";
import { captureClaimedUndo, undoClaimed } from "../src/indexer/undo";
const hex = (bytes: number) => `0x${randomBytes(bytes).toString("hex")}` as Hex;
const chainId = 760000001, contractAddress = hex(20), txHash = hex(32), eventId = `claim-${randomBytes(8).toString("hex")}`;
let user: Awaited<ReturnType<typeof prisma.user.create>>, intentId = "";
const meta = { chainId, contractAddress, txHash, chainEventId: eventId, escrowIdHash: "0x" as Hex, blockNumber: 10n, blockHash: hex(32), txIndex: 0, logIndex: 0, blockTimestamp: 100n };
beforeAll(async () => {
  assertTestDatabase(process.env.TEST_DATABASE_URL);
  user = await prisma.user.create({ data: { walletAddress: hex(20), role: "DEVELOPER" } });
  await prisma.claimableBalance.create({ data: { chainId, contractAddress, address: user.walletAddress, amountRaw: "97500000" } });
  intentId = (await prisma.transactionIntent.create({ data: { userId: user.id, chainId, contractAddress, method: "claim", args: { recipient: user.walletAddress }, txHash, status: "SUBMITTED", expiresAt: new Date(Date.now() + 60_000) } })).id;
});
afterAll(async () => {
  await prisma.notification.deleteMany({ where: { dedupeKey: { startsWith: eventId } } });
  await prisma.transactionIntent.deleteMany({ where: { id: intentId } });
  await prisma.claimableBalance.deleteMany({ where: { chainId, contractAddress } });
  await prisma.user.deleteMany({ where: { id: user.id } }); await prisma.$disconnect();
});
test("claim zeros the exact balance, confirms its intent, notifies and undoes cleanly", async () => {
  const effect: Extract<FoldEffect, { kind: "CLAIMED" }> = { kind: "CLAIMED", recipient: user.walletAddress as Hex, caller: hex(20), amount: 97500000n };
  const snapshot = await prisma.$transaction(async (tx) => {
    const undo = await captureClaimedUndo(tx, chainId, contractAddress, txHash, effect.recipient, effect.amount);
    await applyFoldEffects(tx, [effect], meta); return undo;
  });
  expect((await prisma.claimableBalance.findUniqueOrThrow({ where: { chainId_contractAddress_address: { chainId, contractAddress, address: user.walletAddress } } })).amountRaw.toFixed()).toBe("0");
  expect((await prisma.transactionIntent.findUniqueOrThrow({ where: { id: intentId } })).status).toBe("CONFIRMED");
  expect(await prisma.notification.count({ where: { userId: user.id, type: "PAYMENT_RECEIVED", dedupeKey: { startsWith: eventId } } })).toBe(1);
  await prisma.$transaction((tx) => undoClaimed(tx, eventId, snapshot, chainId, contractAddress));
  expect((await prisma.claimableBalance.findUniqueOrThrow({ where: { chainId_contractAddress_address: { chainId, contractAddress, address: user.walletAddress } } })).amountRaw.toFixed()).toBe("97500000");
  expect((await prisma.transactionIntent.findUniqueOrThrow({ where: { id: intentId } })).status).toBe("SUBMITTED");
  expect(await prisma.notification.count({ where: { dedupeKey: { startsWith: eventId } } })).toBe(0);
});
test("refuses a claim whose amount does not match the indexed balance", async () => {
  const effect: FoldEffect = { kind: "CLAIMED", recipient: user.walletAddress as Hex, caller: hex(20), amount: 1n };
  await expect(prisma.$transaction((tx) => applyFoldEffects(tx, [effect], meta))).rejects.toThrow("does not match indexed claimable balance");
  expect((await prisma.claimableBalance.findUniqueOrThrow({ where: { chainId_contractAddress_address: { chainId, contractAddress, address: user.walletAddress } } })).amountRaw.toFixed()).toBe("97500000");
});
