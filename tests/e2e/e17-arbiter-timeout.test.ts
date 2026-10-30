import { beforeAll, expect, test } from "bun:test";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { advanceTime, restoreChain, snapshotChain } from "./harness/chain";
import { createEvidence, draftRuling, postRuling, raiseDispute, waitForPhase } from "./harness/dispute";
import { fixture } from "./harness/fixture";
import { fund, prepareAndSend } from "./harness/funding";
import { gqlAs } from "./harness/gql";
import { claimable } from "./harness/payout";
import { submitWork } from "./harness/work";
import { waitFor } from "./harness/waitFor";

beforeAll(() => assertTestDatabase(process.env.TEST_DATABASE_URL));
const timeoutSplit = `mutation($issue: ID!) { prepareFinalizeArbiterTimeoutSplit(issueId: $issue) { intentId } }`;

test("E17: an arbiter timeout is open to anyone after 30 days from the raise", async () => {
  const f = await fixture();
  const snapshot = await snapshotChain();
  try {
    await fund(f);
    await submitWork(f, "Disputed work awaiting the arbiter");
    await raiseDispute(f, f.client, (await createEvidence(f, f.client, "The result is incomplete and misses the criterion.")).id);
    await waitForPhase(f, "DISPUTED");
    const early = await gqlAs(f.outsider, timeoutSplit, { issue: f.issueId });
    expect(early.errors?.[0]?.extensions?.code).toBe("DEADLINE_NOT_REACHED");
    await advanceTime(30 * 86400);
    const before = { client: await claimable(f.prisma, f.client.walletAddress), developer: await claimable(f.prisma, f.developer.walletAddress), fee: await claimable(f.prisma, f.feeRecipient) };
    await prepareAndSend(f, f.outsider, "prepareFinalizeArbiterTimeoutSplit");
    await waitFor(async () => (await f.prisma.dispute.findUniqueOrThrow({ where: { issueId: f.issueId } })).status === "RESOLVED");
    expect((await f.prisma.dispute.findUniqueOrThrow({ where: { issueId: f.issueId } })).finalClientBps).toBe(5000);
    expect((await claimable(f.prisma, f.client.walletAddress)) - before.client).toBe(50_000_000n);
    expect((await claimable(f.prisma, f.developer.walletAddress)) - before.developer).toBe(48_750_000n);
    expect((await claimable(f.prisma, f.feeRecipient)) - before.fee).toBe(1_250_000n);
    expect(await f.prisma.notification.count({ where: { type: "DISPUTE_RESOLVED", data: { path: ["issueId"], equals: f.issueId } } })).toBe(2);
  } finally {
    await restoreChain(snapshot, f.prisma);
  }
}, 240_000);

test("E17: a challenged ruling counts the 30 days from the challenge", async () => {
  const f = await fixture();
  const snapshot = await snapshotChain();
  try {
    await fund(f);
    await submitWork(f, "Challenged work awaiting the arbiter");
    await raiseDispute(f, f.client, (await createEvidence(f, f.client, "The result is incomplete and misses the criterion.")).id);
    await waitForPhase(f, "DISPUTED");
    await advanceTime(72 * 3600);
    await postRuling(f, (await draftRuling(f, "INITIAL", 5000)).safeTransactionJson);
    await waitForPhase(f, "INITIAL_RULING");
    await prepareAndSend(f, f.client, "prepareChallengeRuling");
    await waitFor(async () => (await f.prisma.dispute.findUniqueOrThrow({ where: { issueId: f.issueId } })).status === "CHALLENGED");
    await advanceTime(29 * 86400);
    const early = await gqlAs(f.outsider, timeoutSplit, { issue: f.issueId });
    expect(early.errors?.[0]?.extensions?.code).toBe("DEADLINE_NOT_REACHED");
    await advanceTime(2 * 86400);
    await prepareAndSend(f, f.outsider, "prepareFinalizeArbiterTimeoutSplit");
    await waitFor(async () => (await f.prisma.dispute.findUniqueOrThrow({ where: { issueId: f.issueId } })).status === "RESOLVED");
    expect((await f.prisma.dispute.findUniqueOrThrow({ where: { issueId: f.issueId } })).finalClientBps).toBe(5000);
  } finally {
    await restoreChain(snapshot, f.prisma);
  }
}, 240_000);
