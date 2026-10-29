import { ApplicationStatus, IntentStatus, IssueStatus, ReservationStatus, type Prisma } from "@bloody-roar/database";

export type DepositUndo = {
  reservation: { id: string; status: ReservationStatus; fundedAt: string | null };
  issue: { id: string; status: IssueStatus; developerId: string | null };
  applications: Array<{ id: string; status: ApplicationStatus }>;
  intents: Array<{ id: string; status: IntentStatus; confirmedByEventId: string | null }>;
};

export async function captureDepositUndo(tx: Prisma.TransactionClient, escrowIdHash: string): Promise<DepositUndo | null> {
  const reservation = await tx.fundingReservation.findUnique({ where: { escrowIdHash } });
  if (!reservation) return null;
  const [issue, applications, intents] = await Promise.all([
    tx.issue.findUniqueOrThrow({ where: { id: reservation.issueId }, select: { id: true, status: true, developerId: true } }),
    tx.application.findMany({ where: { issueId: reservation.issueId }, select: { id: true, status: true } }),
    tx.transactionIntent.findMany({ where: { escrowKey: reservation.escrowKey }, select: { id: true, status: true, confirmedByEventId: true } }),
  ]);
  return { reservation: { id: reservation.id, status: reservation.status, fundedAt: reservation.fundedAt?.toISOString() ?? null }, issue, applications, intents };
}

export async function undoDeposit(tx: Prisma.TransactionClient, eventId: string, snapshot: DepositUndo): Promise<void> {
  const reservation = await tx.fundingReservation.findUniqueOrThrow({ where: { id: snapshot.reservation.id } });
  const issue = await tx.issue.findUniqueOrThrow({ where: { id: snapshot.issue.id } });
  if (![ReservationStatus.FUNDED, ReservationStatus.MISMATCHED, snapshot.reservation.status].includes(reservation.status)) {
    throw new Error("Cannot safely undo deposit: reservation changed since projection");
  }
  const unchanged = issue.status === snapshot.issue.status && issue.developerId === snapshot.issue.developerId;
  const funded = reservation.status === ReservationStatus.FUNDED && issue.status === IssueStatus.IN_PROGRESS && issue.developerId === reservation.developerId;
  const mismatched = reservation.status === ReservationStatus.MISMATCHED && issue.status === IssueStatus.OPEN && issue.developerId === snapshot.issue.developerId;
  if (!unchanged && !funded && !mismatched) throw new Error("Cannot safely undo deposit: issue changed since projection");
  for (const original of snapshot.applications) {
    const current = await tx.application.findUnique({ where: { id: original.id }, select: { status: true } });
    if (!current) throw new Error("Cannot safely undo deposit: application was removed");
    if (current.status === original.status) continue;
    const projected = original.status === ApplicationStatus.PENDING &&
      (original.id === reservation.applicationId ? current.status === ApplicationStatus.ACCEPTED : current.status === ApplicationStatus.REJECTED);
    if (!projected) throw new Error("Cannot safely undo deposit: application changed since projection");
    await tx.application.update({ where: { id: original.id }, data: { status: original.status } });
  }
  for (const original of snapshot.intents) {
    await tx.transactionIntent.updateMany({ where: { id: original.id, confirmedByEventId: eventId }, data: { status: original.status, confirmedByEventId: original.confirmedByEventId } });
  }
  await tx.fundingReservation.update({ where: { id: reservation.id }, data: { status: snapshot.reservation.status, fundedAt: snapshot.reservation.fundedAt ? new Date(snapshot.reservation.fundedAt) : null } });
  await tx.issue.update({ where: { id: issue.id }, data: { status: snapshot.issue.status, developerId: snapshot.issue.developerId } });
  await tx.notification.deleteMany({ where: { dedupeKey: { startsWith: `${eventId}:` } } });
}
