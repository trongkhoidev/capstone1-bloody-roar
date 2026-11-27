import { createNotificationIdempotent, IntentStatus, postSystemMessage, SubmissionStatus, type Prisma } from "@bloody-roar/database";
import type { FoldEffect } from "@bloody-roar/shared/escrow";
import { notifyNotificationCreated } from "../indexer/notify";
import type { EffectMeta } from "./escrow";

export async function applyWorkSubmitted(tx: Prisma.TransactionClient, effect: Extract<FoldEffect, { kind: "WORK_SUBMITTED" }>, meta: EffectMeta): Promise<void> {
  const projection = await tx.escrowProjection.findUnique({ where: { escrowIdHash: effect.escrowIdHash } });
  if (projection) await tx.escrowProjection.update({ where: { id: projection.id }, data: { reviewDeadline: new Date(Number(meta.blockTimestamp) * 1000 + 7 * 86_400_000) } });
  if (!projection?.issueId || !projection.escrowKey) return;
  const issue = await tx.issue.findUniqueOrThrow({ where: { id: projection.issueId }, select: { clientId: true, developerId: true, title: true } });
  const delivery = await tx.submission.findFirst({ where: { issueId: projection.issueId, deliveryHash: { equals: effect.deliveryHash, mode: "insensitive" } } });
  await tx.submission.updateMany({ where: { issueId: projection.issueId, status: SubmissionStatus.SUBMITTED, ...(delivery ? { id: { not: delivery.id } } : {}) },
    data: { status: SubmissionStatus.SUPERSEDED, supersededAt: new Date(Number(meta.blockTimestamp) * 1000) } });
  if (delivery) await tx.submission.update({ where: { id: delivery.id }, data: { status: SubmissionStatus.SUBMITTED, submittedAt: new Date(Number(meta.blockTimestamp) * 1000), supersededAt: null, onChainEventId: meta.chainEventId } });
  if (issue.developerId) {
    await tx.$queryRaw`SELECT id FROM issues WHERE id = ${projection.issueId} FOR UPDATE`;
    const version = delivery && await tx.submission.count({ where: { issueId: projection.issueId, status: { not: SubmissionStatus.DRAFT }, submittedAt: { lte: new Date(Number(meta.blockTimestamp) * 1000) } } });
    await postSystemMessage(tx, { id: projection.issueId, ...issue }, delivery?.developerId ?? issue.developerId, version ? `Delivery v${version} submitted` : "Delivery submitted", `${meta.chainEventId}:sys`);
  }
  await tx.transactionIntent.updateMany({ where: { escrowKey: projection.escrowKey, method: "submitWork", txHash: meta.txHash.toLowerCase(), status: { in: [IntentStatus.SUBMITTED, IntentStatus.PENDING_SAFE_HEAD] } }, data: { status: IntentStatus.CONFIRMED, confirmedByEventId: meta.chainEventId } });
  const notification = await createNotificationIdempotent(tx, { userId: issue.clientId, type: "WORK_SUBMITTED", title: "Developer submitted work",
    body: `The Submission for “${issue.title}” was recorded on-chain.`, link: `/issues/${projection.issueId}`,
    data: { issueId: projection.issueId, deliveryHash: effect.deliveryHash }, dedupeKey: `${meta.chainEventId}:${issue.clientId}:WORK_SUBMITTED` });
  if (notification) await notifyNotificationCreated(tx, { userId: issue.clientId, id: notification.id });
}
