import { handleReorg } from "../indexer/reorg";
import { scanOnce } from "../indexer/scanner";
import { loadCheckpoint } from "../indexer/checkpoint";
import { health } from "../runtime/health";
import type { Job, JobContext } from "../runtime/scheduler";

async function indexerTick(ctx: JobContext): Promise<void> {
  const { db, rpc, config, log, now } = ctx;
  const reorg = await handleReorg({ db, rpc, config });
  if (reorg) log.warn({ rewoundTo: reorg.rewoundTo }, "reorg detected; cursor rewound");
  await scanOnce({ db, rpc, config });

  const checkpoint = await loadCheckpoint(db, config);
  if (health.lastScannedBlock !== checkpoint.lastScannedBlock) health.cursorMovedAt = now().getTime();
  health.lastScannedBlock = checkpoint.lastScannedBlock;
  health.lastSafeBlock = checkpoint.lastSafeBlock;
}

export const indexerJob: Job = {
  name: "indexer",
  everyMs: 4_000, // QĐ-11: poll every 4 seconds
  async run(ctx) {
    try {
      await indexerTick(ctx);
    } finally {
      health.rpcLatencyMs = ctx.rpc.lastLatencyMs;
      health.rpcErrorStreak = ctx.rpc.errorStreak;
    }
  },
};
