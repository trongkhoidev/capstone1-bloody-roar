import { utils } from "ethers";
import type { IssueStatus, Prisma, TransactionType } from "@bloody-roar/database";
import {
  ESCROW_REVIEW_DAYS,
  DISPUTE_EVIDENCE_RESPONSE_HOURS,
  ARBITER_STALL_DAYS,
} from "@bloody-roar/shared";
import type { LoadedEscrowReceipt } from "./chain";

type EscrowProjection = {
  escrow: Prisma.EscrowUpdateManyMutationInput;
  dispute?: Prisma.DisputeUpdateManyMutationInput;
  issueStatus?: IssueStatus;
  transactionType: TransactionType;
};
const date = (seconds: number) => new Date(seconds * 1000);

type ResolutionSnapshot = {
  proposedClientRatio: number | null;
  finalClientRatio: number | null;
  settlementClientBps: number | null;
};

export function projectEscrowReceipt(
  receipt: LoadedEscrowReceipt,
  decimals: number,
  snapshot?: ResolutionSnapshot,
): EscrowProjection {
  const at = date(receipt.blockTimestamp);
  const cursor = {
    lastChainBlock: receipt.blockNumber,
    lastChainTransactionIndex: receipt.transactionIndex,
    lastChainLogIndex: receipt.logIndex,
  };
  switch (receipt.outcome) {
    case "DEPOSITED": {
      const reviewDeadline = date(receipt.event.deliveryDeadline + ESCROW_REVIEW_DAYS * 86400);
      return {
        transactionType: "DEPOSIT",
        escrow: {
          ...cursor,
          phase: "FUNDED",
          depositedAt: at,
          deliveryDeadline: date(receipt.event.deliveryDeadline),
          reviewDeadline,
          timeoutClaimAt: reviewDeadline,
          arbiterAddress: receipt.event.arbiterAddress,
          feeRecipientAddress: receipt.event.feeRecipientAddress,
          termsHash: receipt.event.termsHash,
        },
      };
    }
    case "WORK_SUBMITTED":
      return {
        transactionType: "WORK",
        escrow: { ...cursor, deliveryHash: receipt.event.deliveryHash },
      };
    case "SETTLEMENT_PROPOSED":
      return {
        transactionType: "SETTLEMENT",
        escrow: {
          ...cursor,
          settlementProposer: receipt.event.proposerAddress,
          settlementClientBps: receipt.event.clientBps,
        },
      };
    case "SETTLEMENT_REVOKED":
      return {
        transactionType: "SETTLEMENT",
        escrow: { ...cursor, settlementProposer: null, settlementClientBps: null },
      };
    case "DISPUTED":
      return {
        transactionType: "DISPUTE",
        escrow: { ...cursor, status: "DISPUTED", phase: "DISPUTED" },
        issueStatus: "DISPUTED",
        dispute: {
          evidenceManifestHash: receipt.event.evidenceManifestHash,
          evidenceResponseDeadline: date(
            receipt.blockTimestamp + DISPUTE_EVIDENCE_RESPONSE_HOURS * 3600,
          ),
          arbiterTimeoutAt: date(receipt.blockTimestamp + ARBITER_STALL_DAYS * 86400),
        },
      };
    case "COUNTERPARTY_EVIDENCE":
      return {
        transactionType: "EVIDENCE",
        escrow: cursor,
        dispute: { counterpartyEvidenceHash: receipt.event.evidenceManifestHash },
      };
    case "INITIAL_RULING":
      return {
        transactionType: "RULING",
        escrow: { ...cursor, phase: "INITIAL_RULING", status: "DISPUTED" },
        dispute: {
          status: "PROPOSED",
          proposedAt: at,
          proposedClientRatio: receipt.event.clientBps / 100,
          challengeDeadline: date(receipt.event.deadline),
          initialDecisionHash: receipt.event.decisionHash,
        },
      };
    case "CHALLENGED":
      return {
        transactionType: "CHALLENGE",
        escrow: { ...cursor, phase: "CHALLENGED", status: "DISPUTED" },
        dispute: {
          status: "CHALLENGED",
          challengedAt: date(receipt.event.challengedAt),
          arbiterTimeoutAt: date(receipt.event.challengedAt + ARBITER_STALL_DAYS * 86400),
        },
      };
    case "FINAL_RULING":
      return {
        transactionType: "RULING",
        escrow: { ...cursor, phase: "FINAL_RULING", status: "DISPUTED" },
        dispute: {
          status: "FINAL_RULING",
          finalRulingAt: at,
          finalClientRatio: receipt.event.clientBps / 100,
          finalDecisionHash: receipt.event.decisionHash,
          noticeDeadline: date(receipt.event.deadline),
        },
      };
    case "RESOLVED": {
      const refund = receipt.event.developerAmount.isZero() && receipt.event.platformFee.isZero();
      const kind = receipt.event.resolutionKind;
      const finalClientRatio =
        kind === "RULING"
          ? (snapshot?.finalClientRatio ?? snapshot?.proposedClientRatio)
          : kind === "ARBITER_TIMEOUT_SPLIT"
            ? 50
            : kind === "MISSED_DELIVERY_REFUND"
              ? 100
              : kind === "RELEASE" || kind === "REVIEW_TIMEOUT"
                ? 0
                : snapshot?.settlementClientBps != null
                  ? snapshot.settlementClientBps / 100
                  : undefined;
      return {
        transactionType: receipt.event.resolutionKind === "RELEASE" ? "RELEASE" : "RESOLVE",
        escrow: {
          ...cursor,
          phase: "RESOLVED",
          status: refund ? "CANCELLED" : "COMPLETED",
          resolutionKind: receipt.event.resolutionKind,
          clientRefund: utils.formatUnits(receipt.event.clientAmount, decimals),
          developerPayout: utils.formatUnits(receipt.event.developerAmount, decimals),
          platformFeeAmount: utils.formatUnits(receipt.event.platformFee, decimals),
          resolvedAt: at,
          settlementProposer: null,
          settlementClientBps: null,
        },
        dispute: {
          status: "RESOLVED",
          resolvedAt: at,
          ...(finalClientRatio != null ? { finalClientRatio } : {}),
        },
        issueStatus: refund ? "CANCELLED" : "COMPLETED",
      };
    }
  }
}

export function isNewerEscrowReceipt(
  receipt: { blockNumber: number; transactionIndex: number; logIndex?: number },
  cursor: {
    lastChainBlock: number | null;
    lastChainTransactionIndex: number | null;
    lastChainLogIndex?: number | null;
  },
): boolean {
  return (
    cursor.lastChainBlock === null ||
    receipt.blockNumber > cursor.lastChainBlock ||
    (receipt.blockNumber === cursor.lastChainBlock &&
      (receipt.transactionIndex > (cursor.lastChainTransactionIndex ?? -1) ||
        (receipt.transactionIndex === cursor.lastChainTransactionIndex &&
          (receipt.logIndex ?? -1) > (cursor.lastChainLogIndex ?? -1))))
  );
}
