import { afterAll, beforeAll, expect, test } from "bun:test";
import { PrismaClient } from "@prisma/client";
import { assertTestDatabase } from "../src/test-guard";
import { createNotificationIdempotent } from "../src/notifications";

const db = new PrismaClient();
const walletAddress = `test-notification-${crypto.randomUUID()}`;
let userId = "";
const dedupeKey = `test-notification-${crypto.randomUUID()}`;

beforeAll(async () => {
  assertTestDatabase(process.env.TEST_DATABASE_URL);
  userId = (await db.user.create({ data: { walletAddress } })).id;
});
afterAll(async () => {
  if (userId) {
    await db.notification.deleteMany({ where: { userId } });
    await db.user.delete({ where: { id: userId } });
  }
  await db.$disconnect();
});

test("concurrent duplicates do not abort the transaction", async () => {
  const input = { dedupeKey, userId, type: "DISPUTE_RAISED" as const, title: "Dispute", body: "A dispute was raised." };
  const insert = () => db.$transaction(async (tx) => {
    const notification = await createNotificationIdempotent(tx, input);
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    return { notification, user };
  });
  const results = await Promise.all([insert(), insert()]);
  expect(results.filter((result) => result.notification)).toHaveLength(1);
  expect(results.map((result) => result.user.id)).toEqual([userId, userId]);
  expect(await db.notification.count({ where: { dedupeKey } })).toBe(1);
});
