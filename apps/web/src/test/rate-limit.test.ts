import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clientIp, rateLimit, tooManyRequests } from "../lib/rate-limit";

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

  it("charges each call its cost against the limit", () => {
    const opts = { limit: 10, windowMs: 60_000 };
    expect(rateLimit("gql:cost", { ...opts, cost: 5 }).ok).toBe(true);
    expect(rateLimit("gql:cost", { ...opts, cost: 5 }).ok).toBe(true);
    expect(rateLimit("gql:cost", { ...opts, cost: 1 }).ok).toBe(false);
  });

  it("counts each key separately", () => {
    const opts = { limit: 1, windowMs: 1_000 };
    rateLimit("ip:c", opts);
    expect(rateLimit("ip:d", opts).ok).toBe(true);
  });
});

describe("tooManyRequests and clientIp", () => {
  it("answers 429 with Retry-After in whole seconds", () => {
    const response = tooManyRequests(2_500);
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("3");
  });

  it("takes the rightmost X-Forwarded-For entry, which the proxy appended", () => {
    const req = new Request("http://localhost/api", { headers: { "x-forwarded-for": "6.6.6.6, 10.0.0.1" } });
    expect(clientIp(req)).toBe("10.0.0.1");
  });
});
