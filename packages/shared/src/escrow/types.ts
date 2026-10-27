// packages/shared/src/escrow/types.ts
// Kiểu của lõi escrow. Số tiền và thời gian on-chain (uint256) là bigint: đơn vị nhỏ nhất của token và giây unix.

export type Hex = `0x${string}`;

export type EscrowPhase =
  | "NONE"
  | "FUNDED"
  | "DISPUTED"
  | "INITIAL_RULING"
  | "CHALLENGED"
  | "FINAL_RULING"
  | "RESOLVED";

// Thứ tự khớp enum ResolutionKind trong contract: chỉ số on-chain là vị trí trong mảng này.
export const ESCROW_RESOLUTION_KINDS = [
  "NONE",
  "RELEASE",
  "MISSED_DELIVERY_REFUND",
  "REVIEW_TIMEOUT",
  "SETTLEMENT",
  "RULING",
  "ARBITER_TIMEOUT_SPLIT",
] as const;
export type EscrowResolutionKind = (typeof ESCROW_RESOLUTION_KINDS)[number];

export type PreparedCall = {
  intentId: string;
  chainId: number;
  to: Hex;
  method: string;
  args: Record<string, string>; // số dạng chuỗi thập phân
  data: Hex;
  value: "0";
  expiresAt: string; // ISO
};

export type SettlementState = {
  proposer: Hex;
  clientBps: number;
};

export type DisputeState = {
  raisedBy: Hex;
  raisedAt: bigint;
  raiserEvidenceHash: Hex;
  counterpartyEvidenceHash: Hex | null;
  initialClientBps: number | null;
  initialRulingAt: bigint | null;
  initialDecisionHash: Hex | null;
  challengedAt: bigint | null;
  finalClientBps: number | null;
  finalRulingAt: bigint | null;
  finalDecisionHash: Hex | null;
};

// Trạng thái một escrow, khóa theo keccak256(escrowId). Log không chứa escrowId gốc vì nó là indexed string.
export type EscrowState = {
  escrowIdHash: Hex;
  client: Hex;
  developer: Hex;
  arbiter: Hex;
  feeRecipient: Hex;
  amount: bigint;
  depositedAt: bigint;
  deliveryDeadline: bigint;
  termsHash: Hex;
  deliveryHash: Hex | null;
  phase: EscrowPhase;
  resolutionKind: EscrowResolutionKind;
  settlement: SettlementState | null;
  dispute: DisputeState | null;
};

export type EventMeta = {
  chainId: number;
  contractAddress: Hex;
  blockNumber: bigint;
  blockHash: Hex;
  txHash: Hex;
  txIndex: number;
  logIndex: number;
  blockTimestamp: bigint;
};

// Mỗi event của contract, đã decode. `name` là tên event trong Solidity.
export type DecodedEscrowEvent =
  | {
      name: "Deposited";
      escrowIdHash: Hex;
      client: Hex;
      developer: Hex;
      arbiter: Hex;
      feeRecipient: Hex;
      amount: bigint;
      deliveryDeadline: bigint;
      termsHash: Hex;
    }
  | { name: "WorkSubmitted"; escrowIdHash: Hex; developer: Hex; deliveryHash: Hex }
  | { name: "SettlementProposed"; escrowIdHash: Hex; proposer: Hex; clientBps: number }
  | { name: "SettlementRevoked"; escrowIdHash: Hex; proposer: Hex }
  | { name: "DisputeRaised"; escrowIdHash: Hex; raisedBy: Hex; evidenceManifestHash: Hex }
  | { name: "CounterpartyEvidenceSubmitted"; escrowIdHash: Hex; submittedBy: Hex; evidenceManifestHash: Hex }
  | {
      name: "InitialRulingPosted";
      escrowIdHash: Hex;
      arbiter: Hex;
      clientBps: number;
      decisionHash: Hex;
      challengeEndsAt: bigint;
    }
  | { name: "RulingChallenged"; escrowIdHash: Hex; challengedBy: Hex; challengedAt: bigint }
  | {
      name: "FinalRulingPosted";
      escrowIdHash: Hex;
      arbiter: Hex;
      clientBps: number;
      decisionHash: Hex;
      noticeEndsAt: bigint;
    }
  | {
      name: "EscrowResolved";
      escrowIdHash: Hex;
      resolution: EscrowResolutionKind;
      clientAmount: bigint;
      developerAmount: bigint;
      platformFee: bigint;
      decisionHash: Hex;
    }
  | { name: "Claimed"; recipient: Hex; caller: Hex; amount: bigint }
  | { name: "ArbiterTransferProposed"; currentArbiter: Hex; pendingArbiter: Hex }
  | { name: "ArbiterUpdated"; oldArbiter: Hex; newArbiter: Hex }
  | { name: "FeeRecipientTransferProposed"; currentRecipient: Hex; pendingRecipient: Hex }
  | { name: "FeeRecipientUpdated"; oldRecipient: Hex; newRecipient: Hex }
  | { name: "Paused"; account: Hex }
  | { name: "Unpaused"; account: Hex }
  | { name: "OwnershipTransferStarted"; previousOwner: Hex; newOwner: Hex }
  | { name: "OwnershipTransferred"; previousOwner: Hex; newOwner: Hex };

