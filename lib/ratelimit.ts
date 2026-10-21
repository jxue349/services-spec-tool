import { requestUser } from './request-context';
/**
 * Dead-simple in-memory sliding-window limiter.
 *
 * Purpose is cost containment, not security: it stops a stuck client (retry
 * loop, double-mounted effect) from burning Glean API quota. It is per-process,
 * so it does not survive a restart and does not coordinate across replicas.
 * If this ever fronts untrusted traffic, put a real limiter at the edge.
 */

const WINDOW_MS = 60_000;
const DEFAULT_LIMIT = 20;
const MAX_TRACKED_KEYS = 5_000;

const hits = new Map<string, number[]>();

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

export function checkRateLimit(key: string, limit: number = DEFAULT_LIMIT, now: number = Date.now()): RateLimitResult {
  // Cheap guard against unbounded growth from spoofed forwarded-for values.
  if (hits.size > MAX_TRACKED_KEYS) hits.clear();

  const cutoff = now - WINDOW_MS;
  const recent = (hits.get(key) ?? []).filter((t) => t > cutoff);

  if (recent.length >= limit) {
    const oldest = recent[0] ?? now;
    hits.set(key, recent);
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000)) };
  }

  recent.push(now);
  hits.set(key, recent);
  return { ok: true };
}

/** Authenticated users share a key regardless of proxy headers or NAT address. */
export function clientKey(): string {
  const user = requestUser();
  return user ? `user:${user.sub}` : 'local-development';
}

/** Test-only reset. */
export function __resetRateLimit(): void {
  hits.clear();
}
