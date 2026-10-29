import { createNotificationIdempotent, IntentStatus, SubmissionStatus, type Prisma } from "@bloody-roar/database";
import type { FoldEffect } from "@bloody-roar/shared/escrow";
import { notifyNotificationCreated } from "../indexer/notify";
import type { EffectMeta } from "./escrow";

export async function applyWorkSubmitted(tx: Prisma.TransactionClient, effect: Extract<FoldEffect, { kind: "WORK_SUBMITTED" }>, meta: EffectMeta): Promise<void> {
  const projection = await tx.escrowProjection.findUnique({ where: { escrowIdHash: effect.escrowIdHash } });
  if (!projection?.issueId || !projection.escrowKey) return;
  const issue = await tx.issue.findUniqueOrThrow({ where: { id: projection.issueId }, select: { clientId: true, title: true } });
  const delivery = await tx.submission.findFirst({ where: { issueId: projection.issueId, deliveryHash: { equals: effect.deliveryHash, mode: "insensitive" } } });
  await tx.submission.updateMany({ where: { issueId: projection.issueId, status: SubmissionStatus.SUBMITTED, ...(delivery ? { id: { not: delivery.id } } : {}) },
    data: { status: SubmissionStatus.SUPERSEDED, supersededAt: new Date(Number(meta.blockTimestamp) * 1000) } });
  if (delivery) await tx.submission.update({ where: { id: delivery.id }, data: { status: SubmissionStatus.SUBMITTED, submittedAt: new Date(Number(meta.blockTimestamp) * 1000), supersededAt: null, onChainEventId: meta.chainEventId } });
  await tx.transactionIntent.updateMany({ where: { escrowKey: projection.escrowKey, method: "submitWork", txHash: meta.txHash.toLowerCase(), status: { in: [IntentStatus.SUBMITTED, IntentStatus.PENDING_SAFE_HEAD] } }, data: { status: IntentStatus.CONFIRMED, confirmedByEventId: meta.chainEventId } });
  const notification = await createNotificationIdempotent(tx, { userId: issue.clientId, type: "WORK_SUBMITTED", title: "Developer đã giao công việc",
    body: `Bài giao cho “${issue.title}” đã được ghi nhận on-chain.`, link: `/issues/${projection.issueId}`,
    data: { issueId: projection.issueId, deliveryHash: effect.deliveryHash }, dedupeKey: `${meta.chainEventId}:${issue.clientId}:WORK_SUBMITTED` });
  if (notification) await notifyNotificationCreated(tx, { userId: issue.clientId, id: notification.id });
}
