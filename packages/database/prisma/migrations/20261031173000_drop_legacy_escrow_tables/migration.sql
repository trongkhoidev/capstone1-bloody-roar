-- DropForeignKey
ALTER TABLE "disputes" DROP CONSTRAINT "disputes_escrowId_fkey";

-- DropForeignKey
ALTER TABLE "escrows" DROP CONSTRAINT "escrows_clientId_fkey";

-- DropForeignKey
ALTER TABLE "escrows" DROP CONSTRAINT "escrows_developerId_fkey";

-- DropForeignKey
ALTER TABLE "escrows" DROP CONSTRAINT "escrows_issueId_fkey";

-- DropForeignKey
ALTER TABLE "escrows" DROP CONSTRAINT "escrows_tokenId_fkey";

-- DropForeignKey
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_escrowId_fkey";

-- DropIndex
DROP INDEX "disputes_escrowId_idx";

-- DropIndex
DROP INDEX "disputes_escrowId_key";

-- AlterTable
ALTER TABLE "disputes" DROP COLUMN "escrowId";

-- DropTable
DROP TABLE "escrows";

-- DropTable
DROP TABLE "transactions";

-- DropEnum
DROP TYPE "EscrowStatus";

-- DropEnum
DROP TYPE "TransactionStatus";

-- DropEnum
DROP TYPE "TransactionType";
