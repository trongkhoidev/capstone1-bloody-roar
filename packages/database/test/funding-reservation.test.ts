import { afterAll, expect, test } from "bun:test";
import { PrismaClient } from "@prisma/client";

// Needs a migrated DATABASE_URL (bun run db:migrate). Rows are removed after the run.
const db = new PrismaClient();
const issueId = `test_issue_${Date.now()}`;

const reservation = (suffix: string, status: "AWAITING_FUNDING" | "FUNDED" | "EXPIRED") => ({
  issueId,
  applicationId: "app",
  clientId: "client",
  developerId: "dev",
  escrowKey: `br_${issueId}_${suffix}`,
  escrowIdHash: `${issueId}_${suffix}`,
  chainId: 84532,
  contractAddress: "0x0000000000000000000000000000000000000001",
  tokenAddress: "0x0000000000000000000000000000000000000002",
  amountRaw: "1250000000",
  deliveryDeadline: new Date("2027-01-01T00:00:00Z"),
  termsHash: "0xterms",
  termsVersion: 1,
  expiresAt: new Date("2026-10-28T00:00:00Z"),
  status,
});

test("one active reservation per issue; terminal rows are allowed", async () => {
  await db.fundingReservation.create({ data: reservation("a", "AWAITING_FUNDING") });
  // Prisma returns a lazy PrismaPromise; Promise.resolve makes it a real promise for .rejects
  const second = db.fundingReservation.create({ data: reservation("b", "FUNDED") });
  await expect(Promise.resolve(second)).rejects.toMatchObject({ code: "P2002" });
  await db.fundingReservation.create({ data: reservation("c", "EXPIRED") });
});

afterAll(async () => {
  await db.fundingReservation.deleteMany({ where: { issueId } });
  await db.$disconnect();
});
