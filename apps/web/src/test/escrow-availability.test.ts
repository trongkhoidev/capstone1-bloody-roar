import { describe, expect, it } from "vitest";
import { availableActions } from "../lib/escrow/availability";
const now = new Date("2030-01-01T00:00:00.000Z");
const base = { phase: "FUNDED" as const, deliveryDeadline: now, reviewDeadline: new Date(now.getTime() + 7 * 86400_000), deliveryHash: null,
  settlementProposer: null, disputeRaisedAt: null, challengedAt: null, counterpartyEvidenceHash: null };
const get = (p: Parameters<typeof availableActions>[0], time = now, ruling: Parameters<typeof availableActions>[2] = null) => Object.fromEntries(availableActions(p, time, ruling).map((a) => [a.action, a]));
describe("availableActions", () => {
  it("honors the strict missed-delivery boundary and inclusive submission boundary", () => {
    const at = get(base); expect(at.submitWork?.reasonDisabled).toBeNull(); expect(at.claimMissedDeliveryRefund?.reasonDisabled).not.toBeNull();
    const after = get(base, new Date(now.getTime() + 1000)); expect(after.submitWork?.reasonDisabled).not.toBeNull(); expect(after.claimMissedDeliveryRefund?.reasonDisabled).toBeNull();
  });
  it("enables release with a delivery and review timeout at its boundary", () => {
    const p = { ...base, deliveryHash: "0x1" }; expect(get(p).releaseFunds?.reasonDisabled).toBeNull();
    expect(get(p).claimReviewTimeout?.reasonDisabled).not.toBeNull(); expect(get(p, p.reviewDeadline).claimReviewTimeout?.reasonDisabled).toBeNull();
  });
  it("enables evidence until 72 hours and arbiter timeout at 30 days", () => {
    const p = { ...base, phase: "DISPUTED" as const, disputeRaisedAt: now };
    expect(get(p).submitCounterpartyEvidence?.reasonDisabled).toBeNull();
    const evidenceEnd = new Date(now.getTime() + 72 * 3600_000); expect(get(p, evidenceEnd).submitCounterpartyEvidence?.reasonDisabled).not.toBeNull(); expect(get(p, evidenceEnd).postInitialRuling?.reasonDisabled).toBeNull();
    const timeout = new Date(now.getTime() + 30 * 86400_000); expect(get(p, timeout).finalizeArbiterTimeoutSplit?.reasonDisabled).toBeNull(); expect(get(p, timeout).postInitialRuling?.reasonDisabled).not.toBeNull();
  });
  it("uses ruling notice boundaries and challenge stall boundaries", () => {
    const ruling = { noticeEndsAt: new Date(now.getTime() + 1000), clientBps: 5000 };
    const initial = { ...base, phase: "INITIAL_RULING" as const }; expect(get(initial, now, ruling).challengeRuling?.reasonDisabled).toBeNull();
    expect(get(initial, ruling.noticeEndsAt, ruling).challengeRuling?.reasonDisabled).not.toBeNull(); expect(get(initial, ruling.noticeEndsAt, ruling).finalizeRuling?.reasonDisabled).toBeNull();
    const final = { ...base, phase: "FINAL_RULING" as const }; expect(get(final, ruling.noticeEndsAt, ruling).finalizeRuling?.reasonDisabled).toBeNull();
    const challenged = { ...base, phase: "CHALLENGED" as const, challengedAt: now }; const stall = new Date(now.getTime() + 30 * 86400_000);
    expect(get(challenged, stall).postFinalRuling?.reasonDisabled).not.toBeNull(); expect(get(challenged, stall).finalizeArbiterTimeoutSplit?.reasonDisabled).toBeNull();
  });
  it("offers pending settlement actions in every unresolved phase and none after resolution", () => {
    expect(Object.keys(get({ ...base, phase: "FINAL_RULING", settlementProposer: "0x1" }))).toContain("acceptSettlement");
    expect(availableActions({ ...base, phase: "RESOLVED" }, now)).toEqual([]);
    expect(availableActions({ ...base, phase: "NONE" }, now)).toEqual([]);
  });
});
