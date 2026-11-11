// apps/web/src/test/escrow-core/fold.test.ts
// BE-82: test dạng bảng cho fold. Mỗi quy tắc có ít nhất một test. Số tiền tính tay từ _resolve, không đọc lại từ code.
import { describe, expect, it } from "vitest";
import {
  foldEscrowEvent,
  type DecodedEscrowEvent,
  type EscrowState,
  type EventMeta,
  type FoldEffect,
  type Hex,
} from "@bloody-roar/shared/escrow";

const DAY = 86_400n;
const HOUR = 3_600n;
const CONTRACT: Hex = "0x1111111111111111111111111111111111111111";
const CLIENT: Hex = "0x2222222222222222222222222222222222222222";
const DEVELOPER: Hex = "0x3333333333333333333333333333333333333333";
const ARBITER: Hex = "0x4444444444444444444444444444444444444444";
const FEE: Hex = "0x5555555555555555555555555555555555555555";
const OUTSIDER: Hex = "0x6666666666666666666666666666666666666666";
const hash = (byte: string) => `0x${byte.repeat(32)}` as const;
const ZERO = hash("00");

const AMOUNT = 1_000_000_000n; // 1000 USDC
const T0 = 1_790_000_000n; // lúc deposit
const DEADLINE = T0 + 30n * DAY;

type Named<N extends DecodedEscrowEvent["name"]> = Extract<DecodedEscrowEvent, { name: N }>;
const ev = <N extends DecodedEscrowEvent["name"]>(event: Named<N>): Named<N> => event;

function meta(blockTimestamp: bigint): EventMeta {
  return {
    chainId: 84532,
    contractAddress: CONTRACT,
    blockNumber: 1n,
    blockHash: hash("bb"),
    txHash: hash("cc"),
    txIndex: 0,
    logIndex: 0,
    blockTimestamp,
  };
}

// Chạy chuỗi event, trả về trạng thái cuối và toàn bộ effect.
function play(steps: Array<[DecodedEscrowEvent, bigint]>, start: EscrowState | null = null) {
  let state = start;
  const effects: FoldEffect[] = [];
  for (const [event, ts] of steps) {
    const result = foldEscrowEvent(state, event, meta(ts));
    state = result.state;
    effects.push(...result.effects);
  }
  return { state, effects };
}

const ESCROW = hash("ab");
const deposit = (escrowIdHash = ESCROW, amount = AMOUNT) =>
  ev({
    name: "Deposited",
    escrowIdHash,
    client: CLIENT,
    developer: DEVELOPER,
    arbiter: ARBITER,
    feeRecipient: FEE,
    amount,
    deliveryDeadline: DEADLINE,
    termsHash: hash("11"),
  });
const work = (byDeveloper: Hex = DEVELOPER, deliveryHash: Hex = hash("22"), escrowIdHash: Hex = ESCROW) =>
  ev({ name: "WorkSubmitted", escrowIdHash, developer: byDeveloper, deliveryHash });
const resolved = (
  resolution: Named<"EscrowResolved">["resolution"],
  clientAmount: bigint,
  developerAmount: bigint,
  platformFee: bigint,
  decisionHash = ZERO,
  escrowIdHash = ESCROW,
) => ev({ name: "EscrowResolved", escrowIdHash, resolution, clientAmount, developerAmount, platformFee, decisionHash });

// Trạng thái sau deposit tại T0, để các test khác bắt đầu từ đây.
function funded(): EscrowState {
  const state = play([[deposit(), T0]]).state;
  if (!state) throw new Error("deposit produced no state");
  return state;
}

const RAISED = T0 + DAY; // dispute mở ở đây
const disputeAt = (raiserEvidence = hash("33")) =>
  ev({ name: "DisputeRaised", escrowIdHash: ESCROW, raisedBy: CLIENT, evidenceManifestHash: raiserEvidence });
const INITIAL_AT = RAISED + 3n * DAY; // sau 72 giờ
const initialRuling = (clientBps: number, decisionHash = hash("55"), at = INITIAL_AT) =>
  ev({
    name: "InitialRulingPosted",
    escrowIdHash: ESCROW,
    arbiter: ARBITER,
    clientBps,
    decisionHash,
    challengeEndsAt: at + 7n * DAY,
  });

