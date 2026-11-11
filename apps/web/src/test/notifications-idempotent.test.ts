import { describe, expect, it } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";
import { createNotificationIdempotent } from "@bloody-roar/database";

const input = {
  dedupeKey: "dispute:1:raised",
  userId: "user-1",
  type: "DISPUTE_RAISED" as const,
  title: "Dispute raised",
  body: "A dispute was raised on your task.",
};

// In-memory stand-in for `db.notification`; `blindFind` simulates losing a race after the existence check.
function fakeDb({ blindFind = false } = {}) {
  const rows = new Map<string, { id: string; dedupeKey: string }>();
  const notification = {
    findUnique: async ({ where }: { where: { dedupeKey: string } }) =>
      blindFind ? null : (rows.get(where.dedupeKey) ?? null),
    create: async ({ data }: { data: { dedupeKey: string } }) => {
      if (rows.has(data.dedupeKey)) {
        throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
          code: "P2002",
          clientVersion: "5.22.0",
        });
      }
      const row = { id: `n${rows.size + 1}`, ...data };
      rows.set(data.dedupeKey, row);
      return row;
    },
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

  it("returns null when a concurrent insert with the same key wins the race", async () => {
    const { db, rows } = fakeDb({ blindFind: true });
    rows.set(input.dedupeKey, { id: "n0", dedupeKey: input.dedupeKey });

    await expect(createNotificationIdempotent(db, input)).resolves.toBeNull();
  });

  it("rethrows errors that are not unique violations", async () => {
    const db = {
      notification: {
        findUnique: async () => null,
        create: async () => {
          throw new Error("connection lost");
        },
      },
    } as unknown as PrismaClient;

    await expect(createNotificationIdempotent(db, input)).rejects.toThrow("connection lost");
  });
});
