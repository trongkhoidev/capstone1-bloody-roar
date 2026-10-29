import { checkpointKey, loadCheckpoint, lockCheckpoint, type IndexerConfig } from "./checkpoint";
import { getBlockByNumber } from "../chain/client";
import type { ScanDeps } from "./scanner";
import { rebuildEscrowProjection } from "./rebuild";
import { undoDeposit, undoWork, type DepositUndo, type WorkUndo } from "./undo";

// Compares the hash stored at lastScannedBlock with the node's hash. On a mismatch, rewinds the
// cursor by reorgWindow blocks and marks events whose block hash changed as non-canonical.
// shortcut: a reorg deeper than INDEXER_REORG_WINDOW is not unwound. Upgrade: store one hash per
// block so the fork point can be found without a fixed window.
export async function handleReorg({ db, rpc, config }: ScanDeps): Promise<{ rewoundTo: bigint } | null> {
  const checkpoint = await loadCheckpoint(db, config);
  if (checkpoint.lastCanonicalBlockHash === "") return null;
  const current = await getBlockByNumber(rpc, checkpoint.lastScannedBlock);
  if (!current) throw new Error(`RPC returned no block for ${checkpoint.lastScannedBlock}`);
  if (current.hash === checkpoint.lastCanonicalBlockHash) return null;

  const floor = config.escrowDeployBlock - 1n;
  const target = maxBigInt(floor, checkpoint.lastScannedBlock - BigInt(config.reorgWindow));
  const candidates = await db.chainEvent.findMany({
    where: { chainId: config.chainId, contractAddress: config.escrowAddress, canonical: true, blockNumber: { gt: target } },
    select: { id: true, blockNumber: true, blockHash: true, txIndex: true, logIndex: true, eventName: true, escrowIdHash: true, args: true },
  });

  const staleIds: string[] = [];
  const hashByBlock = new Map<string, string | null>();
  for (const event of candidates) {
    const key = event.blockNumber.toString();
    if (!hashByBlock.has(key)) {
      const block = await getBlockByNumber(rpc, event.blockNumber);
      if (!block) throw new Error(`RPC returned no block for ${event.blockNumber}`);
      hashByBlock.set(key, block.hash);
    }
    if (hashByBlock.get(key) !== event.blockHash) staleIds.push(event.id);
  }

  let targetHash = "";
  if (target >= 0n) {
    const targetBlock = await getBlockByNumber(rpc, target);
    if (!targetBlock) throw new Error(`RPC returned no block for ${target}`);
    targetHash = targetBlock.hash;
  }
  await db.$transaction(async (tx) => {
    await lockCheckpoint(tx, config, checkpoint);
    const staleSet = new Set(staleIds);
    const stale = candidates.filter((event) => staleSet.has(event.id));
    if (stale.length > 0) await tx.chainEvent.updateMany({ where: { id: { in: staleIds } }, data: { canonical: false } });
    const reversible = stale.filter((event) => (event.eventName === "Deposited" || event.eventName === "WorkSubmitted") && event.escrowIdHash)
      .sort((a, b) => a.blockNumber === b.blockNumber ? b.txIndex - a.txIndex || b.logIndex - a.logIndex : a.blockNumber > b.blockNumber ? -1 : 1);
    for (const event of reversible) {
      if (event.eventName === "WorkSubmitted") {
        const args = event.args as unknown as { undo?: WorkUndo };
        if (args.undo) await undoWork(tx, event.id, args.undo);
        else if ((await tx.escrowProjection.findUnique({ where: { escrowIdHash: event.escrowIdHash! } }))?.issueId)
          throw new Error("Cannot safely undo work submission without its recorded snapshot");
      } else {
        const args = event.args as unknown as { undo?: DepositUndo };
        if (args.undo) await undoDeposit(tx, event.id, args.undo);
        else if (await tx.fundingReservation.findUnique({ where: { escrowIdHash: event.escrowIdHash! } }))
          throw new Error("Cannot safely undo deposit without its recorded snapshot");
      }
    }
    for (const hash of new Set(stale.map((event) => event.escrowIdHash).filter((hash): hash is string => hash !== null))) {
      await rebuildEscrowProjection(tx, config, hash);
    }
    await tx.projectionCheckpoint.update({
      where: checkpointKey(config),
      data: { lastScannedBlock: target, lastCanonicalBlockHash: targetHash },
    });
  }, { timeout: 30_000 });
  return { rewoundTo: target };
}

const maxBigInt = (a: bigint, b: bigint): bigint => (a > b ? a : b);