export type GovernanceEvent = Extract<
  DecodedEscrowEvent,
  {
    name:
      | "ArbiterTransferProposed"
      | "ArbiterUpdated"
      | "FeeRecipientTransferProposed"
      | "FeeRecipientUpdated"
      | "OwnershipTransferStarted"
      | "OwnershipTransferred";
  }
>;

export type PauseEvent = Extract<DecodedEscrowEvent, { name: "Paused" | "Unpaused" }>;

// Effect là phần việc mà tầng DB (A3, A4) phải làm sau khi fold. Mỗi effect mang đủ dữ liệu của event.
export type FoldEffect =
  | {
      kind: "FUNDED";
      escrowIdHash: Hex;
      client: Hex;
      developer: Hex;
      amount: bigint;
      deliveryDeadline: bigint;
      termsHash: Hex;
    }
  | { kind: "WORK_SUBMITTED"; escrowIdHash: Hex; developer: Hex; deliveryHash: Hex }
  | { kind: "SETTLEMENT_PROPOSED"; escrowIdHash: Hex; proposer: Hex; clientBps: number }
  | { kind: "SETTLEMENT_REVOKED"; escrowIdHash: Hex; proposer: Hex }
  | { kind: "DISPUTE_RAISED"; escrowIdHash: Hex; raisedBy: Hex; evidenceManifestHash: Hex }
  | { kind: "COUNTERPARTY_EVIDENCE_SUBMITTED"; escrowIdHash: Hex; submittedBy: Hex; evidenceManifestHash: Hex }
  | {
      kind: "INITIAL_RULING_POSTED";
      escrowIdHash: Hex;
      arbiter: Hex;
      clientBps: number;
      decisionHash: Hex;
      challengeEndsAt: bigint;
    }
  | { kind: "RULING_CHALLENGED"; escrowIdHash: Hex; challengedBy: Hex; challengedAt: bigint }
  | {
      kind: "FINAL_RULING_POSTED";
      escrowIdHash: Hex;
      arbiter: Hex;
      clientBps: number;
      decisionHash: Hex;
      noticeEndsAt: bigint;
    }
  | {
      kind: "ESCROW_RESOLVED";
      escrowIdHash: Hex;
      resolution: EscrowResolutionKind;
      client: Hex;
      developer: Hex;
      feeRecipient: Hex;
      clientAmount: bigint;
      developerAmount: bigint;
      platformFee: bigint;
      decisionHash: Hex;
    }
  | { kind: "CLAIMED"; recipient: Hex; caller: Hex; amount: bigint }
  | { kind: "GOVERNANCE_CHANGED"; event: GovernanceEvent }
  | { kind: "PAUSE_CHANGED"; event: PauseEvent };
