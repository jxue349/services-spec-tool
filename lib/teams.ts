/**
 * Teams own spec folders.
 *
 * A team is a directory under SPEC_ROOT containing a parent spec. That makes
 * the repo self-describing: adding a team is adding a folder with a
 * `parent.md` in it, and nothing has to be registered anywhere for the app
 * to notice. `specs/teams.json` is optional and only supplies display names
 * and ordering — if it is missing, absent, or stale, the folders still win.
 *
 * Pure functions over a file listing, so the rules are testable without a
 * repo.
 */

export const PARENT_FILENAME = 'parent.md';
export const TEAMS_MANIFEST = 'teams.json';

export type Team = {
  /** Directory name under the spec root. Stable; used in paths and IDs. */
  slug: string;
  /** Human name for the UI. */
  name: string;
  /** Path of this team's parent spec (its knowledge base). */
  parentPath: string;
  /** Child specs belonging to the team, excluding the parent. */
  specPaths: string[];
  /** Short description from the manifest, when there is one. */
  description?: string;
  /**
   * Prefix for this team's rule IDs — `HW`, `SVC`, `APPEX`.
   *
   * Chosen in the manifest rather than derived, because these end up cited
   * in tickets: auto-shortening "app-experience" gives APPEXPERIE, which is
   * both mangled and long. Falls back to the slug when unset.
   */
  code: string;
};

export type TeamManifestEntry = {
  slug: string;
  name?: string;
  /** Rule-ID prefix. Short, uppercase, stable — it goes into ticket text. */
  code?: string;
  description?: string;
};

/** Parses `specs/teams.json`, tolerating anything malformed. */
export function parseTeamManifest(content: string | null | undefined): TeamManifestEntry[] {
  if (content === null || content === undefined || content.trim() === '') return [];
  try {
    const parsed = JSON.parse(content) as unknown;
    const list = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { teams?: unknown }).teams)
        ? ((parsed as { teams: unknown[] }).teams)
        : [];

    return list
      .filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null)
      .map((e) => ({
        slug: typeof e.slug === 'string' ? e.slug : '',
        ...(typeof e.name === 'string' ? { name: e.name } : {}),
        ...(typeof e.code === 'string' && e.code.trim() !== ''
          ? { code: e.code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') }
          : {}),
        ...(typeof e.description === 'string' ? { description: e.description } : {}),
      }))
      .filter((e) => e.slug !== '');
  } catch {
    // A broken manifest must not hide the teams that actually exist.
    return [];
  }
}

/**
 * Fallback rule-ID prefix when the manifest does not give one.
 *
 * Initials for a multi-word slug (app-experience -> AE), the slug itself
 * when it is one short word. Deliberately crude: a team that cares about its
 * IDs should set `code` rather than inherit a guess.
 */
export function codeFromSlug(slug: string): string {
  const parts = slug.split(/[-_]/).filter((p) => p !== '');
  if (parts.length === 0) return 'SPEC';
  if (parts.length === 1) return parts[0]!.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'SPEC';
  return parts.map((p) => p[0]!).join('').toUpperCase().replace(/[^A-Z0-9]/g, '') || 'SPEC';
}

/** Title-cases a slug when the manifest does not name the team. */
export function nameFromSlug(slug: string): string {
  return slug
    .split(/[-_]/)
    .filter((part) => part !== '')
    .map((part) => (part.length <= 2 ? part.toUpperCase() : part[0]!.toUpperCase() + part.slice(1)))
    .join(' ');
}

/**
 * Builds the team list from the repo's own markdown files.
 *
 * `paths` is every .md under `root`. A directory directly beneath the root
 * that contains a parent spec is a team; everything else under it is one of
 * that team's specs.
 */
export function buildTeams(
  paths: readonly string[],
  root: string,
  manifest: readonly TeamManifestEntry[] = [],
): Team[] {
  const prefix = root === '' ? '' : `${root}/`;
  const bySlug = new Map<string, { parentPath: string | null; specPaths: string[] }>();

  for (const path of paths) {
    if (!path.startsWith(prefix)) continue;
    const rest = path.slice(prefix.length).split('/');
    // Needs at least <team>/<file>; a file sitting directly in the root
    // belongs to no team and is ignored rather than guessed at.
    if (rest.length < 2) continue;

    const slug = rest[0]!;
    const entry = bySlug.get(slug) ?? { parentPath: null, specPaths: [] };
    if (rest.length === 2 && rest[1] === PARENT_FILENAME) entry.parentPath = path;
    else entry.specPaths.push(path);
    bySlug.set(slug, entry);
  }

  const order = new Map(manifest.map((entry, i) => [entry.slug, i]));
  const named = new Map(manifest.map((entry) => [entry.slug, entry]));

  const teams: Team[] = [];
  for (const [slug, entry] of bySlug) {
    // No parent spec, no team. A folder of specs with nothing to merge into
    // is not a knowledge base, and treating it as one would give Parent Check
    // nothing to compare against.
    if (entry.parentPath === null) continue;

    const meta = named.get(slug);
    teams.push({
      slug,
      name: meta?.name ?? nameFromSlug(slug),
      code: meta?.code ?? codeFromSlug(slug),
      parentPath: entry.parentPath,
      specPaths: [...entry.specPaths].sort(),
      ...(meta?.description !== undefined ? { description: meta.description } : {}),
    });
  }

  // Manifest order first, then anything it does not mention, alphabetically.
  const LAST = Number.MAX_SAFE_INTEGER;
  return teams.sort((a, b) => {
    const ai = order.get(a.slug) ?? LAST;
    const bi = order.get(b.slug) ?? LAST;
    return ai === bi ? a.name.localeCompare(b.name) : ai - bi;
  });
}

