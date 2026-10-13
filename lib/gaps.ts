import { createHash } from 'node:crypto';

/**
 * The gap log: questions the knowledge base could not answer.
 *
 * Lives outside the route because a Next.js route module may only export
 * route handlers and segment config — anything else is a type error — and
 * because the dedupe logic is worth testing on its own.
 */

export const GAP_LABEL = 'kb-gap';

/** Default title when the user does not write one. */
export function gapTitle(question: string): string {
  const flat = question.replace(/\s+/g, ' ').trim();
  const clipped = flat.length > 120 ? `${flat.slice(0, 117)}…` : flat;
  return `KB gap: ${clipped}`;
}

/**
 * The identity of a gap: the question, not the title.
 *
 * Titles are user-editable, so keying dedupe on them would let the same
 * question be filed twice simply because two people worded the heading
 * differently. The question is what makes two reports the same report.
 */
export function gapKey(question: string): string {
  const normalised = question.replace(/\s+/g, ' ').trim().toLowerCase();
  return createHash('sha256').update(normalised).digest('hex').slice(0, 16);
}

/**
 * Marker embedded in the issue body so a gap stays findable however its title
 * is edited — by this app or by a human afterwards.
 */
export function gapMarker(question: string): string {
  return `<!-- kb-gap-key: ${gapKey(question)} -->`;
}

/** Finds our marker in an existing issue body. */
export function markerIn(body: string | null | undefined): string | null {
  const hit = /<!--\s*kb-gap-key:\s*([0-9a-f]{16})\s*-->/.exec(body ?? '');
  return hit?.[1] ?? null;
}

/**
 * Recently filed gaps, by key.
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

export function recallRecentGap(question: string, now: number = Date.now()): { url: string; number: number } | null {
  const key = gapKey(question);
  const hit = recentGaps.get(key);
  if (hit === undefined) return null;
  if (now - hit.at > RECENT_TTL_MS) {
    recentGaps.delete(key);
    return null;
  }
  return { url: hit.url, number: hit.number };
}

export function rememberGap(
  question: string,
  issue: { url: string; number: number },
  now: number = Date.now(),
): void {
  recentGaps.set(gapKey(question), { ...issue, at: now });
}

/** Test-only reset. */
export function __resetRecentGaps(): void {
  recentGaps.clear();
}
