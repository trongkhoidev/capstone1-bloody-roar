import { expect, test } from "bun:test";
import { createLogger } from "../src/log";
import { startScheduler, type Job, type JobContext } from "../src/runtime/scheduler";

const ctx = { log: createLogger(() => undefined) } as unknown as JobContext;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("runs a job right away and then on its interval", async () => {
  let runs = 0;
  const job: Job = { name: "count", everyMs: 5, run: async () => void runs++ };
  const scheduler = startScheduler(ctx, [job]);
  await sleep(60);
  await scheduler.stop();
  expect(runs).toBeGreaterThanOrEqual(3);
});

test("never overlaps a job with itself", async () => {
  let running = 0;
  let maxRunning = 0;
  const job: Job = {
    name: "slow",
    everyMs: 1,
    run: async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await sleep(15);
      running--;
    },
  };
  const scheduler = startScheduler(ctx, [job]);
  await sleep(70);
  await scheduler.stop();
  expect(maxRunning).toBe(1);
});

test("keeps running after a failure", async () => {
  let attempts = 0;
  const job: Job = {
    name: "flaky",
    everyMs: 5,
    run: async () => {
      attempts++;
      if (attempts <= 2) throw new Error("boom");
    },
  };
  const scheduler = startScheduler(ctx, [job]);
  await sleep(60);
  await scheduler.stop();
  expect(attempts).toBeGreaterThanOrEqual(3);
});

test("stop waits for the run in flight and schedules nothing after", async () => {
  let finished = false;
  let runs = 0;
  const job: Job = {
    name: "in-flight",
    everyMs: 1,
    run: async () => {
      runs++;
      await sleep(30);
      finished = true;
    },
  };
  const scheduler = startScheduler(ctx, [job]);
  await sleep(5);
  await scheduler.stop();
  expect(finished).toBe(true);
  const runsAtStop = runs;
  await sleep(40);
  expect(runs).toBe(runsAtStop);
});
