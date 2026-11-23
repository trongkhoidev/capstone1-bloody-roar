import { ARBITER_STALL_DAYS, DAY_MS, DISPUTE_EVIDENCE_RESPONSE_HOURS, HOUR_MS } from "@bloody-roar/shared";
import { ESCROW_CONSTANTS } from "@bloody-roar/shared/escrow";
import type { EscrowProjection, RulingRecord } from "@bloody-roar/database";

export type AvailableAction = { action: string; enabledAt: string | null; reasonDisabled: string | null };
type Projection = Pick<EscrowProjection, "phase" | "deliveryDeadline" | "reviewDeadline" | "deliveryHash" | "settlementProposer" | "disputeRaisedAt" | "challengedAt" | "counterpartyEvidenceHash">;
type Ruling = Pick<RulingRecord, "noticeEndsAt" | "clientBps">;
const hour = 3_600_000;
const day = 24 * hour;

export function rulingWindow(projection: Pick<Projection, "phase" | "disputeRaisedAt" | "challengedAt">) {
  const kind = projection.phase === "DISPUTED" ? "INITIAL" : projection.phase === "CHALLENGED" ? "FINAL" : null;
  const start = kind === "INITIAL" ? projection.disputeRaisedAt : kind === "FINAL" ? projection.challengedAt : null;
  if (!kind || !start) return null;
  return {
    kind,
    opensAt: new Date(start.getTime() + (kind === "INITIAL" ? DISPUTE_EVIDENCE_RESPONSE_HOURS * HOUR_MS : 0)),
    closesAt: new Date(start.getTime() + ARBITER_STALL_DAYS * DAY_MS),
  };
}

// now is supplied by the caller so deadline boundaries can be tested without changing the clock.
export function availableActions(p: Projection, now: Date, ruling: Ruling | null = null): AvailableAction[] {
  const actions: AvailableAction[] = [];
  const add = (action: string, enabled: boolean, enabledAt: Date | null = null, reason = "Conditions are not met yet") => {
    actions.push({ action, enabledAt: enabledAt?.toISOString() ?? null, reasonDisabled: enabled ? null : reason });
  };
  const timed = (action: string, at: Date | null, strict = false) => {
    if (!at) { add(action, false, null, "No on-chain timestamp yet"); return; }
    const enabledAt = strict ? new Date(at.getTime() + 1000) : at;
    add(action, now >= enabledAt, enabledAt, "The deadline has not been reached");
  };
  if (p.phase === "NONE" || p.phase === "RESOLVED") return actions;
  if (p.settlementProposer) { add("revokeSettlement", true); add("acceptSettlement", true); }
  else add("proposeSettlement", true);
  if (p.phase === "FUNDED") {
    add("submitWork", now.getTime() <= p.deliveryDeadline.getTime(), null, "The delivery deadline has passed");
    add("releaseFunds", !!p.deliveryHash, null, "No delivery on-chain yet");
    if (p.deliveryHash) timed("claimReviewTimeout", p.reviewDeadline);
    else timed("claimMissedDeliveryRefund", p.deliveryDeadline, true);
    add("raiseDispute", true);
  } else if (p.phase === "DISPUTED") {
    const evidenceEnd = p.disputeRaisedAt ? new Date(p.disputeRaisedAt.getTime() + ESCROW_CONSTANTS.EVIDENCE_HOURS * hour) : null;
    add("submitCounterpartyEvidence", !!evidenceEnd && now < evidenceEnd && !p.counterpartyEvidenceHash, null, "Expired or evidence already submitted");
    if (evidenceEnd && p.disputeRaisedAt) {
      const stall = new Date(p.disputeRaisedAt.getTime() + ESCROW_CONSTANTS.ARBITER_STALL_DAYS * day);
      add("postInitialRuling", now >= evidenceEnd && now < stall, evidenceEnd, "Ruling window not open yet or already closed");
    } else add("postInitialRuling", false, null, "No on-chain dispute timestamp yet");
    timed("finalizeArbiterTimeoutSplit", p.disputeRaisedAt ? new Date(p.disputeRaisedAt.getTime() + ESCROW_CONSTANTS.ARBITER_STALL_DAYS * day) : null);
  } else if (p.phase === "INITIAL_RULING") {
    add("challengeRuling", !!ruling && now < ruling.noticeEndsAt, null, "Expired or no ruling yet");
    timed("finalizeRuling", ruling?.noticeEndsAt ?? null);
  } else if (p.phase === "CHALLENGED") {
    const stall = p.challengedAt ? new Date(p.challengedAt.getTime() + ESCROW_CONSTANTS.ARBITER_STALL_DAYS * day) : null;
    add("postFinalRuling", !!stall && now < stall, null, "Expired or the appeal timestamp is missing");
    timed("finalizeArbiterTimeoutSplit", stall);
  } else if (p.phase === "FINAL_RULING") {
    timed("finalizeRuling", ruling?.noticeEndsAt ?? null);
  }
  return actions;
}
