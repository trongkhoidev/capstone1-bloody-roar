import { describe } from "bun:test";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { beforeAll } from "bun:test";
import { afterAll, expect, test } from "bun:test";
import { PrismaClient, prisma } from "@bloody-roar/database";
import { scanOnce } from "../src/indexer/scanner";
import { indexerJob } from "../src/jobs/indexer";
import type { JobContext } from "../src/runtime/scheduler";
import { cleanupChain, fakeRpc, newChain, rawLog, scanToHead, testConfig } from "./helpers";

describe.skipIf(!process.env.TEST_DATABASE_URL)("database", () => {

beforeAll(() => assertTestDatabase(process.env.TEST_DATABASE_URL));

const config = testConfig();
const where = { chainId: config.chainId, contractAddress: config.escrowAddress };
const cursor = () => prisma.projectionCheckpoint.findUniqueOrThrow({ where: { chainId_contractAddress: where } });
const storedEvents = () => prisma.chainEvent.findMany({ where, orderBy: [{ blockNumber: "asc" }, { logIndex: "asc" }] });

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

test("successive ticks reuse verified block hashes and refresh the window after a reorg", async () => {
  await cleanupChain(prisma, config);
  const chain = chainUpTo(170n);
  const fake = fakeRpc(chain);
  const tags: string[] = [];
  const rpc = { ...fake, async call<T>(method: string, params: unknown[]): Promise<T> {
    if (method === "eth_getBlockByNumber") tags.push(String(params[0]));
    return fake.call<T>(method, params);
  } };
  const ctx = { db: prisma, rpc, config, now: () => new Date(), log: { info() {}, warn() {}, error() {} } } as JobContext;
  await scanToHead({ db: prisma, rpc, config });
  await indexerJob.run(ctx);
  tags.length = 0;
  chain.safe = 171n; chain.blockHash.set(171n, "0xh171");
  await indexerJob.run(ctx);
  expect(tags).toEqual(["0xaa", "safe", "0xab"]);
  const hashes = (await cursor()).canonicalBlockHashes as Record<string, string>;
  expect(Object.keys(hashes)).toHaveLength(65);
  expect(hashes["106"]).toBeUndefined();
  expect(hashes["107"]).toBe("0xh107");
  tags.length = 0;
  chain.blockHash.set(171n, "0xchanged171");
  await indexerJob.run(ctx);
  for (let n = 108n; n <= 171n; n++) expect(tags).toContain(`0x${n.toString(16)}`);
  expect((await cursor()).canonicalBlockHashes).toMatchObject({ "171": "0xchanged171" });
});

test("a restarted worker resumes from the stored checkpoint without reprocessing or skipping", async () => {
  await cleanupChain(prisma, config);
  const chain = chainUpTo(170n);
  chain.logs = [rawLog({ address: config.escrowAddress, block: 150, blockHash: "0xh150", tx: "0xbefore" })];
  const ranges: Array<[bigint, bigint]> = [];
  const rpc = () => {
    const fake = fakeRpc(chain);
    return { ...fake, async call<T>(method: string, params: unknown[]): Promise<T> {
      if (method === "eth_getLogs") {
        const [range] = params as [{ fromBlock: string; toBlock: string }];
        ranges.push([BigInt(range.fromBlock), BigInt(range.toBlock)]);
      }
      return fake.call<T>(method, params);
    } };
  };
  const ctx = (db: PrismaClient) => ({ db, rpc: rpc(), config, now: () => new Date(), log: { info() {}, warn() {}, error() {} } }) as JobContext;
  await indexerJob.run(ctx(prisma));
  expect((await storedEvents()).map((event) => [event.txHash, event.blockNumber])).toEqual([["0xbefore", 150n]]);
  expect(await cursor()).toMatchObject({ lastScannedBlock: 170n, lastCanonicalBlockHash: "0xh170" });

  await prisma.projectionCheckpoint.update({ where: { chainId_contractAddress: where }, data: { canonicalBlockHashes: {} } });
  chain.safe = 171n; chain.blockHash.set(171n, "0xh171");
  chain.logs = [...chain.logs, rawLog({ address: config.escrowAddress, block: 171, blockHash: "0xh171", tx: "0xafter" })];
  ranges.length = 0;

  const restarted = new PrismaClient({
    ...(process.env.DATABASE_URL ? { datasourceUrl: process.env.DATABASE_URL } : {}),
    transactionOptions: { maxWait: 10_000, timeout: 20_000 },
  });
  try {
    await indexerJob.run(ctx(restarted));
  } finally {
    await restarted.$disconnect();
  }
  expect(ranges).toEqual([[171n, 171n]]);

  const events = await storedEvents();
  expect(events.map((event) => [event.txHash, event.blockNumber])).toEqual([["0xbefore", 150n], ["0xafter", 171n]]);
  const after = await cursor();
  expect(after).toMatchObject({ lastScannedBlock: 171n, lastCanonicalBlockHash: "0xh171", reorgAlerted: false });
  expect(Object.keys(after.canonicalBlockHashes as Record<string, string>)).toHaveLength(65);
  expect(after.canonicalBlockHashes).toMatchObject({ "107": "0xh107", "171": "0xh171" });
});

});
