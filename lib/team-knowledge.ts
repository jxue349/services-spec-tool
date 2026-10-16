import type { SpecEnv } from './env';
import type { SpecRepoClient } from './github';
import { TEAMS_MANIFEST, buildTeams, parseTeamManifest } from './teams';
import type { TeamSpec } from './federated-retrieval';

/**
 * Loads every team's knowledge base for a federated read.
 *
 * Server-side rather than client-supplied: the browser holds one spec, and
 * shipping five knowledge bases to it and back would be both slow and a way
 * for a caller to put text of its own choosing in front of the model while
 * calling it a team's rules. The repo is the only source here.
 */
export async function loadTeamKnowledge(
  client: SpecRepoClient,
  env: SpecEnv,
  /**
   * The caller's unsaved editor draft, substituted for that team's committed
   * parent. This is what makes "I just changed a rule — does it now conflict
   * with another team?" answerable; against committed text only, the question
   * could not be asked until after the change had already landed.
   */
  draft?: { path: string; content: string },
): Promise<TeamSpec[]> {
  const paths = await client.listSpecFiles(env.baseBranch, env.specRoot);
  const manifestFile = await client.getFile(env.baseBranch, `${env.specRoot}/${TEAMS_MANIFEST}`);
  const teams = buildTeams(paths, env.specRoot, parseTeamManifest(manifestFile?.content ?? null));

  const loaded = await Promise.all(
    teams.map(async (team): Promise<TeamSpec | null> => {
      if (draft !== undefined && draft.path === team.parentPath) {
        return { slug: team.slug, name: team.name, code: team.code, content: draft.content };
      }
      try {
        const file = await client.getFile(env.baseBranch, team.parentPath);
        if (file === null || file.content.trim() === '') return null;
        return { slug: team.slug, name: team.name, code: team.code, content: file.content };
      } catch {
        // One unreadable knowledge base must not sink the whole answer. The
        // team simply contributes nothing, and the per-team breakdown in the
        // response shows it sent no rules.
        return null;
      }
    }),
  );

  return loaded.filter((spec): spec is TeamSpec => spec !== null);
}