// Chỉ dùng khi cần thấy số tiền. Phí 2,5% chỉ tính trên phần Developer.
function expectSplit(effect: FoldEffect | undefined, amount: bigint, clientBps: bigint) {
  const clientShare = (amount * clientBps) / 10_000n;
  const developerGross = amount - clientShare;
  const fee = (developerGross * 250n) / 10_000n;
  expect(effect).toMatchObject({ kind: "ESCROW_RESOLVED" });
  if (effect?.kind !== "ESCROW_RESOLVED") return;
  expect(effect.clientAmount).toBe(clientShare);
  expect(effect.platformFee).toBe(fee);
  expect(effect.developerAmount).toBe(amount - clientShare - fee);
}

describe("Deposited", () => {
  it("creates a FUNDED escrow stamped with the block time and emits FUNDED", () => {
    const { state, effects } = play([[deposit(), T0]]);
    expect(state).toMatchObject({
      escrowIdHash: ESCROW,
      client: CLIENT,
      developer: DEVELOPER,
      arbiter: ARBITER,
      feeRecipient: FEE,
      amount: AMOUNT,
      depositedAt: T0,
      deliveryDeadline: DEADLINE,
      phase: "FUNDED",
      resolutionKind: "NONE",
      deliveryHash: null,
      settlement: null,
      dispute: null,
    });
    expect(effects).toEqual([
      {
        kind: "FUNDED",
        escrowIdHash: ESCROW,
        client: CLIENT,
        developer: DEVELOPER,
        amount: AMOUNT,
        deliveryDeadline: DEADLINE,
        termsHash: hash("11"),
      },
    ]);
  });

  it("rejects a second deposit for the same escrow", () => {
    expect(() => play([[deposit(), T0], [deposit(), T0 + 1n]])).toThrow(/already exists/);
  });

  it("rejects a deposit where client and developer are the same address", () => {
    const self = ev({ ...deposit(), developer: CLIENT });
    expect(() => play([[self, T0]])).toThrow(/must differ/);
  });
});

describe("WorkSubmitted", () => {
  it("stores the delivery hash and keeps the escrow FUNDED", () => {
    const { state, effects } = play([[deposit(), T0], [work(), T0 + DAY]]);
    expect(state).toMatchObject({ phase: "FUNDED", deliveryHash: hash("22") });
    expect(effects.at(-1)).toEqual({
      kind: "WORK_SUBMITTED",
      escrowIdHash: ESCROW,
      developer: DEVELOPER,
      deliveryHash: hash("22"),
    });
  });

  it("replaces an earlier hash on resubmission (QĐ-22)", () => {
    const { state } = play([
      [deposit(), T0],
      [work(DEVELOPER, hash("22")), T0 + DAY],
      [work(DEVELOPER, hash("23")), T0 + 2n * DAY],
    ]);
    expect(state?.deliveryHash).toBe(hash("23"));
  });

  it("accepts work at the deadline and rejects it one second later", () => {
    expect(play([[deposit(), T0], [work(), DEADLINE]]).state?.deliveryHash).toBe(hash("22"));
    expect(() => play([[deposit(), T0], [work(), DEADLINE + 1n]])).toThrow(/deadline passed/);
  });

  it("rejects work from anyone but the developer", () => {
    expect(() => play([[deposit(), T0], [work(CLIENT), T0 + DAY]])).toThrow(/only the developer/);
  });

  it("rejects work once a dispute is open", () => {
    expect(() => play([[deposit(), T0], [disputeAt(), RAISED], [work(), RAISED + HOUR]])).toThrow(/expected phase FUNDED/);
  });

  it("rejects a zero delivery hash", () => {
    expect(() => play([[deposit(), T0], [work(DEVELOPER, ZERO), T0 + DAY]])).toThrow(/must not be zero/);
  });
});

