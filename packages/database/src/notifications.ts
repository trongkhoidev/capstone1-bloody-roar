// packages/database/src/notifications.ts
// Idempotent notification insert: a replayed event must not notify the user twice

import { type Prisma, type Notification, type NotificationType, type PrismaClient } from "@prisma/client";

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
  const result = await db.notification.createMany({ data: [input], skipDuplicates: true });
  if (result.count === 0) return null;
  return db.notification.findUniqueOrThrow({ where: { dedupeKey: input.dedupeKey } });
}
