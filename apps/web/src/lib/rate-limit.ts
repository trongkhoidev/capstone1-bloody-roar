// apps/web/src/lib/rate-limit.ts
// In-memory fixed-window limiter. shortcut: per process only, so multiple instances each keep their own counts; move to a shared store before scaling out.

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
