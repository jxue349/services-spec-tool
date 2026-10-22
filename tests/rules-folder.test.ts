import { describe, expect, it } from 'vitest';
import { parseRuleBlocks, rankBlocks, statusOfFields } from '@/lib/spec-retrieval';
import { openRefsFor, parseRegister, resolveStatus } from '@/lib/register';
import { buildTeams } from '@/lib/teams';
import { specLabel } from '@/lib/spec-paths';

/**
 * The folder layout: `rules/<domain>.md` with one rule per `###` heading, a
 * `register.md` holding open questions, and `golden-qa/`.
 *
 * The regression that matters most is the first one. Before this, the parser
 * read `###` as a section heading and found zero rules in a knowledge base
 * written this way — so Ask answered "the spec does not cover that" to every
 * question, which looks like an empty knowledge base rather than a parser
 * that cannot read it.
 */

const RULES = [
  '# Entitlement data model (ENT)',
  '',
  'Some preamble prose that is not a rule.',
  '',
  '### ENT-001 — WSC is the entitlement layer',
  '- source: [WSC as the brain](https://example.test/wsc)',
  '',
  'WSC is the platform-level entitlement layer and reconciliation point.',
  '',
  '### ENT-007 — Floating add-ons',
  '- source: [PRD](https://example.test/prd)',
  '- refs: V-25',
  '',
  'A child add-on can be active with no bound device.',
  '',
  '### ENT-008 — ~~Old recommendation order~~',
  '- source: [PRD](https://example.test/prd)',
  '- superseded-by: ENT-009, ENT-010',
  '',
  'Former rule: ordering was fixed and gated by an allowlist.',
].join('\n');

const REGISTER = [
  '# Verification & Conflict Register',
  '',
  '## Open',
  '',
  '### V-25 — Floating add-on renewal treatment 🔴',
  '- rules: ENT-007',
  '',
  'Renewal behaviour for an unbound add-on is undecided.',
  '',
  '### V-26 — Something unverified ⚠️',
  '- rules: ENT-011',
  '',
  'Needs confirming.',
  '',
  '## Resolved',
  '',
  '### V-03 — Settled question ⚠️',
  '- rules: ENT-001',
  '',
  'Confirmed with the platform team.',
].join('\n');

describe('parseRuleBlocks on the folder layout', () => {
  const blocks = parseRuleBlocks(RULES);

  it('finds every heading rule', () => {
    expect(blocks.map((b) => b.id)).toEqual(['ENT-001', 'ENT-007', 'ENT-008']);
  });

  it('keeps the title and the prose body', () => {
    expect(blocks[0]?.title).toBe('WSC is the entitlement layer');
    expect(blocks[0]?.text).toContain('reconciliation point');
  });

  it('does not treat section headings or preamble as rules', () => {
    // "# Entitlement data model (ENT)" declares no rule id.
    expect(blocks.some((b) => b.text.includes('Some preamble prose'))).toBe(false);
  });

  it('stops a rule at the next heading', () => {
    // Without this every rule would swallow the rest of the file and a
    // citation would highlight the whole document.
    expect(blocks[0]?.text).not.toContain('Floating add-ons');
  });

  it('parses the field lines', () => {
    expect(blocks[1]?.fields?.refs).toEqual(['V-25']);
    expect(blocks[1]?.fields?.source).toContain('example.test/prd');
    expect(blocks[2]?.fields?.supersededBy).toEqual(['ENT-009', 'ENT-010']);
  });

  it('reads a strikethrough tombstone heading', () => {
    expect(blocks[2]?.id).toBe('ENT-008');
    expect(blocks[2]?.status).toBe('superseded');
  });

  it('makes the rules retrievable', () => {
    // The whole point: zero hits here is Ask saying "not covered" to
    // everything.
    expect(rankBlocks(blocks, 'what is the entitlement layer')[0]?.id).toBe('ENT-001');
  });

  it('still parses the table and bullet layouts', () => {
    const table = '| Rule | Statement | Status |\n| --- | --- | --- |\n| TIER-001 | T1 is Cam Plus. | ✅ Confirmed |';
    expect(parseRuleBlocks(table).map((b) => b.id)).toEqual(['TIER-001']);
    expect(parseRuleBlocks('- **R-101** — a bullet rule.').map((b) => b.id)).toEqual(['R-101']);
  });
});

describe('statusOfFields', () => {
  it('caveats a rule carrying refs, pending the register', () => {
    // Fail-safe: wrongly caveating a settled rule annoys a reader, wrongly
    // asserting a disputed one puts a wrong answer in front of a customer.
    expect(statusOfFields({ refs: ['V-25'] })).toBe('unverified');
  });

  it('treats an uncaveated rule as assertable', () => {
    expect(statusOfFields({ source: 'x' })).toBe('confirmed');
  });

  it('puts a tombstone ahead of everything', () => {
    expect(statusOfFields({ refs: ['V-25'], supersededBy: ['ENT-009'] })).toBe('superseded');
  });
});

