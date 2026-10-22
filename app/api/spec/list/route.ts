import { withApiAccess } from '@/lib/api-access';
import { NextResponse } from 'next/server';
import { getSpecEnv } from '@/lib/env';
import { apiErrorFromUnknown, newRequestId } from '@/lib/errors';
import { createSpecRepoClient } from '@/lib/github';
import { specLabel } from '@/lib/spec-paths';
import type { SpecKind, SpecListEntry, SpecListResponse } from '@/lib/schemas';
import { loadTeams } from '@/lib/team-knowledge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Every spec in the repo, for the selector: the parent / knowledge base plus
 * each child spec found under the spec root.
 */
async function handleGET(): Promise<NextResponse> {
  const requestId = newRequestId();
  try {
    const env = getSpecEnv();
    const client = createSpecRepoClient(env);
    const paths = await client.listSpecFiles(env.baseBranch, env.specRoot);

    const parentExists = paths.includes(env.parentPath);

    // Team-aware so a folder-layout knowledge base is grouped as one thing.
    // Sixteen rule files listed as sixteen unrelated child specs would read
    // as a team that has lost its knowledge base rather than split it up.
    const teams = await loadTeams(client, env);

    const kindOf = (path: string): { kind: SpecKind; teamSlug?: string } => {
      for (const team of teams) {
        if (team.layout === 'single-file' && path === team.parentPath) {
          return { kind: 'parent', teamSlug: team.slug };
        }
        if (team.rulePaths.includes(path)) return { kind: 'rules', teamSlug: team.slug };
        if (team.registerPath === path) return { kind: 'register', teamSlug: team.slug };
        if (team.goldenQaPaths.includes(path)) return { kind: 'golden-qa', teamSlug: team.slug };
        if (team.layout === 'folder' && path === team.parentPath) {
          return { kind: 'readme', teamSlug: team.slug };
        }
        if (team.specPaths.includes(path)) return { kind: 'spec', teamSlug: team.slug };
      }
      return { kind: 'spec' };
    };

    const specs: SpecListEntry[] = paths.map((path) => {
      const { kind, teamSlug } = kindOf(path);
      return {
        path,
        label: specLabel(path, env.specRoot, env.parentPath),
        isParent: path === env.parentPath || kind === 'parent',
        kind,
        ...(teamSlug !== undefined ? { teamSlug } : {}),
      };
    });

    // Knowledge base first — it is the default selection and the thing child
    // specs are checked against, so it should never be buried alphabetically.
    const rank: Record<SpecKind, number> = {
      parent: 0,
      rules: 1,
      register: 2,
      'golden-qa': 3,
      readme: 4,
      spec: 5,
    };
    specs.sort((a, b) => rank[a.kind] - rank[b.kind] || a.label.localeCompare(b.label));

    const body: SpecListResponse = {
      specs,
      parentPath: env.parentPath,
      specRoot: env.specRoot,
      parentExists,
    };
    return NextResponse.json(body);
  } catch (err) {
    return apiErrorFromUnknown('GET /api/spec/list', err, requestId);
  }
}

export const GET = withApiAccess(handleGET, { readOnly: true });
