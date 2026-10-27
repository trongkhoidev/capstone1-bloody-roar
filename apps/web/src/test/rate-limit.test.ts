import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rateLimit } from "../lib/rate-limit";

describe("rateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-27T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects after the limit and reports the time left in the window", () => {
    const opts = { limit: 2, windowMs: 60_000 };
    expect(rateLimit("ip:a", opts).ok).toBe(true);
    expect(rateLimit("ip:a", opts).ok).toBe(true);
    expect(rateLimit("ip:a", opts)).toEqual({ ok: false, retryAfterMs: 60_000 });

    vi.advanceTimersByTime(20_000);
    expect(rateLimit("ip:a", opts)).toEqual({ ok: false, retryAfterMs: 40_000 });
  });

  it("allows again once the window has passed", () => {
    const opts = { limit: 1, windowMs: 1_000 };
    rateLimit("ip:b", opts);
    expect(rateLimit("ip:b", opts).ok).toBe(false);

    vi.advanceTimersByTime(1_000);
    expect(rateLimit("ip:b", opts).ok).toBe(true);
  });

  it("counts each key separately", () => {
    const opts = { limit: 1, windowMs: 1_000 };
    rateLimit("ip:c", opts);
    expect(rateLimit("ip:d", opts).ok).toBe(true);
  });
});
