// packages/shared/src/escrow/fold.ts
// Hàm thuần: không I/O, không đọc env. Quy tắc suy ra từ BloodyRoarEscrow.sol. Mỗi quy tắc có test trong BE-82.
// Fold chỉ kiểm để phát hiện chuỗi event không thể có on-chain (lỗi indexer, reorg, decoder lệch). Không thay thế việc contract kiểm.
import { ESCROW_CONSTANTS } from "./constants";
import { splitPayout } from "../money";
import type {
  DecodedEscrowEvent,
  DisputeState,
  EscrowPhase,
  EscrowResolutionKind,
  EscrowState,
  EventMeta,
  FoldEffect,
  GovernanceEvent,
  Hex,
  PauseEvent,
} from "./types";

// state là null với event không thuộc escrow nào (Claimed, Paused, governance). Khi đó state trả về là đầu vào, không đổi.
export type FoldResult = { state: EscrowState | null; effects: FoldEffect[] };

type EscrowScopedEvent = Exclude<
  DecodedEscrowEvent,
  Extract<DecodedEscrowEvent, { name: "Deposited" | "Claimed" }> | GovernanceEvent | PauseEvent
>;

const DAY = 86_400n;
const HOUR = 3_600n;
const MAX_BPS = 10_000;
const ZERO_HASH: Hex = `0x${"00".repeat(32)}`;

const REVIEW_PERIOD = BigInt(ESCROW_CONSTANTS.REVIEW_DAYS) * DAY;
const EVIDENCE_PERIOD = BigInt(ESCROW_CONSTANTS.EVIDENCE_HOURS) * HOUR;
const CHALLENGE_PERIOD = BigInt(ESCROW_CONSTANTS.CHALLENGE_DAYS) * DAY;
const FINAL_NOTICE_PERIOD = BigInt(ESCROW_CONSTANTS.FINAL_NOTICE_HOURS) * HOUR;
const ARBITER_STALL_PERIOD = BigInt(ESCROW_CONSTANTS.ARBITER_STALL_DAYS) * DAY;

function reject(reason: string): never {
  throw new Error(reason);
}

function same(a: Hex, b: Hex): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function isParty(state: EscrowState, address: Hex): boolean {
  return same(address, state.client) || same(address, state.developer);
}

function requirePhase(state: EscrowState, phase: EscrowPhase): void {
  if (state.phase !== phase) reject(`expected phase ${phase}, found ${state.phase}`);
}

function requireDispute(state: EscrowState): DisputeState {
  return state.dispute ?? reject("escrow has no dispute record");
}

function requireNonZero(hash: Hex): void {
  if (same(hash, ZERO_HASH)) reject("hash must not be zero");
}

export function foldEscrowEvent(state: EscrowState | null, event: DecodedEscrowEvent, meta: EventMeta): FoldResult {
  switch (event.name) {
    case "Deposited":
      return deposited(state, event, meta);
    case "Claimed":
      // Claimed không thuộc escrow nào. Số dư claimable do tầng DB cộng và trừ theo effect này.
      return {
        state,
        effects: [{ kind: "CLAIMED", recipient: event.recipient, caller: event.caller, amount: event.amount }],
      };
    case "ArbiterTransferProposed":
    case "ArbiterUpdated":
    case "FeeRecipientTransferProposed":
    case "FeeRecipientUpdated":
    case "OwnershipTransferStarted":
    case "OwnershipTransferred":
      return { state, effects: [{ kind: "GOVERNANCE_CHANGED", event }] };
    case "Paused":
    case "Unpaused":
      return { state, effects: [{ kind: "PAUSE_CHANGED", event }] };
    default:
      if (state === null) reject(`${event.name} arrived for an escrow that was never deposited`);
      return escrowEvent(state, event, meta);
  }
}

function deposited(
  state: EscrowState | null,
  event: Extract<DecodedEscrowEvent, { name: "Deposited" }>,
  meta: EventMeta,
): FoldResult {
  if (state !== null) reject("escrow already exists");
  if (same(event.client, event.developer)) reject("client and developer must differ");
  const next: EscrowState = {
    escrowIdHash: event.escrowIdHash,
    client: event.client,
    developer: event.developer,
    arbiter: event.arbiter,
    feeRecipient: event.feeRecipient,
    amount: event.amount,
    depositedAt: meta.blockTimestamp,
    deliveryDeadline: event.deliveryDeadline,
    termsHash: event.termsHash,
    deliveryHash: null,
    phase: "FUNDED",
    resolutionKind: "NONE",
    settlement: null,
    dispute: null,
  };
  return {
    state: next,
    effects: [
      {
        kind: "FUNDED",
        escrowIdHash: event.escrowIdHash,
        client: event.client,
        developer: event.developer,
        amount: event.amount,
        deliveryDeadline: event.deliveryDeadline,
        termsHash: event.termsHash,
      },
    ],
  };
}

