import { beforeAll, expect, test } from "bun:test";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { restoreChain, snapshotChain } from "./harness/chain";
import { fixture } from "./harness/fixture";
import { fund, prepareAndSend, sendPrepared, walletOf, type Prepared } from "./harness/funding";
import { gqlAs } from "./harness/gql";
import { claimable } from "./harness/payout";
import { waitFor } from "./harness/waitFor";

beforeAll(() => assertTestDatabase(process.env.TEST_DATABASE_URL));

type Fixture = Awaited<ReturnType<typeof fixture>>;
const notified = (f: Fixture, type: "SETTLEMENT_PROPOSED" | "SETTLEMENT_REVOKED", userId: string) => f.prisma.notification.count({ where: { userId, type, data: { path: ["issueId"], equals: f.issueId } } });

async function propose(f: Fixture, user: Fixture["client"], clientBps: number) {
  const result = await gqlAs(user, `mutation($issue: ID!, $bps: Int!) { prepareProposeSettlement(issueId: $issue, clientBps: $bps) { intentId method contractAddress data value } }`, { issue: f.issueId, bps: clientBps });
  if (result.errors?.length) throw new Error(`Propose: ${result.errors[0]?.message}`);
  await sendPrepared(user, walletOf(f, user), result.data?.prepareProposeSettlement as Prepared);
}

test("E14: the other party accepts a proposed split and payouts follow it", async () => {
  const f = await fixture();
  const snapshot = await snapshotChain();
  try {
    await fund(f);
    await propose(f, f.client, 3000);
    await waitFor(async () => (await notified(f, "SETTLEMENT_PROPOSED", f.developer.id)) === 1);
    const selfAccept = await gqlAs(f.client, `mutation($issue: ID!) { prepareAcceptSettlement(issueId: $issue) { intentId } }`, { issue: f.issueId });
    expect(selfAccept.errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
    const before = { client: await claimable(f.prisma, f.client.walletAddress), developer: await claimable(f.prisma, f.developer.walletAddress), fee: await claimable(f.prisma, f.feeRecipient) };
    await prepareAndSend(f, f.developer, "prepareAcceptSettlement");
    await waitFor(async () => (await f.prisma.issue.findUniqueOrThrow({ where: { id: f.issueId } })).outcome === "SETTLEMENT");
    expect((await claimable(f.prisma, f.client.walletAddress)) - before.client).toBe(30_000_000n);
    expect((await claimable(f.prisma, f.developer.walletAddress)) - before.developer).toBe(68_250_000n);
    expect((await claimable(f.prisma, f.feeRecipient)) - before.fee).toBe(1_750_000n);
  } finally {
    await restoreChain(snapshot, f);
  }
}, 180_000);

test("E14: the proposer cannot accept its own proposal and can revoke it", async () => {
  const f = await fixture();
  const snapshot = await snapshotChain();
  try {
    await fund(f);
    await propose(f, f.developer, 3000);
    await waitFor(async () => (await notified(f, "SETTLEMENT_PROPOSED", f.client.id)) === 1);
    const selfAccept = await gqlAs(f.developer, `mutation($issue: ID!) { prepareAcceptSettlement(issueId: $issue) { intentId } }`, { issue: f.issueId });
    expect(selfAccept.errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
    await prepareAndSend(f, f.developer, "prepareRevokeSettlement");
    await waitFor(async () => (await notified(f, "SETTLEMENT_REVOKED", f.client.id)) === 1);
    const projection = await f.prisma.escrowProjection.findUniqueOrThrow({ where: { issueId: f.issueId } });
    expect(await f.prisma.settlementProposal.count({ where: { escrowIdHash: projection.escrowIdHash, status: "PENDING" } })).toBe(0);
    expect(projection.settlementProposer).toBeNull();
  } finally {
    await restoreChain(snapshot, f);
  }
}, 180_000);
