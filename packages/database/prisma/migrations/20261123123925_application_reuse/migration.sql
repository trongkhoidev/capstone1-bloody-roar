-- AlterTable
ALTER TABLE "applications" ADD COLUMN     "reuseOfIssueId" TEXT;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_reuseOfIssueId_fkey" FOREIGN KEY ("reuseOfIssueId") REFERENCES "issues"("id") ON DELETE SET NULL ON UPDATE CASCADE;
