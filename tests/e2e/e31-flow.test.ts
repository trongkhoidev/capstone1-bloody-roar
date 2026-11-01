import { beforeAll, expect, test } from "bun:test";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { fixture } from "./harness/fixture";
import { fund } from "./harness/funding";
import { claimable, claimFunds, feeUser, tokenBalance } from "./harness/payout";
import { releaseFunds, submitWork } from "./harness/work";

beforeAll(() => assertTestDatabase(process.env.TEST_DATABASE_URL));

test("E31: one issue runs from selection to claim and the escrow pays out exactly its bounty", async () => {
  const f = await fixture();
  const fee = await feeUser(f);
  // Earlier files may leave claimable balances behind; clear them so the balance deltas cover only this issue.
  for (const user of [f.developer, fee]) if ((await claimable(f.prisma, user.walletAddress)) > 0n) await claimFunds(f, user);
  await fund(f);
  const funded = await tokenBalance(f, process.env.ESCROW_ADDRESS!);
  await submitWork(f, "Final delivery for the full flow");
  await releaseFunds(f);
  const developerBefore = await tokenBalance(f, f.developer.walletAddress);
  await claimFunds(f, f.developer);
  await claimFunds(f, fee);
  expect(await tokenBalance(f, f.developer.walletAddress) - developerBefore).toBe(97_500_000n);
  expect(funded - await tokenBalance(f, process.env.ESCROW_ADDRESS!)).toBe(100_000_000n);
  expect((await f.prisma.issue.findUniqueOrThrow({ where: { id: f.issueId } })).status).toBe("COMPLETED");
}, 240_000);
