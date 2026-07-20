/**
 * Process-local fixed-window rate limiter.
 *
 * Scope is one serverless instance, the same trade the Jikan tier-1 cache
 * makes: no shared store, dies with the instance, zero I/O on the hot path.
 * That is the right shape for what this protects against — a scraper
 * hammering one warm instance — and honest about what it is not: a security
 * boundary. A distributed limiter (Upstash/WAF) can replace it behind the
 * same call if abuse ever outgrows this.
 *
 * Keys are LRU-capped so an attacker rotating keys (spoofed forwarded IPs)
 * exhausts the map, not the process memory.
 */

const MAX_KEYS = 5_000;

type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();

export type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterSeconds: number };

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const current = windows.get(key);

  if (!current || now >= current.resetAt) {
    // New window. Delete-then-set refreshes Map insertion order, making the
    // eviction below oldest-window-first.
    windows.delete(key);
    windows.set(key, { count: 1, resetAt: now + windowMs });
    if (windows.size > MAX_KEYS) {
      const oldest = windows.keys().next().value;
      if (oldest !== undefined) windows.delete(oldest);
    }
    return { ok: true, remaining: limit - 1 };
  }

  if (current.count >= limit) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  current.count += 1;
  return { ok: true, remaining: limit - current.count };
}

/** Test hook: the window map is module state, like jikan's cache. */
export function resetRateLimit() {
  windows.clear();
}
