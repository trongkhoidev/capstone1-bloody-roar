import { createNotificationIdempotent, IntentStatus, type Prisma } from "@bloody-roar/database";
import type { FoldEffect } from "@bloody-roar/shared/escrow";
import type { EffectMeta } from "./escrow";
import { notifyNotificationCreated } from "../indexer/notify";

type SettlementEffect = Extract<FoldEffect, { kind: "SETTLEMENT_PROPOSED" | "SETTLEMENT_REVOKED" }>;
export async function applySettlement(tx: Prisma.TransactionClient, effect: SettlementEffect, meta: EffectMeta): Promise<void> {
  const projection = await tx.escrowProjection.findUniqueOrThrow({ where: { escrowIdHash: effect.escrowIdHash } });
  if (projection.chainId !== meta.chainId || projection.contractAddress.toLowerCase() !== meta.contractAddress.toLowerCase()) throw new Error("Settlement belongs to another chain or contract");
  if (effect.kind === "SETTLEMENT_PROPOSED") {
    if (await tx.settlementProposal.findFirst({ where: { escrowIdHash: effect.escrowIdHash, status: "PENDING" } })) throw new Error("Settlement proposal already pending");
    await tx.settlementProposal.create({ data: { escrowIdHash: effect.escrowIdHash, proposer: effect.proposer.toLowerCase(), clientBps: effect.clientBps, status: "PENDING", proposedEventId: meta.chainEventId } });
  } else {
    const pending = await tx.settlementProposal.findFirst({ where: { escrowIdHash: effect.escrowIdHash, status: "PENDING" } });
    if (!pending || pending.proposer.toLowerCase() !== effect.proposer.toLowerCase()) throw new Error("Pending settlement does not match revoked event");
    await tx.settlementProposal.update({ where: { id: pending.id }, data: { status: "REVOKED", closedEventId: meta.chainEventId } });
  }
  if (projection.escrowKey) await tx.transactionIntent.updateMany({ where: { escrowKey: projection.escrowKey, chainId: meta.chainId, contractAddress: { equals: meta.contractAddress, mode: "insensitive" },
    method: effect.kind === "SETTLEMENT_PROPOSED" ? "proposeSettlement" : "revokeSettlement", txHash: meta.txHash.toLowerCase(), status: { in: [IntentStatus.SUBMITTED, IntentStatus.PENDING_SAFE_HEAD] } },
    data: { status: IntentStatus.CONFIRMED, confirmedByEventId: meta.chainEventId } });
  const other = effect.proposer.toLowerCase() === projection.client.toLowerCase() ? projection.developer : projection.client;
  const recipient = await tx.user.findFirst({ where: { walletAddress: { equals: other, mode: "insensitive" } }, select: { id: true } });
  if (!recipient) return;
  const type = effect.kind;
  const notification = await createNotificationIdempotent(tx, { userId: recipient.id, type,
    title: type === "SETTLEMENT_PROPOSED" ? "Có đề xuất thỏa thuận" : "Đề xuất thỏa thuận đã được thu hồi",
    body: type === "SETTLEMENT_PROPOSED" ? "Bên còn lại đã đề xuất tỷ lệ phân chia." : "Bên đề xuất đã thu hồi thỏa thuận.",
    ...(projection.issueId ? { link: `/issues/${projection.issueId}` } : {}),
    data: { escrowIdHash: effect.escrowIdHash, ...(projection.issueId ? { issueId: projection.issueId } : {}) }, dedupeKey: `${meta.chainEventId}:${recipient.id}:${type}` });
  if (notification) await notifyNotificationCreated(tx, { userId: recipient.id, id: notification.id });
}
