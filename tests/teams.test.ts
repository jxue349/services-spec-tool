import { describe, expect, it } from 'vitest';
import {
  buildTeams,
  isTeamParent,
  parentPathForSpec,
  defaultTeam,
  nameFromSlug,
  parseTeamManifest,
  teamForPath,
  teamNamespaceFor,
} from '@/lib/teams';

const ROOT = 'specs';

const PATHS = [
  'specs/services/parent.md',
  'specs/services/cam-plus/behavior.md',
  'specs/services/upsell/behavior.md',
  'specs/hardware/parent.md',
  'specs/hardware/plugin-page/behavior.md',
  'specs/app-experience/parent.md',
  'specs/platform/parent.md',
  'specs/others/parent.md',
];

const MANIFEST = [
  { slug: 'hardware', name: 'HW Team', code: 'HW' },
  { slug: 'services', name: 'Services', code: 'SVC' },
  { slug: 'app-experience', name: 'App Experience', code: 'APPEX' },
  { slug: 'platform', name: 'Platform Team', code: 'PLAT' },
  { slug: 'others', name: 'Others', code: 'MISC' },
];

const TEAMS = buildTeams(PATHS, ROOT, MANIFEST);

describe('buildTeams', () => {
  it('finds a team for every folder holding a parent spec', () => {
    const teams = buildTeams(PATHS, ROOT, MANIFEST);
    expect(teams.map((t) => t.slug)).toEqual(['hardware', 'services', 'app-experience', 'platform', 'others']);
  });

  it('follows manifest order, not alphabetical', () => {
    expect(buildTeams(PATHS, ROOT, MANIFEST)[0]?.name).toBe('HW Team');
  });

  it('collects each team’s child specs, excluding its parent', () => {
    const services = buildTeams(PATHS, ROOT, MANIFEST).find((t) => t.slug === 'services')!;
    expect(services.parentPath).toBe('specs/services/parent.md');
    expect(services.specPaths).toEqual(['specs/services/cam-plus/behavior.md', 'specs/services/upsell/behavior.md']);
  });

  it('ignores a folder with no parent spec', () => {
    // A folder of specs with nothing to merge into is not a knowledge base,
    // and Parent Check would have nothing to compare against.
    const teams = buildTeams([...PATHS, 'specs/scratch/notes.md'], ROOT, MANIFEST);
    expect(teams.map((t) => t.slug)).not.toContain('scratch');
  });

  it('ignores a loose file sitting directly in the root', () => {
    const teams = buildTeams([...PATHS, 'specs/README.md'], ROOT, MANIFEST);
    expect(teams).toHaveLength(5);
  });

  it('still lists a team the manifest never mentions', () => {
    // The folders are the source of truth; the manifest is only presentation.
    const teams = buildTeams([...PATHS, 'specs/skunkworks/parent.md'], ROOT, MANIFEST);
    expect(teams.map((t) => t.slug)).toContain('skunkworks');
    expect(teams.find((t) => t.slug === 'skunkworks')?.name).toBe('Skunkworks');
  });

  it('ignores paths outside the root', () => {
    const teams = buildTeams([...PATHS, 'other/hardware/parent.md'], ROOT, MANIFEST);
    expect(teams).toHaveLength(5);
  });
});

describe('parseTeamManifest', () => {
  it('reads an array or a { teams: [...] } wrapper', () => {
    expect(parseTeamManifest('[{"slug":"a","name":"A"}]')).toEqual([{ slug: 'a', name: 'A' }]);
    expect(parseTeamManifest('{"teams":[{"slug":"b"}]}')).toEqual([{ slug: 'b' }]);
  });

  it('survives a broken manifest rather than hiding every team', () => {
    expect(parseTeamManifest('not json')).toEqual([]);
    expect(parseTeamManifest(null)).toEqual([]);
    expect(parseTeamManifest('')).toEqual([]);
  });

  it('drops entries with no slug', () => {
    expect(parseTeamManifest('[{"name":"nameless"},{"slug":"ok"}]')).toEqual([{ slug: 'ok' }]);
  });
});

