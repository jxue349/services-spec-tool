import { describe, expect, it } from 'vitest';
import { extractRuleIds, findRuleRange } from '@/lib/client/rules';

/**
 * Rule-ID handling against the shapes real specs actually use.
 *
 * The Wyze subscription knowledge base numbers rules by domain
 * (`TIER-001`, `ADDON-005`) and writes them as markdown table rows, not as a
 * single `R-` series in bullets. It also cites Jira keys — `BCS-137` — in a
 * Source column, and those are shaped exactly like rule IDs. This fixture
 * mirrors all of that.
 */
const TABLE_SPEC = [
  '# Service & Subscription Rule Knowledge Base',
  '',
  '## 1. Tier & product identity rules (TIER)',
  '',
  '| Rule | Statement | Status | Source |',
  '| --- | --- | --- | --- |',
  '| TIER-001 | **T1 = Cam Plus.** Device-based base security plan. | ✅ Confirmed | [BCS-137](https://example.atlassian.net/browse/BCS-137) |',
  '| TIER-002 | **T2 = Cam Unlimited.** Account-level plan covering all cameras. | ✅ Confirmed | [BUG-60257](https://example.atlassian.net/browse/BUG-60257) |',
  '| TIER-003 | **T3 = Cam Unlimited Pro.** Top tier; code `cam-ultimate`. | ⚠️ Unverified | [CAMPLUSN-946](https://example.atlassian.net/browse/CAMPLUSN-946) |',
  '',
  '## 6. Add-on rules (ADDON)',
  '',
  '| Rule | Statement | Status | Source |',
  '| --- | --- | --- | --- |',
  '| ADDON-005 | **Pro AI identity & price:** `feature-pro-ai`, $4.99/month/device. | ✅ Confirmed | KB §6 |',
  '| ADDON-006 | Duplicate purchase is prohibited. See TIER-001 and ADDON-005. | ✅ Confirmed | KB §6 |',
  '',
  '## Bullet-style rules still work',
  '',
  '- **R-101** — An account-level entitlement covers all eligible devices',
  '  on the account.',
  '- **CAMPLUS-R-102** — A device-level upsell is shown once per period.',
].join('\n');

describe('extractRuleIds', () => {
  it('lists domain-numbered rules defined in table rows', () => {
    const ids = extractRuleIds(TABLE_SPEC);
    expect(ids).toContain('TIER-001');
    expect(ids).toContain('TIER-003');
    expect(ids).toContain('ADDON-005');
  });

  it('lists bullet-defined and namespaced rules too', () => {
    const ids = extractRuleIds(TABLE_SPEC);
    expect(ids).toContain('R-101');
    expect(ids).toContain('CAMPLUS-R-102');
  });

  it('excludes Jira keys cited in a Source column', () => {
    // These are shaped exactly like rule IDs; matching anywhere would list
    // tickets as rules and fill the chip row with dead links.
    const ids = extractRuleIds(TABLE_SPEC);
    expect(ids).not.toContain('BCS-137');
    expect(ids).not.toContain('BUG-60257');
    expect(ids).not.toContain('CAMPLUSN-946');
  });

  it('excludes cross-references inside another rule’s text', () => {
    // ADDON-006's statement mentions TIER-001 and ADDON-005; neither should be
    // counted a second time, and the list stays the real inventory.
    const ids = extractRuleIds(TABLE_SPEC);
    expect(ids.filter((id) => id === 'TIER-001')).toHaveLength(1);
  });

  it('returns each rule once, in document order', () => {
    const ids = extractRuleIds(TABLE_SPEC);
    expect(ids.slice(0, 4)).toEqual(['TIER-001', 'TIER-002', 'TIER-003', 'ADDON-005']);
  });
});

describe('findRuleRange against table-formatted specs', () => {
  it('selects exactly one table row', () => {
    const range = findRuleRange(TABLE_SPEC, 'ADDON-005')!;
    const selected = TABLE_SPEC.slice(range.start, range.end);

    expect(selected).toContain('ADDON-005');
    // Without stopping at the next table row this ran on to the end of the table.
    expect(selected).not.toContain('ADDON-006');
    expect(selected.split('\n')).toHaveLength(1);
  });

  it('prefers the definition row over a mention in another rule', () => {
    const range = findRuleRange(TABLE_SPEC, 'TIER-001')!;
    const selected = TABLE_SPEC.slice(range.start, range.end);
    expect(selected).toContain('T1 = Cam Plus');
    expect(selected).not.toContain('Duplicate purchase');
  });

  it('still handles wrapped bullet rules', () => {
    const range = findRuleRange(TABLE_SPEC, 'R-101')!;
    const selected = TABLE_SPEC.slice(range.start, range.end);
    expect(selected).toContain('on the account.');
    expect(selected).not.toContain('CAMPLUS-R-102');
  });

  it('does not match a bare id inside a namespaced one', () => {
    expect(findRuleRange('- **CAMPLUS-R-102** — x', 'R-102')).toBeNull();
  });

  it('does not match a rule id inside a longer number', () => {
    expect(findRuleRange(TABLE_SPEC, 'TIER-00')).toBeNull();
  });

  it('resolves every rule it extracted', () => {
    const ids = extractRuleIds(TABLE_SPEC);
    const unresolvable = ids.filter((id) => findRuleRange(TABLE_SPEC, id) === null);
    expect(unresolvable).toEqual([]);
  });
});
