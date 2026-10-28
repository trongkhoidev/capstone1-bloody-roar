import { afterAll, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { prisma } from "@bloody-roar/database";
import { keccakUtf8, type FoldEffect } from "@bloody-roar/shared/escrow";
import { applyFoldEffects } from "../src/effects";

const run = randomBytes(4).toString("hex");
const DAY_MS = 86_400_000;
const CHAIN_ID = 84532;
const CONTRACT = `0x${randomBytes(20).toString("hex")}`;
const address = () => `0x${randomBytes(20).toString("hex")}`;
const hash32 = () => `0x${randomBytes(32).toString("hex")}`;
const seconds = (date: Date) => BigInt(Math.floor(date.getTime() / 1000));
const now = new Date();
const deadline = new Date(now.getTime() + 30 * DAY_MS);

const client = await prisma.user.create({ data: { walletAddress: address(), role: "CLIENT" } });
const developer = await prisma.user.create({ data: { walletAddress: address(), role: "DEVELOPER" } });
const rival = await prisma.user.create({ data: { walletAddress: address(), role: "DEVELOPER" } });
const admin = await prisma.user.create({ data: { walletAddress: address(), role: "ADMIN" } });
const userIds = [client.id, developer.id, rival.id, admin.id];
const issueIds: string[] = [];
const tokenIds: string[] = [];
const escrowKeys: string[] = [];
const escrowHashes: string[] = [];

// Một bài toán có reservation đã nối với ứng viên; trả về đủ id để kiểm tra sau
async function scenario(options: {
  reservationStatus: "AWAITING_FUNDING" | "EXPIRED";
  issueStatus: "AWAITING_FUNDING" | "OPEN";
}) {
  const token = await prisma.token.create({
    data: {
      symbol: "TFX",
      name: "Effect test token",
      address: address(),
      decimals: 6,
      chainId: CHAIN_ID,
    },
  });
  tokenIds.push(token.id);
  const issue = await prisma.issue.create({
    data: {
      title: `Effect test ${run} ${issueIds.length}`,
      description: "Effect test bounty for the FUNDED deposit path.",
      category: "BUG_FIX",
      status: options.issueStatus,
      bountyAmount: "100",
      tokenId: token.id,
      clientId: client.id,
      requiredSkills: [],
    },
  });
  issueIds.push(issue.id);
  const application = await prisma.application.create({
    data: { issueId: issue.id, developerId: developer.id, status: "PENDING" },
  });
  const rivalApplication = await prisma.application.create({
    data: { issueId: issue.id, developerId: rival.id, status: "PENDING" },
  });
  const escrowKey = `br_${issue.id}_1`;
  const escrowIdHash = keccakUtf8(escrowKey);
  escrowKeys.push(escrowKey);
  escrowHashes.push(escrowIdHash);
  const termsHash = hash32();
  const reservation = await prisma.fundingReservation.create({
    data: {
      issueId: issue.id,
      applicationId: application.id,
      clientId: client.id,
      developerId: developer.id,
      escrowKey,
      escrowIdHash,
      chainId: CHAIN_ID,
      contractAddress: CONTRACT,
      tokenAddress: token.address,
      amountRaw: "100000000",
      deliveryDeadline: deadline,
      termsHash,
      termsVersion: 1,
      status: options.reservationStatus,
      expiresAt: new Date(now.getTime() + 24 * 3_600_000),
    },
  });
  await prisma.transactionIntent.create({
    data: {
      userId: client.id,
      issueId: issue.id,
      escrowKey,
      chainId: CHAIN_ID,
      contractAddress: CONTRACT,
      method: "deposit",
      args: { escrowId: escrowKey },
      status: "SUBMITTED",
      expiresAt: new Date(now.getTime() + 30 * 60_000),
    },
  });
  const effect = (overrides: Partial<Extract<FoldEffect, { kind: "FUNDED" }>> = {}): FoldEffect => ({
    kind: "FUNDED",
    escrowIdHash,
    client: client.walletAddress as `0x${string}`,
    developer: developer.walletAddress as `0x${string}`,
    arbiter: address() as `0x${string}`,
    feeRecipient: address() as `0x${string}`,
    amount: 100_000_000n,
    deliveryDeadline: seconds(deadline),
    termsHash: termsHash as `0x${string}`,
    ...overrides,
  });
  return { issue, application, rivalApplication, reservation, escrowIdHash, effect };
}

let eventCount = 0;
function meta(escrowIdHash: string) {
  eventCount += 1;
  return {
    chainId: CHAIN_ID,
    contractAddress: CONTRACT as `0x${string}`,
    blockNumber: 500n,
    blockHash: hash32() as `0x${string}`,
    txHash: hash32() as `0x${string}`,
    txIndex: 0,
    logIndex: 0,
    blockTimestamp: seconds(now),
    chainEventId: `evt-${run}-${eventCount}`,
    escrowIdHash: escrowIdHash as `0x${string}`,
  };
}

function apply(effect: FoldEffect, eventMeta: ReturnType<typeof meta>) {
  return prisma.$transaction((tx) => applyFoldEffects(tx, [effect], eventMeta));
}

// Thông báo của các event trong test này (mọi chainEventId bắt đầu bằng evt-{run}-)
function notificationsFor(eventMeta: ReturnType<typeof meta>) {
  return prisma.notification.findMany({
    where: { dedupeKey: { startsWith: `${eventMeta.chainEventId}:` } },
    select: { userId: true, type: true },
  });
}

test("accepts a deposit that matches the reservation (BE-36)", async () => {
  const s = await scenario({ reservationStatus: "AWAITING_FUNDING", issueStatus: "AWAITING_FUNDING" });
  const eventMeta = meta(s.escrowIdHash);

  await apply(s.effect(), eventMeta);

  const issue = await prisma.issue.findUniqueOrThrow({ where: { id: s.issue.id } });
  expect(issue.status).toBe("IN_PROGRESS");
  expect(issue.developerId).toBe(developer.id);
  expect((await prisma.application.findUniqueOrThrow({ where: { id: s.application.id } })).status).toBe(
    "ACCEPTED",
  );
  expect((await prisma.application.findUniqueOrThrow({ where: { id: s.rivalApplication.id } })).status).toBe(
    "REJECTED",
  );
  const reservation = await prisma.fundingReservation.findUniqueOrThrow({ where: { id: s.reservation.id } });
  expect(reservation.status).toBe("FUNDED");
  expect(reservation.fundedAt).not.toBeNull();
  const projection = await prisma.escrowProjection.findUniqueOrThrow({
    where: { escrowIdHash: s.escrowIdHash },
  });
  expect(projection).toMatchObject({
    issueId: s.issue.id,
    reservationId: s.reservation.id,
    phase: "FUNDED",
    arbiter: expect.any(String),
    projectionVersion: 1,
  });
  expect(projection.amountRaw.toFixed()).toBe("100000000");
  const intent = await prisma.transactionIntent.findFirstOrThrow({
    where: { escrowKey: s.reservation.escrowKey },
  });
  expect(intent).toMatchObject({ status: "CONFIRMED", confirmedByEventId: eventMeta.chainEventId });
  expect(await notificationsFor(eventMeta)).toEqual(
    expect.arrayContaining([
      { userId: client.id, type: "DEPOSIT_CONFIRMED" },
      { userId: developer.id, type: "DEPOSIT_CONFIRMED" },
    ]),
  );
});

test("replaying the same event does not notify twice", async () => {
  const s = await scenario({ reservationStatus: "AWAITING_FUNDING", issueStatus: "AWAITING_FUNDING" });
  const eventMeta = meta(s.escrowIdHash);

  await apply(s.effect(), eventMeta);
  await apply(s.effect(), eventMeta);

  expect(await notificationsFor(eventMeta)).toHaveLength(2);
});

test("marks a deposit with a different amount as mismatched and reopens the issue (BE-66c)", async () => {
  const s = await scenario({ reservationStatus: "AWAITING_FUNDING", issueStatus: "AWAITING_FUNDING" });
  const eventMeta = meta(s.escrowIdHash);

  await apply(s.effect({ amount: 99_000_000n }), eventMeta);

  expect(
    (await prisma.fundingReservation.findUniqueOrThrow({ where: { id: s.reservation.id } })).status,
  ).toBe("MISMATCHED");
  expect((await prisma.issue.findUniqueOrThrow({ where: { id: s.issue.id } })).status).toBe("OPEN");
  expect((await prisma.issue.findUniqueOrThrow({ where: { id: s.issue.id } })).developerId).toBeNull();
  expect(await prisma.escrowProjection.findUnique({ where: { escrowIdHash: s.escrowIdHash } })).toBeNull();
  const notified = await notificationsFor(eventMeta);
  expect(notified).toEqual(
    expect.arrayContaining([
      { userId: client.id, type: "DEPOSIT_MISMATCHED" },
      { userId: developer.id, type: "DEPOSIT_MISMATCHED" },
      { userId: admin.id, type: "DEPOSIT_MISMATCHED" },
    ]),
  );
});

test("accepts a late deposit while the issue is still open (QĐ-17)", async () => {
  const s = await scenario({ reservationStatus: "EXPIRED", issueStatus: "OPEN" });
  const eventMeta = meta(s.escrowIdHash);

  await apply(s.effect(), eventMeta);

  expect(
    (await prisma.fundingReservation.findUniqueOrThrow({ where: { id: s.reservation.id } })).status,
  ).toBe("FUNDED");
  expect((await prisma.issue.findUniqueOrThrow({ where: { id: s.issue.id } })).status).toBe("IN_PROGRESS");
});

test("a late deposit does not reopen an issue that another reservation holds", async () => {
  const s = await scenario({ reservationStatus: "EXPIRED", issueStatus: "AWAITING_FUNDING" });
  const eventMeta = meta(s.escrowIdHash);

  await apply(s.effect({ amount: 99_000_000n }), eventMeta);

  expect(
    (await prisma.fundingReservation.findUniqueOrThrow({ where: { id: s.reservation.id } })).status,
  ).toBe("MISMATCHED");
  expect((await prisma.issue.findUniqueOrThrow({ where: { id: s.issue.id } })).status).toBe(
    "AWAITING_FUNDING",
  );
});

afterAll(async () => {
  const prefix = `evt-${run}-`;
  await prisma.notification.deleteMany({ where: { dedupeKey: { startsWith: prefix } } });
  await prisma.escrowProjection.deleteMany({ where: { escrowIdHash: { in: escrowHashes } } });
  await prisma.transactionIntent.deleteMany({ where: { escrowKey: { in: escrowKeys } } });
  await prisma.fundingReservation.deleteMany({ where: { issueId: { in: issueIds } } });
  await prisma.application.deleteMany({ where: { issueId: { in: issueIds } } });
  await prisma.issue.deleteMany({ where: { id: { in: issueIds } } });
  await prisma.token.deleteMany({ where: { id: { in: tokenIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});
