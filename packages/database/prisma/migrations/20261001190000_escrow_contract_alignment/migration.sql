CREATE TYPE "EscrowPhase" AS ENUM ('NONE', 'FUNDED', 'DISPUTED', 'INITIAL_RULING', 'CHALLENGED', 'FINAL_RULING', 'RESOLVED');
CREATE TYPE "EscrowResolutionKind" AS ENUM ('NONE', 'RELEASE', 'MISSED_DELIVERY_REFUND', 'REVIEW_TIMEOUT', 'SETTLEMENT', 'RULING', 'ARBITER_TIMEOUT_SPLIT');
ALTER TYPE "DisputeStatus" ADD VALUE 'FINAL_RULING';
ALTER TYPE "TransactionType" ADD VALUE 'WORK';
ALTER TYPE "TransactionType" ADD VALUE 'SETTLEMENT';
ALTER TYPE "TransactionType" ADD VALUE 'EVIDENCE';
ALTER TYPE "TransactionType" ADD VALUE 'RULING';
ALTER TYPE "TransactionType" ADD VALUE 'CHALLENGE';
ALTER TABLE "escrows"
  ADD COLUMN "phase" "EscrowPhase" NOT NULL DEFAULT 'FUNDED',
  ADD COLUMN "resolutionKind" "EscrowResolutionKind" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "feeRecipientAddress" TEXT,
  ADD COLUMN "termsHash" TEXT,
  ADD COLUMN "deliveryHash" TEXT,
  ADD COLUMN "settlementProposer" TEXT,
  ADD COLUMN "settlementClientBps" INTEGER,
  ADD COLUMN "lastChainBlock" INTEGER,
  ADD COLUMN "lastChainTransactionIndex" INTEGER,
  ADD COLUMN "deliveryDeadline" TIMESTAMP(3),
  ADD COLUMN "reviewDeadline" TIMESTAMP(3),
  ADD COLUMN "resolvedAt" TIMESTAMP(3);
UPDATE "escrows" SET "phase" = CASE
  WHEN "status" IN ('COMPLETED', 'CANCELLED') THEN 'RESOLVED'::"EscrowPhase"
  WHEN "status" = 'DISPUTED' THEN 'DISPUTED'::"EscrowPhase"
  WHEN "status" = 'RESOLUTION_PROPOSED' THEN 'INITIAL_RULING'::"EscrowPhase"
  ELSE 'FUNDED'::"EscrowPhase" END;
UPDATE "escrows" SET "timeoutClaimAt" = NULL;
ALTER TABLE "disputes"
  ADD COLUMN "evidenceManifestHash" TEXT,
  ADD COLUMN "counterpartyEvidenceHash" TEXT,
  ADD COLUMN "evidenceResponseDeadline" TIMESTAMP(3),
  ADD COLUMN "arbiterTimeoutAt" TIMESTAMP(3),
  ADD COLUMN "initialDecisionHash" TEXT,
  ADD COLUMN "finalDecisionHash" TEXT,
  ADD COLUMN "finalRulingAt" TIMESTAMP(3),
  ADD COLUMN "noticeDeadline" TIMESTAMP(3);
