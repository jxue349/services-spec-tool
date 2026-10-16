import { createRecentMemo, marker, markerIn, markerKey } from './issue-marker';

/**
 * The gap log: questions the knowledge base could not answer.
 *
 * Lives outside the route because a Next.js route module may only export
 * route handlers and segment config — anything else is a type error — and
 * because the dedupe logic is worth testing on its own.
 */

export const GAP_LABEL = 'kb-gap';
export const GAP_MARKER_NAME = 'kb-gap-key';

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
  return markerKey(question);
}

/**
 * Marker embedded in the issue body so a gap stays findable however its title
 * is edited — by this app or by a human afterwards.
 */
export function gapMarker(question: string): string {
  return marker(GAP_MARKER_NAME, gapKey(question));
}

/** Finds our marker in an existing issue body. */
export function gapMarkerIn(body: string | null | undefined): string | null {
  return markerIn(body, GAP_MARKER_NAME);
}

const recent = createRecentMemo();

export function recallRecentGap(question: string, now: number = Date.now()): { url: string; number: number } | null {
  return recent.recall(gapKey(question), now);
}

export function rememberGap(
  question: string,
  issue: { url: string; number: number },
  now: number = Date.now(),
): void {
  recent.remember(gapKey(question), issue, now);
}

/** Test-only reset. */
export function __resetRecentGaps(): void {
  recent.reset();
}
