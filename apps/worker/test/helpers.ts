import type { PrismaClient } from "@bloody-roar/database";
import { RpcRangeError, type RawLog, type RpcClient } from "../src/chain/rpc";
import type { IndexerConfig } from "../src/indexer/checkpoint";
import { scanOnce, type ScanDeps } from "../src/indexer/scanner";

export const hex = (n: bigint | number): string => `0x${BigInt(n).toString(16)}`;

// A fake node: block hashes by number, logs, the safe head, a receipt map, and the widest
// eth_getLogs span it accepts before it answers with a range error.
export type FakeChain = {
  blockHash: Map<bigint, string>;
  logs: RawLog[];
  safe: bigint;
  maxSpan: number;
  receipts: Map<string, { status: "0x0" | "0x1"; blockNumber: bigint }>;
};

export function newChain(): FakeChain {
  return { blockHash: new Map(), logs: [], safe: 0n, maxSpan: Number.MAX_SAFE_INTEGER, receipts: new Map() };
}

export function fakeRpc(chain: FakeChain): RpcClient {
  return {
    lastLatencyMs: 1,
    errorStreak: 0,
    async call<T>(method: string, params: unknown[]): Promise<T> {
      if (method === "eth_getBlockByNumber") {
        const [tag] = params as [string];
        const number = tag === "safe" ? chain.safe : BigInt(tag);
        const hash = chain.blockHash.get(number);
        return (hash ? { number: hex(number), hash } : null) as T;
      }
      if (method === "eth_getLogs") {
        const [{ fromBlock, toBlock }] = params as [{ fromBlock: string; toBlock: string }];
        const from = BigInt(fromBlock);
        const to = BigInt(toBlock);
        if (Number(to - from) + 1 > chain.maxSpan) throw new RpcRangeError("block range too large");
        return chain.logs.filter((log) => BigInt(log.blockNumber) >= from && BigInt(log.blockNumber) <= to) as T;
      }
      if (method === "eth_getTransactionReceipt") {
        const [txHash] = params as [string];
        const receipt = chain.receipts.get(txHash);
        return (receipt ? { status: receipt.status, blockNumber: hex(receipt.blockNumber), transactionHash: txHash } : null) as T;
      }
      throw new Error(`fake rpc: unexpected ${method}`);
    },
  };
}

export function rawLog(o: { address: string; block: number; blockHash: string; tx: string; txIndex?: number; logIndex?: number }): RawLog {
  return {
    address: o.address,
    topics: ["0x" + "11".repeat(32)],
    data: "0x",
    blockNumber: hex(o.block),
    blockHash: o.blockHash,
    transactionHash: o.tx,
    transactionIndex: hex(o.txIndex ?? 0),
    logIndex: hex(o.logIndex ?? 0),
  };
}

// Each test gets its own chain id and escrow address, so shared DB rows never collide.
let counter = 0;
export function testConfig(overrides: Partial<IndexerConfig> = {}): IndexerConfig {
  counter++;
  const suffix = Date.now() % 100_000_000;
  return {
    chainId: 600_000_000 + suffix * 10 + counter,
    escrowAddress: `0x${(suffix * 1000 + counter).toString(16).padStart(40, "0")}`,
    escrowDeployBlock: 100n,
    rangeSize: 2000,
    reorgWindow: 64,
    ...overrides,
  };
}

// Scans until the cursor reaches the safe head, whatever range size the scanner picked.
export async function scanToHead(deps: ScanDeps): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (!(await scanOnce(deps))) return;
  }
  throw new Error("scan did not reach the head");
}

export async function cleanupChain(db: PrismaClient, config: IndexerConfig): Promise<void> {
  const where = { chainId: config.chainId, contractAddress: config.escrowAddress };
  await db.chainEvent.deleteMany({ where });
  await db.projectionCheckpoint.deleteMany({ where });
}
