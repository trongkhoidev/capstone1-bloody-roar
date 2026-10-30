import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import type { PrismaClient } from "@bloody-roar/database";

type Manifest = { token: string; chainId: string | number };
export async function seedTestToken(db: Pick<PrismaClient, "token">, manifest: Manifest) {
  assertTestDatabase(process.env.TEST_DATABASE_URL);
  const chainId = Number(manifest.chainId), address = manifest.token.toLowerCase();
  if (chainId !== 31337 || !/^0x[0-9a-f]{40}$/.test(address)) throw new Error("Invalid local deployment manifest");
  const data = { symbol: "USDC", name: "MockUSDC", decimals: 6, chainId, address, isActive: true };
  return db.token.upsert({ where: { chainId_address: { chainId, address } }, create: data, update: data });
}

if (import.meta.main) {
  assertTestDatabase(process.env.TEST_DATABASE_URL);
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.DIRECT_URL = process.env.TEST_DATABASE_URL;
  const { prisma } = await import("@bloody-roar/database");
  try {
    const manifest = await Bun.file("apps/contracts/deployments/localhost.json").json() as Manifest;
    await seedTestToken(prisma, manifest);
  } finally { await prisma.$disconnect(); }
}
