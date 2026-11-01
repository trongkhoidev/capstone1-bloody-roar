import { expect, test } from "bun:test";
import { evaluateAlerts, LAG_ALERT_SECONDS, RPC_ERROR_ALERT_STREAK, sendAlerts } from "../src/alerts";

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