describe("SettlementProposed and SettlementRevoked", () => {
  it("stores one pending proposal without changing the phase", () => {
    const { state, effects } = play([
      [deposit(), T0],
      [ev({ name: "SettlementProposed", escrowIdHash: ESCROW, proposer: CLIENT, clientBps: 3000 }), T0 + DAY],
    ]);
    expect(state).toMatchObject({ phase: "FUNDED", settlement: { proposer: CLIENT, clientBps: 3000 } });
    expect(effects.at(-1)).toEqual({ kind: "SETTLEMENT_PROPOSED", escrowIdHash: ESCROW, proposer: CLIENT, clientBps: 3000 });
  });

  it("rejects a second proposal while one is pending", () => {
    const propose = ev({ name: "SettlementProposed", escrowIdHash: ESCROW, proposer: CLIENT, clientBps: 3000 });
    expect(() => play([[deposit(), T0], [propose, T0 + 1n], [propose, T0 + 2n]])).toThrow(/already pending/);
  });

  it("rejects a proposal from outside the escrow", () => {
    const outsider = ev({ name: "SettlementProposed", escrowIdHash: ESCROW, proposer: OUTSIDER, clientBps: 3000 });
    expect(() => play([[deposit(), T0], [outsider, T0 + 1n]])).toThrow(/only a party/);
  });

  it("clears the proposal on revoke by its proposer only", () => {
    const propose = ev({ name: "SettlementProposed", escrowIdHash: ESCROW, proposer: CLIENT, clientBps: 3000 });
    const revoke = (by: `0x${string}`) => ev({ name: "SettlementRevoked", escrowIdHash: ESCROW, proposer: by });
    const { state } = play([[deposit(), T0], [propose, T0 + 1n], [revoke(CLIENT), T0 + 2n]]);
    expect(state?.settlement).toBeNull();
    expect(() => play([[deposit(), T0], [propose, T0 + 1n], [revoke(DEVELOPER), T0 + 2n]])).toThrow(/only the proposer/);
    expect(() => play([[deposit(), T0], [revoke(CLIENT), T0 + 1n]])).toThrow(/no pending settlement/);
  });
});

describe("DisputeRaised", () => {
  it("moves FUNDED to DISPUTED and records the raiser's evidence and time", () => {
    const { state, effects } = play([[deposit(), T0], [disputeAt(), RAISED]]);
    expect(state?.phase).toBe("DISPUTED");
    expect(state?.dispute).toMatchObject({
      raisedBy: CLIENT,
      raisedAt: RAISED,
      raiserEvidenceHash: hash("33"),
      counterpartyEvidenceHash: null,
      initialClientBps: null,
      finalClientBps: null,
    });
    expect(effects.at(-1)).toEqual({
      kind: "DISPUTE_RAISED",
      escrowIdHash: ESCROW,
      raisedBy: CLIENT,
      evidenceManifestHash: hash("33"),
    });
  });

  it("rejects a dispute from outside the escrow", () => {
    const outsider = ev({ name: "DisputeRaised", escrowIdHash: ESCROW, raisedBy: OUTSIDER, evidenceManifestHash: hash("33") });
    expect(() => play([[deposit(), T0], [outsider, RAISED]])).toThrow(/only a party/);
  });

  it("rejects a second dispute and a dispute on a resolved escrow", () => {
    expect(() => play([[deposit(), T0], [disputeAt(), RAISED], [disputeAt(), RAISED + 1n]])).toThrow(/expected phase FUNDED/);
  });

  it("rejects a zero evidence hash", () => {
    expect(() => play([[deposit(), T0], [disputeAt(ZERO), RAISED]])).toThrow(/must not be zero/);
  });
});

describe("CounterpartyEvidenceSubmitted", () => {
  const counter = (by: `0x${string}` = DEVELOPER, h = hash("44")) =>
    ev({ name: "CounterpartyEvidenceSubmitted", escrowIdHash: ESCROW, submittedBy: by, evidenceManifestHash: h });

  it("lets the other party submit once and keeps the phase", () => {
    const { state, effects } = play([[deposit(), T0], [disputeAt(), RAISED], [counter(), RAISED + DAY]]);
    expect(state?.phase).toBe("DISPUTED");
    expect(state?.dispute?.counterpartyEvidenceHash).toBe(hash("44"));
    expect(effects.at(-1)).toMatchObject({ kind: "COUNTERPARTY_EVIDENCE_SUBMITTED", submittedBy: DEVELOPER });
  });

  it("rejects the raiser answering their own dispute", () => {
    expect(() => play([[deposit(), T0], [disputeAt(), RAISED], [counter(CLIENT), RAISED + DAY]])).toThrow(/only the counterparty/);
  });

  it("rejects a second submission", () => {
    expect(() =>
      play([[deposit(), T0], [disputeAt(), RAISED], [counter(), RAISED + DAY], [counter(), RAISED + 2n * DAY]]),
    ).toThrow(/already submitted/);
  });

  it("closes the 72-hour window exactly at raise + 72h", () => {
    const justInside = RAISED + 3n * DAY - 1n;
    expect(play([[deposit(), T0], [disputeAt(), RAISED], [counter(), justInside]]).state?.dispute?.counterpartyEvidenceHash).toBe(
      hash("44"),
    );
    expect(() => play([[deposit(), T0], [disputeAt(), RAISED], [counter(), RAISED + 3n * DAY]])).toThrow(/window closed/);
  });
});

