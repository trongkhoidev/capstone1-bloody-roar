import { checkpointKey, loadCheckpoint, type IndexerConfig } from "./checkpoint";
import { getBlockByNumber } from "../chain/rpc";
import type { ScanDeps } from "./scanner";

// Compares the hash stored at lastScannedBlock with the node's hash. On a mismatch, rewinds the
// cursor by reorgWindow blocks and marks events whose block hash changed as non-canonical.
// shortcut: a reorg deeper than INDEXER_REORG_WINDOW is not unwound. Upgrade: store one hash per
// block so the fork point can be found without a fixed window.
export async function handleReorg({ db, rpc, config }: ScanDeps): Promise<{ rewoundTo: bigint } | null> {
  const checkpoint = await loadCheckpoint(db, config);
  if (checkpoint.lastCanonicalBlockHash === "") return null;
  const current = await getBlockByNumber(rpc, checkpoint.lastScannedBlock);
  if (current?.hash === checkpoint.lastCanonicalBlockHash) return null;

  const floor = config.escrowDeployBlock - 1n;
  const target = maxBigInt(floor, checkpoint.lastScannedBlock - BigInt(config.reorgWindow));
  const candidates = await db.chainEvent.findMany({
    where: { chainId: config.chainId, contractAddress: config.escrowAddress, canonical: true, blockNumber: { gt: target } },
    select: { id: true, blockNumber: true, blockHash: true },
  });

  const staleIds: string[] = [];
  const hashByBlock = new Map<string, string | null>();
  for (const event of candidates) {
    const key = event.blockNumber.toString();
    if (!hashByBlock.has(key)) hashByBlock.set(key, (await getBlockByNumber(rpc, event.blockNumber))?.hash ?? null);
    if (hashByBlock.get(key) !== event.blockHash) staleIds.push(event.id);
  }

  const targetHash = (await getBlockByNumber(rpc, target))?.hash ?? "";
  await db.$transaction(async (tx) => {
    if (staleIds.length > 0) await tx.chainEvent.updateMany({ where: { id: { in: staleIds } }, data: { canonical: false } });
    await tx.projectionCheckpoint.update({
      where: checkpointKey(config),
      data: { lastScannedBlock: target, lastCanonicalBlockHash: targetHash },
    });
  });
  return { rewoundTo: target };
}

const maxBigInt = (a: bigint, b: bigint): bigint => (a > b ? a : b);
