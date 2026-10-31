// packages/database/src/seed-local-token.ts
// Registers the MockUSDC from the last `bun run deploy:local` as the bounty token on the local chain.
// Usage: bun run --cwd packages/database db:seed:local (after deploy:local, with CHAIN_ID=31337)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { prisma } from "./index";

const manifest = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../apps/contracts/deployments/localhost.json", import.meta.url)),
    "utf8",
  ),
) as { chainId: string; token: string };

const chainId = Number(manifest.chainId);
if (chainId !== 31337) throw new Error(`Expected the local manifest (31337), got chain ${chainId}`);

async function main() {
  await prisma.token.upsert({
    where: { chainId_address: { chainId, address: manifest.token } },
    update: { isActive: true },
    create: {
      symbol: "mUSDC",
      name: "Mock USD Coin",
      address: manifest.token,
      decimals: 6,
      chainId,
      isActive: true,
      sortOrder: 0,
    },
  });
  // A Hardhat node reset invalidates earlier local token addresses, so only the live token stays offered.
  const { count } = await prisma.token.updateMany({
    where: { chainId, isActive: true, address: { not: manifest.token } },
    data: { isActive: false },
  });
  console.log(`✅ Local bounty token ${manifest.token} (chain ${chainId}); deactivated ${count} stale row(s)`);
}

main().finally(() => prisma.$disconnect());
