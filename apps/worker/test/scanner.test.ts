import { afterAll, expect, test } from "bun:test";
import { prisma } from "@bloody-roar/database";
import { scanOnce } from "../src/indexer/scanner";
import { cleanupChain, fakeRpc, newChain, rawLog, scanToHead, testConfig } from "./helpers";

const config = testConfig();
const where = { chainId: config.chainId, contractAddress: config.escrowAddress };
const cursor = () => prisma.projectionCheckpoint.findUniqueOrThrow({ where: { chainId_contractAddress: where } });
const storedEvents = () => prisma.chainEvent.findMany({ where, orderBy: { txHash: "asc" } });

// Block hashes 100..safe, so every block the scanner asks for has a hash.
function chainUpTo(safe: bigint) {
  const chain = newChain();
  chain.safe = safe;
  for (let n = 100n; n <= safe; n++) chain.blockHash.set(n, `0xh${n}`);
  return chain;
}

afterAll(async () => {
  await cleanupChain(prisma, config);
  await prisma.$disconnect();
});

test("stores each log once and moves the cursor to the safe head", async () => {
  const chain = chainUpTo(110n);
  chain.logs = [
    rawLog({ address: config.escrowAddress, block: 101, blockHash: "0xh101", tx: "0xtx1" }),
    rawLog({ address: config.escrowAddress, block: 103, blockHash: "0xh103", tx: "0xtx2", txIndex: 1 }),
  ];
  const rpc = fakeRpc(chain);
  await scanToHead({ db: prisma, rpc, config });

  const events = await storedEvents();
  expect(events.map((e) => [e.txHash, e.blockNumber, e.canonical, e.decoderVersion])).toEqual([
    ["0xtx1", 101n, true, 0],
    ["0xtx2", 103n, true, 0],
  ]);
  expect(await cursor()).toMatchObject({ lastScannedBlock: 110n, lastSafeBlock: 110n, lastCanonicalBlockHash: "0xh110" });
  expect(await scanOnce({ db: prisma, rpc, config })).toBeNull();
});

test("rescanning a range leaves the stored events unchanged", async () => {
  const rpc = fakeRpc(chainUpTo(110n));
  await prisma.projectionCheckpoint.update({ where: { chainId_contractAddress: where }, data: { lastScannedBlock: 99n } });
  await scanToHead({ db: prisma, rpc, config });
  expect(await storedEvents()).toHaveLength(2);
});

test("an RPC range refusal halves the span until the node accepts it", async () => {
  const chain = chainUpTo(130n);
  chain.maxSpan = 3;
  const result = await scanOnce({ db: prisma, rpc: fakeRpc(chain), config });
  // from 111: span 20 -> 10 -> 5 -> 2 (accepted), so the scan stops at block 112
  expect(result).toEqual({ from: 111n, to: 112n, events: 0 });
  expect((await cursor()).lastScannedBlock).toBe(112n);
});
