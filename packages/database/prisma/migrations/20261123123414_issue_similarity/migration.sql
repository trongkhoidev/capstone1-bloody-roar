-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'SIMILAR_ISSUE_POSTED';

-- CreateTable
CREATE TABLE "issue_similarities" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "similarIssueId" TEXT NOT NULL,
    "developerId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "issue_similarities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "issue_similarities_issueId_developerId_idx" ON "issue_similarities"("issueId", "developerId");

-- CreateIndex
CREATE UNIQUE INDEX "issue_similarities_issueId_similarIssueId_key" ON "issue_similarities"("issueId", "similarIssueId");

-- AddForeignKey
ALTER TABLE "issue_similarities" ADD CONSTRAINT "issue_similarities_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_similarities" ADD CONSTRAINT "issue_similarities_similarIssueId_fkey" FOREIGN KEY ("similarIssueId") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_similarities" ADD CONSTRAINT "issue_similarities_developerId_fkey" FOREIGN KEY ("developerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
