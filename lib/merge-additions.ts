import { extractRuleIds } from './client/rules';
import { ruleIdMatches } from './rule-id';
import type { ProposedAddition } from './schemas';

/**
 * Applies proposed additions to the parent spec.
 *
 * Deliberately deterministic string work rather than asking the model to
 * rewrite the parent: a model rewrite of the knowledge base could silently
 * reword or drop rules nobody asked it to touch, and the parent is the one
 * document in the system that must never change by accident.
 *
 * Only additions are ever applied. Contradictions are a product decision and
 * travel to the followers as discussion in the pull request body.
 */

export const MERGED_SECTION_PREFIX = '## Merged from';

export type MergeResult = {
  content: string;
  /** Rule ids actually written. */
  applied: string[];
  /** Rule ids skipped because the parent already defines them. */
  skipped: string[];
};

const ruleIdPattern = (ruleId: string): RegExp =>
  new RegExp(`(?<![A-Za-z0-9-])${ruleId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);

export function appendAdditions(
  parent: string,
  additions: readonly ProposedAddition[],
  childLabel: string,
  /**
   * Team codes, so a proposed `ENT-007` is recognised as already present when
   * the parent has since been migrated to `SVC-ENT-007`. Without this the
   * migration would quietly make every earlier merge re-appliable, and the
   * knowledge base would collect duplicate rules under two spellings.
   */
  teamCodes: readonly string[] = [],
): MergeResult {
  const applied: string[] = [];
  const skipped: string[] = [];
  const blocks: string[] = [];

  const parentIds = extractRuleIds(parent);

  for (const addition of additions) {
    const id = addition.ruleId.trim();
    const markdown = addition.markdown.trim();
    if (id === '' || markdown === '') continue;

    // Idempotent: re-requesting a change must not duplicate rules the parent
    // already absorbed from an earlier request — under either spelling.
    if (
      ruleIdPattern(id).test(parent) ||
      parentIds.some((existing) => ruleIdMatches(existing, id, teamCodes))
    ) {
      skipped.push(id);
      continue;
    }

    applied.push(id);
    blocks.push(markdown);
  }

  if (blocks.length === 0) return { content: parent, applied, skipped };

  const heading = `${MERGED_SECTION_PREFIX} ${childLabel}`;
  const body = blocks.join('\n');
  const trimmed = parent.replace(/\s+$/, '');

  // Extend the existing section for this child if there is one, so repeated
  // merges from the same spec stay in one place instead of stacking headings.
  const headingIndex = trimmed.indexOf(`\n${heading}\n`);
  if (headingIndex !== -1) {
    const sectionStart = headingIndex + heading.length + 2;
    const nextHeading = trimmed.indexOf('\n## ', sectionStart);
    const insertAt = nextHeading === -1 ? trimmed.length : nextHeading;
    const before = trimmed.slice(0, insertAt).replace(/\s+$/, '');
    const after = trimmed.slice(insertAt);
    return { content: `${before}\n${body}\n${after}\n`, applied, skipped };
  }

  return { content: `${trimmed}\n\n${heading}\n\n${body}\n`, applied, skipped };
}
