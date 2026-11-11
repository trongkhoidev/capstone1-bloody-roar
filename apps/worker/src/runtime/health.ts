import { createServer } from "node:http";

export type HealthState = {
  startedAt: number; // ms
  lockHeld: boolean;
  lastSafeBlock: bigint | null;
  lastScannedBlock: bigint | null;
  cursorMovedAt: number | null; // ms, when lastScannedBlock last increased
  rpcLatencyMs: number | null;
  rpcErrorStreak: number;
};

export const RPC_ERROR_LIMIT = 5;

export const health: HealthState = {
  startedAt: Date.now(),
  lockHeld: false,
  lastSafeBlock: null,
  lastScannedBlock: null,
  cursorMovedAt: null,
  rpcLatencyMs: null,
  rpcErrorStreak: 0,
};

export function healthSnapshot(state: HealthState, nowMs: number) {
  const { lastSafeBlock, lastScannedBlock } = state;
  return {
    ok: state.lockHeld && state.rpcErrorStreak < RPC_ERROR_LIMIT,
    lockHeld: state.lockHeld,
    lastSafeBlock: lastSafeBlock?.toString() ?? null,
    projectionLagBlocks: lastSafeBlock !== null && lastScannedBlock !== null ? Number(lastSafeBlock - lastScannedBlock) : null,
    cursorAgeSeconds: state.cursorMovedAt === null ? null : Math.round((nowMs - state.cursorMovedAt) / 1000),
    rpcLatencyMs: state.rpcLatencyMs,
    rpcErrorStreak: state.rpcErrorStreak,
    uptimeSeconds: Math.round((nowMs - state.startedAt) / 1000),
  };
}

// GET /health: 200 when healthy, 503 otherwise, so the platform restarts a stuck worker.
export function createHealthServer(port: number, getState: () => HealthState): { close(): Promise<void> } {
  const server = createServer((req, res) => {
    if (req.url !== "/health") return void res.writeHead(404).end();
    const snapshot = healthSnapshot(getState(), Date.now());
    res.writeHead(snapshot.ok ? 200 : 503, { "content-type": "application/json" });
    res.end(JSON.stringify(snapshot));
  });
  server.listen(port);
  return { close: () => new Promise((resolve) => server.close(() => resolve())) };
}
