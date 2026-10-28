import { expect, test } from "bun:test";
import { ARBITER_STALL_MS, dueDeadlineNotices, DAY_MS, EVIDENCE_MS, HOUR_MS, type DeadlineInput } from "../src/jobs/deadlines";

const t = (iso: string) => new Date(iso);
const base: DeadlineInput = {
  id: "e1",
  phase: "FUNDED",
  deliveryHash: null,
  deliveryDeadline: t("2027-01-10T00:00:00Z"),
  reviewDeadline: t("2027-01-17T00:00:00Z"),
  disputeRaisedAt: null,
  challengedAt: null,
  initialNoticeEndsAt: null,
  finalNoticeEndsAt: null,
};

test("missed delivery opens at the delivery deadline when nothing was submitted", () => {
  expect(dueDeadlineNotices(base, t("2027-01-09T23:59:59Z"))).toEqual([]);
  expect(dueDeadlineNotices(base, t("2027-01-10T00:00:00Z"))).toEqual([
    { kind: "MISSED_DELIVERY", at: base.deliveryDeadline, dedupeKey: "deadline:e1:MISSED_DELIVERY" },
  ]);
});

test("review timeout replaces missed delivery once work was submitted", () => {
  const submitted = { ...base, deliveryHash: "0xdelivery" };
  const kinds = (now: string) => dueDeadlineNotices(submitted, t(now)).map((n) => n.kind);
  expect(kinds("2027-01-12T00:00:00Z")).toEqual([]);
  expect(kinds("2027-01-17T00:00:00Z")).toEqual(["REVIEW_TIMEOUT"]);
});

test("evidence is about to close 24 hours before the 72-hour window ends", () => {
  const disputed = { ...base, phase: "DISPUTED" as const, disputeRaisedAt: t("2027-02-01T00:00:00Z") };
  const warnAt = new Date(disputed.disputeRaisedAt.getTime() + EVIDENCE_MS - DAY_MS);
  expect(dueDeadlineNotices(disputed, new Date(warnAt.getTime() - 1))).toEqual([]);
  expect(dueDeadlineNotices(disputed, warnAt).map((n) => n.kind)).toEqual(["EVIDENCE_ENDING"]);
});

test("arbiter stall counts 30 days from the challenge when there is one, else from the raise", () => {
  const raised = t("2027-02-01T00:00:00Z");
  const challenged = t("2027-02-10T00:00:00Z");
  const stallAt = (input: DeadlineInput) =>
    dueDeadlineNotices(input, new Date(raised.getTime() + ARBITER_STALL_MS + 30 * DAY_MS)).find((n) => n.kind === "ARBITER_STALL")?.at;

  expect(stallAt({ ...base, phase: "DISPUTED", disputeRaisedAt: raised })).toEqual(new Date(raised.getTime() + ARBITER_STALL_MS));
  expect(stallAt({ ...base, phase: "CHALLENGED", disputeRaisedAt: raised, challengedAt: challenged })).toEqual(
    new Date(challenged.getTime() + ARBITER_STALL_MS),
  );
});

test("challenge end and final notice follow the latest ruling's notice window", () => {
  const endsAt = t("2027-03-01T00:00:00Z");
  const kindsAt = (input: DeadlineInput, now: Date) => dueDeadlineNotices(input, now).map((n) => n.kind);
  expect(kindsAt({ ...base, phase: "INITIAL_RULING", initialNoticeEndsAt: endsAt }, endsAt)).toEqual(["CHALLENGE_ENDED"]);
  expect(kindsAt({ ...base, phase: "FINAL_RULING", finalNoticeEndsAt: endsAt }, endsAt)).toEqual(["FINAL_NOTICE_ENDED"]);
  expect(kindsAt({ ...base, phase: "FINAL_RULING", finalNoticeEndsAt: endsAt }, new Date(endsAt.getTime() - HOUR_MS))).toEqual([]);
});

test("resolved escrows never produce notices", () => {
  expect(dueDeadlineNotices({ ...base, phase: "RESOLVED" }, t("2030-01-01T00:00:00Z"))).toEqual([]);
});
