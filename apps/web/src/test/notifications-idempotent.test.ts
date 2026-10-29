import { describe, expect, it } from "vitest";
import { type PrismaClient } from "@prisma/client";
import { createNotificationIdempotent } from "@bloody-roar/database";

const input = {
  dedupeKey: "dispute:1:raised",
  userId: "user-1",
  type: "DISPUTE_RAISED" as const,
  title: "Dispute raised",
  body: "A dispute was raised on your task.",
};

function fakeDb() {
  const rows = new Map<string, { id: string; dedupeKey: string }>();
  const notification = {
    createMany: async ({ data }: { data: Array<{ dedupeKey: string }> }) => {
      const row = data[0]!;
      if (rows.has(row.dedupeKey)) return { count: 0 };
      rows.set(row.dedupeKey, { id: `n${rows.size + 1}`, ...row });
      return { count: 1 };
    },
    findUniqueOrThrow: async ({ where }: { where: { dedupeKey: string } }) => rows.get(where.dedupeKey),
  };
  return { db: { notification } as unknown as PrismaClient, rows };
}

describe("createNotificationIdempotent", () => {
  it("inserts once and returns null for a repeated dedupeKey", async () => {
    const { db, rows } = fakeDb();

    const first = await createNotificationIdempotent(db, input);
    const second = await createNotificationIdempotent(db, input);

    expect(first?.dedupeKey).toBe(input.dedupeKey);
    expect(second).toBeNull();
    expect(rows.size).toBe(1);
  });

  it("rethrows errors that are not unique violations", async () => {
    const db = {
      notification: {
        createMany: async () => {
          throw new Error("connection lost");
        },
      },
    } as unknown as PrismaClient;

    await expect(createNotificationIdempotent(db, input)).rejects.toThrow("connection lost");
  });
});
