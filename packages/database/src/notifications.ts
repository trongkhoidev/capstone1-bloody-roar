// packages/database/src/notifications.ts
// Idempotent notification insert: a replayed event must not notify the user twice

import { Prisma, type Notification, type NotificationType, type PrismaClient } from "@prisma/client";

export type CreateNotificationIdempotentInput = {
  dedupeKey: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  actorId?: string;
  data?: Record<string, string>;
};

/** Returns null when `dedupeKey` already exists. */
export async function createNotificationIdempotent(
  db: PrismaClient | Prisma.TransactionClient,
  input: CreateNotificationIdempotentInput,
): Promise<Notification | null> {
  const { dedupeKey, ...fields } = input;
  // Check first: a caught unique violation aborts the whole interactive transaction.
  const existing = await db.notification.findUnique({ where: { dedupeKey }, select: { id: true } });
  if (existing) return null;
  try {
    return await db.notification.create({ data: { ...fields, dedupeKey } });
  } catch (error) {
    // A concurrent insert with the same key won the race.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return null;
    throw error;
  }
}
