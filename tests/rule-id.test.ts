import { describe, expect, it } from 'vitest';
import { bareRuleId, isRuleId, ruleIdMatches, splitRuleId, withTeamPrefix } from '@/lib/rule-id';
import { extractRuleIds, findRuleRange } from '@/lib/client/rules';
import { parseRuleBlocks, rankBlocks } from '@/lib/spec-retrieval';

const CODES = ['SVC', 'HW', 'APPEX', 'PLAT', 'MISC'];

describe('isRuleId', () => {
  it('accepts every shape real specs use', () => {
    for (const id of ['R-101', 'TIER-001', 'ADDON-014', 'CAMPLUS-R-101', 'SVC-ENT-007', 'HW-PLUGINPAGE-001']) {
      expect(isRuleId(id), id).toBe(true);
    }
  });

  it('rejects things that are not rule ids', () => {
    for (const id of ['', 'ENT', '007', 'ent-007 extra', 'A-B-C-001']) {
      expect(isRuleId(id), id).toBe(false);
    }
  });
});

describe('splitRuleId', () => {
  it('splits a known team prefix off', () => {
    expect(splitRuleId('SVC-ENT-007', CODES)).toEqual({ team: 'SVC', bare: 'ENT-007' });
  });

  it('does not invent a team from a domain segment', () => {
    // TIER is a domain, not a team. Splitting here would turn every rule in
    // the knowledge base into a rule of a team that does not exist.
    expect(splitRuleId('TIER-001', CODES)).toEqual({ team: null, bare: 'TIER-001' });
    expect(splitRuleId('ADDON-014', CODES)).toEqual({ team: null, bare: 'ADDON-014' });
  });

  it('leaves a child-spec namespace alone', () => {
    expect(splitRuleId('CAMPLUS-R-101', CODES)).toEqual({ team: null, bare: 'CAMPLUS-R-101' });
  });

  it('needs the remainder to be a valid id in its own right', () => {
    expect(splitRuleId('SVC-007', CODES)).toEqual({ team: null, bare: 'SVC-007' });
  });
});

describe('withTeamPrefix', () => {
  it('prefixes a bare domain id', () => {
    expect(withTeamPrefix('ENT-007', 'SVC', CODES)).toBe('SVC-ENT-007');
  });

  it('is idempotent', () => {
    // The migration has to be safely re-runnable over a half-migrated file.
    expect(withTeamPrefix('SVC-ENT-007', 'SVC', CODES)).toBe('SVC-ENT-007');
    expect(withTeamPrefix(withTeamPrefix('ENT-007', 'SVC', CODES), 'SVC', CODES)).toBe('SVC-ENT-007');
  });

  it('leaves an id that already opens with the team code', () => {
    // HW-001 is already self-describing; HW-HW-001 would be absurd.
    expect(withTeamPrefix('HW-001', 'HW', CODES)).toBe('HW-001');
    expect(withTeamPrefix('HW-PLUGINPAGE-001', 'HW', CODES)).toBe('HW-PLUGINPAGE-001');
  });

  it('never re-homes a rule that another team already owns', () => {
    expect(withTeamPrefix('SVC-ENT-007', 'HW', CODES)).toBe('SVC-ENT-007');
  });
});

describe('ruleIdMatches', () => {
  it('matches across the migration in both directions', () => {
    expect(ruleIdMatches('ENT-007', 'SVC-ENT-007', CODES)).toBe(true);
    expect(ruleIdMatches('SVC-ENT-007', 'ENT-007', CODES)).toBe(true);
  });

  it('does not match two different rules', () => {
    expect(ruleIdMatches('ENT-007', 'ENT-008', CODES)).toBe(false);
    expect(ruleIdMatches('SVC-ENT-007', 'HW-ENT-007', CODES)).toBe(false);
  });
});

describe('bareRuleId', () => {
  it('is the identity for an unprefixed id', () => {
    expect(bareRuleId('TIER-001', CODES)).toBe('TIER-001');
  });
});

// ---------------------------------------------------------------------------