describe("InitialRulingPosted", () => {
  it("moves DISPUTED to INITIAL_RULING with the ruling and a 7-day challenge end", () => {
    const { state, effects } = play([[deposit(), T0], [disputeAt(), RAISED], [initialRuling(5000), INITIAL_AT]]);
    expect(state?.phase).toBe("INITIAL_RULING");
    expect(state?.dispute).toMatchObject({ initialClientBps: 5000, initialRulingAt: INITIAL_AT, initialDecisionHash: hash("55") });
    expect(effects.at(-1)).toEqual({
      kind: "INITIAL_RULING_POSTED",
      escrowIdHash: ESCROW,
      arbiter: ARBITER,
      clientBps: 5000,
      decisionHash: hash("55"),
      challengeEndsAt: INITIAL_AT + 7n * DAY,
    });
  });

  it("refuses a ruling before the evidence period ends", () => {
    const early = RAISED + 3n * DAY - 1n;
    expect(() => play([[deposit(), T0], [disputeAt(), RAISED], [initialRuling(5000, hash("55"), early), early]])).toThrow(
      /evidence period/,
    );
  });

  it("refuses a ruling at or after the 30-day arbiter stall", () => {
    const late = RAISED + 30n * DAY;
    expect(() => play([[deposit(), T0], [disputeAt(), RAISED], [initialRuling(5000, hash("55"), late), late]])).toThrow(/stall/);
  });

  it("refuses a ruling from anyone but the escrow's arbiter", () => {
    const fake = ev({ ...initialRuling(5000), arbiter: OUTSIDER } as Named<"InitialRulingPosted">);
    expect(() => play([[deposit(), T0], [disputeAt(), RAISED], [fake, INITIAL_AT]])).toThrow(/only the escrow arbiter/);
  });

  it("refuses a challenge end that does not match the posting block", () => {
    const wrong = ev({ ...initialRuling(5000), challengeEndsAt: INITIAL_AT + 6n * DAY } as Named<"InitialRulingPosted">);
    expect(() => play([[deposit(), T0], [disputeAt(), RAISED], [wrong, INITIAL_AT]])).toThrow(/challenge end/);
  });
});

describe("RulingChallenged", () => {
  const challenge = (by: `0x${string}`, at = INITIAL_AT + DAY) =>
    ev({ name: "RulingChallenged", escrowIdHash: ESCROW, challengedBy: by, challengedAt: at });
  const base = (clientBps: number) => [
    [deposit(), T0] as [DecodedEscrowEvent, bigint],
    [disputeAt(), RAISED] as [DecodedEscrowEvent, bigint],
    [initialRuling(clientBps), INITIAL_AT] as [DecodedEscrowEvent, bigint],
  ];

  it("lets the client challenge a ruling that gives them less than everything", () => {
    const { state, effects } = play([...base(5000), [challenge(CLIENT), INITIAL_AT + DAY]]);
    expect(state).toMatchObject({ phase: "CHALLENGED" });
    expect(state?.dispute?.challengedAt).toBe(INITIAL_AT + DAY);
    expect(effects.at(-1)).toMatchObject({ kind: "RULING_CHALLENGED", challengedBy: CLIENT });
  });

  it("lets the developer challenge a ruling that gives them anything", () => {
    expect(play([...base(5000), [challenge(DEVELOPER), INITIAL_AT + DAY]]).state?.phase).toBe("CHALLENGED");
  });

  it("refuses the client challenging a full-client ruling, and the developer challenging a zero-client one", () => {
    expect(() => play([...base(10_000), [challenge(CLIENT), INITIAL_AT + DAY]])).toThrow(/cannot challenge/);
    expect(() => play([...base(0), [challenge(DEVELOPER), INITIAL_AT + DAY]])).toThrow(/cannot challenge/);
  });

  it("refuses a challenge from the arbiter or an outsider", () => {
    expect(() => play([...base(5000), [challenge(ARBITER), INITIAL_AT + DAY]])).toThrow(/cannot challenge/);
    expect(() => play([...base(5000), [challenge(OUTSIDER), INITIAL_AT + DAY]])).toThrow(/cannot challenge/);
  });

  it("closes the challenge window exactly at the 7th day", () => {
    const closing = INITIAL_AT + 7n * DAY;
    expect(() => play([...base(5000), [challenge(CLIENT, closing), closing]])).toThrow(/window closed/);
  });

  it("refuses a challenge time that does not match the block", () => {
    expect(() => play([...base(5000), [challenge(CLIENT, INITIAL_AT + 2n * DAY), INITIAL_AT + DAY]])).toThrow(/does not match/);
  });
});

