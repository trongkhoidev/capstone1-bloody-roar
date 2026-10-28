import { NOTIFICATION_CREATED_CHANNEL, PROJECTION_CHANGED_CHANNEL, type Prisma } from "@bloody-roar/database";

// Call inside the write's transaction: Postgres delivers a NOTIFY only when that transaction commits.
export async function notifyProjectionChanged(
  tx: Prisma.TransactionClient,
  payload: { escrowId: string; issueId: string | null; projectionVersion: number },
): Promise<void> {
  await tx.$executeRaw`SELECT pg_notify(${PROJECTION_CHANGED_CHANNEL}, ${JSON.stringify(payload)})`;
}

export async function notifyNotificationCreated(
  tx: Prisma.TransactionClient,
  payload: { userId: string; id: string },
): Promise<void> {
  await tx.$executeRaw`SELECT pg_notify(${NOTIFICATION_CREATED_CHANNEL}, ${JSON.stringify(payload)})`;
}