describe('parseRegister', () => {
  const register = parseRegister(REGISTER);

  it('reads every item', () => {
    expect([...register.keys()].sort()).toEqual(['V-03', 'V-25', 'V-26']);
  });

  it('takes openness from the section, not the marker', () => {
    // A resolved item keeps its original ⚠️ for history, so the marker alone
    // would call it open forever.
    expect(register.get('V-03')?.open).toBe(false);
    expect(register.get('V-25')?.open).toBe(true);
  });

  it('keeps the severity distinction', () => {
    expect(register.get('V-25')?.severity).toBe('open');
    expect(register.get('V-26')?.severity).toBe('unverified');
  });

  it('records the rules an item names', () => {
    expect(register.get('V-25')?.rules).toEqual(['ENT-007']);
  });

  it('survives a missing register', () => {
    expect(parseRegister(null).size).toBe(0);
  });
});

describe('resolveStatus', () => {
  const register = parseRegister(REGISTER);
  const blocks = parseRuleBlocks(RULES);
  const byId = (id: string) => blocks.find((b) => b.id === id)!;

  it('reports an open 🔴 item as a live conflict', () => {
    expect(resolveStatus(byId('ENT-007'), register)).toBe('open');
  });

  it('leaves a rule with no refs assertable', () => {
    expect(resolveStatus(byId('ENT-001'), register)).toBe('confirmed');
  });

  it('upgrades a rule whose refs are all resolved', () => {
    const block = { ...byId('ENT-001'), fields: { refs: ['V-03'] }, status: 'unverified' as const };
    expect(resolveStatus(block, register)).toBe('confirmed');
  });

  it('keeps the caveat on an unknown ref', () => {
    // A ref the register does not mention is more likely a typo than a
    // settled question; promoting it to fact is the outcome worth avoiding.
    const block = { ...byId('ENT-001'), fields: { refs: ['V-99'] }, status: 'unverified' as const };
    expect(resolveStatus(block, register)).toBe('unverified');
  });

  it('never un-supersedes a tombstone', () => {
    expect(resolveStatus(byId('ENT-008'), register)).toBe('superseded');
  });

  it('lists the open items blocking a rule', () => {
    expect(openRefsFor(byId('ENT-007'), register).map((i) => i.id)).toEqual(['V-25']);
  });
});

describe('buildTeams with a folder knowledge base', () => {
  const paths = [
    'specs/services/README.md',
    'specs/services/register.md',
    'specs/services/rules/ent.md',
    'specs/services/rules/addon.md',
    'specs/services/golden-qa/golden-qa-v1.md',
    'specs/hardware/parent.md',
    'specs/hardware/plugin-page/behavior.md',
  ];
  const teams = buildTeams(paths, 'specs', [
    { slug: 'services', name: 'Services', code: 'SVC' },
    { slug: 'hardware', name: 'HW Team', code: 'HW' },
  ]);

  it('recognises a team with rules/ and no parent.md', () => {
    // Before this, Services vanished from the team list entirely.
    const services = teams.find((t) => t.slug === 'services');
    expect(services).toBeDefined();
    expect(services?.layout).toBe('folder');
  });

  it('collects the rule files, register and golden QA separately', () => {
    const services = teams.find((t) => t.slug === 'services')!;
    expect(services.rulePaths).toEqual(['specs/services/rules/addon.md', 'specs/services/rules/ent.md']);
    expect(services.registerPath).toBe('specs/services/register.md');
    expect(services.goldenQaPaths).toEqual(['specs/services/golden-qa/golden-qa-v1.md']);
  });

  it('does not mistake knowledge-base files for child specs', () => {
    // Otherwise the selector lists sixteen rule files as unrelated specs.
    expect(teams.find((t) => t.slug === 'services')!.specPaths).toEqual([]);
  });

  it('anchors a folder team on its README', () => {
    expect(teams.find((t) => t.slug === 'services')!.parentPath).toBe('specs/services/README.md');
  });

  it('leaves a single-file team exactly as it was', () => {
    const hw = teams.find((t) => t.slug === 'hardware')!;
    expect(hw.layout).toBe('single-file');
    expect(hw.parentPath).toBe('specs/hardware/parent.md');
    expect(hw.rulePaths).toEqual(['specs/hardware/parent.md']);
    expect(hw.specPaths).toEqual(['specs/hardware/plugin-page/behavior.md']);
  });

  it('still ignores a directory with no knowledge base at all', () => {
    const extra = buildTeams([...paths, 'specs/scratch/notes.md'], 'specs', []);
    expect(extra.map((t) => t.slug)).not.toContain('scratch');
  });
});

describe('specLabel in the folder layout', () => {
  it('names a rule file by its domain, not its directory', () => {
    // Every rules/ file shares a directory, so "rules" labels all sixteen.
    expect(specLabel('specs/services/rules/ent.md', 'specs', 'specs/x/parent.md')).toBe('ent');
    expect(specLabel('specs/services/golden-qa/golden-qa-v1.md', 'specs', 'specs/x/parent.md')).toBe('golden-qa-v1');
  });

  it('still names a child spec by its directory', () => {
    expect(specLabel('specs/services/cam-plus/behavior.md', 'specs', 'specs/x/parent.md')).toBe('cam-plus');
  });
});
