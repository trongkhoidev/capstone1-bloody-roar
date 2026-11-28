import { describe } from "bun:test";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { beforeAll } from "bun:test";
import { afterAll, expect, test } from "bun:test";
import { prisma } from "@bloody-roar/database";
import { handleReorg } from "../src/indexer/reorg";
import { cleanupChain, fakeRpc, newChain, rawLog, scanToHead, testConfig } from "./helpers";

describe.skipIf(!process.env.TEST_DATABASE_URL)("database", () => {

beforeAll(() => assertTestDatabase(process.env.TEST_DATABASE_URL));

const config = testConfig();
const where = { chainId: config.chainId, contractAddress: config.escrowAddress };
const address = config.escrowAddress;

afterAll(async () => {
  await cleanupChain(prisma, config);
  await prisma.$disconnect();
});

test("a reorg marks orphaned events non-canonical and re-includes events that moved", async () => {
  const chain = newChain();
  chain.safe = 105n;
  chain.blockHash.set(99n, "0xA99");
  for (let n = 100n; n <= 105n; n++) chain.blockHash.set(n, `0xA${n}`);
  chain.logs = [
    rawLog({ address, block: 101, blockHash: "0xA101", tx: "0xtx1" }),
    rawLog({ address, block: 103, blockHash: "0xA103", tx: "0xtx2" }),
    rawLog({ address, block: 104, blockHash: "0xA104", tx: "0xtx3" }),
    rawLog({ address, block: 105, blockHash: "0xA105", tx: "0xtx4" }),
  ];
  await scanToHead({ db: prisma, rpc: fakeRpc(chain), config });
  expect(await handleReorg({ db: prisma, rpc: fakeRpc(chain), config })).toEqual({ verifiedTip: { number: 105n, hash: "0xA105" } });

  // Blocks 104 and 105 are replaced. tx3 is included again in the new block 104. tx4 is gone.
  chain.blockHash.set(104n, "0xB104");
  chain.blockHash.set(105n, "0xB105");
  chain.logs = [
    rawLog({ address, block: 101, blockHash: "0xA101", tx: "0xtx1" }),
    rawLog({ address, block: 103, blockHash: "0xA103", tx: "0xtx2" }),
    rawLog({ address, block: 104, blockHash: "0xB104", tx: "0xtx3" }),
  ];
  const reorged = fakeRpc(chain);
  expect(await handleReorg({ db: prisma, rpc: reorged, config })).toEqual({ rewoundTo: 99n });
  await scanToHead({ db: prisma, rpc: reorged, config });

  const events = await prisma.chainEvent.findMany({ where });
  const byTx = Object.fromEntries(events.map((e) => [e.txHash, e]));
  expect(byTx["0xtx1"]?.canonical).toBe(true);
  expect(byTx["0xtx2"]?.canonical).toBe(true);
  expect(byTx["0xtx3"]).toMatchObject({ canonical: true, blockHash: "0xB104", blockNumber: 104n });
  expect(byTx["0xtx4"]?.canonical).toBe(false);
  expect(await prisma.projectionCheckpoint.findUniqueOrThrow({ where: { chainId_contractAddress: where } })).toMatchObject({
    lastScannedBlock: 105n,
    lastCanonicalBlockHash: "0xB105",
  });
});


test("an unavailable RPC block does not orphan events or move the checkpoint", async () => {
  await cleanupChain(prisma, config);
  const chain = newChain();
  chain.safe = 101n;
  chain.blockHash.set(99n, "0xA99");
  chain.blockHash.set(100n, "0xA100");
  chain.blockHash.set(101n, "0xA101");
  chain.logs = [rawLog({ address, block: 100, blockHash: "0xA100", tx: "0xmissing" })];
  await scanToHead({ db: prisma, rpc: fakeRpc(chain), config });
  chain.blockHash.set(101n, "0xB101");
  chain.blockHash.delete(100n);
  await expect(handleReorg({ db: prisma, rpc: fakeRpc(chain), config })).rejects.toThrow("no block for 100");
  expect((await prisma.chainEvent.findFirstOrThrow({ where: { ...where, txHash: "0xmissing" } })).canonical).toBe(true);
  expect((await prisma.projectionCheckpoint.findUniqueOrThrow({ where: { chainId_contractAddress: where } })).lastScannedBlock).toBe(101n);
  chain.blockHash.delete(101n);
  await expect(handleReorg({ db: prisma, rpc: fakeRpc(chain), config })).rejects.toThrow("no block for 101");
  chain.blockHash.set(101n, "0xB101");
  chain.blockHash.set(100n, "0xA100");
  chain.blockHash.delete(99n);
  await expect(handleReorg({ db: prisma, rpc: fakeRpc(chain), config })).rejects.toThrow("no block for 99");
  expect((await prisma.chainEvent.findFirstOrThrow({ where: { ...where, txHash: "0xmissing" } })).canonical).toBe(true);
});

test("a second reorg is detected before a rewound scanner catches up", async () => {
  await cleanupChain(prisma, config);
  const chain = newChain(); chain.safe = 102n;
  for (const n of [99n, 100n, 101n, 102n]) chain.blockHash.set(n, `0xA${n}`);
  chain.logs = [rawLog({ address, block: 101, blockHash: "0xA101", tx: "0xfirst" }), rawLog({ address, block: 102, blockHash: "0xA102", tx: "0xsecond" })];
  await scanToHead({ db: prisma, rpc: fakeRpc(chain), config });
  chain.blockHash.set(102n, "0xB102");
  expect(await handleReorg({ db: prisma, rpc: fakeRpc(chain), config })).toEqual({ rewoundTo: 99n });
  expect((await prisma.chainEvent.findFirstOrThrow({ where: { ...where, txHash: "0xsecond" } })).canonical).toBe(false);
  expect((await prisma.chainEvent.findFirstOrThrow({ where: { ...where, txHash: "0xfirst" } })).canonical).toBe(true);
  chain.blockHash.set(101n, "0xC101");
  expect(await handleReorg({ db: prisma, rpc: fakeRpc(chain), config })).toEqual({ rewoundTo: 99n });
  expect((await prisma.chainEvent.findFirstOrThrow({ where: { ...where, txHash: "0xfirst" } })).canonical).toBe(false);
});

test("two-block reorg recovers with no escrow event at the window boundary", async () => {
  await cleanupChain(prisma, config);
  const limited = { ...config, escrowDeployBlock: 0n, reorgWindow: 64 };
  const chain = newChain(); chain.safe = 300n;
  for (let n = 0n; n <= 300n; n++) chain.blockHash.set(n, `0xA${n}`);
  chain.logs = [rawLog({ address, block: 300, blockHash: "0xA300", tx: "0xshallow" })];
  await scanToHead({ db: prisma, rpc: fakeRpc(chain), config: limited });
  const hashes = (await prisma.projectionCheckpoint.findUniqueOrThrow({ where: { chainId_contractAddress: where } })).canonicalBlockHashes as Record<string, string>;
  expect(Object.keys(hashes)).toHaveLength(65);
  expect(hashes["236"]).toBe("0xA236");
  chain.blockHash.set(299n, "0xB299"); chain.blockHash.set(300n, "0xB300");
  chain.logs = [];
  expect(await handleReorg({ db: prisma, rpc: fakeRpc(chain), config: limited })).toEqual({ rewoundTo: 236n });
  await scanToHead({ db: prisma, rpc: fakeRpc(chain), config: limited });
  expect((await prisma.projectionCheckpoint.findUniqueOrThrow({ where: { chainId_contractAddress: where } })).lastScannedBlock).toBe(300n);
  expect((await prisma.chainEvent.findFirstOrThrow({ where: { ...where, txHash: "0xshallow" } })).canonical).toBe(false);
});

test("a reorg right after the migration with an empty hash map rewinds to the deploy block instead of alerting", async () => {
  await cleanupChain(prisma, config);
  const limited = { ...config, escrowDeployBlock: 100n, reorgWindow: 64, alertWebhookUrl: "https://example.test/alert" };
  const chain = newChain(); chain.safe = 300n;
  for (let n = 99n; n <= 300n; n++) chain.blockHash.set(n, `0xA${n}`);
  chain.logs = [
    rawLog({ address, block: 236, blockHash: "0xA236", tx: "0xboundary" }),
    rawLog({ address, block: 300, blockHash: "0xA300", tx: "0xpostmigration" }),
  ];
  await scanToHead({ db: prisma, rpc: fakeRpc(chain), config: limited });
  await prisma.projectionCheckpoint.update({ where: { chainId_contractAddress: where }, data: { canonicalBlockHashes: {} } });
  for (let n = 236n; n <= 300n; n++) chain.blockHash.set(n, `0xB${n}`);
  chain.logs = [
    rawLog({ address, block: 236, blockHash: "0xB236", tx: "0xboundary" }),
    rawLog({ address, block: 300, blockHash: "0xB300", tx: "0xpostmigration" }),
  ];
  const originalFetch = globalThis.fetch;
  let alertCount = 0;
  globalThis.fetch = (async () => { alertCount++; return new Response(); }) as typeof fetch;
  try {
    expect(await handleReorg({ db: prisma, rpc: fakeRpc(chain), config: limited })).toEqual({ rewoundTo: 99n });
  } finally {
    globalThis.fetch = originalFetch;
  }
  expect(alertCount).toBe(0);
  expect(await prisma.projectionCheckpoint.findUniqueOrThrow({ where: { chainId_contractAddress: where } })).toMatchObject({
    lastScannedBlock: 99n, lastCanonicalBlockHash: "0xA99", reorgAlerted: false,
  });
  const stale = await prisma.chainEvent.findMany({ where, orderBy: { txHash: "asc" } });
  expect(stale.map((event) => [event.txHash, event.canonical])).toEqual([["0xboundary", false], ["0xpostmigration", false]]);
  await scanToHead({ db: prisma, rpc: fakeRpc(chain), config: limited });
  expect(await prisma.projectionCheckpoint.findUniqueOrThrow({ where: { chainId_contractAddress: where } })).toMatchObject({
    lastScannedBlock: 300n, lastCanonicalBlockHash: "0xB300",
  });
  const recovered = await prisma.chainEvent.findMany({ where, orderBy: { txHash: "asc" } });
  expect(recovered.map((event) => [event.txHash, event.canonical, event.blockHash])).toEqual([
    ["0xboundary", true, "0xB236"],
    ["0xpostmigration", true, "0xB300"],
  ]);
});

test("raising the reorg window rewinds without a false beyond-window alert", async () => {
  await cleanupChain(prisma, config);
  const narrow = { ...config, escrowDeployBlock: 100n, reorgWindow: 2 };
  const chain = newChain(); chain.safe = 300n;
  for (let n = 99n; n <= 300n; n++) chain.blockHash.set(n, `0xA${n}`);
  chain.logs = [rawLog({ address, block: 300, blockHash: "0xA300", tx: "0xwindow" })];
  await scanToHead({ db: prisma, rpc: fakeRpc(chain), config: narrow });
  const wide = { ...narrow, reorgWindow: 64 };
  chain.blockHash.set(300n, "0xB300");
  chain.logs = [];
  expect(await handleReorg({ db: prisma, rpc: fakeRpc(chain), config: wide })).toEqual({ rewoundTo: 236n });
  expect(await prisma.projectionCheckpoint.findUniqueOrThrow({ where: { chainId_contractAddress: where } })).toMatchObject({
    lastScannedBlock: 236n, lastCanonicalBlockHash: "0xA236", reorgAlerted: false,
  });
});

test("a reorg beyond the window stops without changing the cursor or events", async () => {
  await cleanupChain(prisma, config);
  const limited = { ...config, reorgWindow: 2, alertWebhookUrl: "https://example.test/alert" };
  const chain = newChain(); chain.safe = 103n;
  for (const n of [99n, 100n, 101n, 102n, 103n]) chain.blockHash.set(n, `0xA${n}`);
  chain.logs = [rawLog({ address, block: 103, blockHash: "0xA103", tx: "0xdeep" })];
  await scanToHead({ db: prisma, rpc: fakeRpc(chain), config: limited });
  for (const n of [101n, 102n, 103n]) chain.blockHash.set(n, `0xB${n}`);
  const originalFetch = globalThis.fetch;
  let alerts: string[] = [];
  let alertCount = 0;
  globalThis.fetch = (async (_url, init) => { alertCount++; alerts = JSON.parse(String(init?.body)).alerts; return new Response(); }) as typeof fetch;
  try {
    await expect(handleReorg({ db: prisma, rpc: fakeRpc(chain), config: limited })).rejects.toThrow("REORG_BEYOND_WINDOW");
    expect(alerts).toEqual(["REORG_BEYOND_WINDOW"]);
    await expect(handleReorg({ db: prisma, rpc: fakeRpc(chain), config: limited })).rejects.toThrow("REORG_BEYOND_WINDOW");
    expect(alertCount).toBe(1);
  } finally { globalThis.fetch = originalFetch; }
  expect((await prisma.projectionCheckpoint.findUniqueOrThrow({ where: { chainId_contractAddress: where } })).lastScannedBlock).toBe(103n);
  expect((await prisma.chainEvent.findFirstOrThrow({ where: { ...where, txHash: "0xdeep" } })).canonical).toBe(true);
});

});
