import { createNotificationIdempotent, type EscrowPhase } from "@bloody-roar/database";
import { notifyNotificationCreated } from "../indexer/notify";
import type { Job, JobContext } from "../runtime/scheduler";

// Contract timers (QĐ-03). The contract owns the real clock; these only decide when to tell users.
export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;
export const EVIDENCE_MS = 72 * HOUR_MS;
export const ARBITER_STALL_MS = 30 * DAY_MS;

export type DeadlineInput = {
  id: string;
  phase: EscrowPhase;
  deliveryHash: string | null;
  deliveryDeadline: Date;
  reviewDeadline: Date;
  disputeRaisedAt: Date | null;
  challengedAt: Date | null;
  initialNoticeEndsAt: Date | null; // from the latest INITIAL RulingRecord
  finalNoticeEndsAt: Date | null; // from the latest FINAL RulingRecord
};

export type DeadlineKind =
  | "MISSED_DELIVERY"
  | "REVIEW_TIMEOUT"
  | "EVIDENCE_ENDING"
  | "CHALLENGE_ENDED"
  | "FINAL_NOTICE_ENDED"
  | "ARBITER_STALL";

export type DueNotice = { kind: DeadlineKind; at: Date; dedupeKey: string };

const noticeBody: Record<DeadlineKind, string> = {
  MISSED_DELIVERY: "Đã đến hạn giao hàng nhưng chưa có bản giao trên chain.",
  REVIEW_TIMEOUT: "Thời hạn xem xét bản giao đã kết thúc.",
  EVIDENCE_ENDING: "Thời hạn bổ sung bằng chứng sắp kết thúc.",
  CHALLENGE_ENDED: "Thời hạn phản đối quyết định ban đầu đã kết thúc.",
  FINAL_NOTICE_ENDED: "Thời hạn công bố quyết định cuối cùng đã kết thúc.",
  ARBITER_STALL: "Đã đến hạn xử lý tranh chấp khi trọng tài chưa ra quyết định.",
};

// Returns the notices whose exit has opened (or whose evidence window is about to close) by `now`.
// The dedupe key is stable, so re-running the job never repeats a notice.
export function dueDeadlineNotices(p: DeadlineInput, now: Date): DueNotice[] {
  const stallStart = p.challengedAt ?? p.disputeRaisedAt;
  const exits: Array<{ kind: DeadlineKind; at: Date | null }> = [
    { kind: "MISSED_DELIVERY", at: p.phase === "FUNDED" && !p.deliveryHash ? p.deliveryDeadline : null },
    { kind: "REVIEW_TIMEOUT", at: p.phase === "FUNDED" && p.deliveryHash ? p.reviewDeadline : null },
    {
      kind: "EVIDENCE_ENDING",
      at: p.phase === "DISPUTED" && p.disputeRaisedAt ? new Date(p.disputeRaisedAt.getTime() + EVIDENCE_MS - DAY_MS) : null,
    },
    { kind: "CHALLENGE_ENDED", at: p.phase === "INITIAL_RULING" ? p.initialNoticeEndsAt : null },
    { kind: "FINAL_NOTICE_ENDED", at: p.phase === "FINAL_RULING" ? p.finalNoticeEndsAt : null },
    {
      kind: "ARBITER_STALL",
      at: (p.phase === "DISPUTED" || p.phase === "CHALLENGED") && stallStart ? new Date(stallStart.getTime() + ARBITER_STALL_MS) : null,
    },
  ];
  return exits
    .filter((exit): exit is { kind: DeadlineKind; at: Date } => exit.at !== null && exit.at <= now)
    .map((exit) => ({ ...exit, dedupeKey: `deadline:${p.id}:${exit.kind}` }));
}

async function runDeadlines({ db, log, now }: JobContext): Promise<void> {
  const projections = await db.escrowProjection.findMany({
    where: { phase: { notIn: ["NONE", "RESOLVED"] } },
    select: {
      id: true,
      phase: true,
      deliveryHash: true,
      deliveryDeadline: true,
      reviewDeadline: true,
      disputeRaisedAt: true,
      challengedAt: true,
      escrowIdHash: true,
      issueId: true,
    },
  });
  if (projections.length === 0) return;

  const rulings = await db.rulingRecord.findMany({
    where: { escrowIdHash: { in: projections.map((p) => p.escrowIdHash) } },
    orderBy: { postedAt: "desc" },
    select: { escrowIdHash: true, kind: true, noticeEndsAt: true },
  });
  const latestNotice = (escrowIdHash: string, kind: string) =>
    rulings.find((r) => r.escrowIdHash === escrowIdHash && r.kind === kind)?.noticeEndsAt ?? null;

  for (const p of projections) {
    const input: DeadlineInput = {
      ...p,
      initialNoticeEndsAt: latestNotice(p.escrowIdHash, "INITIAL"),
      finalNoticeEndsAt: latestNotice(p.escrowIdHash, "FINAL"),
    };
    if (!p.issueId) continue;
    const issue = await db.issue.findUnique({ where: { id: p.issueId }, select: { clientId: true, developerId: true } });
    if (!issue) continue;
    for (const notice of dueDeadlineNotices(input, now())) {
      const recipients = new Set([issue.clientId, issue.developerId].filter((id): id is string => !!id));
      for (const userId of recipients) {
        await db.$transaction(async (tx) => {
          const notification = await createNotificationIdempotent(tx, {
            dedupeKey: `${notice.dedupeKey}:${userId}`, userId, type: "DEADLINE_APPROACHING",
            title: "Mốc thời gian ký quỹ", body: noticeBody[notice.kind],
            link: `/issues/${p.issueId}`, data: { issueId: p.issueId!, escrowId: p.id, kind: notice.kind },
          });
          if (notification) await notifyNotificationCreated(tx, { userId, id: notification.id });
        });
      }
      log.info({ escrowId: p.id, kind: notice.kind, dedupeKey: notice.dedupeKey, at: notice.at }, "deadline notice due");
    }
  }
}

export const deadlinesJob: Job = { name: "deadlines", everyMs: 60_000, run: runDeadlines };
