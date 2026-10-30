import { afterAll, beforeAll, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { prisma } from "@bloody-roar/database";
import { cleanupJob } from "../src/jobs/cleanup";

const hex = (n: number) => `0x${randomBytes(n).toString("hex")}`;
const now = new Date("2031-01-01T12:00:00Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);
const noop = () => undefined;
const log = { debug: noop, info: noop, warn: noop, error: noop, child: () => log };

let user: { id: string };
let tokenId = "";
const run = `cleanup-${randomBytes(4).toString("hex")}`;

beforeAll(async () => {
  assertTestDatabase(process.env.TEST_DATABASE_URL);
  user = await prisma.user.create({ data: { walletAddress: hex(20), role: "CLIENT" } });
  tokenId = (await prisma.token.create({ data: { name: "Cleanup", symbol: "CLN", address: hex(20), decimals: 6, chainId: 31337 } })).id;
});

afterAll(async () => {
  await prisma.githubWebhookDelivery.deleteMany({ where: { deliveryId: { startsWith: run } } });
  await prisma.attachment.deleteMany({ where: { uploaderId: user.id } });
  await prisma.session.deleteMany({ where: { userId: user.id } });
  await prisma.token.deleteMany({ where: { id: tokenId } });
  await prisma.user.deleteMany({ where: { id: user.id } });
  await prisma.$disconnect();
});

test("cleanup removes only expired sessions, abandoned uploads and old webhook deliveries", async () => {
  const session = (suffix: string, expiresAt: Date, revokedAt: Date | null) =>
    prisma.session.create({ data: { userId: user.id, refreshHash: `${run}-${suffix}`, expiresAt, revokedAt } });
  const expiredSession = await session("expired", daysAgo(8), null);
  const revokedSession = await session("revoked", new Date(now.getTime() + 86_400_000), daysAgo(8));
  const recentRevoked = await session("recent-revoked", new Date(now.getTime() + 86_400_000), daysAgo(2));
  const liveSession = await session("live", new Date(now.getTime() + 86_400_000), null);

  const attachment = (suffix: string, createdAt: Date) =>
    prisma.attachment.create({
      data: { uploaderId: user.id, fileName: `${suffix}.png`, fileUrl: `http://localhost/api/uploads?key=${user.id}%2F${suffix}.png`, fileSize: 1, fileMime: "image/png", status: "PENDING", createdAt },
    });
  const staleUpload = await attachment("stale", daysAgo(2));
  const freshUpload = await attachment("fresh", daysAgo(0));

  const delivery = (suffix: string, receivedAt: Date) => prisma.githubWebhookDelivery.create({ data: { deliveryId: `${run}-${suffix}`, receivedAt } });
  const oldDelivery = await delivery("old", daysAgo(31));
  const newDelivery = await delivery("new", daysAgo(5));

  await cleanupJob.run({ db: prisma, log, now: () => now } as never);

  expect(await prisma.session.findUnique({ where: { id: expiredSession.id } })).toBeNull();
  expect(await prisma.session.findUnique({ where: { id: revokedSession.id } })).toBeNull();
  expect(await prisma.session.findUnique({ where: { id: recentRevoked.id } })).not.toBeNull();
  expect(await prisma.session.findUnique({ where: { id: liveSession.id } })).not.toBeNull();

  expect(await prisma.attachment.findUnique({ where: { id: staleUpload.id } })).toBeNull();
  expect(await prisma.attachment.findUnique({ where: { id: freshUpload.id } })).not.toBeNull();

  expect(await prisma.githubWebhookDelivery.findUnique({ where: { deliveryId: oldDelivery.deliveryId } })).toBeNull();
  expect(await prisma.githubWebhookDelivery.findUnique({ where: { deliveryId: newDelivery.deliveryId } })).not.toBeNull();
});
