// apps/worker/src/effects/escrow.ts
// Effect escrow của A4: FUNDED (BE-36, BE-66c). Chạy trong cùng transaction với ChainEvent.
// Thông báo dùng dedupeKey = {chainEventId}:{userId}:{type} (BE-62), nên replay không gửi trùng.

import { DAY_MS } from "@bloody-roar/shared/constants";
import {
  ApplicationStatus,
  createNotificationIdempotent,
  EscrowPhase,
  IntentStatus,
  IssueStatus,
  postSystemMessage,
  Prisma,
  ReservationStatus,
  UserRole,
  type FundingReservation,
} from "@bloody-roar/database";
import {
  checkDepositAgainstReservation,
  ESCROW_CONSTANTS,
  type EventMeta,
  type FoldEffect,
  type Hex,
} from "@bloody-roar/shared/escrow";
import { notifyNotificationCreated } from "../indexer/notify";

export type EffectMeta = EventMeta & { chainEventId: string; escrowIdHash: Hex };
type FundedEffect = Extract<FoldEffect, { kind: "FUNDED" }>;
type Reservation = FundingReservation;


// Thời gian on-chain là giây unix (uint256)
const fromUnix = (seconds: bigint) => new Date(Number(seconds) * 1000);

async function notify(
  tx: Prisma.TransactionClient,
  meta: EffectMeta,
  userIds: string[],
  input: { type: "DEPOSIT_CONFIRMED" | "DEPOSIT_MISMATCHED" | "APPLICATION_ACCEPTED" | "APPLICATION_REJECTED" | "TASK_ASSIGNED"; title: string; body: string; link: string; data: Record<string, string> },
) {
  for (const userId of new Set(userIds)) {
    const notification = await createNotificationIdempotent(tx, {
      ...input,
      dedupeKey: `${meta.chainEventId}:${userId}:${input.type}`,
      userId,
    });
    if (notification) await notifyNotificationCreated(tx, { userId, id: notification.id });
  }
}

// BE-36: deposit khớp reservation thì nhận: issue IN_PROGRESS, application được chọn ACCEPTED
export async function applyFunded(
  tx: Prisma.TransactionClient,
  effect: FundedEffect,
  meta: EffectMeta,
): Promise<void> {
  const reservation = await tx.fundingReservation.findUnique({
    where: { escrowIdHash: effect.escrowIdHash },
  });
  // shortcut: deposit không đi qua backend (QĐ-05) chưa tạo projection orphan, cần làm sau
  if (!reservation) return;
  if (reservation.chainId !== meta.chainId || reservation.contractAddress.toLowerCase() !== meta.contractAddress.toLowerCase()) {
    throw new Error("Deposit contract or chain does not match the reservation");
  }
  if (reservation.status === ReservationStatus.FUNDED) return;
  await tx.$queryRaw`SELECT id FROM issues WHERE id = ${reservation.issueId} FOR UPDATE`;

  const issue = await tx.issue.findUniqueOrThrow({
    where: { id: reservation.issueId },
    select: { status: true, title: true },
  });
  const [client, developer, application] = await Promise.all([
    tx.user.findUniqueOrThrow({ where: { id: reservation.clientId }, select: { walletAddress: true } }),
    tx.user.findUniqueOrThrow({ where: { id: reservation.developerId }, select: { walletAddress: true } }),
    tx.application.findUniqueOrThrow({ where: { id: reservation.applicationId }, select: { status: true } }),
  ]);
  const reasons = checkDepositAgainstReservation(
    {
      client: effect.client,
      developer: effect.developer,
      amount: effect.amount,
      deliveryDeadline: effect.deliveryDeadline,
      termsHash: effect.termsHash,
    },
    {
      client: client.walletAddress as Hex,
      developer: developer.walletAddress as Hex,
      amount: BigInt(reservation.amountRaw.toFixed()),
      deliveryDeadline: BigInt(Math.floor(reservation.deliveryDeadline.getTime() / 1000)),
      termsHash: reservation.termsHash as Hex,
    },
  );
  if (application.status !== ApplicationStatus.PENDING) reasons.push("application");

  // QĐ-17: deposit đến sau hạn được nhận nếu issue vẫn OPEN (không có reservation khác đang chạy)
  const late = reservation.status !== ReservationStatus.AWAITING_FUNDING;
  if (reasons.length === 0 && (!late || issue.status === IssueStatus.OPEN)) {
    await acceptDeposit(tx, reservation, effect, meta, issue.title, issue.status);
    return;
  }
  await markMismatch(tx, reservation, issue, reasons.length ? reasons : ["late"], meta, late);
}

const mismatchReasonText: Record<string, string> = {
  client: "the client wallet differs",
  developer: "the developer wallet differs",
  amount: "the amount differs",
  deadline: "the delivery deadline differs",
  termsHash: "the terms hash differs",
  token: "the token differs",
  application: "the Application is no longer pending",
  late: "it arrived after the reservation expired and the Issue is no longer open",
};

