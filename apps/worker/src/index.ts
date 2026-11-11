// Worker entrypoint: one instance per database (advisory lock), health on WORKER_PORT, jobs on a scheduler.
import { prisma } from "@bloody-roar/database";
import { createRpcClient } from "./chain/rpc";
import { loadConfig } from "./config";
import { createLogger, errorMessage } from "./log";
import { jobs } from "./jobs";
import { tryAcquireWorkerLock } from "./runtime/lock";
import { createHealthServer, health } from "./runtime/health";
import { registerJob, startScheduler } from "./runtime/scheduler";

const log = createLogger();

async function main(): Promise<void> {
  const config = loadConfig();
  const lock = await tryAcquireWorkerLock(config.lockUrl);
  if (!lock) {
    log.info({}, "another worker holds the lock; exiting");
    await prisma.$disconnect();
    return;
  }

  for (const job of jobs) registerJob(job);
  const rpc = createRpcClient({ url: config.rpcUrl });
  const server = createHealthServer(config.port, () => ({ ...health, lockHeld: lock.isHeld() }));
  const scheduler = startScheduler({ db: prisma, rpc, config, log, now: () => new Date() });
  log.info({ port: config.port, chainId: config.chainId, escrowAddress: config.escrowAddress }, "worker started");

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    log.info({ signal }, "shutting down");
    await scheduler.stop();
    await server.close();
    await lock.release();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err: unknown) => {
  log.error({ err: errorMessage(err) }, "worker failed to start");
  process.exit(1);
});
