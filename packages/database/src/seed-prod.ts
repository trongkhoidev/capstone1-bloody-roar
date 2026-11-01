// packages/database/src/seed-prod.ts
// Production seed: only reference data the app needs (no demo users or issues).
// Usage: bun run db:seed:prod

import { prisma } from "./index";

async function main() {
  const chainId = Number(process.env.CHAIN_ID || "84532");
  if (!Number.isSafeInteger(chainId) || chainId < 1) throw new Error("CHAIN_ID must be a positive integer");
  // Base Sepolia USDC — the only token the escrow contract accepts.
  const usdc = await prisma.token.upsert({
    where: {
      chainId_address: {
        chainId,
        address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      },
    },
    update: { isActive: true },
    create: {
      symbol: "USDC",
      name: "USD Coin",
      address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      decimals: 6,
      chainId,
      isActive: true,
      sortOrder: 1,
    },
  });
  console.log(`Token ready: ${usdc.symbol} (chain ${usdc.chainId})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
