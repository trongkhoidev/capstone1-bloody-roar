// apps/web/scripts/grant-admin.ts
// Grants the ADMIN role to a wallet and records the grant in AdminLog.
// Usage: bun run scripts/grant-admin.ts <0x-wallet-address>

import "../src/lib/env";
import { prisma, UserRole } from "@bloody-roar/database";

async function main() {
  const walletAddress = process.argv[2]?.trim().toLowerCase();
  if (!walletAddress || !/^0x[0-9a-f]{40}$/.test(walletAddress)) {
    console.error("Usage: bun run scripts/grant-admin.ts <0x-wallet-address>");
    process.exit(1);
  }

  const user = await prisma.$transaction(async (tx) => {
    const granted = await tx.user.upsert({
      where: { walletAddress },
      update: { role: UserRole.ADMIN },
      create: { walletAddress, role: UserRole.ADMIN },
      select: { id: true, walletAddress: true, role: true },
    });
    await tx.adminLog.create({
      data: {
        action: "grant_admin",
        target: "user",
        targetId: granted.id,
        adminId: "cli",
        details: { walletAddress },
      },
    });
    return granted;
  });

  console.log(`Granted ${user.role} to ${user.walletAddress}`);
}

main()
  .catch((error) => {
    console.error("Grant failed:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
