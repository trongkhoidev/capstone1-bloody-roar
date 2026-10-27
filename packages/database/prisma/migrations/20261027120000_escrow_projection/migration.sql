-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('AWAITING_FUNDING', 'FUNDED', 'EXPIRED', 'CANCELLED', 'MISMATCHED');

-- CreateEnum
CREATE TYPE "IntentStatus" AS ENUM ('AWAITING_SIGNATURE', 'SUBMITTED', 'PENDING_SAFE_HEAD', 'CONFIRMED', 'FAILED', 'EXPIRED', 'DROPPED');

-- CreateEnum
CREATE TYPE "AttachmentPurpose" AS ENUM ('CHAT', 'ISSUE_IMAGE', 'DELIVERY', 'EVIDENCE', 'AVATAR');

-- CreateEnum
CREATE TYPE "AttachmentStatus" AS ENUM ('PENDING', 'ATTACHED');

-- AlterEnum
ALTER TYPE "IssueStatus" ADD VALUE 'AWAITING_FUNDING';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'FUNDING_REQUIRED';
ALTER TYPE "NotificationType" ADD VALUE 'RESERVATION_EXPIRED';
ALTER TYPE "NotificationType" ADD VALUE 'DEPOSIT_CONFIRMED';
ALTER TYPE "NotificationType" ADD VALUE 'WORK_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE 'CHANGES_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE 'SETTLEMENT_PROPOSED';
ALTER TYPE "NotificationType" ADD VALUE 'SETTLEMENT_REVOKED';
ALTER TYPE "NotificationType" ADD VALUE 'EVIDENCE_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE 'RULING_POSTED';
ALTER TYPE "NotificationType" ADD VALUE 'RULING_CHALLENGED';
ALTER TYPE "NotificationType" ADD VALUE 'ESCROW_RESOLVED';
ALTER TYPE "NotificationType" ADD VALUE 'FUNDS_CLAIMABLE';
ALTER TYPE "NotificationType" ADD VALUE 'DEADLINE_APPROACHING';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SubmissionStatus" ADD VALUE 'DRAFT';
ALTER TYPE "SubmissionStatus" ADD VALUE 'PENDING_CHAIN';
ALTER TYPE "SubmissionStatus" ADD VALUE 'SUPERSEDED';

-- AlterTable
ALTER TABLE "attachments" ADD COLUMN     "purpose" "AttachmentPurpose",
ADD COLUMN     "sha256" TEXT,
ADD COLUMN     "status" "AttachmentStatus" NOT NULL DEFAULT 'PENDING';

-- Uploads already linked to an issue or message were attached before this migration
UPDATE "attachments" SET "status" = 'ATTACHED' WHERE "issueId" IS NOT NULL OR "messageId" IS NOT NULL;

-- AlterTable
ALTER TABLE "disputes" ADD COLUMN     "aiStatus" TEXT,
ADD COLUMN     "finalClientBps" INTEGER,
ADD COLUMN     "phase" "EscrowPhase",
ADD COLUMN     "proposedClientBps" INTEGER,
ADD COLUMN     "suggestedClientBps" INTEGER;

-- AlterTable
ALTER TABLE "issues" ADD COLUMN     "deliveryDeadline" TIMESTAMP(3),
ADD COLUMN     "outcome" "EscrowResolutionKind",
ADD COLUMN     "termsHash" TEXT,
ADD COLUMN     "termsVersion" INTEGER NOT NULL DEFAULT 1,
ALTER COLUMN "bountyAmount" SET DATA TYPE DECIMAL(20,6);

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "afterDispute" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "dedupeKey" TEXT;

-- AlterTable
ALTER TABLE "submissions" ADD COLUMN     "changesRequested" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "deliveryHash" TEXT,
ADD COLUMN     "manifest" JSONB,
ADD COLUMN     "onChainEventId" TEXT,
ADD COLUMN     "supersededAt" TIMESTAMP(3);

