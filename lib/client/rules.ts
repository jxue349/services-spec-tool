/**
 * Locating rules inside the spec text so a rule chip can reveal the rule it
 * cites. Pure string work — no DOM — so it is trivially testable.
 */

import { RULE_ID_CORE, definitionForms, splitRuleId } from '../rule-id';

const RULE_DEFINITION = new RegExp(`(?:${definitionForms(`(${RULE_ID_CORE})`)})`, 'gm');

/**
 * Every distinct rule ID the spec *defines*, in document order.
 *
 * Mentions elsewhere — cross-references, Jira links in a Source column — are
 * deliberately excluded, so the list is the spec's actual rule inventory.
 */
export function extractRuleIds(spec: string): string[] {
  const seen = new Set<string>();
  for (const match of spec.matchAll(RULE_DEFINITION)) {
    // One capture group per alternative; exactly one is set per match.
    const id = match.slice(1).find((group) => typeof group === 'string');
    if (id !== undefined) seen.add(id);
  }
  return [...seen];
}

/**
 * Namespace prefix for a child spec, derived from its directory.
 * `spec/cam-plus/behavior.md` -> `CAMPLUS`, so its rules read `CAMPLUS-R-101`.
 */
export function namespaceFor(specPath: string, specRoot: string): string {
  const rootSegments = specRoot.split('/').filter((s) => s !== '');
  const segments = specPath.split('/').slice(rootSegments.length);
  const dir = segments.length > 1 ? segments[0] : segments[0]?.replace(/\.md$/i, '');
  return (dir ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16) || 'SPEC';
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export type RuleRange = { start: number; end: number; line: number };

/**
 * Finds where a rule is *defined*, preferring a line that opens with the ID
 * (`- **R-102** — ...`) over a passing citation elsewhere, and returns the span
 * through the end of that paragraph.
 */
export function findRuleRange(
  spec: string,
  ruleId: string,
  /**
   * Team codes, so `SVC-ENT-007` can be found in a document that still writes
   * `ENT-007` and the other way round.
   *
   * Explicit rather than "any leading segment": treating any segment as a
   * team prefix would make `R-101` land on `CAMPLUS-R-101`, so a parent's
   * citation would jump into a child spec.
   */
  teamCodes: readonly string[] = [],
): RuleRange | null {
  const asked = ruleId.trim();
  if (asked === '') return null;

  // A rule id must not match inside a longer id.
  const notIdChar = '(?<![A-Za-z0-9-])';

  // Exact first, then the same rule written with or without its team prefix.
  const { team, bare } = splitRuleId(asked, teamCodes);
  const candidates = [
    ...new Set([
      asked,
      // The pre-migration spelling, for a document not yet migrated.
      bare,
      // Only widen to other teams when the citation names no team itself.
      // `SVC-ENT-007` must never land on `HW-ENT-007`: those are two rules.
      ...(team === null ? teamCodes.map((code) => `${code.toUpperCase()}-${bare}`) : []),
    ]),
  ]
    .filter((candidate) => candidate !== '')
    .map(escapeRegExp);

  const match =
    candidates.reduce<RegExpExecArray | null>(
      (found, id) => found ?? new RegExp(definitionForms(id), 'mi').exec(spec),
      null,
    ) ??
    candidates.reduce<RegExpExecArray | null>(
      (found, id) => found ?? new RegExp(`${notIdChar}${id}(?![A-Za-z0-9-])`, 'i').exec(spec),
      null,
    );

  if (match === null) return null;

  const start = match.index;

  let end = endOfRuleBlock(spec, start);

  // Don't drag trailing whitespace into the selection — at the end of the file
  // that would highlight the blank tail of the editor.
  while (end > start && /\s/.test(spec[end - 1] ?? '')) end -= 1;

  return { start, end, line: countLines(spec, start) };
}

/** A line that begins a new block, so the previous rule has ended. */
function startsNewBlock(line: string): boolean {
  return (
    line.trim() === '' ||
    /^[ \t]*\|/.test(line) || // next table row — one rule per row, so stop here
    /^[ \t]*[-*+][ \t]+/.test(line) || // next list item — rules are usually a tight list
    /^[ \t]*\d+[.)][ \t]+/.test(line) || // next ordered item
    /^#{1,6}[ \t]/.test(line) // next heading
  );
}

/**
 * Where a rule's own text stops.
 *
 * Ending at the next blank line is not enough: specs normally write rules as a
 * tight bullet list, so the following rule would be swept into the selection
 * and a chip for R-302 would also highlight R-303. Continuation lines (the
 * indented wrap of a long rule) must still be included, so only a line that
 * opens a new block terminates the range.
 */
function endOfRuleBlock(spec: string, start: number): number {
  let cursor = spec.indexOf('\n', start);

  while (cursor !== -1) {
    const lineStart = cursor + 1;
    const nextBreak = spec.indexOf('\n', lineStart);
    const line = spec.slice(lineStart, nextBreak === -1 ? spec.length : nextBreak);

    if (startsNewBlock(line)) return cursor;
    if (nextBreak === -1) return spec.length;
    cursor = nextBreak;
  }

  return spec.length;
}

/** Zero-based line index of `offset`. */
export function countLines(text: string, offset: number): number {
  let lines = 0;
  for (let i = 0; i < offset && i < text.length; i += 1) {
    if (text[i] === '\n') lines += 1;
  }
  return lines;
}