describe('nameFromSlug', () => {
  it('title-cases, keeping short tokens upper', () => {
    expect(nameFromSlug('app-experience')).toBe('App Experience');
    expect(nameFromSlug('hw-team')).toBe('HW Team');
  });
});

describe('teamForPath', () => {
  const teams = buildTeams(PATHS, ROOT, MANIFEST);

  it('finds the owner of a parent and of a child spec', () => {
    expect(teamForPath('specs/services/parent.md', teams)?.slug).toBe('services');
    expect(teamForPath('specs/hardware/plugin-page/behavior.md', teams)?.slug).toBe('hardware');
  });

  it('returns null for a path belonging to no team', () => {
    expect(teamForPath('specs/README.md', teams)).toBeNull();
  });
});

describe('defaultTeam', () => {
  const teams = buildTeams(PATHS, ROOT, MANIFEST);

  it('honours the preferred slug', () => {
    expect(defaultTeam(teams, 'platform')?.slug).toBe('platform');
  });

  it('falls back to the first team when the preference is unknown or absent', () => {
    expect(defaultTeam(teams, 'nope')?.slug).toBe('hardware');
    expect(defaultTeam(teams)?.slug).toBe('hardware');
  });

  it('is null when there are no teams at all', () => {
    expect(defaultTeam([], 'services')).toBeNull();
  });
});

describe('teamNamespaceFor', () => {
  it('uses the team code chosen in the manifest', () => {
    // The collision this exists to prevent: two teams with a plugin-page spec.
    expect(teamNamespaceFor('specs/hardware/plugin-page/behavior.md', ROOT, TEAMS)).toBe('HW-PLUGINPAGE');
    expect(teamNamespaceFor('specs/app-experience/plugin-page/behavior.md', ROOT, TEAMS)).toBe('APPEX-PLUGINPAGE');
  });

  it('gives a team parent the bare team code', () => {
    expect(teamNamespaceFor('specs/services/parent.md', ROOT, TEAMS)).toBe('SVC');
  });

  it('falls back to initials when no code is configured', () => {
    // Crude on purpose: a team that cares should set `code` in the manifest.
    expect(teamNamespaceFor('specs/app-experience/nav/behavior.md', ROOT)).toBe('AE-NAV');
    expect(teamNamespaceFor('specs/platform/parent.md', ROOT)).toBe('PLATFORM');
  });

  it('never returns an empty prefix', () => {
    expect(teamNamespaceFor('specs/!!!/parent.md', ROOT, TEAMS)).toBe('SPEC');
  });
});

describe('parentPathForSpec', () => {
  it('resolves a spec to its own team’s knowledge base', () => {
    // Without this, the hardware spec is checked against the services KB.
    expect(parentPathForSpec('specs/hardware/plugin-page/behavior.md', ROOT, 'fallback')).toBe(
      'specs/hardware/parent.md',
    );
    expect(parentPathForSpec('specs/services/cam-plus/behavior.md', ROOT, 'fallback')).toBe(
      'specs/services/parent.md',
    );
  });

  it('recognises each team’s parent as a parent', () => {
    expect(isTeamParent('specs/hardware/parent.md', ROOT, 'fallback')).toBe(true);
    expect(isTeamParent('specs/platform/parent.md', ROOT, 'fallback')).toBe(true);
    expect(isTeamParent('specs/services/cam-plus/behavior.md', ROOT, 'fallback')).toBe(false);
  });

  it('falls back for a path outside the team layout', () => {
    expect(parentPathForSpec('spec/behavior.md', ROOT, 'fallback')).toBe('fallback');
    expect(parentPathForSpec('specs/loose.md', ROOT, 'fallback')).toBe('fallback');
  });
});
