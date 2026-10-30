import type { Prisma } from "@prisma/client";

// Rebuilds a developer's off-chain reputation from reviews and completed work, inside the caller's transaction.
export async function recalcReputation(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  const ratings = await tx.review.aggregate({ where: { developerId: userId }, _avg: { rating: true } });
  const completedTaskCount = await tx.issue.count({
    where: {
      developerId: userId,
      status: "COMPLETED",
      OR: [{ outcome: null }, { outcome: { not: "MISSED_DELIVERY_REFUND" } }],
    },
  });
  const average = ratings._avg.rating ?? 0;
  await tx.user.update({
    where: { id: userId },
    data: { reputationScore: Math.round(average * 100) / 100, completedTaskCount },
  });
}
