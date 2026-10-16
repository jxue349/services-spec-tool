/**
 * The rule-ID grammar, in one place.
 *
 * This pattern used to live in both `spec-retrieval` and `client/rules`. Two
 * copies were survivable while the grammar was fixed; they are not now that
 * it has a team prefix, because a question that reaches retrieval but not the
 * rule chip is a bug nobody would think to look for.
 *
 * Shapes that must match:
 *
 *   R-101            bare series
 *   TIER-001         domain series, the common form in real specs
 *   CAMPLUS-R-101    child-spec namespace
 *   SVC-ENT-007      team-prefixed — the convention this module adds
 *   HW-PLUGINPAGE-001  team + child spec
 *
 * Client-safe: no server imports, so the browser and the API share one
 * definition rather than two that drift.
 */

/** One segment: an uppercase token that can start an ID. */
const SEGMENT = String.raw`[A-Z][A-Z0-9]{0,15}`;

/**
 * An optional leading team segment, then the ID as specs already write it.
 *
 * The prefix is optional because the migration is gradual and external
 * citations are not: a Jira ticket that says `ENT-007` has to keep resolving
 * after the knowledge base starts writing `SVC-ENT-007`.
 */
export const RULE_ID_CORE = String.raw`(?:${SEGMENT}-)?${SEGMENT}-(?:R-)?\d{1,4}`;

/** Guards against matching inside a longer ID: `R-101` must not hit `CAMPLUS-R-101`. */
export const NOT_ID_CHAR_BEFORE = String.raw`(?<![A-Za-z0-9-])`;
export const NOT_ID_CHAR_AFTER = String.raw`(?![A-Za-z0-9-])`;

const EXACT = new RegExp(`^${RULE_ID_CORE}$`);

export function isRuleId(value: string): boolean {
  return EXACT.test(value.trim().toUpperCase());
}

/**
 * Splits an ID into its team prefix and the rest.
 *
 * `team` is only reported when the leading segment is one of `teamCodes` —
 * the grammar alone cannot tell `SVC-ENT-007` (team + domain) from
 * `CAMPLUS-R-101` (child namespace), and guessing would turn every child
 * spec's rules into rules of a team that does not exist.
 */
export function splitRuleId(
  id: string,
  teamCodes: readonly string[] = [],
): { team: string | null; bare: string } {
  const trimmed = id.trim().toUpperCase();
  const codes = new Set(teamCodes.map((c) => c.toUpperCase()));

  const head = trimmed.indexOf('-');
  if (head <= 0) return { team: null, bare: trimmed };

  const candidate = trimmed.slice(0, head);
  const rest = trimmed.slice(head + 1);

  // The remainder has to be a valid id in its own right, or this was never a
  // prefix — `TIER-001` must not split into team `TIER` and bare `001`.
  if (codes.has(candidate) && EXACT.test(rest)) return { team: candidate, bare: rest };
  return { team: null, bare: trimmed };
}

/** The ID without its team prefix, for comparing across the migration. */
export function bareRuleId(id: string, teamCodes: readonly string[] = []): string {
  return splitRuleId(id, teamCodes).bare;
}

/**
 * Adds a team prefix, unless the ID already carries one.
 *
 * Idempotent on purpose: the migration can be re-run over a partly migrated
 * document without producing `SVC-SVC-ENT-007`.
 */
export function withTeamPrefix(id: string, teamCode: string, teamCodes: readonly string[] = []): string {
  const code = teamCode.trim().toUpperCase();
  if (code === '') return id.trim().toUpperCase();

  const trimmed = id.trim().toUpperCase();
  const known = teamCodes.length > 0 ? teamCodes : [code];

  // Already prefixed by this team, or by another one — leave it alone. A rule
  // that moved teams is a decision for a human, not a regex.
  if (splitRuleId(trimmed, known).team !== null) return trimmed;

  // An id whose own first segment is the team code (`HW-001` for team HW) is
  // already self-describing; prefixing it would give `HW-HW-001`.
  if (trimmed.startsWith(`${code}-`)) return trimmed;

  return `${code}-${trimmed}`;
}

/**
 * Whether two IDs refer to the same rule, tolerating a missing team prefix.
 *
 * `ENT-007` asked of `SVC-ENT-007` is a match: the question came from a Jira
 * ticket written before the migration, and refusing it would make every
 * existing citation dead.
 */
export function ruleIdMatches(a: string, b: string, teamCodes: readonly string[] = []): boolean {
  const left = splitRuleId(a, teamCodes);
  const right = splitRuleId(b, teamCodes);

  if (left.bare !== right.bare) return false;

  // Two ids that each name a team must name the SAME team. `SVC-ENT-007` and
  // `HW-ENT-007` are different rules — that collision is the entire reason
  // the prefix exists, so matching them would undo the migration's purpose.
  if (left.team !== null && right.team !== null) return left.team === right.team;

  // One side is unprefixed: a citation from before the migration, which is
  // allowed to resolve to whichever team now owns the rule.
  return true;
}

/**
 * Where a rule is *defined*, as opposed to merely mentioned.
 *
 * This distinction is load-bearing. A spec's Source column is full of Jira
 * keys — `BCS-137`, `BUG-60257` — shaped exactly like rule IDs, so matching
 * anywhere would list tickets as rules. A definition is the first cell of a
 * table row, the head of a list item, or a heading.
 */
export function definitionForms(idPattern: string): string {
  const nb = NOT_ID_CHAR_BEFORE;
  return [
    // | TIER-001 | ...        (markdown table, the common form in real specs)
    `^[ \\t]*\\|[ \\t]*(?:\\*\\*|__)?${nb}${idPattern}(?:\\*\\*|__)?[ \\t]*\\|`,
    // - **R-101** — ...       (bullet list)
    `^[ \\t]*(?:[-*+][ \\t]+)?(?:\\*\\*|__)?${nb}${idPattern}(?:\\*\\*|__)?${NOT_ID_CHAR_AFTER}`,
    // ### R-101 ...
    `^#{1,6}[ \\t]+(?:\\*\\*|__)?${nb}${idPattern}`,
  ].join('|');
}
