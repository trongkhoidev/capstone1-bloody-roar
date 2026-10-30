/*
  Warnings:

  - Added the required column `issueId` to the `evidence_manifests` table without a default value. This is not possible if the table is not empty.
  - Added the required column `side` to the `evidence_manifests` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "evidence_manifests" ADD COLUMN     "issueId" TEXT NOT NULL,
ADD COLUMN     "side" TEXT NOT NULL,
ALTER COLUMN "disputeId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "ruling_drafts" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "clientBps" INTEGER NOT NULL,
    "rationale" TEXT NOT NULL,
    "decisionHash" TEXT NOT NULL,
    "draftedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ruling_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ruling_drafts_decisionHash_key" ON "ruling_drafts"("decisionHash");

-- CreateIndex
CREATE INDEX "ruling_drafts_issueId_idx" ON "ruling_drafts"("issueId");

-- CreateIndex
CREATE INDEX "evidence_manifests_issueId_idx" ON "evidence_manifests"("issueId");
