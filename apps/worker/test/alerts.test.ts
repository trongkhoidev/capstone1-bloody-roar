import { expect, spyOn, test } from "bun:test";
import { alertsJob, evaluateAlerts, LAG_ALERT_SECONDS, RPC_ERROR_ALERT_STREAK, sendAlerts } from "../src/alerts";
import { health } from "../src/runtime/health";
import type { JobContext } from "../src/runtime/scheduler";

test.each(["count", "findMany", "updateMany"])("still sends independent alerts when testRun.%s fails", async (failure) => {
  const previous = { ...health }, posts: Array<{ alerts: string[] }> = [];
  const webhook = spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
    posts.push(JSON.parse(String(init?.body)));
    return new Response("ok");
  });
  try {
    Object.assign(health, { lastSafeBlock: 2n, lastScannedBlock: 1n, cursorMovedAt: 0, rpcErrorStreak: 5 });
    const db = { testRun: {
      count: async () => { if (failure === "count") throw new Error("pool exhausted"); return 1; },
      findMany: async () => { if (failure === "findMany") throw new Error("pool exhausted"); return [{ id: "queued-run", log: null }]; },
      updateMany: async () => { throw new Error("pool exhausted"); },
    } };
    const { alertsJob: freshJob } = await import(`../src/alerts.ts?db-failure=${failure}`);
    await freshJob.run({ db, config: { relayerPrivateKey: `0x${"22".repeat(32)}`, relayerMinGasWei: 100n, alertWebhookUrl: "https://hooks.example/alerts" }, now: () => new Date(600_000), rpc: { call: async () => "0x63" }, log: { warn() {}, error() {} } } as unknown as JobContext);
    expect(posts).toHaveLength(1);
    expect(posts[0]?.alerts).toEqual(["projection lag 600s is over 300s", "5 RPC errors in a row", "RELAYER_LOW_GAS", "DB_UNREACHABLE"]);
  } finally {
    webhook.mockRestore();
    Object.assign(health, previous);
  }
});

test("alerts below the relayer gas threshold, not at the threshold", () => {
  expect(evaluateAlerts({ lagSeconds: null, rpcErrorStreak: 0, relayerBalanceWei: 99n, relayerMinGasWei: 100n })).toEqual(["RELAYER_LOW_GAS"]);
  expect(evaluateAlerts({ lagSeconds: null, rpcErrorStreak: 0, relayerBalanceWei: 100n, relayerMinGasWei: 100n })).toEqual([]);
});

test("deduplicates low gas alerts until the relayer recovers", async () => {
  let balance = "0x63";
  const warnings: Array<{ alert: string }> = [];
  const ctx = { db: { testRun: { count: async () => 0, findMany: async () => [] } }, config: { relayerPrivateKey: `0x${"11".repeat(32)}`, relayerMinGasWei: 100n }, now: () => new Date(), rpc: { call: async () => balance }, log: { warn: (item: { alert: string }) => warnings.push(item), error() {} } };
  await alertsJob.run(ctx as never); await alertsJob.run(ctx as never);
  balance = "0x64"; await alertsJob.run(ctx as never);
  balance = "0x63"; await alertsJob.run(ctx as never);
  expect(warnings.filter((w) => w.alert === "RELAYER_LOW_GAS")).toHaveLength(2);
});

test("alerts when lag is over 5 minutes, not at exactly 5 minutes", () => {
  expect(evaluateAlerts({ lagSeconds: LAG_ALERT_SECONDS, rpcErrorStreak: 0 })).toEqual([]);
  expect(evaluateAlerts({ lagSeconds: LAG_ALERT_SECONDS + 1, rpcErrorStreak: 0 })).toHaveLength(1);
});

test("alerts on a run of RPC errors and ignores unknown lag", () => {
  expect(evaluateAlerts({ lagSeconds: null, rpcErrorStreak: RPC_ERROR_ALERT_STREAK - 1 })).toEqual([]);
  expect(evaluateAlerts({ lagSeconds: null, rpcErrorStreak: RPC_ERROR_ALERT_STREAK })).toEqual([
    `${RPC_ERROR_ALERT_STREAK} RPC errors in a row`,
  ]);
});

test("posts alerts to the webhook, and posts nothing without one", async () => {
  const calls: Array<{ url: string; body: unknown }> = [];
  const doFetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    return new Response("ok");
  }) as unknown as typeof fetch;

  await sendAlerts(["lag"], undefined, doFetch);
  expect(calls).toHaveLength(0);

  await sendAlerts(["lag"], "https://hooks.example/alerts", doFetch);
  expect(calls).toHaveLength(1);
  expect(calls[0]?.url).toBe("https://hooks.example/alerts");
  expect((calls[0]?.body as { alerts: string[] }).alerts).toEqual(["lag"]);
});
