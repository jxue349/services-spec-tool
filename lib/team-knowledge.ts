import type { SpecEnv } from './env';
import type { SpecRepoClient } from './github';
import { TEAMS_MANIFEST, buildTeams, parseTeamManifest } from './teams';
import type { Team } from './teams';
import type { TeamSpec } from './federated-retrieval';

/**
 * Loads a team's knowledge base, whatever layout it is in.
 *
 * Server-side rather than client-supplied. That was already true for the
 * federated read — shipping five knowledge bases to the browser and back
 * would be slow, and would let a caller put text of its own choosing in
 * front of the model while calling it a team's rules. The folder layout
 * makes it true for a single team too: Services is sixteen files plus a
 * register, so there is no longer one document the editor could have sent.
 */

/** The caller's unsaved edit to one file, folded in before retrieval. */
export type Draft = { path: string; content: string };

/**
 * Concatenates a team's rule files into one retrieval corpus.
 *
 * Each file is prefixed with its path so a rule keeps its provenance: the
 * domain file is the nearest thing the folder layout has to a section, and
 * without it a retrieved rule could not be traced back to a document to
 * edit.
 */
async function readKnowledgeBase(
  client: SpecRepoClient,
  env: SpecEnv,
  team: Team,
  draft?: Draft,
): Promise<{ content: string; register: string | null } | null> {
  const parts = await Promise.all(
    team.rulePaths.map(async (path) => {
      if (draft !== undefined && draft.path === path) return { path, content: draft.content };
      try {
        const file = await client.getFile(env.baseBranch, path);
        return file === null ? null : { path, content: file.content };
      } catch {
        // One unreadable file must not sink the whole knowledge base.
        return null;
      }
    }),
  );

  const usable = parts.filter((part): part is { path: string; content: string } => part !== null);
  if (usable.length === 0) return null;

  const content = usable
    .filter((part) => part.content.trim() !== '')
    .map((part) => `<!-- ${part.path} -->\n${part.content}`)
    .join('\n\n');

  if (content.trim() === '') return null;

  let register: string | null = null;
  if (team.registerPath !== null) {
    if (draft !== undefined && draft.path === team.registerPath) register = draft.content;
    else {
      try {
        register = (await client.getFile(env.baseBranch, team.registerPath))?.content ?? null;
      } catch {
        register = null;
      }
    }
  }

  return { content, register };
}

/** Discovers the teams in the repo. */
export async function loadTeams(client: SpecRepoClient, env: SpecEnv): Promise<Team[]> {
  const paths = await client.listSpecFiles(env.baseBranch, env.specRoot);
  const manifestFile = await client.getFile(env.baseBranch, `${env.specRoot}/${TEAMS_MANIFEST}`);
  return buildTeams(paths, env.specRoot, parseTeamManifest(manifestFile?.content ?? null));
}

/** One team's knowledge base, for the "this team" Ask scope. */
export async function loadOneTeamKnowledge(
  client: SpecRepoClient,
  env: SpecEnv,
  slug: string,
  draft?: Draft,
): Promise<TeamSpec | null> {
  const team = (await loadTeams(client, env)).find((t) => t.slug === slug);
  if (team === undefined) return null;

  const kb = await readKnowledgeBase(client, env, team, draft);
  if (kb === null) return null;

  return {
    slug: team.slug,
    name: team.name,
    code: team.code,
    content: kb.content,
    ...(kb.register !== null ? { register: kb.register } : {}),
  };
}

/** Every team's knowledge base, for a federated read. */
export async function loadTeamKnowledge(
  client: SpecRepoClient,
  env: SpecEnv,
  /**
   * The caller's unsaved editor draft, folded into whichever team owns the
   * file. This is what makes "I just changed a rule — does it now conflict
   * with another team?" answerable before the change lands rather than after.
   */
  draft?: Draft,
): Promise<TeamSpec[]> {
  const teams = await loadTeams(client, env);

  const loaded = await Promise.all(
    teams.map(async (team): Promise<TeamSpec | null> => {
      const kb = await readKnowledgeBase(client, env, team, draft);
      if (kb === null) return null;
      return {
        slug: team.slug,
        name: team.name,
        code: team.code,
        content: kb.content,
        ...(kb.register !== null ? { register: kb.register } : {}),
      };
    }),
  );

  return loaded.filter((spec): spec is TeamSpec => spec !== null);
}
