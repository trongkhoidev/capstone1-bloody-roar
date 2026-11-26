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
  const disputesLost = await tx.dispute.count({
    where: {
      raisedById: userId,
      issue: { status: "COMPLETED", outcome: "RULING" },
      OR: [
        { finalClientBps: 0, issue: { clientId: userId } },
        { finalClientBps: 10_000, issue: { developerId: userId } },
      ],
    },
  });
  const average = ratings._avg.rating ?? 0;
  await tx.user.update({
    where: { id: userId },
    data: { reputationScore: Math.round(average * 100) / 100, completedTaskCount, disputesLost },
  });
}
