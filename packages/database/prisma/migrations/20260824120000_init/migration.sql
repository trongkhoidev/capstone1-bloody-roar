-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('CLIENT', 'DEVELOPER', 'ADMIN');

-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "IssueCategory" AS ENUM ('BUG_FIX', 'FEATURE', 'SMART_CONTRACT', 'AUDIT', 'UI_UX', 'DATA_SCIENCE', 'DEVOPS', 'DOCUMENTATION', 'OTHER');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "EscrowStatus" AS ENUM ('AWAITING_DELIVERY', 'COMPLETED', 'CANCELLED', 'DISPUTED', 'RESOLUTION_PROPOSED');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'ANALYZING', 'PROPOSED', 'RESOLVED', 'CHALLENGED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('NEW_APPLICANT', 'APPLICATION_ACCEPTED', 'APPLICATION_REJECTED', 'TASK_ASSIGNED', 'PAYMENT_RECEIVED', 'DISPUTE_RAISED', 'DISPUTE_RESOLVED', 'MESSAGE_RECEIVED');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'FILE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('DEPOSIT', 'RELEASE', 'CANCEL', 'DISPUTE', 'RESOLVE');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AttestationType" AS ENUM ('COMPLETION', 'SKILL', 'CERTIFICATION');

-- CreateEnum
CREATE TYPE "TestCasePriority" AS ENUM ('CRITICAL', 'NORMAL', 'LOW');

-- CreateEnum
CREATE TYPE "TestCaseSource" AS ENUM ('AI', 'MANUAL');

-- CreateEnum
CREATE TYPE "PRState" AS ENUM ('OPEN', 'MERGED', 'CLOSED');

