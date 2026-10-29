import { type PrismaClient } from "@bloody-roar/database";
import { getBlockByNumber, getLogs, getSafeBlock, hexToNumber, RpcRangeError, type RawLog, type RpcClient } from "../chain/client";
import { checkpointKey, DECODER_VERSION, loadCheckpoint, type IndexerConfig } from "./checkpoint";
import { projectLog } from "./project";

export type ScanDeps = { db: PrismaClient; rpc: RpcClient; config: IndexerConfig };
export type ScanResult = { from: bigint; to: bigint; events: number };

// Block span of the next eth_getLogs. Halved when the RPC refuses a range, grown back
// after successful calls. Module state, so it lasts for the life of the worker process.
let rangeWindow: number | null = null;

export async function scanOnce({ db, rpc, config }: ScanDeps): Promise<ScanResult | null> {
  const checkpoint = await loadCheckpoint(db, config);
  const safe = await getSafeBlock(rpc, config.finality);
  if (!safe) return null;
  if (safe.number <= checkpoint.lastScannedBlock) {
    await db.projectionCheckpoint.update({ where: checkpointKey(config), data: { lastSafeBlock: safe.number } });
    return null;
  }

  const from = checkpoint.lastScannedBlock + 1n;
  let size = Math.min(rangeWindow ?? config.rangeSize, config.rangeSize);
  let to = minBigInt(safe.number, from + BigInt(size) - 1n);
  let logs: RawLog[];
  for (;;) {
    try {
      logs = await getLogs(rpc, { address: config.escrowAddress, fromBlock: from, toBlock: to });
      break;
    } catch (err) {
      const span = Number(to - from) + 1;
      if (!(err instanceof RpcRangeError) || span <= 1) throw err;
      size = Math.max(1, Math.floor(span / 2));
      rangeWindow = size;
      to = from + BigInt(size) - 1n;
    }
  }
  rangeWindow = Math.min(config.rangeSize, size * 2); // grow back toward the configured size

  // The stored hash is the hash of `to`; handleReorg compares it at lastScannedBlock.
  const toBlock = await getBlockByNumber(rpc, to);
  if (!toBlock) return null;

  const ordered = [...logs].sort((a, b) => {
    const block = BigInt(a.blockNumber) - BigInt(b.blockNumber);
    return block < 0n ? -1 : block > 0n ? 1 : hexToNumber(a.transactionIndex) - hexToNumber(b.transactionIndex) || hexToNumber(a.logIndex) - hexToNumber(b.logIndex);
  });
  const blocks = new Map<string, { hash: string; timestamp: bigint }>();
  for (const log of ordered) {
    const n = BigInt(log.blockNumber);
    if (n < from || n > to || log.address.toLowerCase() !== config.escrowAddress.toLowerCase()) throw new Error("RPC returned a log outside the requested range or contract");
    let block = blocks.get(log.blockNumber);
    if (!block) {
      const response = await rpc.call<{ hash: string; timestamp: string } | null>("eth_getBlockByNumber", [log.blockNumber, false]);
      if (!response?.timestamp) throw new Error(`RPC returned an invalid block for ${n}`);
      block = { hash: response.hash, timestamp: BigInt(response.timestamp) };
      blocks.set(log.blockNumber, block);
    }
    if (block.hash.toLowerCase() !== log.blockHash.toLowerCase()) throw new Error(`RPC returned an invalid block for ${n}`);
  }
  await db.$transaction(async (tx) => {
    for (const log of ordered) await projectLog(tx, config, log, blocks.get(log.blockNumber)!.timestamp);
    await tx.projectionCheckpoint.update({
      where: checkpointKey(config),
      data: { lastScannedBlock: to, lastSafeBlock: safe.number, lastCanonicalBlockHash: toBlock.hash, decoderVersion: DECODER_VERSION },
    });
  }, { timeout: 30_000 });

  return { from, to, events: logs.length };
}

const minBigInt = (a: bigint, b: bigint): bigint => (a < b ? a : b);
