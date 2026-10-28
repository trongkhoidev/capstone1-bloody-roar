import { afterAll, expect, test } from "bun:test";
import { prisma } from "@bloody-roar/database";
import { expireReservations } from "../src/jobs/reservations";
import { createLogger } from "../src/log";

const run = Date.now();
const now = new Date("2027-01-01T12:00:00Z");
const log = createLogger(() => undefined);
const hours = (h: number) => new Date(now.getTime() + h * 3_600_000);

const client = await prisma.user.create({
  data: { walletAddress: `0xres${run}`, updatedAt: now },
});
const token = await prisma.token.create({
  data: { symbol: "TST", name: "Test", address: `0xtok${run}`, decimals: 6, chainId: 1, updatedAt: now },
});
const makeIssue = (suffix: string) =>
  prisma.issue.create({
    data: {
      title: `reservation ${suffix}`,
      description: "d",
      category: "FEATURE",
      status: "AWAITING_FUNDING",
      bountyAmount: 10,
      tokenId: token.id,
      clientId: client.id,
      updatedAt: now,
    },
  });
const expiredIssue = await makeIssue("expired");
const liveIssue = await makeIssue("live");

const reservation = (issueId: string, suffix: string, expiresAt: Date) => ({
  issueId,
  applicationId: `app_${suffix}`,
  clientId: client.id,
  developerId: client.id,
  escrowKey: `br_${run}_${suffix}`,
  escrowIdHash: `${run}_${suffix}`,
  chainId: 84532,
  contractAddress: "0x0000000000000000000000000000000000000001",
  tokenAddress: "0x0000000000000000000000000000000000000002",
  amountRaw: "10000000",
  deliveryDeadline: hours(24 * 30),
  termsHash: "0xterms",
  termsVersion: 1,
  expiresAt,
});
await prisma.fundingReservation.create({ data: reservation(expiredIssue.id, "a", hours(-1)) });
await prisma.fundingReservation.create({ data: reservation(liveIssue.id, "b", hours(1)) });

afterAll(async () => {
  await prisma.fundingReservation.deleteMany({ where: { escrowKey: { startsWith: `br_${run}_` } } });
  await prisma.issue.deleteMany({ where: { id: { in: [expiredIssue.id, liveIssue.id] } } });
  await prisma.token.delete({ where: { id: token.id } });
  await prisma.user.delete({ where: { id: client.id } });
  await prisma.$disconnect();
});

test("an unfunded reservation past its expiry is expired and its issue returns to OPEN", async () => {
  await expireReservations({ db: prisma, log, now: () => now });

  const statusOf = async (issueId: string) => (await prisma.fundingReservation.findFirstOrThrow({ where: { issueId } })).status;
  expect(await statusOf(expiredIssue.id)).toBe("EXPIRED");
  expect(await prisma.issue.findUniqueOrThrow({ where: { id: expiredIssue.id } })).toMatchObject({ status: "OPEN" });

  expect(await statusOf(liveIssue.id)).toBe("AWAITING_FUNDING");
  expect(await prisma.issue.findUniqueOrThrow({ where: { id: liveIssue.id } })).toMatchObject({ status: "AWAITING_FUNDING" });
});

test("running again changes nothing", async () => {
  expect(await expireReservations({ db: prisma, log, now: () => now })).toBe(0);
});
