import type { PrismaClient } from "@bloody-roar/database";
import type { RpcClient } from "../chain/rpc";
import type { WorkerConfig } from "../config";
import { errorMessage, type Logger } from "../log";

export type JobContext = {
  db: PrismaClient;
  rpc: RpcClient;
  config: WorkerConfig;
  log: Logger;
  now: () => Date;
};

export type Job = { name: string; everyMs: number; run: (ctx: JobContext) => Promise<void> };

const registry: Job[] = [];

export function registerJob(job: Job): void {
  if (registry.some((existing) => existing.name === job.name)) throw new Error(`job already registered: ${job.name}`);
  registry.push(job);
}

// Each job has its own timer chain, so a job never overlaps itself. A failed run is logged
// and the next run is still scheduled.
export function startScheduler(ctx: JobContext, jobs: Job[] = registry): { stop(): Promise<void> } {
  let stopped = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const inflight = new Set<Promise<void>>();

  const schedule = (job: Job, delayMs: number) => {
    if (stopped) return;
    const timer = setTimeout(() => {
      timers.delete(timer);
      const run = job
        .run(ctx)
        .catch((err: unknown) => ctx.log.error({ job: job.name, err: errorMessage(err) }, "job failed"))
        .finally(() => {
          inflight.delete(run);
          schedule(job, job.everyMs);
        });
      inflight.add(run);
    }, delayMs);
    timers.add(timer);
  };

  for (const job of jobs) schedule(job, 0);

  return {
    async stop() {
      stopped = true;
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      await Promise.allSettled([...inflight]);
    },
  };
}
