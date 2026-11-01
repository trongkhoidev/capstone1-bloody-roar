import { beforeAll, expect, test } from "bun:test";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import type { Hex } from "@bloody-roar/shared/escrow";
import { fixture } from "./harness/fixture";
import { externalDeposit } from "./harness/funding";
import { waitFor } from "./harness/waitFor";
beforeAll(() => assertTestDatabase(process.env.TEST_DATABASE_URL));
for (const mismatch of ["amount", "developer"] as const) test(`E6: external deposit with wrong ${mismatch} is flagged`, async () => {
  const f = await fixture();
  const selection = await f.select(f.applicationId);
  expect(selection.errors).toBeUndefined();
  const id = (selection.data?.selectDeveloper as { id: string }).id;
  const reservation = await f.prisma.fundingReservation.findUniqueOrThrow({ where: { id } });
  await externalDeposit(f, reservation, mismatch === "amount" ? { amount: 101000000n } : { developer: f.rival.walletAddress as Hex });
  await waitFor(async () => (await f.prisma.fundingReservation.findUnique({ where: { id } }))?.status === "MISMATCHED");
  expect((await f.prisma.issue.findUniqueOrThrow({ where: { id: f.issueId } })).status).not.toBe("IN_PROGRESS");
  for (const userId of [f.client.id, f.developer.id, f.admin.id])
    expect(await f.prisma.notification.count({ where: { userId, type: "DEPOSIT_MISMATCHED", data: { path: ["issueId"], equals: f.issueId } } })).toBe(1);
}, 120_000);
