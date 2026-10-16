import { extractRuleIds } from './client/rules';
import { withTeamPrefix } from './rule-id';

/**
 * Rewrites a knowledge base's rule IDs to carry their owning team.
 *
 * `ENT-007` becomes `SVC-ENT-007`, so an ID pasted into a ticket says who
 * owns the rule. Deterministic string work, never a model rewrite: this
 * touches every rule in a 74 KB production document at once, and a model
 * that reworded one rule in passing would be nearly impossible to spot in
 * the diff.
 *
 * Two things make it safe to run over real content:
 *
 * - Only IDs the document *defines* are renamed. The Source column is full of
 *   Jira keys shaped exactly like rule IDs (`BCS-137`, `CAMPLUSN-946`), and
 *   they are never in definition position, so they are never in the set.
 * - URLs are masked first. A defined ID appearing inside a link target would
 *   otherwise be rewritten and the link would break.
 *
 * Cross-references inside rule text are rewritten too, so a rule that says
 * "see ENT-007" still points somewhere after the migration.
 */

export type RuleIdRename = { from: string; to: string };

export type MigrationResult = {
  content: string;
  /** Renames applied, in document order. */
  renamed: RuleIdRename[];
  /** Defined IDs deliberately left alone — already prefixed, or self-describing. */
  unchanged: string[];
};

/** Private-use sentinels: cannot occur in a markdown spec, cannot look like an ID. */
const MASK_OPEN = '';
const MASK_CLOSE = '';

/** Matches a URL up to whitespace or a closing paren. */
const URL = /https?:\/\/[^\s)<>"']+/g;

function maskUrls(text: string): { masked: string; urls: string[] } {
  const urls: string[] = [];
  const masked = text.replace(URL, (match) => {
    urls.push(match);
    return `${MASK_OPEN}${urls.length - 1}${MASK_CLOSE}`;
  });
  return { masked, urls };
}

function unmaskUrls(text: string, urls: readonly string[]): string {
  return text.replace(new RegExp(`${MASK_OPEN}(\\d+)${MASK_CLOSE}`, 'g'), (_whole, index: string) => {
    const url = urls[Number(index)];
    return url ?? '';
  });
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function migrateRuleIds(
  content: string,
  teamCode: string,
  /** Every team's code, so another team's prefix is recognised and left alone. */
  teamCodes: readonly string[] = [],
): MigrationResult {
  const defined = extractRuleIds(content);

  const renamed: RuleIdRename[] = [];
  const unchanged: string[] = [];

  for (const from of defined) {
    const to = withTeamPrefix(from, teamCode, teamCodes);
    if (to === from) unchanged.push(from);
    else renamed.push({ from, to });
  }

  if (renamed.length === 0) return { content, renamed, unchanged };

  const { masked, urls } = maskUrls(content);

  // Boundary guards make every match a whole token, which also means an
  // already-rewritten `SVC-ENT-007` cannot be matched again by `ENT-007`:
  // the character before it is a hyphen.
  const rewritten = renamed.reduce(
    (text, { from, to }) =>
      text.replace(new RegExp(`(?<![A-Za-z0-9-])${escapeRegExp(from)}(?![A-Za-z0-9-])`, 'g'), to),
    masked,
  );

  return { content: unmaskUrls(rewritten, urls), renamed, unchanged };
}
