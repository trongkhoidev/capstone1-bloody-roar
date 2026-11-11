import type { Job, JobContext } from "../runtime/scheduler";

// QĐ-16: a reservation not funded before its expiry expires, and its issue goes back to OPEN.
// Late deposits are handled by the applier (QĐ-17), not here.
export async function expireReservations({ db, log, now }: Pick<JobContext, "db" | "log" | "now">): Promise<number> {
  const expired = await db.fundingReservation.findMany({
    where: { status: "AWAITING_FUNDING", expiresAt: { lte: now() } },
    select: { id: true, issueId: true },
  });
  if (expired.length === 0) return 0;

  await db.$transaction([
    db.fundingReservation.updateMany({ where: { id: { in: expired.map((r) => r.id) } }, data: { status: "EXPIRED" } }),
    db.issue.updateMany({
      where: { id: { in: expired.map((r) => r.issueId) }, status: "AWAITING_FUNDING" },
      data: { status: "OPEN" },
    }),
  ]);
  // shortcut: logged only. Upgrade: notify the developer with RESERVATION_EXPIRED through createNotificationIdempotent (A5).
  for (const r of expired) log.info({ reservationId: r.id, issueId: r.issueId }, "reservation expired");
  return expired.length;
}

export const reservationsJob: Job = {
  name: "reservations",
  everyMs: 30_000,
  async run(ctx) {
    await expireReservations(ctx);
  },
};