/**
 * Resolves a team label written by the model back to a real team.
 *
 * Needed because the label is generated text, not an identifier. Asked to
 * name the team a rule belongs to, a model will variously answer "Services",
 * "SVC", or — copying the heading it was given — "Services (SVC)". Matching
 * only the exact name silently drops every citation in the third form, which
 * shows up as a conflict nobody can file rather than as an error.
 *
 * Deliberately not fuzzy: it matches the name or the code as a whole token,
 * never a substring, so "App Experience" cannot match "Experience Platform".
 */
export function matchTeamLabel<T extends { name: string; code: string }>(
  label: string,
  teams: readonly T[],
): T | null {
  const raw = label.trim().toUpperCase();
  if (raw === '') return null;

  // "Services (SVC)" -> ["SERVICES (SVC)", "SERVICES", "SVC"]
  const withoutSuffix = raw.replace(/\s*\([^)]*\)\s*$/, '').trim();
  const inParens = /\(([^)]*)\)/.exec(raw)?.[1]?.trim() ?? '';
  const candidates = [raw, withoutSuffix, inParens].filter((c) => c !== '');

  for (const candidate of candidates) {
    const hit = teams.find((team) => team.name.toUpperCase() === candidate || team.code.toUpperCase() === candidate);
    if (hit !== undefined) return hit;
  }

  return null;
}

/** The team a path belongs to, or null when it is outside every team. */
export function teamForPath(path: string, teams: readonly Team[]): Team | null {
  return teams.find((team) => path === team.parentPath || team.specPaths.includes(path)) ?? null;
}

/** Picks the team to show first. */
export function defaultTeam(teams: readonly Team[], preferredSlug?: string): Team | null {
  if (teams.length === 0) return null;
  if (preferredSlug !== undefined && preferredSlug !== '') {
    const match = teams.find((t) => t.slug === preferredSlug);
    if (match !== undefined) return match;
  }
  return teams[0] ?? null;
}

/**
 * Namespace prefix for rules in a spec, including the team.
 *
 * Without the team, `hardware/plugin-page` and `app-experience/plugin-page`
 * both yield PLUGINPAGE — impossible with one knowledge base, likely with
 * several. A team's parent spec keeps the bare team prefix.
 */
export function teamNamespaceFor(specPath: string, root: string, teams: readonly Team[] = []): string {
  const prefix = root === '' ? '' : `${root}/`;
  const rest = specPath.startsWith(prefix) ? specPath.slice(prefix.length) : specPath;
  const parts = rest.split('/').filter((p) => p !== '');

  const slug = parts[0] ?? '';
  const team = teams.find((t) => t.slug === slug);
  const code = team?.code ?? codeFromSlug(slug);

  // The team's parent spec carries the bare team code.
  if (parts.length <= 2 && parts[1] === PARENT_FILENAME) return code;

  const spec = (parts.length > 2 ? parts[1]! : (parts[1] ?? ''))
    .replace(/\.md$/i, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12);

  return [code, spec].filter((p) => p !== '').join('-') || 'SPEC';
}

/**
 * The parent spec of whichever team owns `specPath`.
 *
 * Derived from the path rather than configuration, because with several
 * teams there is no single parent: a spec's knowledge base is its own team's,
 * and comparing against a globally configured one would check the hardware
 * spec against the services KB.
 */
export function parentPathForSpec(specPath: string, root: string, fallback: string): string {
  const prefix = root === '' ? '' : `${root}/`;
  if (!specPath.startsWith(prefix)) return fallback;

  const parts = specPath.slice(prefix.length).split('/').filter((p) => p !== '');
  // Needs <team>/<something>; a file directly in the root has no team.
  if (parts.length < 2) return fallback;

  return `${prefix}${parts[0]}/${PARENT_FILENAME}`;
}

/** True when the path is a team's own parent spec. */
export function isTeamParent(specPath: string, root: string, fallback: string): boolean {
  return specPath === parentPathForSpec(specPath, root, fallback);
}
