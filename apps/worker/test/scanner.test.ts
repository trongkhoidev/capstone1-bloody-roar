import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { beforeAll } from "bun:test";
import { afterAll, expect, test } from "bun:test";
import { prisma } from "@bloody-roar/database";
import { scanOnce } from "../src/indexer/scanner";
import { cleanupChain, fakeRpc, newChain, rawLog, scanToHead, testConfig } from "./helpers";

beforeAll(() => assertTestDatabase(process.env.TEST_DATABASE_URL));

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
    ["0xtx1", 101n, true, 1],
    ["0xtx2", 103n, true, 1],
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


test("latest finality scans without requesting the safe tag", async () => {
  const chain = chainUpTo(113n);
  const fake = fakeRpc(chain);
  const tags: unknown[] = [];
  const rpc = {
    ...fake,
    async call<T>(method: string, params: unknown[]): Promise<T> {
      if (method === "eth_getBlockByNumber") tags.push(params[0]);
      return fake.call<T>(method, params);
    },
  };
  await scanOnce({ db: prisma, rpc, config: { ...config, finality: "latest" } });
  expect(tags).toContain("latest");
  expect(tags).not.toContain("safe");
});


test("a concurrent replay invalidates a scan before it can advance the cursor", async () => {
  const chain = chainUpTo(114n);
  const fake = fakeRpc(chain);
  let changed = false;
  const rpc = {
    ...fake,
    async call<T>(method: string, params: unknown[]): Promise<T> {
      if (method === "eth_getLogs" && !changed) {
        changed = true;
        await prisma.projectionCheckpoint.update({ where: { chainId_contractAddress: where }, data: { lastScannedBlock: 99n, replayStatus: "REPLAY_REQUESTED" } });
      }
      return fake.call<T>(method, params);
    },
  };
  await expect(scanOnce({ db: prisma, rpc, config })).rejects.toThrow("checkpoint changed");
  expect(await cursor()).toMatchObject({ lastScannedBlock: 99n, replayStatus: "REPLAY_REQUESTED" });
});