-- Map legacy review states (README §5). REJECTED becomes a "changes requested" flag,
-- so the flag must be set before the status moves.
UPDATE "submissions" SET "changesRequested" = true WHERE "status" = 'REJECTED';
UPDATE "submissions" SET "status" = 'SUBMITTED' WHERE "status" IN ('UNDER_REVIEW', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "funding_reservations" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "developerId" TEXT NOT NULL,
    "escrowKey" TEXT NOT NULL,
    "escrowIdHash" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "tokenAddress" TEXT NOT NULL,
    "amountRaw" DECIMAL(78,0) NOT NULL,
    "deliveryDeadline" TIMESTAMP(3) NOT NULL,
    "termsHash" TEXT NOT NULL,
    "termsVersion" INTEGER NOT NULL,
    "intentSignature" TEXT,
    "intentNonce" TEXT,
    "intentExpiresAt" TIMESTAMP(3),
    "status" "ReservationStatus" NOT NULL DEFAULT 'AWAITING_FUNDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "fundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "funding_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_intents" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "issueId" TEXT,
    "escrowKey" TEXT,
    "chainId" INTEGER NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "args" JSONB NOT NULL,
    "status" "IntentStatus" NOT NULL DEFAULT 'AWAITING_SIGNATURE',
    "txHash" TEXT,
    "submittedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "failureReason" TEXT,
    "confirmedByEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transaction_intents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chain_events" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "blockHash" TEXT NOT NULL,
    "txIndex" INTEGER NOT NULL,
    "eventName" TEXT NOT NULL,
    "args" JSONB NOT NULL,
    "decoderVersion" INTEGER NOT NULL,
    "escrowIdHash" TEXT,
    "canonical" BOOLEAN NOT NULL DEFAULT true,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReconciledAt" TIMESTAMP(3),

    CONSTRAINT "chain_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projection_checkpoints" (
    "chainId" INTEGER NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "lastScannedBlock" BIGINT NOT NULL,
    "lastSafeBlock" BIGINT NOT NULL,
    "lastCanonicalBlockHash" TEXT NOT NULL,
    "decoderVersion" INTEGER NOT NULL,
    "replayStatus" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projection_checkpoints_pkey" PRIMARY KEY ("chainId","contractAddress")
);

-- CreateTable
CREATE TABLE "escrow_projections" (
    "id" TEXT NOT NULL,
    "escrowIdHash" TEXT NOT NULL,
    "escrowKey" TEXT,
    "issueId" TEXT,
    "reservationId" TEXT,
    "chainId" INTEGER NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "client" TEXT NOT NULL,
    "developer" TEXT NOT NULL,
    "arbiter" TEXT NOT NULL,
    "feeRecipient" TEXT NOT NULL,
    "amountRaw" DECIMAL(78,0) NOT NULL,
    "depositedAt" TIMESTAMP(3) NOT NULL,
    "deliveryDeadline" TIMESTAMP(3) NOT NULL,
    "reviewDeadline" TIMESTAMP(3) NOT NULL,
    "termsHash" TEXT NOT NULL,
    "deliveryHash" TEXT,
    "phase" "EscrowPhase" NOT NULL,
    "resolutionKind" "EscrowResolutionKind" NOT NULL DEFAULT 'NONE',
    "clientAmountRaw" DECIMAL(78,0),
    "developerAmountRaw" DECIMAL(78,0),
    "platformFeeRaw" DECIMAL(78,0),
    "decisionHash" TEXT,
    "settlementProposer" TEXT,
    "settlementClientBps" INTEGER,
    "disputeRaisedBy" TEXT,
    "disputeRaisedAt" TIMESTAMP(3),
    "raiserEvidenceHash" TEXT,
    "counterpartyEvidenceHash" TEXT,
    "challengedAt" TIMESTAMP(3),
    "orphan" BOOLEAN NOT NULL DEFAULT false,
    "projectionVersion" INTEGER NOT NULL DEFAULT 0,
    "lastProjectedBlock" BIGINT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "escrow_projections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ruling_records" (
    "id" TEXT NOT NULL,
    "escrowIdHash" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "clientBps" INTEGER NOT NULL,
    "decisionHash" TEXT NOT NULL,
    "arbiter" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "noticeEndsAt" TIMESTAMP(3) NOT NULL,
    "chainEventId" TEXT NOT NULL,

    CONSTRAINT "ruling_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlement_proposals" (
    "id" TEXT NOT NULL,
    "escrowIdHash" TEXT NOT NULL,
    "proposer" TEXT NOT NULL,
    "clientBps" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "proposedEventId" TEXT NOT NULL,
    "closedEventId" TEXT,

    CONSTRAINT "settlement_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claimable_balances" (
    "chainId" INTEGER NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "amountRaw" DECIMAL(78,0) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "claimable_balances_pkey" PRIMARY KEY ("chainId","contractAddress","address")
);

-- CreateTable
CREATE TABLE "contract_configs" (
    "chainId" INTEGER NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "paused" BOOLEAN NOT NULL,
    "owner" TEXT NOT NULL,
    "pendingOwner" TEXT,
    "arbiter" TEXT NOT NULL,
    "pendingArbiter" TEXT,
    "feeRecipient" TEXT NOT NULL,
    "pendingFeeRecipient" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_configs_pkey" PRIMARY KEY ("chainId","contractAddress")
);

-- CreateTable
CREATE TABLE "evidence_manifests" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "manifest" JSONB NOT NULL,
    "manifestHash" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "onChainEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_manifests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_findings" (
    "id" TEXT NOT NULL,
    "escrowIdHash" TEXT,
    "kind" TEXT NOT NULL,
    "expected" JSONB NOT NULL,
    "actual" JSONB NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reconciliation_findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "github_webhook_deliveries" (
    "deliveryId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "github_webhook_deliveries_pkey" PRIMARY KEY ("deliveryId")
);

-- CreateIndex
CREATE UNIQUE INDEX "funding_reservations_escrowKey_key" ON "funding_reservations"("escrowKey");

-- CreateIndex
CREATE UNIQUE INDEX "funding_reservations_escrowIdHash_key" ON "funding_reservations"("escrowIdHash");

-- CreateIndex
CREATE UNIQUE INDEX "funding_reservations_intentNonce_key" ON "funding_reservations"("intentNonce");

-- CreateIndex
CREATE INDEX "funding_reservations_issueId_status_idx" ON "funding_reservations"("issueId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "transaction_intents_txHash_key" ON "transaction_intents"("txHash");

-- CreateIndex
CREATE INDEX "transaction_intents_userId_idx" ON "transaction_intents"("userId");

-- CreateIndex
CREATE INDEX "transaction_intents_status_idx" ON "transaction_intents"("status");

-- CreateIndex
CREATE INDEX "chain_events_escrowIdHash_blockNumber_txIndex_logIndex_idx" ON "chain_events"("escrowIdHash", "blockNumber", "txIndex", "logIndex");

-- CreateIndex
CREATE UNIQUE INDEX "chain_events_chainId_contractAddress_txHash_logIndex_key" ON "chain_events"("chainId", "contractAddress", "txHash", "logIndex");

-- CreateIndex
CREATE UNIQUE INDEX "escrow_projections_escrowIdHash_key" ON "escrow_projections"("escrowIdHash");

-- CreateIndex
CREATE UNIQUE INDEX "escrow_projections_issueId_key" ON "escrow_projections"("issueId");

-- CreateIndex
CREATE UNIQUE INDEX "escrow_projections_reservationId_key" ON "escrow_projections"("reservationId");

-- CreateIndex
CREATE INDEX "escrow_projections_phase_idx" ON "escrow_projections"("phase");

-- CreateIndex
CREATE UNIQUE INDEX "ruling_records_chainEventId_key" ON "ruling_records"("chainEventId");

-- CreateIndex
CREATE INDEX "ruling_records_escrowIdHash_idx" ON "ruling_records"("escrowIdHash");

-- CreateIndex
CREATE UNIQUE INDEX "settlement_proposals_proposedEventId_key" ON "settlement_proposals"("proposedEventId");

-- CreateIndex
CREATE INDEX "settlement_proposals_escrowIdHash_idx" ON "settlement_proposals"("escrowIdHash");

-- CreateIndex
CREATE UNIQUE INDEX "evidence_manifests_manifestHash_key" ON "evidence_manifests"("manifestHash");

-- CreateIndex
CREATE INDEX "evidence_manifests_disputeId_idx" ON "evidence_manifests"("disputeId");

-- CreateIndex
CREATE INDEX "reconciliation_findings_escrowIdHash_resolvedAt_idx" ON "reconciliation_findings"("escrowIdHash", "resolvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_dedupeKey_key" ON "notifications"("dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "submissions_deliveryHash_key" ON "submissions"("deliveryHash");

-- One active reservation per issue (BE-31). Prisma cannot express partial indexes,
-- so schema.prisma does not list this index. It is maintained only by this migration.
CREATE UNIQUE INDEX "funding_reservations_one_active_per_issue" ON "funding_reservations"("issueId") WHERE "status" IN ('AWAITING_FUNDING', 'FUNDED');

