import { createNotificationIdempotent } from "@bloody-roar/database";
import { notifyNotificationCreated } from "../indexer/notify";
import type { Job, JobContext } from "../runtime/scheduler";

// QĐ-16: an expired unfunded hold reopens its issue and notifies the selected developer.
export async function expireReservations({ db, log, now }: Pick<JobContext, "db" | "log" | "now">): Promise<number> {
  const at = now();
  const expired = await db.fundingReservation.findMany({
    where: { status: "AWAITING_FUNDING", expiresAt: { lte: at } },
    select: { id: true, issueId: true, developerId: true },
  });
  let count = 0;
  for (const reservation of expired) {
    const changed = await db.$transaction(async (tx) => {
      const updated = await tx.fundingReservation.updateMany({ where: { id: reservation.id, status: "AWAITING_FUNDING", expiresAt: { lte: at } }, data: { status: "EXPIRED" } });
      if (!updated.count) return false;
      const active = await tx.fundingReservation.count({ where: { issueId: reservation.issueId, status: { in: ["AWAITING_FUNDING", "FUNDED"] } } });
      if (!active) await tx.issue.updateMany({ where: { id: reservation.issueId, status: "AWAITING_FUNDING" }, data: { status: "OPEN" } });
      const notification = await createNotificationIdempotent(tx, {
        dedupeKey: `reservation:${reservation.id}:expired`, userId: reservation.developerId,
        type: "RESERVATION_EXPIRED", title: "Giữ chỗ ký quỹ đã hết hạn",
        body: "Khách hàng chưa nạp ký quỹ trong thời hạn giữ chỗ.", link: `/issues/${reservation.issueId}`,
        data: { issueId: reservation.issueId, reservationId: reservation.id },
      });
      if (notification) await notifyNotificationCreated(tx, { userId: reservation.developerId, id: notification.id });
      return true;
    });
    if (changed) {
      count++;
      log.info({ reservationId: reservation.id, issueId: reservation.issueId }, "reservation expired");
    }
  }
  return count;
}

export const reservationsJob: Job = {
  name: "reservations",
  everyMs: 30_000,
  async run(ctx) {
    await expireReservations(ctx);
  },
};
