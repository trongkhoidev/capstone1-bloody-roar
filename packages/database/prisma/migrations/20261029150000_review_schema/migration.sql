ALTER TYPE "NotificationType" ADD VALUE 'DEPOSIT_MISMATCHED';
ALTER TABLE "issues" ADD COLUMN "hiddenAt" TIMESTAMP(3);
ALTER TABLE "disputes" ADD COLUMN "raisedAt" TIMESTAMP(3);
CREATE TABLE "issue_views" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "issue_views_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "issue_views_issueId_userId_key" ON "issue_views"("issueId", "userId");
CREATE INDEX "issue_views_issueId_idx" ON "issue_views"("issueId");
ALTER TABLE "issue_views" ADD CONSTRAINT "issue_views_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "issue_views" ADD CONSTRAINT "issue_views_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
