import { ESCROW_CONSTANTS } from "@bloody-roar/shared/escrow";
import type { EscrowProjection, RulingRecord } from "@bloody-roar/database";

export type AvailableAction = { action: string; enabledAt: string | null; reasonDisabled: string | null };
type Projection = Pick<EscrowProjection, "phase" | "deliveryDeadline" | "reviewDeadline" | "deliveryHash" | "settlementProposer" | "disputeRaisedAt" | "challengedAt" | "counterpartyEvidenceHash">;
type Ruling = Pick<RulingRecord, "noticeEndsAt" | "clientBps">;
const hour = 3_600_000;
const day = 24 * hour;

// now is supplied by the caller so deadline boundaries can be tested without changing the clock.
export function availableActions(p: Projection, now: Date, ruling: Ruling | null = null): AvailableAction[] {
  const actions: AvailableAction[] = [];
  const add = (action: string, enabled: boolean, enabledAt: Date | null = null, reason = "Điều kiện chưa được đáp ứng") => {
    actions.push({ action, enabledAt: enabledAt?.toISOString() ?? null, reasonDisabled: enabled ? null : reason });
  };
  const timed = (action: string, at: Date | null, strict = false) => {
    if (!at) { add(action, false, null, "Chưa có mốc thời gian on-chain"); return; }
    const enabledAt = strict ? new Date(at.getTime() + 1000) : at;
    add(action, now >= enabledAt, enabledAt, "Chưa đến thời hạn");
  };
  if (p.phase === "NONE" || p.phase === "RESOLVED") return actions;
  if (p.settlementProposer) { add("revokeSettlement", true); add("acceptSettlement", true); }
  else add("proposeSettlement", true);
  if (p.phase === "FUNDED") {
    add("submitWork", now.getTime() <= p.deliveryDeadline.getTime(), null, "Đã hết hạn giao hàng");
    add("releaseFunds", !!p.deliveryHash, null, "Chưa có bài giao on-chain");
    if (p.deliveryHash) timed("claimReviewTimeout", p.reviewDeadline);
    else timed("claimMissedDeliveryRefund", p.deliveryDeadline, true);
    add("raiseDispute", true);
  } else if (p.phase === "DISPUTED") {
    const evidenceEnd = p.disputeRaisedAt ? new Date(p.disputeRaisedAt.getTime() + ESCROW_CONSTANTS.EVIDENCE_HOURS * hour) : null;
    add("submitCounterpartyEvidence", !!evidenceEnd && now < evidenceEnd && !p.counterpartyEvidenceHash, null, "Hết hạn hoặc đã nộp bằng chứng");
    if (evidenceEnd && p.disputeRaisedAt) {
      const stall = new Date(p.disputeRaisedAt.getTime() + ESCROW_CONSTANTS.ARBITER_STALL_DAYS * day);
      add("postInitialRuling", now >= evidenceEnd && now < stall, evidenceEnd, "Chưa đến hạn hoặc đã quá hạn phán quyết");
    } else add("postInitialRuling", false, null, "Chưa có mốc tranh chấp on-chain");
    timed("finalizeArbiterTimeoutSplit", p.disputeRaisedAt ? new Date(p.disputeRaisedAt.getTime() + ESCROW_CONSTANTS.ARBITER_STALL_DAYS * day) : null);
  } else if (p.phase === "INITIAL_RULING") {
    add("challengeRuling", !!ruling && now < ruling.noticeEndsAt, null, "Hết hạn hoặc chưa có phán quyết");
    timed("finalizeRuling", ruling?.noticeEndsAt ?? null);
  } else if (p.phase === "CHALLENGED") {
    const stall = p.challengedAt ? new Date(p.challengedAt.getTime() + ESCROW_CONSTANTS.ARBITER_STALL_DAYS * day) : null;
    add("postFinalRuling", !!stall && now < stall, null, "Đã hết hạn hoặc thiếu mốc kháng cáo");
    timed("finalizeArbiterTimeoutSplit", stall);
  } else if (p.phase === "FINAL_RULING") {
    timed("finalizeRuling", ruling?.noticeEndsAt ?? null);
  }
  return actions;
}
