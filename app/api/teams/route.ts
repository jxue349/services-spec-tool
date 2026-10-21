import { withApiAccess } from '@/lib/api-access';
import { NextResponse } from 'next/server';
import { getSpecEnv } from '@/lib/env';
import { apiErrorFromUnknown, newRequestId } from '@/lib/errors';
import { createSpecRepoClient } from '@/lib/github';
import { TEAMS_MANIFEST, buildTeams, defaultTeam, parseTeamManifest } from '@/lib/teams';
import type { TeamsResponse } from '@/lib/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The teams in the repo, each with its own knowledge base.
 *
 * Derived from the folders rather than a registry the app has to be told
 * about: a directory under the spec root containing a parent spec is a team.
 * `specs/teams.json` only supplies display names, ordering and rule-ID
 * prefixes, so a missing or stale manifest never hides a team that exists.
 */
async function handleGET(): Promise<NextResponse> {
  const requestId = newRequestId();
  try {
    const env = getSpecEnv();
    const client = createSpecRepoClient(env);

    const paths = await client.listSpecFiles(env.baseBranch, env.specRoot);
    const manifestFile = await client.getFile(env.baseBranch, `${env.specRoot}/${TEAMS_MANIFEST}`);
    const manifest = parseTeamManifest(manifestFile?.content ?? null);

    const teams = buildTeams(paths, env.specRoot, manifest);
    const body: TeamsResponse = {
      teams,
      specRoot: env.specRoot,
      defaultTeamSlug: defaultTeam(teams, process.env.SPEC_DEFAULT_TEAM?.trim())?.slug ?? null,
    };
    return NextResponse.json(body);
  } catch (err) {
    return apiErrorFromUnknown('GET /api/teams', err, requestId);
  }
}

export const GET = withApiAccess(handleGET, { readOnly: true });