-- CreateEnum
CREATE TYPE "AILogStatus" AS ENUM ('SUCCESS', 'ERROR', 'FALLBACK');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'DEVELOPER',
    "name" TEXT,
    "email" TEXT,
    "avatar" TEXT,
    "bio" TEXT,
    "skills" TEXT[],
    "location" TEXT,
    "githubUsername" TEXT,
    "githubId" TEXT,
    "githubAccessTokenEncrypted" TEXT,
    "isGithubVerified" BOOLEAN NOT NULL DEFAULT false,
    "reputationScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "completedTaskCount" INTEGER NOT NULL DEFAULT 0,
    "passportScore" DOUBLE PRECISION,
    "isBanned" BOOLEAN NOT NULL DEFAULT false,
    "bannedReason" TEXT,
    "bannedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tokens" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "decimals" INTEGER NOT NULL,
    "chainId" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isNative" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "logoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshHash" TEXT NOT NULL,
    "nonce" TEXT,
    "userAgent" TEXT,
    "ip" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issues" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "IssueCategory" NOT NULL,
    "status" "IssueStatus" NOT NULL DEFAULT 'OPEN',
    "bountyAmount" DECIMAL(65,30) NOT NULL,
    "tokenId" TEXT NOT NULL,
    "commitmentSignature" TEXT,
    "commitmentNonce" TEXT,
    "commitmentExpiresAt" TIMESTAMP(3),
    "requiredSkills" TEXT[],
    "difficulty" TEXT,
    "timeEstimate" TEXT,
    "expiresAt" TIMESTAMP(3),
    "isDraft" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "githubRepo" TEXT,
    "githubInstallationId" TEXT,
    "clientId" TEXT NOT NULL,
    "developerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "assignedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "issueId" TEXT NOT NULL,
    "developerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escrows" (
    "id" TEXT NOT NULL,
    "status" "EscrowStatus" NOT NULL DEFAULT 'AWAITING_DELIVERY',
    "txHashDeposit" TEXT,
    "txHashRelease" TEXT,
    "txHashCancel" TEXT,
    "contractAddress" TEXT,
    "onChainIssueId" TEXT,
    "tokenId" TEXT NOT NULL,
    "arbiterAddress" TEXT,
    "platformFeeBps" INTEGER NOT NULL DEFAULT 250,
    "bountyAmount" DECIMAL(65,30) NOT NULL,
    "platformFeeAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "developerPayout" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "clientRefund" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "depositedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "timeoutClaimAt" TIMESTAMP(3),
    "issueId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "developerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "escrows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "from" TEXT,
    "to" TEXT,
    "blockNumber" INTEGER,
    "gasUsed" BIGINT,
    "gasPrice" BIGINT,
    "chainId" INTEGER NOT NULL,
    "escrowId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" "MessageType" NOT NULL DEFAULT 'TEXT',
    "wasModified" BOOLEAN NOT NULL DEFAULT false,
    "originalHash" TEXT,
    "issueId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "clientMessageId" TEXT,
    "replyToId" TEXT,
    "readAt" TIMESTAMP(3),
    "editedAt" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL,
    "issueId" TEXT,
    "messageId" TEXT,
    "uploaderId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "fileMime" TEXT NOT NULL,
    "etag" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disputes" (
    "id" TEXT NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "reason" TEXT NOT NULL,
    "aiReport" JSONB,
    "suggestedRatio" DECIMAL(65,30),
    "aiConfidenceScore" DOUBLE PRECISION,
    "proposedClientRatio" DECIMAL(65,30),
    "finalClientRatio" DECIMAL(65,30),
    "proposedAt" TIMESTAMP(3),
    "challengeDeadline" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "challengedById" TEXT,
    "challengedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "issueId" TEXT NOT NULL,
    "escrowId" TEXT,
    "raisedById" TEXT NOT NULL,
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_cases" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "given" TEXT NOT NULL,
    "when" TEXT NOT NULL,
    "then" TEXT NOT NULL,
    "isEdgeCase" BOOLEAN NOT NULL DEFAULT false,
    "priority" "TestCasePriority" NOT NULL DEFAULT 'NORMAL',
    "source" "TestCaseSource",
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "clientNotes" TEXT,
    "issueId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "test_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "developerId" TEXT NOT NULL,
    "description" TEXT,
    "pullRequestUrl" TEXT,
    "prNumber" INTEGER,
    "prState" "PRState",
    "commitSha" TEXT,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'SUBMITTED',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mergedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "developerId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attestations" (
    "id" TEXT NOT NULL,
    "attestationUid" TEXT NOT NULL,
    "schemaUid" TEXT NOT NULL,
    "developerId" TEXT NOT NULL,
    "issueId" TEXT,
    "reviewId" TEXT,
    "type" "AttestationType" NOT NULL DEFAULT 'COMPLETION',
    "data" JSONB NOT NULL,
    "chainId" INTEGER NOT NULL,
    "attester" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attestations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_logs" (
    "id" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "issueId" TEXT,
    "disputeId" TEXT,
    "latencyMs" INTEGER,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "costUsd" DECIMAL(65,30),
    "inputHash" TEXT,
    "outputHash" TEXT,
    "status" "AILogStatus" NOT NULL DEFAULT 'SUCCESS',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "data" JSONB,
    "actorId" TEXT,
    "link" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_logs" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "details" JSONB,
    "adminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_walletAddress_key" ON "users"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_githubUsername_key" ON "users"("githubUsername");

-- CreateIndex
CREATE UNIQUE INDEX "users_githubId_key" ON "users"("githubId");

-- CreateIndex
CREATE INDEX "users_walletAddress_idx" ON "users"("walletAddress");

-- CreateIndex
CREATE INDEX "users_githubId_idx" ON "users"("githubId");

-- CreateIndex
CREATE INDEX "tokens_isActive_idx" ON "tokens"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "tokens_chainId_address_key" ON "tokens"("chainId", "address");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refreshHash_key" ON "sessions"("refreshHash");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_nonce_key" ON "sessions"("nonce");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "issues_status_idx" ON "issues"("status");

-- CreateIndex
CREATE INDEX "issues_category_idx" ON "issues"("category");

-- CreateIndex
CREATE INDEX "issues_clientId_idx" ON "issues"("clientId");

-- CreateIndex
CREATE INDEX "issues_developerId_idx" ON "issues"("developerId");

-- CreateIndex
CREATE INDEX "issues_tokenId_idx" ON "issues"("tokenId");

-- CreateIndex
CREATE INDEX "applications_issueId_idx" ON "applications"("issueId");

-- CreateIndex
CREATE INDEX "applications_developerId_idx" ON "applications"("developerId");

-- CreateIndex
CREATE UNIQUE INDEX "applications_issueId_developerId_key" ON "applications"("issueId", "developerId");

-- CreateIndex
CREATE UNIQUE INDEX "escrows_issueId_key" ON "escrows"("issueId");

-- CreateIndex
CREATE INDEX "escrows_issueId_idx" ON "escrows"("issueId");

-- CreateIndex
CREATE INDEX "escrows_clientId_idx" ON "escrows"("clientId");

-- CreateIndex
CREATE INDEX "escrows_developerId_idx" ON "escrows"("developerId");

-- CreateIndex
CREATE INDEX "escrows_tokenId_idx" ON "escrows"("tokenId");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_txHash_key" ON "transactions"("txHash");

-- CreateIndex
CREATE INDEX "transactions_escrowId_idx" ON "transactions"("escrowId");

-- CreateIndex
CREATE INDEX "transactions_txHash_idx" ON "transactions"("txHash");

-- CreateIndex
CREATE INDEX "messages_issueId_createdAt_idx" ON "messages"("issueId", "createdAt");

-- CreateIndex
CREATE INDEX "messages_senderId_idx" ON "messages"("senderId");

-- CreateIndex
CREATE INDEX "messages_clientMessageId_idx" ON "messages"("clientMessageId");

-- CreateIndex
CREATE INDEX "attachments_issueId_idx" ON "attachments"("issueId");

-- CreateIndex
CREATE INDEX "attachments_messageId_idx" ON "attachments"("messageId");

-- CreateIndex
CREATE INDEX "attachments_uploaderId_idx" ON "attachments"("uploaderId");

-- CreateIndex
CREATE UNIQUE INDEX "disputes_issueId_key" ON "disputes"("issueId");

-- CreateIndex
CREATE UNIQUE INDEX "disputes_escrowId_key" ON "disputes"("escrowId");

-- CreateIndex
CREATE INDEX "disputes_issueId_idx" ON "disputes"("issueId");

-- CreateIndex
CREATE INDEX "disputes_escrowId_idx" ON "disputes"("escrowId");

-- CreateIndex
CREATE INDEX "test_cases_issueId_idx" ON "test_cases"("issueId");

-- CreateIndex
CREATE INDEX "submissions_issueId_idx" ON "submissions"("issueId");

-- CreateIndex
CREATE INDEX "submissions_developerId_idx" ON "submissions"("developerId");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_issueId_key" ON "reviews"("issueId");

-- CreateIndex
CREATE INDEX "reviews_developerId_idx" ON "reviews"("developerId");

-- CreateIndex
CREATE UNIQUE INDEX "attestations_attestationUid_key" ON "attestations"("attestationUid");

-- CreateIndex
CREATE INDEX "attestations_developerId_idx" ON "attestations"("developerId");

-- CreateIndex
CREATE INDEX "attestations_issueId_idx" ON "attestations"("issueId");

-- CreateIndex
CREATE INDEX "ai_logs_task_idx" ON "ai_logs"("task");

-- CreateIndex
CREATE INDEX "ai_logs_issueId_idx" ON "ai_logs"("issueId");

-- CreateIndex
CREATE INDEX "ai_logs_createdAt_idx" ON "ai_logs"("createdAt");

-- CreateIndex
CREATE INDEX "notifications_userId_idx" ON "notifications"("userId");

-- CreateIndex
CREATE INDEX "notifications_isRead_idx" ON "notifications"("isRead");

-- CreateIndex
CREATE INDEX "admin_logs_adminId_idx" ON "admin_logs"("adminId");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "tokens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_developerId_fkey" FOREIGN KEY ("developerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_developerId_fkey" FOREIGN KEY ("developerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escrows" ADD CONSTRAINT "escrows_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "tokens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escrows" ADD CONSTRAINT "escrows_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escrows" ADD CONSTRAINT "escrows_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escrows" ADD CONSTRAINT "escrows_developerId_fkey" FOREIGN KEY ("developerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_escrowId_fkey" FOREIGN KEY ("escrowId") REFERENCES "escrows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_escrowId_fkey" FOREIGN KEY ("escrowId") REFERENCES "escrows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_developerId_fkey" FOREIGN KEY ("developerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_developerId_fkey" FOREIGN KEY ("developerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attestations" ADD CONSTRAINT "attestations_developerId_fkey" FOREIGN KEY ("developerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

