import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@bloody-roar/database";
import { getBlockByNumber, getLogs, getSafeBlock, hexToNumber, RpcRangeError, type RawLog, type RpcClient } from "../chain/rpc";
import { checkpointKey, DECODER_VERSION, loadCheckpoint, type IndexerConfig } from "./checkpoint";

export type ScanDeps = { db: PrismaClient; rpc: RpcClient; config: IndexerConfig };
export type ScanResult = { from: bigint; to: bigint; events: number };

// Block span of the next eth_getLogs. Halved when the RPC refuses a range, grown back
// after successful calls. Module state, so it lasts for the life of the worker process.
let rangeWindow: number | null = null;

export async function scanOnce({ db, rpc, config }: ScanDeps): Promise<ScanResult | null> {
  const checkpoint = await loadCheckpoint(db, config);
  const safe = await getSafeBlock(rpc);
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

  await db.$transaction(async (tx) => {
    if (logs.length > 0) await insertChainEvents(tx, config, logs);
    // shortcut: no decode or fold yet (A2 not merged), so no projection row changes here.
    // Upgrade: decode each log with A2's decodeEscrowLog, fold, then applyFoldEffects in this transaction.
    await tx.projectionCheckpoint.update({
      where: checkpointKey(config),
      data: { lastScannedBlock: to, lastSafeBlock: safe.number, lastCanonicalBlockHash: toBlock.hash },
    });
  });

  return { from, to, events: logs.length };
}

// ON CONFLICT DO NOTHING would lose a log that moved to a new block after a reorg,
// so a stale copy (other block hash, or marked non-canonical) is updated to the new block.
async function insertChainEvents(tx: Prisma.TransactionClient, config: IndexerConfig, logs: RawLog[]): Promise<void> {
  const rows = logs.map(
    (log) => Prisma.sql`(
      ${randomUUID()}, ${config.chainId}, ${config.escrowAddress}, ${log.transactionHash}, ${hexToNumber(log.logIndex)},
      ${BigInt(log.blockNumber)}, ${log.blockHash}, ${hexToNumber(log.transactionIndex)}, ${log.topics[0] ?? ""},
      ${JSON.stringify({ topics: log.topics, data: log.data })}::jsonb, ${DECODER_VERSION}, true
    )`,
  );
  await tx.$executeRaw`
    INSERT INTO chain_events (id, "chainId", "contractAddress", "txHash", "logIndex", "blockNumber", "blockHash", "txIndex", "eventName", args, "decoderVersion", canonical)
    VALUES ${Prisma.join(rows)}
    ON CONFLICT ("chainId", "contractAddress", "txHash", "logIndex") DO UPDATE SET
      "blockNumber" = EXCLUDED."blockNumber", "blockHash" = EXCLUDED."blockHash", "txIndex" = EXCLUDED."txIndex", canonical = true
    WHERE chain_events."blockHash" <> EXCLUDED."blockHash" OR chain_events.canonical = false`;
}

const minBigInt = (a: bigint, b: bigint): bigint => (a < b ? a : b);