async function acceptDeposit(
  tx: Prisma.TransactionClient,
  reservation: Reservation,
  effect: FundedEffect,
  meta: EffectMeta,
  issueTitle: string,
  issueStatus: IssueStatus,
) {
  const depositedAt = fromUnix(meta.blockTimestamp);
  const deliveryDeadline = fromUnix(effect.deliveryDeadline);

  const funded = await tx.fundingReservation.updateMany({
    where: { id: reservation.id, status: reservation.status },
    data: { status: ReservationStatus.FUNDED, fundedAt: depositedAt },
  });
  if (!funded.count) throw new Error("Reservation changed while applying deposit; retry");
  const moved = await tx.issue.updateMany({
    where: { id: reservation.issueId, status: issueStatus },
    data: { status: IssueStatus.IN_PROGRESS, developerId: reservation.developerId },
  });
  if (!moved.count) throw new Error("Issue changed while applying deposit; retry");
  const rejected = await tx.application.findMany({
    where: { issueId: reservation.issueId, id: { not: reservation.applicationId }, status: ApplicationStatus.PENDING },
    select: { developerId: true },
  });
  await tx.application.update({
    where: { id: reservation.applicationId },
    data: { status: ApplicationStatus.ACCEPTED },
  });
  await tx.application.updateMany({
    where: {
      issueId: reservation.issueId,
      id: { not: reservation.applicationId },
      status: ApplicationStatus.PENDING,
    },
    data: { status: ApplicationStatus.REJECTED },
  });
  await tx.escrowProjection.create({
    data: {
      escrowIdHash: effect.escrowIdHash,
      escrowKey: reservation.escrowKey,
      issueId: reservation.issueId,
      reservationId: reservation.id,
      chainId: meta.chainId,
      contractAddress: meta.contractAddress,
      client: effect.client,
      developer: effect.developer,
      arbiter: effect.arbiter,
      feeRecipient: effect.feeRecipient,
      amountRaw: effect.amount.toString(),
      depositedAt,
      deliveryDeadline,
      reviewDeadline: new Date(deliveryDeadline.getTime() + ESCROW_CONSTANTS.REVIEW_DAYS * DAY_MS),
      termsHash: effect.termsHash,
      phase: EscrowPhase.FUNDED,
      lastProjectedBlock: meta.blockNumber,
      projectionVersion: 1,
    },
  });
  // Intent là chỗ duy nhất được đặt CONFIRMED, và chỉ sau khi event đã được áp dụng
  await tx.transactionIntent.updateMany({
    where: {
      escrowKey: reservation.escrowKey,
      method: "deposit",
      txHash: meta.txHash.toLowerCase(),
      status: {
        in: [IntentStatus.SUBMITTED, IntentStatus.PENDING_SAFE_HEAD],
      },
    },
    data: { status: IntentStatus.CONFIRMED, confirmedByEventId: meta.chainEventId },
  });
  await postSystemMessage(tx, { id: reservation.issueId, clientId: reservation.clientId, developerId: reservation.developerId }, reservation.clientId, "Escrow funded", `${meta.chainEventId}:sys`);
  const data = { issueId: reservation.issueId, reservationId: reservation.id };
  const link = `/issues/${reservation.issueId}`;
  await notify(tx, meta, [reservation.clientId], {
    type: "DEPOSIT_CONFIRMED", title: "Deposit confirmed",
    body: `The deposit for “${issueTitle}” was recorded on-chain.`, link, data,
  });
  await notify(tx, meta, [reservation.developerId], {
    type: "APPLICATION_ACCEPTED", title: "Application accepted",
    body: `You were selected to work on “${issueTitle}”.`, link, data,
  });
  await notify(tx, meta, [reservation.developerId], {
    type: "TASK_ASSIGNED", title: "Work is ready to start",
    body: `The deposit for “${issueTitle}” is funded; you can start now.`, link, data,
  });
  await notify(tx, meta, rejected.map((application) => application.developerId), {
    type: "APPLICATION_REJECTED", title: "Application not selected",
    body: `Another applicant was selected for “${issueTitle}”.`, link, data,
  });
}

// BE-66c: deposit lệch điều khoản. Reservation MISMATCHED, không gán developer, báo hai bên và admin
async function markMismatch(
  tx: Prisma.TransactionClient,
  reservation: Reservation,
  issue: { title: string },
  reasons: string[],
  meta: EffectMeta,
  late: boolean,
) {
  const changed = await tx.fundingReservation.updateMany({
    where: { id: reservation.id, status: reservation.status },
    data: { status: ReservationStatus.MISMATCHED },
  });
  if (!changed.count) throw new Error("Reservation changed while applying deposit; retry");
  // Reservation đang giữ issue thì mở lại để issue không bị kẹt. Khoản on-chain lệch do admin xử lý.
  // Reservation đã hết hạn không được động vào issue, vì issue có thể đang do reservation khác giữ.
  if (!late) {
    await tx.issue.updateMany({
      where: { id: reservation.issueId, status: IssueStatus.AWAITING_FUNDING },
      data: { status: IssueStatus.OPEN },
    });
  }
  const admins = await tx.user.findMany({ where: { role: UserRole.ADMIN }, select: { id: true } });
  await notify(
    tx,
    meta,
    [reservation.clientId, reservation.developerId, ...admins.map((admin) => admin.id)],
    {
      type: "DEPOSIT_MISMATCHED",
      title: "Deposit does not match the terms",
      body: `The deposit for “${issue.title}” does not match: ${reasons.map((reason) => mismatchReasonText[reason] ?? reason).join("; ")}. Manual review is required.`,
      link: `/issues/${reservation.issueId}`,
      data: {
        issueId: reservation.issueId,
        reservationId: reservation.id,
        reasons: reasons.join(","),
      },
    },
  );
}
