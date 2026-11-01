import { createNotificationIdempotent, IntentStatus, type Prisma } from "@bloody-roar/database";
import type { FoldEffect } from "@bloody-roar/shared/escrow";
import type { EffectMeta } from "./escrow";
import { notifyNotificationCreated } from "../indexer/notify";

type Claimed = Extract<FoldEffect, { kind: "CLAIMED" }>;
export async function applyClaimed(tx: Prisma.TransactionClient, effect: Claimed, meta: EffectMeta): Promise<void> {
  const address = effect.recipient.toLowerCase(), contractAddress = meta.contractAddress.toLowerCase();
  if (effect.amount <= 0n) throw new Error("Claim event has no payout");
  const updated = await tx.claimableBalance.updateMany({ where: { chainId: meta.chainId, contractAddress, address, amountRaw: effect.amount.toString() }, data: { amountRaw: "0" } });
  if (!updated.count) throw new Error("Claim event does not match indexed claimable balance");
  await tx.transactionIntent.updateMany({ where: { chainId: meta.chainId, contractAddress: { equals: contractAddress, mode: "insensitive" }, method: "claim",
    txHash: meta.txHash.toLowerCase(), status: { in: [IntentStatus.SUBMITTED, IntentStatus.PENDING_SAFE_HEAD] } },
    data: { status: IntentStatus.CONFIRMED, confirmedByEventId: meta.chainEventId } });
  const recipient = await tx.user.findUnique({ where: { walletAddress: address }, select: { id: true } }) ??
    await tx.user.findFirst({ where: { walletAddress: { equals: address, mode: "insensitive" } }, select: { id: true } });
  if (!recipient) return;
  const notification = await createNotificationIdempotent(tx, { userId: recipient.id, type: "PAYMENT_RECEIVED", title: "Đã nhận tiền",
    body: "Khoản tiền có thể rút đã được chuyển tới ví của bạn.", link: "/dashboard",
    data: { chainId: String(meta.chainId), contractAddress, address, amountRaw: effect.amount.toString() },
    dedupeKey: `${meta.chainEventId}:${recipient.id}:PAYMENT_RECEIVED` });
  if (notification) await notifyNotificationCreated(tx, { userId: recipient.id, id: notification.id });
}
