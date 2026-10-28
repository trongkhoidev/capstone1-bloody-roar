import type { PrismaClient } from "@bloody-roar/database";
import { checkpointKey, loadCheckpoint, type IndexerConfig } from "./checkpoint";

// Moves the cursor back so the scanner re-reads from fromBlock. Stored ChainEvent rows are
// reused, not duplicated. Projection rebuild is marked by replayStatus and runs once A2 folds.
export async function requestReplay(db: PrismaClient, config: IndexerConfig, fromBlock: bigint): Promise<void> {
  if (fromBlock < config.escrowDeployBlock) {
    throw new Error(`fromBlock ${fromBlock} is before the escrow deploy block ${config.escrowDeployBlock}`);
  }
  await loadCheckpoint(db, config);
  await db.projectionCheckpoint.update({
    where: checkpointKey(config),
    data: { lastScannedBlock: fromBlock - 1n, lastCanonicalBlockHash: "", replayStatus: "REPLAY_REQUESTED" },
  });
}
