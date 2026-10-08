import { describe, expect, it } from 'vitest';
import {
  CONTEXT_BUDGET,
  parseRuleBlocks,
  rankBlocks,
  renderContext,
  retrieveContext,
  terms,
} from '@/lib/spec-retrieval';

/**
 * Retrieval decides which rules the model is allowed to see, so a miss here
 * is worse than a slow answer: the model is told the spec is silent on
 * something it actually defines.
 */

const SPEC = [
  '# Knowledge base',
  '',
  '## 6. Add-on rules (ADDON)',
  '',
  '| Rule | Statement | Status | Source |',
  '| --- | --- | --- | --- |',
  '| ADDON-005 | **Pro AI identity & price:** service code `feature-pro-ai`, $4.99/month/device. | ✅ Confirmed | KB §6 |',
  '| ADDON-011 | **Cloud 60:** service code `feature-cloud-60`, $2.99/month/device. | ✅ Confirmed | KB §6 |',
  '| ADDON-008 | Recommended add-on display order gated by the Redis allowlist. | ⚠️ Unverified | notes |',
  '',
  '## 11. Bird Watch rules (BW)',
  '',
  '| BW-001 | Identity: service code `bird-watch`; device `GW_WBDC` only. | ✅ Confirmed | Bird PRD |',
  '| BW-002 | Price: $5.99/month/device or $59.99/year/device. | 🔴 Open | conflict |',
  '',
  '## 15. Legacy rules (LEGACY)',
  '',
  '- **LEGACY-002** — Never describe CPL as a universal lifetime benefit.',
  '  No official policy source establishes it. ⚠️ Unverified',
  '- **TIER-005** — ~~Cam Unlimited Light mapping gap.~~ ⛔ Superseded by owner decision.',
].join('\n');

describe('parseRuleBlocks', () => {
  it('finds table rules and carries their section', () => {
    const blocks = parseRuleBlocks(SPEC);
    const addon = blocks.find((b) => b.id === 'ADDON-011')!;
    expect(addon.section).toBe('6. Add-on rules (ADDON)');
    expect(addon.text).toContain('feature-cloud-60');
  });

  it('finds list rules and joins their wrapped continuation', () => {
    const blocks = parseRuleBlocks(SPEC);
    const legacy = blocks.find((b) => b.id === 'LEGACY-002')!;
    expect(legacy.text).toContain('No official policy source establishes it');
    expect(legacy.section).toBe('15. Legacy rules (LEGACY)');
  });

  it('reads the status marker', () => {
    const byId = Object.fromEntries(parseRuleBlocks(SPEC).map((b) => [b.id, b.status]));
    expect(byId['ADDON-005']).toBe('confirmed');
    expect(byId['ADDON-008']).toBe('unverified');
    expect(byId['BW-002']).toBe('open');
    expect(byId['TIER-005']).toBe('superseded');
  });

  it('ignores the header and separator rows of a table', () => {
    const ids = parseRuleBlocks(SPEC).map((b) => b.id);
    expect(ids).not.toContain(null);
    expect(ids).toHaveLength(7);
  });
});

describe('terms', () => {
  it('keeps identifiers intact and drops stop words', () => {
    expect(terms('What is the price of feature-cloud-60?')).toEqual(['price', 'feature-cloud-60']);
  });
});

describe('rankBlocks', () => {
  const blocks = parseRuleBlocks(SPEC);

  it('puts an explicitly named rule first', () => {
    const ranked = rankBlocks(blocks, 'what does ADDON-011 say?');
    expect(ranked[0]?.id).toBe('ADDON-011');
  });

  it('matches on an exact identifier in the question', () => {
    const ranked = rankBlocks(blocks, 'how much is feature-cloud-60');
    expect(ranked[0]?.id).toBe('ADDON-011');
  });

  it('finds the right domain from plain language', () => {
    const ranked = rankBlocks(blocks, 'what device does bird watch support?');
    expect(ranked[0]?.id).toBe('BW-001');
  });

  it('demotes superseded rules below live ones', () => {
    const ranked = rankBlocks(blocks, 'cam unlimited light mapping gap');
    const superseded = ranked.findIndex((b) => b.id === 'TIER-005');
    // It may still appear — it is the only match — but never with full weight.
    const raw = rankBlocks(blocks.map((b) => ({ ...b, status: null })), 'cam unlimited light mapping gap');
    expect(ranked[superseded]!.score).toBeLessThan(raw[0]!.score);
  });

  it('returns nothing for a question the spec has no terms for', () => {
    expect(rankBlocks(blocks, 'zzzz qqqq')).toEqual([]);
  });
});

describe('retrieveContext', () => {
  it('sends the whole document when it is small', () => {
    const ctx = retrieveContext(SPEC, 'bird watch price');
    expect(ctx.wholeDocument).toBe(true);
    expect(renderContext(ctx, SPEC)).toBe(SPEC);
  });

  it('selects rules once the document is large', () => {
    const padding = `\n${'| PAD-001 | filler text about unrelated matters. | ✅ Confirmed | x |'.repeat(400)}`;
    const big = SPEC + padding;

    const ctx = retrieveContext(big, 'how much is feature-cloud-60');
    expect(ctx.wholeDocument).toBe(false);
    expect(ctx.blocks.length).toBeGreaterThan(0);
    expect(ctx.blocks[0]?.id).toBe('ADDON-011');

    const rendered = renderContext(ctx, big);
    expect(rendered).toContain('feature-cloud-60');
    expect(rendered).toContain('## 6. Add-on rules (ADDON)');
    expect(rendered.length).toBeLessThan(big.length);
  });

  it('never exceeds the context budget', () => {
    const big = SPEC + `\n${'| PAD-002 | bird watch price device filler. | ✅ Confirmed | x |'.repeat(2000)}`;
    const ctx = retrieveContext(big, 'bird watch price device');
    expect(ctx.chars).toBeLessThanOrEqual(CONTEXT_BUDGET);
  });

  it('groups selected rules under their own sections, in document order', () => {
    const big = SPEC + `\n${'| PAD-003 | filler. | ✅ Confirmed | x |'.repeat(400)}`;
    const ctx = retrieveContext(big, 'pro ai cloud 60 price add-on');
    const rendered = renderContext(ctx, big);
    expect(rendered.indexOf('ADDON-005')).toBeLessThan(rendered.indexOf('ADDON-011'));
  });
});
