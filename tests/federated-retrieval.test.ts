import { describe, expect, it } from 'vitest';
import { MIN_TEAM_SHARE, renderFederatedContext, retrieveAcrossTeams } from '@/lib/federated-retrieval';
import type { TeamSpec } from '@/lib/federated-retrieval';

/** A knowledge base with `count` rules all mentioning the same term. */
function bulky(slug: string, count: number, term: string): TeamSpec {
  const rules = Array.from(
    { length: count },
    (_, i) => `- **${slug.toUpperCase()}-${String(i + 1).padStart(3, '0')}** — ${term} behaviour variant ${i} ✅ Confirmed`,
  );
  return {
    slug,
    name: slug,
    code: slug.toUpperCase().slice(0, 4),
    content: `# ${slug}\n\n${rules.join('\n')}\n`,
  };
}

const SERVICES: TeamSpec = {
  slug: 'services',
  name: 'Services',
  code: 'SVC',
  content: [
    '# Services knowledge base',
    '',
    '## Grace periods',
    '- **ADDON-014** — Cam Plus grace period is 16 days after a failed payment ✅ Confirmed',
    '- **ADDON-020** — Cloud CVR is billed per device ✅ Confirmed',
  ].join('\n'),
};

const HARDWARE: TeamSpec = {
  slug: 'hardware',
  name: 'HW Team',
  code: 'HW',
  content: [
    '# Hardware knowledge base',
    '',
    '## Plugin page',
    '- **HW-007** — The plugin page shows a 30 day grace period banner ⚠️ Unverified',
  ].join('\n'),
};

const APPEX: TeamSpec = {
  slug: 'app-experience',
  name: 'App Experience',
  code: 'APPEX',
  content: ['# App Experience', '', '- **APPEX-002** — Navigation drawer lists owned devices ✅ Confirmed'].join('\n'),
};

describe('retrieveAcrossTeams', () => {
  it('retrieves from every team that has something to say', () => {
    const context = retrieveAcrossTeams([SERVICES, HARDWARE, APPEX], 'grace period');
    const teams = new Set(context.blocks.map((b) => b.teamSlug));
    expect(teams).toEqual(new Set(['services', 'hardware']));
  });

  it('tags every block with the team that owns it', () => {
    const context = retrieveAcrossTeams([SERVICES, HARDWARE], 'grace period');
    const hw = context.blocks.find((b) => b.id === 'HW-007');
    expect(hw?.teamName).toBe('HW Team');
    expect(hw?.teamCode).toBe('HW');
    // Never attributed to the team whose rules happened to rank higher.
    expect(context.blocks.find((b) => b.id === 'ADDON-014')?.teamSlug).toBe('services');
  });

  it('reports what each team contributed, including nothing', () => {
    const context = retrieveAcrossTeams([SERVICES, HARDWARE, APPEX], 'grace period');
    const appex = context.perTeam.find((t) => t.slug === 'app-experience');
    // Listed with zero sent, not omitted: "this team had nothing to say" and
    // "this team was not asked" have to be distinguishable to a reader.
    expect(appex).toMatchObject({ rulesSent: 0, rulesConsidered: 1 });
  });

  it('keeps a small knowledge base in context against a flooding one', () => {
    // The conflict-detection case. One pooled ranking would spend the whole
    // budget on the 400-rule team and the contradicting rule would never be
    // seen — which is the only reason it is worth reading across teams.
    const flood = bulky('services', 400, 'grace period');
    const context = retrieveAcrossTeams([flood, HARDWARE], 'grace period', 8_000);

    expect(context.blocks.some((b) => b.id === 'HW-007')).toBe(true);
    expect(context.perTeam.find((t) => t.slug === 'hardware')?.rulesSent).toBe(1);
  });

  it('gives a lone team the whole budget rather than a fraction', () => {
    const flood = bulky('services', 400, 'grace period');
    const context = retrieveAcrossTeams([flood, APPEX], 'grace period', 8_000);
    // APPEX matches nothing here, so services should not be held to half.
    expect(context.chars).toBeGreaterThan(MIN_TEAM_SHARE);
  });

  it('stays inside the budget', () => {
    const context = retrieveAcrossTeams([bulky('a', 200, 'grace'), bulky('b', 200, 'grace')], 'grace', 6_000);
    expect(context.chars).toBeLessThanOrEqual(6_000);
  });

  it('never returns the same rule twice', () => {
    const context = retrieveAcrossTeams([bulky('a', 50, 'grace')], 'grace', 20_000);
    const keys = context.blocks.map((b) => `${b.teamSlug}:${b.line}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('returns nothing, and no team, when the question matches nowhere', () => {
    const context = retrieveAcrossTeams([SERVICES, HARDWARE], 'quantum tunnelling diode');
    expect(context.blocks).toEqual([]);
    expect(context.chars).toBe(0);
    expect(context.perTeam.every((t) => t.rulesSent === 0)).toBe(true);
  });

  it('handles an empty team list', () => {
    expect(retrieveAcrossTeams([], 'anything').blocks).toEqual([]);
  });
});

describe('renderFederatedContext', () => {
  it('groups rules under the team that owns them', () => {
    const rendered = renderFederatedContext(retrieveAcrossTeams([SERVICES, HARDWARE], 'grace period'));

    expect(rendered).toContain('### Team: Services (SVC)');
    expect(rendered).toContain('### Team: HW Team (HW)');

    // The model has to be able to say "Services says 16, Hardware says 30",
    // so each rule must sit under its own team's heading and nowhere else.
    const services = rendered.indexOf('### Team: Services');
    const hardware = rendered.indexOf('### Team: HW Team');
    const addon = rendered.indexOf('ADDON-014');
    const hw = rendered.indexOf('HW-007');
    expect(addon).toBeGreaterThan(services);
    expect(hw).toBeGreaterThan(hardware);
    expect(Math.min(addon, hw) < Math.max(services, hardware)).toBe(true);
  });

  it('renders nothing for an empty retrieval', () => {
    expect(renderFederatedContext(retrieveAcrossTeams([], 'x'))).toBe('');
  });
});