function escrowEvent(state: EscrowState, event: EscrowScopedEvent, meta: EventMeta): FoldResult {
  if (event.escrowIdHash !== state.escrowIdHash) reject("event belongs to another escrow");
  const now = meta.blockTimestamp;

  switch (event.name) {
    case "WorkSubmitted": {
      // submitWork: chỉ Developer, khi FUNDED và còn trong hạn. Gửi lại được và thay hash cũ (QĐ-22).
      requirePhase(state, "FUNDED");
      if (!same(event.developer, state.developer)) reject("only the developer can submit work");
      if (now > state.deliveryDeadline) reject("delivery deadline passed");
      requireNonZero(event.deliveryHash);
      return {
        state: { ...state, deliveryHash: event.deliveryHash },
        effects: [
          { kind: "WORK_SUBMITTED", escrowIdHash: event.escrowIdHash, developer: event.developer, deliveryHash: event.deliveryHash },
        ],
      };
    }

    case "SettlementProposed": {
      // proposeSettlement: một đề xuất đang chờ tại một thời điểm, do một bên đề xuất.
      if (state.phase === "RESOLVED") reject("escrow already resolved");
      if (state.settlement !== null) reject("settlement already pending");
      if (!isParty(state, event.proposer)) reject("only a party can propose a settlement");
      return {
        state: { ...state, settlement: { proposer: event.proposer, clientBps: event.clientBps } },
        effects: [
          { kind: "SETTLEMENT_PROPOSED", escrowIdHash: event.escrowIdHash, proposer: event.proposer, clientBps: event.clientBps },
        ],
      };
    }

    case "SettlementRevoked": {
      if (state.phase === "RESOLVED") reject("escrow already resolved");
      if (state.settlement === null) reject("no pending settlement");
      if (!same(event.proposer, state.settlement.proposer)) reject("only the proposer can revoke a settlement");
      return {
        state: { ...state, settlement: null },
        effects: [{ kind: "SETTLEMENT_REVOKED", escrowIdHash: event.escrowIdHash, proposer: event.proposer }],
      };
    }

    case "DisputeRaised": {
      // raiseDispute: chỉ khi FUNDED, bởi một bên. Mốc raisedAt là thời điểm event.
      requirePhase(state, "FUNDED");
      if (!isParty(state, event.raisedBy)) reject("only a party can raise a dispute");
      requireNonZero(event.evidenceManifestHash);
      const dispute: DisputeState = {
        raisedBy: event.raisedBy,
        raisedAt: now,
        raiserEvidenceHash: event.evidenceManifestHash,
        counterpartyEvidenceHash: null,
        initialClientBps: null,
        initialRulingAt: null,
        initialDecisionHash: null,
        challengedAt: null,
        finalClientBps: null,
        finalRulingAt: null,
        finalDecisionHash: null,
      };
      return {
        state: { ...state, phase: "DISPUTED", dispute },
        effects: [
          {
            kind: "DISPUTE_RAISED",
            escrowIdHash: event.escrowIdHash,
            raisedBy: event.raisedBy,
            evidenceManifestHash: event.evidenceManifestHash,
          },
        ],
      };
    }

    case "CounterpartyEvidenceSubmitted": {
      // Bên còn lại nộp bằng chứng một lần, trong 72 giờ kể từ lúc raise.
      requirePhase(state, "DISPUTED");
      const dispute = requireDispute(state);
      const counterparty = same(dispute.raisedBy, state.client) ? state.developer : state.client;
      if (!same(event.submittedBy, counterparty)) reject("only the counterparty can submit evidence");
      if (dispute.counterpartyEvidenceHash !== null) reject("evidence already submitted");
      if (now >= dispute.raisedAt + EVIDENCE_PERIOD) reject("evidence window closed");
      requireNonZero(event.evidenceManifestHash);
      return {
        state: { ...state, dispute: { ...dispute, counterpartyEvidenceHash: event.evidenceManifestHash } },
        effects: [
          {
            kind: "COUNTERPARTY_EVIDENCE_SUBMITTED",
            escrowIdHash: event.escrowIdHash,
            submittedBy: event.submittedBy,
            evidenceManifestHash: event.evidenceManifestHash,
          },
        ],
      };
    }

    case "InitialRulingPosted": {
      // postInitialRuling: arbiter của escrow, sau hết 72 giờ và trước mốc 30 ngày.
      requirePhase(state, "DISPUTED");
      const dispute = requireDispute(state);
      if (!same(event.arbiter, state.arbiter)) reject("only the escrow arbiter can rule");
      requireNonZero(event.decisionHash);
      if (now < dispute.raisedAt + EVIDENCE_PERIOD) reject("evidence period still active");
      if (now >= dispute.raisedAt + ARBITER_STALL_PERIOD) reject("arbiter stall deadline reached");
      if (event.challengeEndsAt !== now + CHALLENGE_PERIOD) reject("challenge end does not match the posting block");
      return {
        state: {
          ...state,
          phase: "INITIAL_RULING",
          dispute: { ...dispute, initialClientBps: event.clientBps, initialRulingAt: now, initialDecisionHash: event.decisionHash },
        },
        effects: [
          {
            kind: "INITIAL_RULING_POSTED",
            escrowIdHash: event.escrowIdHash,
            arbiter: event.arbiter,
            clientBps: event.clientBps,
            decisionHash: event.decisionHash,
            challengeEndsAt: event.challengeEndsAt,
          },
        ],
      };
    }

    case "RulingChallenged": {
      // Chỉ bên mất tiền mới được challenge, trong 7 ngày kể từ ruling đầu. Được challenge một lần.
      requirePhase(state, "INITIAL_RULING");
      const dispute = requireDispute(state);
      const initialRulingAt = dispute.initialRulingAt ?? reject("initial ruling has no timestamp");
      const initialClientBps = dispute.initialClientBps ?? reject("initial ruling has no client share");
      if (now >= initialRulingAt + CHALLENGE_PERIOD) reject("challenge window closed");
      const clientLostPrincipal = same(event.challengedBy, state.client) && initialClientBps < MAX_BPS;
      const developerLostPrincipal = same(event.challengedBy, state.developer) && initialClientBps > 0;
      if (!clientLostPrincipal && !developerLostPrincipal) reject("this party cannot challenge the ruling");
      if (event.challengedAt !== now) reject("challenge time does not match the posting block");
      return {
        state: { ...state, phase: "CHALLENGED", dispute: { ...dispute, challengedAt: now } },
        effects: [
          {
            kind: "RULING_CHALLENGED",
            escrowIdHash: event.escrowIdHash,
            challengedBy: event.challengedBy,
            challengedAt: event.challengedAt,
          },
        ],
      };
    }

    case "FinalRulingPosted": {
      // postFinalRuling: arbiter, sau khi có challenge và trước 30 ngày kể từ lúc challenge.
      requirePhase(state, "CHALLENGED");
      const dispute = requireDispute(state);
      const challengedAt = dispute.challengedAt ?? reject("challenge has no timestamp");
      if (!same(event.arbiter, state.arbiter)) reject("only the escrow arbiter can rule");
      requireNonZero(event.decisionHash);
      if (now >= challengedAt + ARBITER_STALL_PERIOD) reject("arbiter stall deadline reached");
      if (event.noticeEndsAt !== now + FINAL_NOTICE_PERIOD) reject("notice end does not match the posting block");
      return {
        state: {
          ...state,
          phase: "FINAL_RULING",
          dispute: { ...dispute, finalClientBps: event.clientBps, finalRulingAt: now, finalDecisionHash: event.decisionHash },
        },
        effects: [
          {
            kind: "FINAL_RULING_POSTED",
            escrowIdHash: event.escrowIdHash,
            arbiter: event.arbiter,
            clientBps: event.clientBps,
            decisionHash: event.decisionHash,
            noticeEndsAt: event.noticeEndsAt,
          },
        ],
      };
    }

    case "EscrowResolved": {
      if (state.phase === "RESOLVED") reject("escrow already resolved");
      const terms = resolutionTerms(state, event.resolution, now);
      if (!same(event.decisionHash, terms.decisionHash)) reject("decision hash does not match the resolution");
      // Số tiền lấy từ event. Fold chỉ kiểm rằng chúng khớp quy tắc phí 2,5% trên phần Developer (QĐ-02).
      const split = splitPayout(state.amount, ESCROW_CONSTANTS.FEE_BPS, terms.clientBps);
      if (event.clientAmount !== split.client || event.developerAmount !== split.developer || event.platformFee !== split.fee) {
        reject("payout amounts do not match the fee rule");
      }
      return {
        state: { ...state, phase: "RESOLVED", resolutionKind: event.resolution, settlement: null },
        effects: [
          {
            kind: "ESCROW_RESOLVED",
            escrowIdHash: event.escrowIdHash,
            resolution: event.resolution,
            client: state.client,
            developer: state.developer,
            feeRecipient: state.feeRecipient,
            clientAmount: event.clientAmount,
            developerAmount: event.developerAmount,
            platformFee: event.platformFee,
            decisionHash: event.decisionHash,
          },
        ],
      };
    }
  }
}

