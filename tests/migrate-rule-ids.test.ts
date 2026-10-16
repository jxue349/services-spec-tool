import { describe, expect, it } from 'vitest';
import { migrateRuleIds } from '@/lib/migrate-rule-ids';
import { extractRuleIds } from '@/lib/client/rules';

const CODES = ['SVC', 'HW', 'APPEX', 'PLAT', 'MISC'];

const SPEC = [
  '# Service & Subscription Management — Rule-Based Knowledge Base',
  '',
  '## Entitlement',
  '',
  '| Rule | Statement | Status | Source |',
  '| --- | --- | --- | --- |',
  '| ENT-007 | An unbound add-on stays active. See TIER-001. | ✅ Confirmed | [BCS-137](https://wyze.atlassian.net/browse/BCS-137) |',
  '| TIER-001 | T1 = Cam Plus. | ✅ Confirmed | [CAMPLUSN-946](https://wyze.atlassian.net/browse/CAMPLUSN-946) |',
  '',
  '## Notes',
  '',
  'Operators should read ENT-007 together with TIER-001.',
].join('\n');

describe('migrateRuleIds', () => {
  it('prefixes every rule the document defines', () => {
    const result = migrateRuleIds(SPEC, 'SVC', CODES);
    expect(result.renamed).toEqual([
      { from: 'ENT-007', to: 'SVC-ENT-007' },
      { from: 'TIER-001', to: 'SVC-TIER-001' },
    ]);
    expect(extractRuleIds(result.content)).toEqual(['SVC-ENT-007', 'SVC-TIER-001']);
  });

  it('rewrites cross-references, not just definitions', () => {
    // A rule that says "see ENT-007" has to still point somewhere afterwards.
    const { content } = migrateRuleIds(SPEC, 'SVC', CODES);
    expect(content).toContain('See SVC-TIER-001.');
    expect(content).toContain('Operators should read SVC-ENT-007 together with SVC-TIER-001.');
  });

  it('never touches a Jira key', () => {
    // The Source column is full of keys shaped exactly like rule ids. Renaming
    // one would silently point the evidence trail at a ticket that is not there.
    const { content } = migrateRuleIds(SPEC, 'SVC', CODES);
    expect(content).toContain('[BCS-137]');
    expect(content).toContain('[CAMPLUSN-946]');
    expect(content).not.toContain('SVC-BCS-137');
    expect(content).not.toContain('SVC-CAMPLUSN-946');
  });

  it('leaves URLs intact', () => {
    const { content } = migrateRuleIds(SPEC, 'SVC', CODES);
    expect(content).toContain('https://wyze.atlassian.net/browse/BCS-137');
  });

  it('does not corrupt a URL that contains a real rule id', () => {
    const spec = [
      '| Rule | Statement | Source |',
      '| --- | --- | --- |',
      '| ENT-007 | Something. | https://wiki/specs/ENT-007 |',
    ].join('\n');

    const { content } = migrateRuleIds(spec, 'SVC', CODES);
    expect(content).toContain('https://wiki/specs/ENT-007');
    expect(content).toContain('| SVC-ENT-007 |');
  });

  it('is idempotent', () => {
    // Re-running over a migrated or half-migrated file must be a no-op, not
    // a source of SVC-SVC-ENT-007.
    const once = migrateRuleIds(SPEC, 'SVC', CODES).content;
    const twice = migrateRuleIds(once, 'SVC', CODES);
    expect(twice.content).toBe(once);
    expect(twice.renamed).toEqual([]);
  });

  it('leaves ids that already open with the team code', () => {
    const hw = ['| Rule | Statement |', '| --- | --- |', '| HW-001 | Plugin page rule. |'].join('\n');
    const result = migrateRuleIds(hw, 'HW', CODES);
    expect(result.renamed).toEqual([]);
    expect(result.unchanged).toEqual(['HW-001']);
    expect(result.content).toBe(hw);
  });

  it('leaves another team’s rules alone', () => {
    const mixed = ['| Rule | Statement |', '| --- | --- |', '| HW-ENT-007 | Hardware rule. |'].join('\n');
    expect(migrateRuleIds(mixed, 'SVC', CODES).renamed).toEqual([]);
  });

  it('handles bullet-style rules', () => {
    const bullets = ['# Child', '', '- **R-101** — first rule, see R-102.', '- **R-102** — second rule.'].join('\n');
    const { content } = migrateRuleIds(bullets, 'SVC', CODES);
    expect(content).toContain('- **SVC-R-101** — first rule, see SVC-R-102.');
    expect(content).toContain('- **SVC-R-102** — second rule.');
  });

  it('changes nothing else about the document', () => {
    const { content } = migrateRuleIds(SPEC, 'SVC', CODES);
    // Same shape, same line count — only ids moved.
    expect(content.split('\n')).toHaveLength(SPEC.split('\n').length);
    expect(content.replace(/SVC-/g, '')).toBe(SPEC);
  });

  it('returns the document untouched when there is nothing to do', () => {
    expect(migrateRuleIds('# Empty\n\nNo rules here.\n', 'SVC', CODES)).toMatchObject({
      renamed: [],
      unchanged: [],
    });
  });
});
