import type { SystemRateLimit } from "./systems";

type WindowUnit = "minute" | "hour";

interface CounterBucket {
  count: number;
  resetAt: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  limit?: number;
  unit?: WindowUnit;
  remaining?: number;
  resetAt?: number;
}

const counters = new Map<string, CounterBucket>();

export function checkRateLimit(
  key: string,
  config: SystemRateLimit | undefined,
  now = Date.now(),
): RateLimitDecision {
  if (!config?.enabled) return { allowed: true };

  const minute = checkWindow(`${key}:minute`, config.perMinute, 60_000, now);
  if (!minute.allowed) return { ...minute, unit: "minute" };

  const hour = checkWindow(`${key}:hour`, config.perHour, 3_600_000, now);
  if (!hour.allowed) return { ...hour, unit: "hour" };

  return {
    allowed: true,
    remaining: Math.min(
      minute.remaining ?? Number.POSITIVE_INFINITY,
      hour.remaining ?? Number.POSITIVE_INFINITY,
    ),
  };
}

export function clearRateLimitCounters() {
  counters.clear();
}

function checkWindow(
  key: string,
  limit: number | undefined,
  windowMs: number,
  now: number,
): RateLimitDecision {
  if (!limit) return { allowed: true };

  const existing = counters.get(key);
  const bucket =
    existing && existing.resetAt > now
      ? existing
      : { count: 0, resetAt: now + windowMs };

  if (bucket.count >= limit) {
    counters.set(key, bucket);
    return {
      allowed: false,
      limit,
      remaining: 0,
      resetAt: bucket.resetAt,
    };
  }

  bucket.count += 1;
  counters.set(key, bucket);
  return {
    allowed: true,
    limit,
    remaining: Math.max(limit - bucket.count, 0),
    resetAt: bucket.resetAt,
  };
}