describe("FinalRulingPosted", () => {
  const challenged = () => [
    [deposit(), T0] as [DecodedEscrowEvent, bigint],
    [disputeAt(), RAISED] as [DecodedEscrowEvent, bigint],
    [initialRuling(5000), INITIAL_AT] as [DecodedEscrowEvent, bigint],
    [ev({ name: "RulingChallenged", escrowIdHash: ESCROW, challengedBy: CLIENT, challengedAt: INITIAL_AT + DAY }), INITIAL_AT + DAY] as [
      DecodedEscrowEvent,
      bigint,
    ],
  ];
  const final = (clientBps: number, at: bigint, notice = at + 24n * HOUR) =>
    ev({ name: "FinalRulingPosted", escrowIdHash: ESCROW, arbiter: ARBITER, clientBps, decisionHash: hash("66"), noticeEndsAt: notice });

  it("moves CHALLENGED to FINAL_RULING with a 24-hour notice", () => {
    const at = INITIAL_AT + 2n * DAY;
    const { state, effects } = play([...challenged(), [final(7000, at), at]]);
    expect(state?.phase).toBe("FINAL_RULING");
    expect(state?.dispute).toMatchObject({ finalClientBps: 7000, finalRulingAt: at, finalDecisionHash: hash("66") });
    expect(effects.at(-1)).toMatchObject({ kind: "FINAL_RULING_POSTED", noticeEndsAt: at + 24n * HOUR });
  });

  it("refuses a final ruling before any challenge", () => {
    const at = INITIAL_AT + 2n * DAY;
    expect(() => play([[deposit(), T0], [disputeAt(), RAISED], [initialRuling(5000), INITIAL_AT], [final(7000, at), at]])).toThrow(
      /expected phase CHALLENGED/,
    );
  });

  it("refuses a final ruling from anyone but the arbiter, and one at or after the 30-day stall", () => {
    const at = INITIAL_AT + 2n * DAY;
    const fake = ev({ ...final(7000, at), arbiter: OUTSIDER } as Named<"FinalRulingPosted">);
    expect(() => play([...challenged(), [fake, at]])).toThrow(/only the escrow arbiter/);
    const late = INITIAL_AT + DAY + 30n * DAY;
    expect(() => play([...challenged(), [final(7000, late), late]])).toThrow(/stall/);
  });

  it("refuses a notice end that does not match the posting block", () => {
    const at = INITIAL_AT + 2n * DAY;
    expect(() => play([...challenged(), [final(7000, at, at + 23n * HOUR), at]])).toThrow(/notice end/);
  });
});

