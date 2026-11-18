import { errorMessage } from "./log";
import { health } from "./runtime/health";
import type { Job } from "./runtime/scheduler";
import { privateKeyToAccount, type Hex } from "@bloody-roar/shared";

export const LAG_ALERT_SECONDS = 300;
export const RPC_ERROR_ALERT_STREAK = 5;
const QUEUED_RUN_ALERT = "QUEUED_RUN_OVERDUE";

export function evaluateAlerts(input: { lagSeconds: number | null; rpcErrorStreak: number; relayerBalanceWei?: bigint; relayerMinGasWei?: bigint; reorgBeyondWindow?: boolean }): string[] {
  const alerts: string[] = [];
  if (input.reorgBeyondWindow) alerts.push("REORG_BEYOND_WINDOW");
  if (input.relayerBalanceWei !== undefined && input.relayerMinGasWei !== undefined && input.relayerBalanceWei < input.relayerMinGasWei) alerts.push("RELAYER_LOW_GAS");
  if (input.lagSeconds !== null && input.lagSeconds > LAG_ALERT_SECONDS) {
    alerts.push(`projection lag ${Math.round(input.lagSeconds)}s is over ${LAG_ALERT_SECONDS}s`);
  }
  if (input.rpcErrorStreak >= RPC_ERROR_ALERT_STREAK) {
    alerts.push(`${input.rpcErrorStreak} RPC errors in a row`);
  }
  return alerts;
}

export async function sendAlerts(alerts: string[], webhookUrl: string | undefined, doFetch: typeof fetch = fetch): Promise<void> {
  if (!webhookUrl || alerts.length === 0) return;
  await doFetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ service: "bloody-roar-worker", alerts, at: new Date().toISOString() }),
    signal: AbortSignal.timeout(5_000),
  });
}

// Lag is the time the cursor has stood still while the safe head is ahead of it.
let lowGasReported = false;
export const alertsJob: Job = {
  name: "alerts",
  everyMs: 30_000,
  async run({ db, config, log, now, rpc }) {
    const behind = health.lastSafeBlock !== null && health.lastScannedBlock !== null && health.lastSafeBlock > health.lastScannedBlock;
    const lagSeconds = behind && health.cursorMovedAt !== null ? (now().getTime() - health.cursorMovedAt) / 1000 : null;
    const alerts = evaluateAlerts({ lagSeconds, rpcErrorStreak: health.rpcErrorStreak });
    if (config.relayerPrivateKey) {
      const account = privateKeyToAccount(config.relayerPrivateKey as Hex);
      const balance = BigInt(await rpc.call<string>("eth_getBalance", [account.address, "latest"]));
      const low = balance < config.relayerMinGasWei;
      if (low && !lowGasReported) alerts.push("RELAYER_LOW_GAS");
      lowGasReported = low;
    }
    try {
      health.queuedTestRuns = await db.testRun.count({ where: { status: "QUEUED" } });
      const overdue = await db.testRun.findMany({
        where: { status: "QUEUED", createdAt: { lt: new Date(now().getTime() - 15 * 60_000) }, OR: [{ log: null }, { log: { not: { contains: QUEUED_RUN_ALERT } } }] },
        select: { id: true, log: true },
      });
      for (const run of overdue) {
        // shortcut: claiming before delivery prevents repeats after restart; use an outbox if delivery must be guaranteed.
        const claimed = await db.testRun.updateMany({ where: { id: run.id, status: "QUEUED", log: run.log }, data: { log: [run.log, QUEUED_RUN_ALERT].filter(Boolean).join("\n") } });
        if (claimed.count) alerts.push(`${QUEUED_RUN_ALERT} ${run.id}`);
      }
    } catch (err) {
      log.error({ err: errorMessage(err) }, "queued run check failed");
      alerts.push("DB_UNREACHABLE");
    }
    if (alerts.length === 0) return;
    for (const alert of alerts) log.warn({ alert }, "worker alert");
    await sendAlerts(alerts, config.alertWebhookUrl).catch((err: unknown) =>
      log.error({ err: errorMessage(err) }, "alert webhook failed"),
    );
  },
};
