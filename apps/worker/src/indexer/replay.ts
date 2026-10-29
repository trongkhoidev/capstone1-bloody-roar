import type { PrismaClient } from "@bloody-roar/database";
import { checkpointKey, loadCheckpoint, lockCheckpoint, type IndexerConfig } from "./checkpoint";
import { rebuildEscrowProjection } from "./rebuild";

// Rebuild affected projections from canonical history before the scanner re-reads the range.
export async function requestReplay(db: PrismaClient, config: IndexerConfig, fromBlock: bigint): Promise<void> {
  if (fromBlock < config.escrowDeployBlock) {
    throw new Error(`fromBlock ${fromBlock} is before the escrow deploy block ${config.escrowDeployBlock}`);
  }
  await loadCheckpoint(db, config);
  await db.$transaction(async (tx) => {
    await lockCheckpoint(tx, config);
    const affected = await tx.chainEvent.findMany({
      where: { chainId: config.chainId, contractAddress: config.escrowAddress, canonical: true, blockNumber: { gte: fromBlock }, escrowIdHash: { not: null } },
      select: { escrowIdHash: true },
    });
    for (const hash of new Set(affected.map((event) => event.escrowIdHash).filter((hash): hash is string => hash !== null))) {
      await rebuildEscrowProjection(tx, config, hash);
    }
    await tx.projectionCheckpoint.update({
      where: checkpointKey(config),
      data: { lastScannedBlock: fromBlock - 1n, lastCanonicalBlockHash: "", replayStatus: "REPLAY_REQUESTED" },
    });
  }, { timeout: 30_000 });
}