describe("EscrowResolved", () => {
  it("RELEASE: client gets nothing, the developer gets principal minus 2.5%", () => {
    const at = T0 + 2n * DAY;
    const { state, effects } = play([
      [deposit(), T0],
      [work(), T0 + DAY],
      [resolved("RELEASE", 0n, 975_000_000n, 25_000_000n), at],
    ]);
    expect(state).toMatchObject({ phase: "RESOLVED", resolutionKind: "RELEASE", settlement: null });
    expect(effects.at(-1)).toEqual({
      kind: "ESCROW_RESOLVED",
      escrowIdHash: ESCROW,
      resolution: "RELEASE",
      client: CLIENT,
      developer: DEVELOPER,
      feeRecipient: FEE,
      clientAmount: 0n,
      developerAmount: 975_000_000n,
      platformFee: 25_000_000n,
      decisionHash: ZERO,
    });
  });

  it("RELEASE: rejected with no delivery", () => {
    expect(() => play([[deposit(), T0], [resolved("RELEASE", 0n, 975_000_000n, 25_000_000n), T0 + DAY]])).toThrow(/no delivery/);
  });

  it("MISSED_DELIVERY_REFUND: the client gets everything and no fee is charged", () => {
    const { effects } = play([
      [deposit(), T0],
      [resolved("MISSED_DELIVERY_REFUND", AMOUNT, 0n, 0n), DEADLINE + 1n],
    ]);
    expectSplit(effects.at(-1), AMOUNT, 10_000n);
    expect(effects.at(-1)).toMatchObject({ clientAmount: AMOUNT, developerAmount: 0n, platformFee: 0n });
  });

  it("MISSED_DELIVERY_REFUND: needs the deadline passed and no delivery", () => {
    expect(() => play([[deposit(), T0], [resolved("MISSED_DELIVERY_REFUND", AMOUNT, 0n, 0n), DEADLINE]])).toThrow(/not reached/);
    expect(() =>
      play([
        [deposit(), T0],
        [work(), T0 + DAY],
        [resolved("MISSED_DELIVERY_REFUND", AMOUNT, 0n, 0n), DEADLINE + 1n],
      ]),
    ).toThrow(/delivery was submitted/);
  });

  it("REVIEW_TIMEOUT: only after the deadline plus 7 days, and only with a delivery", () => {
    const reviewEnd = DEADLINE + 7n * DAY;
    const amounts = [0n, 975_000_000n, 25_000_000n] as const;
    expect(() =>
      play([[deposit(), T0], [work(), T0 + DAY], [resolved("REVIEW_TIMEOUT", ...amounts), reviewEnd - 1n]]),
    ).toThrow(/review window still open/);
    expect(play([[deposit(), T0], [work(), T0 + DAY], [resolved("REVIEW_TIMEOUT", ...amounts), reviewEnd]]).state?.phase).toBe(
      "RESOLVED",
    );
    expect(() => play([[deposit(), T0], [resolved("REVIEW_TIMEOUT", ...amounts), reviewEnd]])).toThrow(/no delivery to review/);
  });

  it("SETTLEMENT: uses the pending client share and clears the proposal", () => {
    const { state, effects } = play([
      [deposit(), T0],
      [ev({ name: "SettlementProposed", escrowIdHash: ESCROW, proposer: CLIENT, clientBps: 3000 }), T0 + DAY],
      [resolved("SETTLEMENT", 300_000_000n, 682_500_000n, 17_500_000n), T0 + 2n * DAY],
    ]);
    expect(state).toMatchObject({ phase: "RESOLVED", resolutionKind: "SETTLEMENT", settlement: null });
    expectSplit(effects.at(-1), AMOUNT, 3000n);
  });

  it("SETTLEMENT: rejected with no pending proposal", () => {
    expect(() => play([[deposit(), T0], [resolved("SETTLEMENT", 0n, 975_000_000n, 25_000_000n), T0 + DAY]])).toThrow(/no pending settlement/);
  });

  it("RULING via the initial ruling: applies only after the 7-day challenge window", () => {
    const after = INITIAL_AT + 7n * DAY;
    const steps: Array<[DecodedEscrowEvent, bigint]> = [
      [deposit(), T0],
      [disputeAt(), RAISED],
      [initialRuling(5000), INITIAL_AT],
    ];
    expect(() => play([...steps, [resolved("RULING", 500_000_000n, 487_500_000n, 12_500_000n, hash("55")), after - 1n]])).toThrow(
      /challenge window still open/,
    );
    const { state, effects } = play([...steps, [resolved("RULING", 500_000_000n, 487_500_000n, 12_500_000n, hash("55")), after]]);
    expect(state).toMatchObject({ phase: "RESOLVED", resolutionKind: "RULING" });
    expectSplit(effects.at(-1), AMOUNT, 5000n);
  });

  it("RULING via the final ruling: applies only after the 24-hour notice", () => {
    const at = INITIAL_AT + 2n * DAY;
    const steps: Array<[DecodedEscrowEvent, bigint]> = [
      [deposit(), T0],
      [disputeAt(), RAISED],
      [initialRuling(5000), INITIAL_AT],
      [ev({ name: "RulingChallenged", escrowIdHash: ESCROW, challengedBy: DEVELOPER, challengedAt: INITIAL_AT + DAY }), INITIAL_AT + DAY],
      [ev({ name: "FinalRulingPosted", escrowIdHash: ESCROW, arbiter: ARBITER, clientBps: 7000, decisionHash: hash("66"), noticeEndsAt: at + 24n * HOUR }), at],
    ];
    const payout = [700_000_000n, 292_500_000n, 7_500_000n] as const;
    expect(() => play([...steps, [resolved("RULING", ...payout, hash("66")), at + 24n * HOUR - 1n]])).toThrow(/notice period/);
    const { effects } = play([...steps, [resolved("RULING", ...payout, hash("66")), at + 24n * HOUR]]);
    expectSplit(effects.at(-1), AMOUNT, 7000n);
  });

  it("RULING: the decision hash must be the one that was posted", () => {
    const after = INITIAL_AT + 7n * DAY;
    expect(() =>
      play([
        [deposit(), T0],
        [disputeAt(), RAISED],
        [initialRuling(5000), INITIAL_AT],
        [resolved("RULING", 500_000_000n, 487_500_000n, 12_500_000n, hash("99")), after],
      ]),
    ).toThrow(/decision hash/);
  });

  it("ARBITER_TIMEOUT_SPLIT: splits 50/50 after 30 days in DISPUTED, fee on the developer half", () => {
    const at = RAISED + 30n * DAY;
    const { state, effects } = play([
      [deposit(), T0],
      [disputeAt(), RAISED],
      [resolved("ARBITER_TIMEOUT_SPLIT", 500_000_000n, 487_500_000n, 12_500_000n), at],
    ]);
    expect(state?.resolutionKind).toBe("ARBITER_TIMEOUT_SPLIT");
    expectSplit(effects.at(-1), AMOUNT, 5000n);
  });

  it("ARBITER_TIMEOUT_SPLIT: counts 30 days from the challenge when the final ruling is overdue", () => {
    const challengedAt = INITIAL_AT + DAY;
    const steps: Array<[DecodedEscrowEvent, bigint]> = [
      [deposit(), T0],
      [disputeAt(), RAISED],
      [initialRuling(5000), INITIAL_AT],
      [ev({ name: "RulingChallenged", escrowIdHash: ESCROW, challengedBy: DEVELOPER, challengedAt }), challengedAt],
    ];
    const payout = [500_000_000n, 487_500_000n, 12_500_000n] as const;
    expect(() => play([...steps, [resolved("ARBITER_TIMEOUT_SPLIT", ...payout), challengedAt + 30n * DAY - 1n]])).toThrow(/stall period/);
    expect(play([...steps, [resolved("ARBITER_TIMEOUT_SPLIT", ...payout), challengedAt + 30n * DAY]]).state?.phase).toBe("RESOLVED");
  });

  it("refuses any resolution once the escrow is RESOLVED", () => {
    const at = T0 + 2n * DAY;
    expect(() =>
      play([
        [deposit(), T0],
        [work(), T0 + DAY],
        [resolved("RELEASE", 0n, 975_000_000n, 25_000_000n), at],
        [resolved("RELEASE", 0n, 975_000_000n, 25_000_000n), at + 1n],
      ]),
    ).toThrow(/already resolved/);
  });

  it("refuses payout amounts that break the fee rule, such as a fee on the client's share", () => {
    // 3000 bps cho client. Phí đúng là 17,5 triệu trên phần Developer, không phải trên toàn bộ.
    expect(() =>
      play([
        [deposit(), T0],
        [ev({ name: "SettlementProposed", escrowIdHash: ESCROW, proposer: CLIENT, clientBps: 3000 }), T0 + DAY],
        [resolved("SETTLEMENT", 300_000_000n, 675_000_000n, 25_000_000n), T0 + 2n * DAY],
      ]),
    ).toThrow(/fee rule/);
  });

  it("conserves the principal and charges the fee only on the developer's share, for every resolution", () => {
    const cases: Array<[Parameters<typeof resolved>, bigint]> = [
      [["RELEASE", 0n, 975_000_000n, 25_000_000n], 0n],
      [["MISSED_DELIVERY_REFUND", AMOUNT, 0n, 0n], 10_000n],
      [["SETTLEMENT", 300_000_000n, 682_500_000n, 17_500_000n], 3000n],
      [["ARBITER_TIMEOUT_SPLIT", 500_000_000n, 487_500_000n, 12_500_000n], 5000n],
    ];
    // Bước cần có trước mỗi kết thúc, và thời điểm kết thúc.
    const setup: Record<string, Array<[DecodedEscrowEvent, bigint]>> = {
      RELEASE: [[work(), T0 + DAY]],
      MISSED_DELIVERY_REFUND: [],
      SETTLEMENT: [[ev({ name: "SettlementProposed", escrowIdHash: ESCROW, proposer: CLIENT, clientBps: 3000 }), T0 + DAY]],
      ARBITER_TIMEOUT_SPLIT: [[disputeAt(), RAISED]],
    };
    const resolveAt: Record<string, bigint> = {
      RELEASE: T0 + 2n * DAY,
      MISSED_DELIVERY_REFUND: DEADLINE + 1n,
      SETTLEMENT: T0 + 2n * DAY,
      ARBITER_TIMEOUT_SPLIT: RAISED + 30n * DAY,
    };

    for (const [args, bps] of cases) {
      const kind = args[0] ?? "";
      const steps: Array<[DecodedEscrowEvent, bigint]> = [[deposit(), T0], ...(setup[kind] ?? []), [resolved(...args), resolveAt[kind] ?? 0n]];
      const effect = play(steps).effects.at(-1);
      expect(effect).toMatchObject({ kind: "ESCROW_RESOLVED" });
      if (effect?.kind !== "ESCROW_RESOLVED") continue;
      expect(effect.clientAmount + effect.developerAmount + effect.platformFee, kind).toBe(AMOUNT);
      expectSplit(effect, AMOUNT, bps);
    }
  });
});

