import { beforeAll, expect, test } from "bun:test";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { restoreChain, snapshotChain } from "./harness/chain";
import { externalDeposit } from "./harness/funding";
import { fixture } from "./harness/fixture";
import { waitFor } from "./harness/waitFor";

beforeAll(() => assertTestDatabase(process.env.TEST_DATABASE_URL));

// N-12: a real Hardhat reorg replaces deposit A with deposit B, and the indexer follows B.
test("E22: a reorged deposit is marked non-canonical and the projection follows the replacement", async () => {
  const f = await fixture();
  const snapshot = await snapshotChain();
  let clean = snapshot;
  try {
    const selection = await f.select(f.applicationId);
    if (selection.errors?.length) throw new Error(`Select: ${selection.errors[0]?.message}`);
    const reservation = await f.prisma.fundingReservation.findUniqueOrThrow({ where: { id: (selection.data?.selectDeveloper as { id: string }).id } });
    const chainEvent = (txHash: string) => f.prisma.chainEvent.findFirst({ where: { txHash, escrowIdHash: reservation.escrowIdHash } });
    const depositA = (await externalDeposit(f, reservation)).toLowerCase();
    await waitFor(async () => (await chainEvent(depositA))?.canonical === true);
    await restoreChain(snapshot, f);
    clean = await snapshotChain();
    const depositB = (await externalDeposit(f, reservation)).toLowerCase();
    expect(depositB).not.toBe(depositA);
    await waitFor(async () => (await chainEvent(depositB))?.canonical === true);
    await waitFor(async () => (await chainEvent(depositA))?.canonical === false);
    await waitFor(async () => (await f.prisma.escrowProjection.findUnique({ where: { escrowIdHash: reservation.escrowIdHash } }))?.phase === "FUNDED");
    expect((await f.prisma.escrowProjection.findUniqueOrThrow({ where: { escrowIdHash: reservation.escrowIdHash } })).amountRaw.toFixed()).toBe(reservation.amountRaw.toFixed());
  } finally {
    await restoreChain(clean, f);
  }
}, 240_000);