const PREFIXED_SPEC = [
  '# Services',
  '',
  '| Rule | Statement | Status | Source |',
  '| --- | --- | --- | --- |',
  '| SVC-ENT-007 | An unbound add-on stays an active entitlement. | ✅ Confirmed | [BCS-137](https://x/BCS-137) |',
  '| SVC-TIER-001 | T1 = Cam Plus. | ✅ Confirmed | [CAMPLUSN-946](https://x) |',
].join('\n');

const LEGACY_SPEC = [
  '# Services',
  '',
  '| Rule | Statement | Status |',
  '| --- | --- | --- |',
  '| ENT-007 | An unbound add-on stays an active entitlement. | ✅ Confirmed |',
].join('\n');

describe('extractRuleIds with team prefixes', () => {
  it('reads team-prefixed ids as rules', () => {
    expect(extractRuleIds(PREFIXED_SPEC)).toEqual(['SVC-ENT-007', 'SVC-TIER-001']);
  });

  it('still refuses to treat Jira keys as rules', () => {
    // The Source column is full of ticket keys shaped exactly like rule ids.
    const ids = extractRuleIds(PREFIXED_SPEC);
    expect(ids).not.toContain('BCS-137');
    expect(ids).not.toContain('CAMPLUSN-946');
  });
});

describe('findRuleRange across the migration', () => {
  it('finds a prefixed rule when asked by its bare id', () => {
    // A Jira ticket written before the migration says ENT-007.
    const range = findRuleRange(PREFIXED_SPEC, 'ENT-007', CODES);
    expect(range).not.toBeNull();
    expect(PREFIXED_SPEC.slice(range!.start, range!.end)).toContain('SVC-ENT-007');
  });

  it('finds a bare rule when asked by its prefixed id', () => {
    const range = findRuleRange(LEGACY_SPEC, 'SVC-ENT-007', CODES);
    expect(range).not.toBeNull();
    expect(LEGACY_SPEC.slice(range!.start, range!.end)).toContain('ENT-007');
  });

  it('selects only the row it was asked for', () => {
    const range = findRuleRange(PREFIXED_SPEC, 'SVC-ENT-007', CODES);
    expect(PREFIXED_SPEC.slice(range!.start, range!.end)).not.toContain('SVC-TIER-001');
  });

  it('still never lets a bare series id land on a namespaced one', () => {
    // The guarantee the old exact-match code gave for free, and the reason
    // the team prefix is an explicit list rather than "any leading segment":
    // R-101 matching CAMPLUS-R-101 would send a parent citation into a child.
    const spec = '# Child\n\n- **CAMPLUS-R-101** — child rule.\n';
    expect(findRuleRange(spec, 'R-101', CODES)).toBeNull();
  });

  it('returns null for a rule that is nowhere', () => {
    expect(findRuleRange(PREFIXED_SPEC, 'SVC-ENT-999', CODES)).toBeNull();
  });

  it('never resolves one team’s rule to another team’s same-numbered rule', () => {
    // Two teams both numbering a rule ENT-007 is precisely the collision the
    // prefix exists to prevent; widening across teams here would reintroduce it.
    const hwSpec = '# HW\n\n| Rule | Statement |\n| --- | --- |\n| HW-ENT-007 | Different rule entirely. |\n';
    expect(findRuleRange(hwSpec, 'SVC-ENT-007', CODES)).toBeNull();
  });
});

describe('rankBlocks across the migration', () => {
  it('ranks a prefixed rule first when asked by its bare id', () => {
    const blocks = parseRuleBlocks(PREFIXED_SPEC);
    const ranked = rankBlocks(blocks, 'what does ENT-007 say?', CODES);
    expect(ranked[0]?.id).toBe('SVC-ENT-007');
    // The id match is decisive, not merely helpful.
    expect(ranked[0]?.score).toBeGreaterThan(900);
  });

  it('ranks by the prefixed id too', () => {
    const ranked = rankBlocks(parseRuleBlocks(PREFIXED_SPEC), 'SVC-TIER-001', CODES);
    expect(ranked[0]?.id).toBe('SVC-TIER-001');
  });

  it('parses a team-prefixed table row as a rule', () => {
    expect(parseRuleBlocks(PREFIXED_SPEC).map((b) => b.id)).toEqual(['SVC-ENT-007', 'SVC-TIER-001']);
  });
});
