CREATE TABLE "auth_challenges" (
    "id" TEXT NOT NULL,
    "nonceHash" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "uri" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_challenges_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "auth_challenges_nonceHash_key" ON "auth_challenges"("nonceHash");
CREATE INDEX "auth_challenges_expiresAt_idx" ON "auth_challenges"("expiresAt");
