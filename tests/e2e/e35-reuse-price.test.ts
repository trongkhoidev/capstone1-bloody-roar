import { beforeAll, expect, test } from "bun:test";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { fixture } from "./harness/fixture";
import { externalDeposit, fund } from "./harness/funding";
import { gqlAs } from "./harness/gql";
import { claimable, claimFunds, feeUser, tokenBalance } from "./harness/payout";
import { waitFor } from "./harness/waitFor";
import { releaseFunds, submitWork } from "./harness/work";

beforeAll(() => assertTestDatabase(process.env.TEST_DATABASE_URL));

// US-108: the fixture's developer fixed a similar COMPLETED issue, then re-applies to the 100 USDC bounty at the reuse price.
async function reuseFixture() {
  const f = await fixture();
  const old = await f.prisma.issue.create({ data: { title: `Solved ${crypto.randomUUID()}`, description: "An earlier fix of the same bug.", category: "BUG_FIX",
    status: "COMPLETED", tokenId: f.token.id, bountyAmount: "100", clientId: f.outsider.id, developerId: f.developer.id } });
  await f.prisma.issueSimilarity.create({ data: { issueId: f.issueId, similarIssueId: old.id, developerId: f.developer.id, score: 0.9 } });
  const withdrawn = await gqlAs(f.developer, `mutation($id: ID!) { withdrawApplication(id: $id) { id } }`, { id: f.applicationId });
  if (withdrawn.errors?.length) throw new Error(`Withdraw: ${withdrawn.errors[0]?.message}`);
  const reapplied = await gqlAs(f.developer, `mutation($input: ApplyToIssueInput!) { applyToIssue(input: $input) { id reuseOfIssueId } }`,
    { input: { issueId: f.issueId, reuseOfIssueId: old.id } });
  if (reapplied.errors?.length) throw new Error(`Reuse apply: ${reapplied.errors[0]?.message}`);
  expect(reapplied.data?.applyToIssue).toEqual({ id: f.applicationId, reuseOfIssueId: old.id });
  return f;
}

test("E35: a reuse-priced bounty costs the client 55 USDC and pays 50 to the developer and 5 to the fee recipient", async () => {
  const f = await reuseFixture();
  const fee = await feeUser(f);
  for (const user of [f.developer, fee]) if ((await claimable(f.prisma, user.walletAddress)) > 0n) await claimFunds(f, user);
  const escrowBefore = await tokenBalance(f, process.env.ESCROW_ADDRESS!);
  const { reservation, clientBalanceBeforeDeposit } = await fund(f);
  expect(reservation.amountRaw.toFixed()).toBe("50000000");
  const clientAfter = await tokenBalance(f, f.client.walletAddress);
  expect(clientBalanceBeforeDeposit - clientAfter).toBe(55_000_000n);
  expect(await tokenBalance(f, process.env.ESCROW_ADDRESS!) - escrowBefore).toBe(55_000_000n);

  await submitWork(f, "Reused the earlier fix");
  await releaseFunds(f);
  const developerBefore = await tokenBalance(f, f.developer.walletAddress);
  const feeBefore = await tokenBalance(f, fee.walletAddress);
  await claimFunds(f, f.developer);
  await claimFunds(f, fee);
  expect(await tokenBalance(f, f.developer.walletAddress) - developerBefore).toBe(50_000_000n);
  expect(await tokenBalance(f, fee.walletAddress) - feeBefore).toBe(5_000_000n);
  expect((await f.prisma.issue.findUniqueOrThrow({ where: { id: f.issueId } })).status).toBe("COMPLETED");
}, 240_000);

test("E35: a full-bounty deposit against a reuse reservation is flagged as mismatched", async () => {
  const f = await reuseFixture();
  const selection = await f.select(f.applicationId);
  expect(selection.errors).toBeUndefined();
  const id = (selection.data?.selectDeveloper as { id: string }).id;
  const reservation = await f.prisma.fundingReservation.findUniqueOrThrow({ where: { id } });
  await externalDeposit(f, reservation, { amount: 100_000_000n });
  await waitFor(async () => (await f.prisma.fundingReservation.findUnique({ where: { id } }))?.status === "MISMATCHED");
  expect(await f.prisma.notification.count({ where: { userId: f.client.id, type: "DEPOSIT_MISMATCHED", data: { path: ["issueId"], equals: f.issueId } } })).toBe(1);
}, 120_000);
