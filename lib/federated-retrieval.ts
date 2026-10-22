import { CONTEXT_BUDGET, parseRuleBlocks, rankBlocks } from './spec-retrieval';
import type { ScoredBlock } from './spec-retrieval';

/**
 * Retrieval across every team's knowledge base.
 *
 * The point is coherence: a question like "what does the plugin page show for
 * a Cam Plus user?" spans hardware, app experience and services, and the
 * interesting answer is often that two teams disagree. That only surfaces if
 * both teams' rules reach the model.
 *
 * Which is why the budget is split per team rather than pooled. Services has
 * 172 rules and Hardware has three; one ranked pool would let Services fill
 * the context and the contradicting hardware rule would never be seen. Each
 * team gets a guaranteed share, and unused share is redistributed to teams
 * that can use it.
 */

export type TeamSpec = {
  slug: string;
  name: string;
  code: string;
  content: string;
  /**
   * The team's verification register, when it keeps one.
   *
   * Needed to report a rule's real status: in the folder layout a rule
   * carries `refs: V-25` and the register says whether V-25 is still open,
   * so status is a join between two documents.
   */
  register?: string;
};

export type FederatedBlock = ScoredBlock & {
  teamSlug: string;
  teamName: string;
  teamCode: string;
};

export type FederatedContext = {
  blocks: FederatedBlock[];
  /** Per-team counts, so the UI can show what each contributed. */
  perTeam: { slug: string; name: string; rulesConsidered: number; rulesSent: number }[];
  chars: number;
};

/** Floor so a small knowledge base is never squeezed out entirely. */
export const MIN_TEAM_SHARE = 2_000;

export function retrieveAcrossTeams(
  specs: readonly TeamSpec[],
  question: string,
  budget: number = CONTEXT_BUDGET,
): FederatedContext {
  // Every team's code, so a question quoting `ENT-007` reaches `SVC-ENT-007`
  // wherever it lives, and never reaches another team's `HW-ENT-007`.
  const codes = specs.map((spec) => spec.code);

  const withMatches = specs.map((spec) => {
    const blocks = parseRuleBlocks(spec.content);
    return { spec, considered: blocks.length, ranked: rankBlocks(blocks, question, codes) };
  });

  const contributing = withMatches.filter((t) => t.ranked.length > 0);
  if (contributing.length === 0) {
    return {
      blocks: [],
      perTeam: withMatches.map((t) => ({
        slug: t.spec.slug,
        name: t.spec.name,
        rulesConsidered: t.considered,
        rulesSent: 0,
      })),
      chars: 0,
    };
  }

  // First pass: an equal share each, floored so a three-rule knowledge base
  // still gets in. Second pass hands leftovers to whoever had more to say.
  const share = Math.max(MIN_TEAM_SHARE, Math.floor(budget / contributing.length));

  const taken = new Map<string, FederatedBlock[]>();
  const used = new Map<string, number>();

  const take = (entry: (typeof contributing)[number], limit: number): void => {
    const chosen = taken.get(entry.spec.slug) ?? [];
    let spent = used.get(entry.spec.slug) ?? 0;

    for (const block of entry.ranked) {
      if (chosen.some((b) => b.line === block.line)) continue;
      if (spent + block.text.length > limit) break;
      chosen.push({
        ...block,
        teamSlug: entry.spec.slug,
        teamName: entry.spec.name,
        teamCode: entry.spec.code,
      });
      spent += block.text.length;
    }

    taken.set(entry.spec.slug, chosen);
    used.set(entry.spec.slug, spent);
  };

  for (const entry of contributing) take(entry, share);

  let spent = [...used.values()].reduce((a, b) => a + b, 0);
  let leftover = budget - spent;
  if (leftover > 0) {
    // Redistribute in rank order so the strongest matches get the slack.
    for (const entry of [...contributing].sort((a, b) => (b.ranked[0]?.score ?? 0) - (a.ranked[0]?.score ?? 0))) {
      const current = used.get(entry.spec.slug) ?? 0;
      take(entry, current + leftover);
      const after = used.get(entry.spec.slug) ?? 0;
      leftover -= after - current;
      if (leftover <= 0) break;
    }
    spent = [...used.values()].reduce((a, b) => a + b, 0);
  }

  const blocks = [...taken.values()].flat().sort((a, b) => b.score - a.score);

  return {
    blocks,
    perTeam: withMatches.map((t) => ({
      slug: t.spec.slug,
      name: t.spec.name,
      rulesConsidered: t.considered,
      rulesSent: (taken.get(t.spec.slug) ?? []).length,
    })),
    chars: spent,
  };
}

/**
 * Renders the federated context grouped by team.
 *
 * Grouped, and each rule prefixed with its team code, because the model has
 * to be able to say "Services says X, Hardware says Y" — an undifferentiated
 * pile of rules cannot produce that sentence.
 */
export function renderFederatedContext(context: FederatedContext): string {
  const byTeam = new Map<string, FederatedBlock[]>();
  for (const block of context.blocks) {
    const list = byTeam.get(block.teamSlug) ?? [];
    list.push(block);
    byTeam.set(block.teamSlug, list);
  }

  const parts: string[] = [];
  for (const [, blocks] of byTeam) {
    const first = blocks[0];
    if (first === undefined) continue;

    parts.push(`### Team: ${first.teamName} (${first.teamCode})`);
    for (const block of [...blocks].sort((a, b) => a.line - b.line)) {
      parts.push(block.section === '' ? block.text : `${block.text}   <!-- ${block.section} -->`);
    }
    parts.push('');
  }

  return parts.join('\n').trim();
}