// Điều kiện và clientBps của từng loại kết thúc, theo đúng các hàm trong contract.
function resolutionTerms(
  state: EscrowState,
  kind: EscrowResolutionKind,
  now: bigint,
): { clientBps: number; decisionHash: Hex } {
  switch (kind) {
    case "RELEASE":
      // releaseFunds: client, khi FUNDED và đã có delivery.
      requirePhase(state, "FUNDED");
      if (state.deliveryHash === null) reject("no delivery to release");
      return { clientBps: 0, decisionHash: ZERO_HASH };

    case "MISSED_DELIVERY_REFUND":
      // claimMissedDeliveryRefund: quá hạn mà chưa có delivery. Hoàn 100% cho client, không phí.
      requirePhase(state, "FUNDED");
      if (state.deliveryHash !== null) reject("delivery was submitted");
      if (now <= state.deliveryDeadline) reject("delivery deadline not reached");
      return { clientBps: MAX_BPS, decisionHash: ZERO_HASH };

    case "REVIEW_TIMEOUT":
      // claimReviewTimeout: client im lặng 7 ngày sau hạn, Developer nhận tiền.
      requirePhase(state, "FUNDED");
      if (state.deliveryHash === null) reject("no delivery to review");
      if (now < state.deliveryDeadline + REVIEW_PERIOD) reject("review window still open");
      return { clientBps: 0, decisionHash: ZERO_HASH };

    case "SETTLEMENT": {
      // acceptSettlement: dùng clientBps của đề xuất đang chờ.
      const settlement = state.settlement ?? reject("no pending settlement");
      return { clientBps: settlement.clientBps, decisionHash: ZERO_HASH };
    }

    case "RULING": {
      // finalizeRuling: ruling đầu sau 7 ngày không bị challenge, hoặc ruling cuối sau 24 giờ thông báo.
      const dispute = requireDispute(state);
      if (state.phase === "INITIAL_RULING") {
        const at = dispute.initialRulingAt ?? reject("initial ruling has no timestamp");
        if (now < at + CHALLENGE_PERIOD) reject("challenge window still open");
        return {
          clientBps: dispute.initialClientBps ?? reject("initial ruling has no client share"),
          decisionHash: dispute.initialDecisionHash ?? reject("initial ruling has no decision hash"),
        };
      }
      if (state.phase === "FINAL_RULING") {
        const at = dispute.finalRulingAt ?? reject("final ruling has no timestamp");
        if (now < at + FINAL_NOTICE_PERIOD) reject("final notice period still open");
        return {
          clientBps: dispute.finalClientBps ?? reject("final ruling has no client share"),
          decisionHash: dispute.finalDecisionHash ?? reject("final ruling has no decision hash"),
        };
      }
      return reject(`expected a ruling phase, found ${state.phase}`);
    }

    case "ARBITER_TIMEOUT_SPLIT": {
      // finalizeArbiterTimeoutSplit: arbiter im 30 ngày. Chia đôi, phí vẫn áp trên phần Developer.
      const dispute = requireDispute(state);
      const since =
        state.phase === "DISPUTED"
          ? dispute.raisedAt
          : state.phase === "CHALLENGED"
            ? (dispute.challengedAt ?? reject("challenge has no timestamp"))
            : reject(`expected DISPUTED or CHALLENGED, found ${state.phase}`);
      if (now < since + ARBITER_STALL_PERIOD) reject("arbiter stall period not reached");
      return { clientBps: MAX_BPS / 2, decisionHash: ZERO_HASH };
    }

    case "NONE":
      return reject("NONE is not a resolution");
  }
}
