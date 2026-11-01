import { beforeAll, expect, test } from "bun:test";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { advanceTime, restoreChain, snapshotChain } from "./harness/chain";
import { fixture } from "./harness/fixture";
import { fund, prepareAndSend } from "./harness/funding";
import { gqlAs } from "./harness/gql";
import { claimable, claimFunds, tokenBalance } from "./harness/payout";
import { waitFor } from "./harness/waitFor";

beforeAll(() => assertTestDatabase(process.env.TEST_DATABASE_URL));

test("E12: a missed delivery refund opens after the deadline and pays the client", async () => {
  const f = await fixture();
  const snapshot = await snapshotChain();
  try {
    await fund(f);
    const early = await gqlAs(f.outsider, `mutation($id: ID!) { prepareClaimMissedDeliveryRefund(issueId: $id) { intentId } }`, { id: f.issueId });
    expect(early.errors?.[0]?.extensions?.code).toBe("DEADLINE_NOT_REACHED");
    await advanceTime(6 * 86400);
    const before = await claimable(f.prisma, f.client.walletAddress);
    await prepareAndSend(f, f.outsider, "prepareClaimMissedDeliveryRefund");
    await waitFor(async () => (await claimable(f.prisma, f.client.walletAddress)) - before === 100_000_000n);
    const walletBefore = await tokenBalance(f, f.client.walletAddress);
    await claimFunds(f, f.client);
    expect(await tokenBalance(f, f.client.walletAddress) - walletBefore).toBe(100_000_000n);
  } finally {
    await restoreChain(snapshot, f);
  }
}, 180_000);
