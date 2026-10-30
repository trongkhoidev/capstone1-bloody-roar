import { beforeAll, expect, test } from "bun:test";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { advanceTime, restoreChain, snapshotChain } from "./harness/chain";
import { fixture } from "./harness/fixture";
import { fund, prepareAndSend } from "./harness/funding";
import { gqlAs } from "./harness/gql";
import { claimable } from "./harness/payout";
import { submitWork } from "./harness/work";
import { waitFor } from "./harness/waitFor";

beforeAll(() => assertTestDatabase(process.env.TEST_DATABASE_URL));

test("E13: a review timeout waits for the review window, then pays the developer and the fee recipient", async () => {
  const f = await fixture();
  const snapshot = await snapshotChain();
  try {
    await fund(f);
    await submitWork(f, "Work awaiting client review");
    const early = await gqlAs(f.developer, `mutation($id: ID!) { prepareClaimReviewTimeout(issueId: $id) { intentId } }`, { id: f.issueId });
    expect(early.errors?.[0]?.extensions?.code).toBe("REVIEW_WINDOW_NOT_REACHED");
    await advanceTime(13 * 86400);
    const developerBefore = await claimable(f.prisma, f.developer.walletAddress);
    const feeBefore = await claimable(f.prisma, f.feeRecipient);
    await prepareAndSend(f, f.developer, "prepareClaimReviewTimeout");
    await waitFor(async () => (await claimable(f.prisma, f.developer.walletAddress)) - developerBefore === 97_500_000n);
    expect((await claimable(f.prisma, f.feeRecipient)) - feeBefore).toBe(2_500_000n);
    expect((await f.prisma.issue.findUniqueOrThrow({ where: { id: f.issueId } })).outcome).toBe("REVIEW_TIMEOUT");
  } finally {
    await restoreChain(snapshot, f.prisma);
  }
}, 180_000);