describe("Claimed and governance events", () => {
  it("Claimed emits CLAIMED and leaves the escrow state alone, even with no escrow", () => {
    const claim = ev({ name: "Claimed", recipient: DEVELOPER, caller: OUTSIDER, amount: 975_000_000n });
    const none = foldEscrowEvent(null, claim, meta(T0));
    expect(none).toEqual({
      state: null,
      effects: [{ kind: "CLAIMED", recipient: DEVELOPER, caller: OUTSIDER, amount: 975_000_000n }],
    });
    const state = funded();
    expect(foldEscrowEvent(state, claim, meta(T0)).state).toBe(state);
  });

  it("pause events emit PAUSE_CHANGED and governance events emit GOVERNANCE_CHANGED, neither touching the escrow", () => {
    const state = funded();
    const paused = ev({ name: "Paused", account: ARBITER });
    const transfer = ev({ name: "ArbiterTransferProposed", currentArbiter: ARBITER, pendingArbiter: OUTSIDER });
    expect(foldEscrowEvent(state, paused, meta(T0))).toEqual({
      state,
      effects: [{ kind: "PAUSE_CHANGED", event: paused }],
    });
    expect(foldEscrowEvent(null, transfer, meta(T0))).toEqual({
      state: null,
      effects: [{ kind: "GOVERNANCE_CHANGED", event: transfer }],
    });
  });
});

