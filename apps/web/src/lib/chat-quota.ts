import type { Prisma } from "@bloody-roar/database";

export const CHAT_DAILY_FILE_LIMIT = 50;
export const CHAT_DAILY_BYTES_LIMIT = 200 * 1024 * 1024;
export const CHAT_DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function chatQuotaAllows(tx: Prisma.TransactionClient, userId: string, fileSize: number) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
  const today = await tx.attachment.aggregate({
    where: { uploaderId: userId, purpose: "CHAT", createdAt: { gte: new Date(Date.now() - CHAT_DAILY_WINDOW_MS) } },
    _count: { _all: true },
    _sum: { fileSize: true },
  });
  return today._count._all + 1 <= CHAT_DAILY_FILE_LIMIT && (today._sum.fileSize ?? 0) + fileSize <= CHAT_DAILY_BYTES_LIMIT;
}
