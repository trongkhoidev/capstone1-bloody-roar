// apps/web/src/lib/rate-limit.ts
// In-memory fixed-window limiter. shortcut: per process only, so multiple instances each keep their own counts; move to a shared store before scaling out.

import { NextResponse } from "next/server";

type Bucket = { count: number; resetAt: number };

const SWEEP_AT = 10_000;
const buckets = new Map<string, Bucket>();

export function rateLimit(
  key: string,
  opts: { limit: number; windowMs: number },
): { ok: boolean; retryAfterMs: number } {
  const now = Date.now();
  if (buckets.size > SWEEP_AT) {
    for (const [k, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(k);
  }

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
    return { ok: true, retryAfterMs: 0 };
  }
  if (bucket.count < opts.limit) {
    bucket.count += 1;
    return { ok: true, retryAfterMs: 0 };
  }
  return { ok: false, retryAfterMs: bucket.resetAt - now };
}

// The rightmost X-Forwarded-For entry is the one the proxy appended; the leftmost is client-supplied.
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  return forwarded || req.headers.get("x-real-ip") || "unknown";
}

export function tooManyRequests(retryAfterMs: number) {
  return NextResponse.json(
    { error: "Too many requests" },
    {
      status: 429,
      headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)), "Cache-Control": "no-store" },
    },
  );
}
