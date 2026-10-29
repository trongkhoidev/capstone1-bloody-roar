CREATE TABLE "issue_comments" (
    "id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "issue_comments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "issue_comments_issueId_createdAt_idx" ON "issue_comments"("issueId", "createdAt");
CREATE INDEX "issue_comments_userId_idx" ON "issue_comments"("userId");

ALTER TABLE "issue_comments" ADD CONSTRAINT "issue_comments_issueId_fkey"
    FOREIGN KEY ("issueId") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "issue_comments" ADD CONSTRAINT "issue_comments_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