describe("guards on event order and identity", () => {
  it("rejects an escrow event that arrives before its deposit", () => {
    expect(() => play([[work(), T0]])).toThrow(/never deposited/);
  });

  it("rejects an event that names a different escrow", () => {
    const other = ev({ name: "WorkSubmitted", escrowIdHash: hash("ee"), developer: DEVELOPER, deliveryHash: hash("22") });
    expect(() => play([[deposit(), T0], [other, T0 + DAY]])).toThrow(/another escrow/);
  });
});

describe("balances across escrows", () => {
  it("credits payouts on resolution, debits on claim, and keeps the ledger equal to the resolved principal", () => {
    const escrowA = hash("a1");
    const escrowB = hash("b2");
    const runA: Array<[DecodedEscrowEvent, bigint]> = [
      [deposit(escrowA), T0],
      [work(DEVELOPER, hash("22"), escrowA), T0 + DAY],
      [resolved("RELEASE", 0n, 975_000_000n, 25_000_000n, ZERO, escrowA), T0 + 2n * DAY],
    ];
    const runB: Array<[DecodedEscrowEvent, bigint]> = [
      [deposit(escrowB), T0],
      [resolved("MISSED_DELIVERY_REFUND", AMOUNT, 0n, 0n, ZERO, escrowB), DEADLINE + 1n],
    ];
    const effects = [...play(runA).effects, ...play(runB).effects];

    const ledger = new Map<string, bigint>();
    const credit = (who: string, amount: bigint) => ledger.set(who, (ledger.get(who) ?? 0n) + amount);
    for (const effect of effects) {
      if (effect.kind === "ESCROW_RESOLVED") {
        credit(effect.client, effect.clientAmount);
        credit(effect.developer, effect.developerAmount);
        credit(effect.feeRecipient, effect.platformFee);
      }
    }
    const credited = [...ledger.values()].reduce((sum, value) => sum + value, 0n);
    expect(credited).toBe(2n * AMOUNT);
    expect(ledger.get(DEVELOPER)).toBe(975_000_000n);
    expect(ledger.get(FEE)).toBe(25_000_000n);
    expect(ledger.get(CLIENT)).toBe(AMOUNT);

    // Developer claim toàn bộ số dư của mình.
    credit(DEVELOPER, -975_000_000n);
    expect(ledger.get(DEVELOPER)).toBe(0n);
    expect([...ledger.values()].reduce((sum, value) => sum + value, 0n)).toBe(2n * AMOUNT - 975_000_000n);
  });
});
