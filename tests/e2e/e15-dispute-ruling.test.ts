import { beforeAll, expect, test } from "bun:test";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { encodeEscrowCall } from "@bloody-roar/shared/escrow";
import { advanceTime, restoreChain, snapshotChain } from "./harness/chain";
import { createEvidence, draftRuling, arbiterPost, raiseDispute, submitCounterpartyEvidence, waitForPhase } from "./harness/dispute";
import { fixture } from "./harness/fixture";
import { fund, prepareAndSend } from "./harness/funding";
import { gqlAs } from "./harness/gql";
import { claimable } from "./harness/payout";
import { submitWork } from "./harness/work";
import { waitFor } from "./harness/waitFor";

beforeAll(() => assertTestDatabase(process.env.TEST_DATABASE_URL));

test("E15: evidence, an initial ruling and finalization pay the split", async () => {
  const f = await fixture();
  const snapshot = await snapshotChain();
  try {
    await fund(f);
    await submitWork(f, "Delivered work under dispute");
    const evidence = await createEvidence(f, f.client, "The delivery does not satisfy the acceptance criterion.");
    await raiseDispute(f, f.client, evidence.id);
    await waitFor(async () => (await f.prisma.notification.count({ where: { type: "DISPUTE_RAISED", userId: { in: [f.developer.id, f.admin.id] }, data: { path: ["issueId"], equals: f.issueId } } })) === 2);
    const counter = await createEvidence(f, f.developer, "The work meets the criterion; see the delivery hash.");
    await submitCounterpartyEvidence(f, f.developer, counter.id);
    await waitFor(async () => (await f.prisma.notification.count({ where: { userId: f.client.id, type: "EVIDENCE_SUBMITTED", data: { path: ["issueId"], equals: f.issueId } } })) === 1);
    await advanceTime(72 * 3600);
    const draft = await draftRuling(f, "INITIAL", 5000);
    const reservation = await f.prisma.fundingReservation.findFirstOrThrow({ where: { issueId: f.issueId } });
    const tx = await arbiterPost(f, draft.safeTransactionJson);
    expect(tx.data).toBe(encodeEscrowCall("postInitialRuling", { escrowId: reservation.escrowKey, clientBps: "5000", decisionHash: draft.decisionHash }));
    await waitForPhase(f, "INITIAL_RULING");
    await waitFor(async () => (await f.prisma.notification.count({ where: { type: "RULING_POSTED", data: { path: ["issueId"], equals: f.issueId } } })) > 0);
    await advanceTime(7 * 86400);
    const late = await gqlAs(f.client, `mutation($issue: ID!) { prepareChallengeRuling(issueId: $issue) { intentId } }`, { issue: f.issueId });
    expect(late.errors?.[0]?.extensions?.code).toBe("DEADLINE_NOT_REACHED");
    const before = { client: await claimable(f.prisma, f.client.walletAddress), developer: await claimable(f.prisma, f.developer.walletAddress), fee: await claimable(f.prisma, f.feeRecipient) };
    await prepareAndSend(f, f.outsider, "prepareFinalizeRuling");
    await waitFor(async () => (await f.prisma.dispute.findUniqueOrThrow({ where: { issueId: f.issueId } })).status === "RESOLVED");
    expect((await claimable(f.prisma, f.client.walletAddress)) - before.client).toBe(50_000_000n);
    expect((await claimable(f.prisma, f.developer.walletAddress)) - before.developer).toBe(48_750_000n);
    expect((await claimable(f.prisma, f.feeRecipient)) - before.fee).toBe(1_250_000n);
    expect(await f.prisma.notification.count({ where: { type: "DISPUTE_RESOLVED", data: { path: ["issueId"], equals: f.issueId } } })).toBe(2);
    expect(await f.prisma.notification.count({ where: { type: "ESCROW_RESOLVED", data: { path: ["issueId"], equals: f.issueId } } })).toBe(0);
  } finally {
    await restoreChain(snapshot, f);
  }
}, 240_000);
