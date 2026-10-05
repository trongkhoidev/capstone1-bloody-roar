ALTER TABLE "escrows" ADD COLUMN "lastChainLogIndex" INTEGER;
ALTER TABLE "transactions" ADD COLUMN "logIndex" INTEGER NOT NULL DEFAULT 0;
DROP INDEX "transactions_txHash_key";
CREATE UNIQUE INDEX "transactions_chainId_to_txHash_logIndex_key" ON "transactions"("chainId", "to", "txHash", "logIndex");
