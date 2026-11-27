import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import pino from "pino";
import { prisma } from "@bloody-roar/database";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { keccakUtf8 } from "@bloody-roar/shared/escrow";
import { createRpcClient } from "../src/chain/client";
import { loadConfig } from "../src/config";
import { checkpointKey } from "../src/indexer/checkpoint";
import { handleReorg } from "../src/indexer/reorg";
import { indexerJob } from "../src/jobs/indexer";
import { fakeReorg, rpc, snapshotChain } from "../../../tests/e2e/harness/chain";
import { cleanupChain, testConfig } from "./helpers";

process.env.RPC_URL ||= "http://127.0.0.1:8546";
const rpcUrl = process.env.RPC_URL;
const chainUp = await rpc<string>("eth_chainId").then((id) => id === "0x7a69", () => false);
const window = 4;
const emitter = `0x33337f${keccakUtf8("OwnershipTransferred(address,address)").slice(2)}60006000a300`;
const alerts: unknown[] = [];
let hook: ReturnType<typeof Bun.serve>;
let initial: string;
const configs: ReturnType<typeof loadConfig>[] = [];

const head = async () => BigInt(await rpc<string>("eth_blockNumber"));
const blockHash = async (n: bigint) => (await rpc<{ hash: string }>("eth_getBlockByNumber", [`0x${n.toString(16)}`, false])).hash;
const mine = async (blocks: number) => { for (let i = 0; i < blocks; i++) await rpc("evm_mine"); };
const send = async (to: string, data: string) => {
  const [from] = await rpc<string[]>("eth_accounts");
  return rpc<string>("eth_sendTransaction", [{ from, to, data }]);
};

async function setup() {
  const escrowAddress = testConfig().escrowAddress;
  await rpc("hardhat_setCode", [escrowAddress, emitter]);
  const config = loadConfig({
    RPC_URL: rpcUrl,
    CHAIN_ID: "31337",
    ESCROW_ADDRESS: escrowAddress,
    ESCROW_DEPLOY_BLOCK: String(await head()),
    DATABASE_URL: process.env.TEST_DATABASE_URL,
    FINALITY: "latest",
    INDEXER_REORG_WINDOW: String(window),
    ALERT_WEBHOOK_URL: hook.url.href,
  });
  await mine(window * 2);
  configs.push(config);
  const ctx = { db: prisma, rpc: createRpcClient({ url: rpcUrl }), config, log: pino({ level: "silent" }), now: () => new Date() };
  const where = { chainId: config.chainId, contractAddress: config.escrowAddress };
  return { ctx, where, escrowAddress, checkpoint: () => prisma.projectionCheckpoint.findUniqueOrThrow({ where: checkpointKey(config) }) };
}

describe.skipIf(!process.env.TEST_DATABASE_URL || !chainUp)("hardhat reorg", () => {
  beforeAll(async () => {
    assertTestDatabase(process.env.TEST_DATABASE_URL);
    initial = await snapshotChain();
    hook = Bun.serve({ port: 0, fetch: async (req) => (alerts.push(await req.json()), new Response("ok")) });
  });

  afterAll(async () => {
    hook.stop(true);
    await fakeReorg(initial, 0);
    for (const config of configs) await cleanupChain(prisma, config);
    await prisma.$disconnect();
  });

  test("a short reorg rewinds by the window and re-projects to match the new chain", async () => {
    const { ctx, where, escrowAddress, checkpoint } = await setup();
    const depth = window / 2;
    const snapshot = await snapshotChain();
    const txOld = await send(escrowAddress, "0x01");
    await mine(depth - 1);
    await indexerJob.run(ctx);
    const scanned = (await checkpoint()).lastScannedBlock;
    expect((await prisma.chainEvent.findFirstOrThrow({ where: { ...where, txHash: txOld } })).canonical).toBe(true);

    await fakeReorg(snapshot, depth - 1);
    const txNew = await send(escrowAddress, "0x02");
    await mine(1);
    const target = scanned - BigInt(window);
    expect(await handleReorg(ctx)).toEqual({ rewoundTo: target });
    const rewound = await checkpoint();
    expect(rewound.lastScannedBlock).toBe(target);
    expect(rewound.lastCanonicalBlockHash).toBe(await blockHash(target));

    const tip = await head();
    for (let i = 0; i < window && (await checkpoint()).lastScannedBlock < tip; i++) await indexerJob.run(ctx);

    const nodeLogs = await rpc<{ transactionHash: string; blockHash: string }[]>("eth_getLogs", [{ address: escrowAddress, fromBlock: "0x0", toBlock: "latest" }]);
    const canonical = await prisma.chainEvent.findMany({ where: { ...where, canonical: true } });
    expect(canonical.map((e) => [e.txHash, e.blockHash])).toEqual(nodeLogs.map((l) => [l.transactionHash, l.blockHash]));
    expect(canonical.map((e) => e.txHash)).toEqual([txNew]);
    expect((await prisma.chainEvent.findFirstOrThrow({ where: { ...where, txHash: txOld } })).canonical).toBe(false);
    const cp = await checkpoint();
    expect(cp.lastScannedBlock).toBe(tip);
    expect(cp.lastCanonicalBlockHash).toBe(await blockHash(tip));
    expect(cp.reorgAlerted).toBe(false);
  });

  test("a reorg deeper than the window halts and alerts once", async () => {
    const { ctx, where, escrowAddress, checkpoint } = await setup();
    const snapshot = await snapshotChain();
    const txOld = await send(escrowAddress, "0x03");
    await mine(window + 2);
    await indexerJob.run(ctx);
    const before = await checkpoint();
    expect(before.lastScannedBlock).toBe(await head());
    const sent = alerts.length;

    await fakeReorg(snapshot, window * 2);
    await expect(indexerJob.run(ctx)).rejects.toThrow("REORG_BEYOND_WINDOW");
    await mine(1);
    await expect(indexerJob.run(ctx)).rejects.toThrow("REORG_BEYOND_WINDOW");

    expect(alerts.slice(sent)).toEqual([expect.objectContaining({ alerts: ["REORG_BEYOND_WINDOW"] })]);
    const after = await checkpoint();
    expect(after.lastScannedBlock).toBe(before.lastScannedBlock);
    expect(after.lastCanonicalBlockHash).toBe(before.lastCanonicalBlockHash);
    expect(after.reorgAlerted).toBe(true);
    expect((await prisma.chainEvent.findFirstOrThrow({ where: { ...where, txHash: txOld } })).canonical).toBe(true);
  });
});
