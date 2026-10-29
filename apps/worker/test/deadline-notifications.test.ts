import { afterAll, beforeAll, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import pino from "pino";
import { Client } from "pg";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { NOTIFICATION_CREATED_CHANNEL, prisma } from "@bloody-roar/database";
import { deadlinesJob } from "../src/jobs/deadlines";
import type { JobContext } from "../src/runtime/scheduler";

const run = randomBytes(8).toString("hex");
const address = () => `0x${randomBytes(20).toString("hex")}`;
const now = new Date("2027-01-01T12:00:00Z");
let clientId = "", developerId = "", issueId = "", tokenId = "", projectionId = "";
const listener = new Client({ connectionString: process.env.TEST_DATABASE_URL });
const received: Array<{ userId: string; id: string }> = [];

beforeAll(async () => {
  assertTestDatabase(process.env.TEST_DATABASE_URL);
  await listener.connect();
  await listener.query(`LISTEN ${NOTIFICATION_CREATED_CHANNEL}`);
  listener.on("notification", (message) => {
    if (message.payload) received.push(JSON.parse(message.payload));
  });
  clientId = (await prisma.user.create({ data: { walletAddress: address(), role: "CLIENT" } })).id;
  developerId = (await prisma.user.create({ data: { walletAddress: address(), role: "DEVELOPER" } })).id;
  tokenId = (await prisma.token.create({ data: { symbol: `D${run}`, name: "Deadline test", address: address(), decimals: 6, chainId: 31337 } })).id;
  issueId = (await prisma.issue.create({ data: { title: "Deadline notification test", description: "A funded issue with an expired delivery deadline.", category: "BUG_FIX", status: "IN_PROGRESS", bountyAmount: "100", tokenId, clientId, developerId, requiredSkills: [] } })).id;
  projectionId = (await prisma.escrowProjection.create({ data: { escrowIdHash: `0x${run}`, issueId, chainId: 31337, contractAddress: address(), client: address(), developer: address(), arbiter: address(), feeRecipient: address(), amountRaw: "100000000", depositedAt: new Date(now.getTime() - 10 * 86400_000), deliveryDeadline: new Date(now.getTime() - 1000), reviewDeadline: new Date(now.getTime() + 7 * 86400_000), termsHash: `0x${run}`, phase: "FUNDED", lastProjectedBlock: 1n } })).id;
});

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { userId: { in: [clientId, developerId] } } });
  await prisma.escrowProjection.deleteMany({ where: { id: projectionId } });
  await prisma.issue.deleteMany({ where: { id: issueId } });
  await prisma.token.deleteMany({ where: { id: tokenId } });
  await prisma.user.deleteMany({ where: { id: { in: [clientId, developerId] } } });
  await listener.end();
  await prisma.$disconnect();
});

test("deadline notices are sent once per participant when the job runs repeatedly", async () => {
  const ctx = { db: prisma, log: pino({ level: "silent" }), now: () => now } as unknown as JobContext;
  await deadlinesJob.run(ctx);
  await deadlinesJob.run(ctx);
  const notifications = await prisma.notification.findMany({ where: { userId: { in: [clientId, developerId] }, type: "DEADLINE_APPROACHING" } });
  expect(notifications).toHaveLength(2);
  expect(new Set(notifications.map((notification) => notification.userId))).toEqual(new Set([clientId, developerId]));
  expect(new Set(notifications.map((notification) => notification.dedupeKey)).size).toBe(2);
  await new Promise((resolve) => setTimeout(resolve, 100));
  const ids = new Set(notifications.map((notification) => notification.id));
  expect(received.filter((event) => ids.has(event.id))).toHaveLength(2);
});
