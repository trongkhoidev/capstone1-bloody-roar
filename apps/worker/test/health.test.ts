import { expect, test } from "bun:test";
import { healthSnapshot, RPC_ERROR_LIMIT, type HealthState } from "../src/runtime/health";

const base: HealthState = {
  startedAt: 0,
  lockHeld: true,
  lastSafeBlock: 130n,
  lastScannedBlock: 120n,
  cursorMovedAt: 0,
  rpcLatencyMs: 42,
  rpcErrorStreak: 0,
};

test("healthy worker reports the fields the plan asks for", () => {
  const snapshot = healthSnapshot(base, 10_000);
  expect(snapshot).toEqual({
    ok: true,
    lockHeld: true,
    lastSafeBlock: "130",
    projectionLagBlocks: 10,
    cursorAgeSeconds: 10,
    rpcLatencyMs: 42,
    rpcErrorStreak: 0,
    uptimeSeconds: 10,
  });
});

test("not ok without the lock or after too many RPC errors", () => {
  expect(healthSnapshot({ ...base, lockHeld: false }, 0).ok).toBe(false);
  expect(healthSnapshot({ ...base, rpcErrorStreak: RPC_ERROR_LIMIT - 1 }, 0).ok).toBe(true);
  expect(healthSnapshot({ ...base, rpcErrorStreak: RPC_ERROR_LIMIT }, 0).ok).toBe(false);
});

test("nothing scanned yet means null lag, not zero", () => {
  expect(healthSnapshot({ ...base, lastSafeBlock: null, lastScannedBlock: null }, 0).projectionLagBlocks).toBeNull();
});
