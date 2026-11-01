import { beforeAll, expect, test } from "bun:test";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { advanceTime, restoreChain, snapshotChain } from "./harness/chain";
import { createEvidence, draftRuling, arbiterPost, raiseDispute, waitForPhase } from "./harness/dispute";
import { fixture } from "./harness/fixture";
import { fund, prepareAndSend } from "./harness/funding";
import { gqlAs } from "./harness/gql";
import { claimable } from "./harness/payout";
import { submitWork } from "./harness/work";
import { waitFor } from "./harness/waitFor";

beforeAll(() => assertTestDatabase(process.env.TEST_DATABASE_URL));

test("E16: a client challenge replaces the initial ruling with a final ruling", async () => {
  const f = await fixture();
  const snapshot = await snapshotChain();
  try {
    await fund(f);
    await submitWork(f, "Disputed work");
    await raiseDispute(f, f.client, (await createEvidence(f, f.client, "The result is incomplete and misses the criterion.")).id);
    await waitForPhase(f, "DISPUTED");
    await advanceTime(72 * 3600);
    await arbiterPost(f, (await draftRuling(f, "INITIAL", 3000)).safeTransactionJson);
    await waitForPhase(f, "INITIAL_RULING");
    await prepareAndSend(f, f.client, "prepareChallengeRuling");
    await waitFor(async () => (await f.prisma.dispute.findUniqueOrThrow({ where: { issueId: f.issueId } })).status === "CHALLENGED");
    await waitFor(async () => (await f.prisma.notification.count({ where: { type: "RULING_CHALLENGED", userId: f.developer.id, data: { path: ["issueId"], equals: f.issueId } } })) === 1);
    const counterChallenge = await gqlAs(f.developer, `mutation($issue: ID!) { prepareChallengeRuling(issueId: $issue) { intentId } }`, { issue: f.issueId });
    expect(counterChallenge.errors?.[0]?.extensions?.code).toBe("INVALID_PHASE");
    await arbiterPost(f, (await draftRuling(f, "FINAL", 7000)).safeTransactionJson);
    await waitForPhase(f, "FINAL_RULING");
    await advanceTime(24 * 3600);
    const before = { client: await claimable(f.prisma, f.client.walletAddress), developer: await claimable(f.prisma, f.developer.walletAddress), fee: await claimable(f.prisma, f.feeRecipient) };
    await prepareAndSend(f, f.outsider, "prepareFinalizeRuling");
    await waitFor(async () => (await f.prisma.dispute.findUniqueOrThrow({ where: { issueId: f.issueId } })).status === "RESOLVED");
    expect((await claimable(f.prisma, f.client.walletAddress)) - before.client).toBe(70_000_000n);
    expect((await claimable(f.prisma, f.developer.walletAddress)) - before.developer).toBe(29_250_000n);
    expect((await claimable(f.prisma, f.feeRecipient)) - before.fee).toBe(750_000n);
  } finally {
    await restoreChain(snapshot, f);
  }
}, 240_000);

test("E16: a challenge after the seven-day window is refused", async () => {
  const f = await fixture();
  const snapshot = await snapshotChain();
  try {
    await fund(f);
    await submitWork(f, "Second disputed work");
    await raiseDispute(f, f.client, (await createEvidence(f, f.client, "The result is incomplete and misses the criterion.")).id);
    await waitForPhase(f, "DISPUTED");
    await advanceTime(72 * 3600);
    await arbiterPost(f, (await draftRuling(f, "INITIAL", 3000)).safeTransactionJson);
    await waitForPhase(f, "INITIAL_RULING");
    await advanceTime(7 * 86400);
    const late = await gqlAs(f.client, `mutation($issue: ID!) { prepareChallengeRuling(issueId: $issue) { intentId } }`, { issue: f.issueId });
    expect(late.errors?.[0]?.extensions?.code).toBe("DEADLINE_NOT_REACHED");
  } finally {
    await restoreChain(snapshot, f);
  }
}, 240_000);
