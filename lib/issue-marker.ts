import { createHash } from 'node:crypto';

/**
 * Hidden identity markers in GitHub issue bodies.
 *
 * Dedupe cannot key on the title: titles are user-editable, so two people
 * wording the same report differently would file it twice. A marker in the
 * body survives any amount of later editing and renders as nothing.
 *
 * Shared by the gap log and cross-team conflict reports, which need the same
 * mechanism over different identities.
 */

/** A stable short hash of whatever identifies the report. */
export function markerKey(...parts: readonly string[]): string {
  const normalised = parts.map((part) => part.replace(/\s+/g, ' ').trim().toLowerCase()).join('\u0000');
  return createHash('sha256').update(normalised).digest('hex').slice(0, 16);
}

/** The HTML comment to embed. Invisible when GitHub renders the body. */
export function marker(name: string, key: string): string {
  return `<!-- ${name}: ${key} -->`;
}

/** Reads a marker of this name back out of an issue body. */
export function markerIn(body: string | null | undefined, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const hit = new RegExp(`<!--\\s*${escaped}:\\s*([0-9a-f]{16})\\s*-->`).exec(body ?? '');
  return hit?.[1] ?? null;
}

/**
 * A short-lived memo of reports filed by this process.
 *
 * GitHub's issue list is eventually consistent: an issue created a moment ago
 * is not reliably returned by the next list call, so two identical reports a
 * few seconds apart both look new and both get filed. Observed against a real
 * repo, not theorised.
 *
 * Per-process and short-lived, like the rate limiter: a best-effort guard,
 * not distributed coordination. The API check remains the real dedupe.
 */
export function createRecentMemo(ttlMs = 10 * 60_000) {
  const entries = new Map<string, { url: string; number: number; at: number }>();

  return {
    recall(key: string, now: number = Date.now()): { url: string; number: number } | null {
      const hit = entries.get(key);
      if (hit === undefined) return null;
      if (now - hit.at > ttlMs) {
        entries.delete(key);
        return null;
      }
      return { url: hit.url, number: hit.number };
    },
    remember(key: string, issue: { url: string; number: number }, now: number = Date.now()): void {
      entries.set(key, { ...issue, at: now });
    },
    reset(): void {
      entries.clear();
    },
  };
}
