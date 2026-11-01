import { type Prisma, type PrismaClient } from "@bloody-roar/database";
import { ESCROW_DECODER_VERSION } from "@bloody-roar/shared/escrow";
import type { WorkerConfig } from "../config";

export type IndexerConfig = Pick<WorkerConfig, "chainId" | "escrowAddress" | "escrowDeployBlock" | "rangeSize" | "reorgWindow" | "finality">;

// Version of the decoder used for newly indexed logs.
export const DECODER_VERSION = ESCROW_DECODER_VERSION;

export const checkpointKey = (config: IndexerConfig) => ({
  chainId_contractAddress: { chainId: config.chainId, contractAddress: config.escrowAddress },
});

export async function loadCheckpoint(db: PrismaClient | Prisma.TransactionClient, config: IndexerConfig) {
  return db.projectionCheckpoint.upsert({
    where: checkpointKey(config),
    create: {
      chainId: config.chainId,
      contractAddress: config.escrowAddress,
      lastScannedBlock: config.escrowDeployBlock - 1n,
      lastSafeBlock: config.escrowDeployBlock - 1n,
      lastCanonicalBlockHash: "",
      decoderVersion: DECODER_VERSION,
      replayStatus: "IDLE",
    },
    update: {},
  });
}


export async function lockCheckpoint(
  tx: Prisma.TransactionClient,
  config: IndexerConfig,
  expected?: { lastScannedBlock: bigint; lastCanonicalBlockHash: string; replayStatus: string },
) {
  await tx.$queryRaw`SELECT 1 FROM projection_checkpoints WHERE "chainId" = ${config.chainId} AND "contractAddress" = ${config.escrowAddress} FOR UPDATE`;
  const current = await tx.projectionCheckpoint.findUniqueOrThrow({ where: checkpointKey(config) });
  if (expected && (current.lastScannedBlock !== expected.lastScannedBlock || current.lastCanonicalBlockHash !== expected.lastCanonicalBlockHash || current.replayStatus !== expected.replayStatus)) {
    throw new Error("Indexer checkpoint changed during scan; retry");
  }
  return current;
}
