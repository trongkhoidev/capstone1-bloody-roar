import { errorMessage } from "./log";
import { health } from "./runtime/health";
import type { Job } from "./runtime/scheduler";

export const LAG_ALERT_SECONDS = 300;
export const RPC_ERROR_ALERT_STREAK = 5;

export function evaluateAlerts(input: { lagSeconds: number | null; rpcErrorStreak: number }): string[] {
  const alerts: string[] = [];
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
export const alertsJob: Job = {
  name: "alerts",
  everyMs: 30_000,
  async run({ config, log, now }) {
    const behind = health.lastSafeBlock !== null && health.lastScannedBlock !== null && health.lastSafeBlock > health.lastScannedBlock;
    const lagSeconds = behind && health.cursorMovedAt !== null ? (now().getTime() - health.cursorMovedAt) / 1000 : null;
    const alerts = evaluateAlerts({ lagSeconds, rpcErrorStreak: health.rpcErrorStreak });
    if (alerts.length === 0) return;
    for (const alert of alerts) log.warn({ alert }, "worker alert");
    await sendAlerts(alerts, config.alertWebhookUrl).catch((err: unknown) =>
      log.error({ err: errorMessage(err) }, "alert webhook failed"),
    );
  },
};
