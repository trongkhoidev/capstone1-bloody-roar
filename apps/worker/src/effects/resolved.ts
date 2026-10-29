import { createNotificationIdempotent, IntentStatus, IssueStatus, type Prisma } from "@bloody-roar/database";
import type { FoldEffect } from "@bloody-roar/shared/escrow";
import { notifyNotificationCreated } from "../indexer/notify";
import type { EffectMeta } from "./escrow";

type Resolved = Extract<FoldEffect, { kind: "ESCROW_RESOLVED" }>;

export async function applyResolved(tx: Prisma.TransactionClient, effect: Resolved, meta: EffectMeta): Promise<void> {
  const projection = await tx.escrowProjection.findUnique({ where: { escrowIdHash: effect.escrowIdHash } });
  if (!projection) throw new Error("Cannot resolve an escrow without a projection");
  if (projection.chainId !== meta.chainId || projection.contractAddress.toLowerCase() !== meta.contractAddress.toLowerCase()) throw new Error("Resolution belongs to another chain or contract");
  const credits = new Map<string, bigint>();
  for (const [wallet, amount] of [[effect.client, effect.clientAmount], [effect.developer, effect.developerAmount], [effect.feeRecipient, effect.platformFee]] as const) {
    const address = wallet.toLowerCase();
    if (amount > 0n) credits.set(address, (credits.get(address) ?? 0n) + amount);
  }
  for (const [address, amount] of credits) {
    const key = { chainId: meta.chainId, contractAddress: meta.contractAddress.toLowerCase(), address };
    await tx.claimableBalance.upsert({ where: { chainId_contractAddress_address: key }, create: { ...key, amountRaw: amount.toString() }, update: { amountRaw: { increment: amount.toString() } } });
  }
  if (!projection.issueId) {
    const recipients = await tx.user.findMany({ where: { walletAddress: { in: [...credits.keys()], mode: "insensitive" } }, select: { id: true } });
    for (const recipient of recipients) {
      const notification = await createNotificationIdempotent(tx, { userId: recipient.id, type: "FUNDS_CLAIMABLE", title: "Tiền đã có thể rút",
        body: "Bạn có tiền có thể rút từ ký quỹ.", data: { escrowIdHash: effect.escrowIdHash, resolution: effect.resolution },
        dedupeKey: `${meta.chainEventId}:${recipient.id}:FUNDS_CLAIMABLE` });
      if (notification) await notifyNotificationCreated(tx, { userId: recipient.id, id: notification.id });
    }
    return;
  }
  const issue = await tx.issue.findUniqueOrThrow({ where: { id: projection.issueId }, select: { clientId: true, developerId: true, status: true, title: true } });
  if (issue.status !== IssueStatus.IN_PROGRESS && issue.status !== IssueStatus.DISPUTED) throw new Error("Issue changed before escrow resolution");
  await tx.issue.update({ where: { id: projection.issueId }, data: { status: IssueStatus.COMPLETED, outcome: effect.resolution, completedAt: new Date(Number(meta.blockTimestamp) * 1000) } });
  // TODO(P1-22): recalculate reputation in this transaction once the review module is implemented.
  await tx.transactionIntent.updateMany({ where: { issueId: projection.issueId, chainId: meta.chainId, contractAddress: { equals: meta.contractAddress, mode: "insensitive" }, txHash: meta.txHash.toLowerCase(), status: { in: [IntentStatus.SUBMITTED, IntentStatus.PENDING_SAFE_HEAD] },
    method: { in: ["releaseFunds", "claimMissedDeliveryRefund", "claimReviewTimeout", "acceptSettlement", "finalizeRuling", "finalizeArbiterTimeoutSplit"] } }, data: { status: IntentStatus.CONFIRMED, confirmedByEventId: meta.chainEventId } });
  const recipients = await tx.user.findMany({ where: { walletAddress: { in: [...credits.keys()], mode: "insensitive" } }, select: { id: true, walletAddress: true } });
  const send = async (userId: string, type: "ESCROW_RESOLVED" | "FUNDS_CLAIMABLE", body: string) => {
    const notification = await createNotificationIdempotent(tx, { userId, type, title: type === "ESCROW_RESOLVED" ? "Ký quỹ đã kết thúc" : "Tiền đã có thể rút", body,
      link: `/issues/${projection.issueId}`, data: { issueId: projection.issueId!, resolution: effect.resolution }, dedupeKey: `${meta.chainEventId}:${userId}:${type}` });
    if (notification) await notifyNotificationCreated(tx, { userId, id: notification.id });
  };
  for (const id of new Set([issue.clientId, issue.developerId].filter((id): id is string => !!id))) await send(id, "ESCROW_RESOLVED", `Ký quỹ cho “${issue.title}” đã được kết thúc.`);
  for (const recipient of recipients) await send(recipient.id, "FUNDS_CLAIMABLE", `Bạn có tiền có thể rút từ “${issue.title}”.`);
}
