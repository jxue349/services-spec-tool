/**
 * The gap log: questions the knowledge base could not answer.
 *
 * Lives outside the route because a Next.js route module may only export
 * route handlers and segment config — anything else is a type error — and
 * because the dedupe logic is worth testing on its own.
 */

export const GAP_LABEL = 'kb-gap';

/** One line, so the same question collides on title and joins its issue. */
export function gapTitle(question: string): string {
  const flat = question.replace(/\s+/g, ' ').trim();
  const clipped = flat.length > 120 ? `${flat.slice(0, 117)}…` : flat;
  return `KB gap: ${clipped}`;
}

/**
 * Recently filed gaps, by title.
 *
 * GitHub's issue list is eventually consistent: an issue created a moment ago
 * is not reliably returned by the next list call, so two identical flags a few
 * seconds apart both look new and both get filed. Observed against a real
 * repo, not theorised. This closes the window for the case that actually
 * happens — the same question flagged twice in quick succession.
 *
 * Per-process and short-lived, like the rate limiter: a best-effort guard, not
 * distributed coordination. The API check remains the real dedupe.
 */
const RECENT_TTL_MS = 10 * 60_000;

const recentGaps = new Map<string, { url: string; number: number; at: number }>();

/**
 * The single notion of "same question", used by both dedupe paths.
 *
 * The memo and the API check must agree: if one is case-sensitive and the
 * other is not, the same question dedupes or duplicates depending purely on
 * which path happens to catch it.
 */
export function gapKey(title: string): string {
  return title.trim().toLowerCase();
}

export function recallRecentGap(title: string, now: number = Date.now()): { url: string; number: number } | null {
  const key = gapKey(title);
  const hit = recentGaps.get(key);
  if (hit === undefined) return null;
  if (now - hit.at > RECENT_TTL_MS) {
    recentGaps.delete(key);
    return null;
  }
  return { url: hit.url, number: hit.number };
}

export function rememberGap(title: string, issue: { url: string; number: number }, now: number = Date.now()): void {
  recentGaps.set(gapKey(title), { ...issue, at: now });
}

/** Test-only reset. */
export function __resetRecentGaps(): void {
  recentGaps.clear();
}
