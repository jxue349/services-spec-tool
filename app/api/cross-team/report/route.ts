import { NextResponse } from 'next/server';
import { NotSignedInError, requireWriteIdentity } from '@/lib/auth/require-user';
import {
  CROSS_TEAM_LABEL,
  CROSS_TEAM_MARKER_NAME,
  conflictKey,
  conflictTitle,
  recallRecentConflict,
  rememberConflict,
  renderConflictBody,
} from '@/lib/cross-team';
import { getSpecEnv } from '@/lib/env';
import { apiError, apiErrorFromUnknown, newRequestId } from '@/lib/errors';
import { followersPathFor, parseFollowers } from '@/lib/followers';
import { createSpecRepoClient } from '@/lib/github';
import { BadRequestError, readJson } from '@/lib/http';
import { checkRateLimit, clientKey } from '@/lib/ratelimit';
import { CrossTeamReportSchema } from '@/lib/schemas';
import type { CrossTeamReportResponse } from '@/lib/schemas';
import { TEAMS_MANIFEST, buildTeams, parseTeamManifest } from '@/lib/teams';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Files a cross-team contradiction with the team that owns the rule.
 *
 * This is the write half of the multi-team permission model, and it is
 * deliberately the weakest write there is: an issue on the owning team's
 * knowledge base. One team may raise a conflict against another's spec
 * without holding write access to it, because nothing in their spec changes
 * — the report names both rules and leaves the decision to the owners.
 *
 * Anything stronger (editing another team's rules, merging into their
 * knowledge base) stays out. A team's rules are changed only by that team.
 */
const REPORT_LIMIT_PER_MIN = 10;

export async function POST(req: Request): Promise<NextResponse> {
  const requestId = newRequestId();

  const limit = checkRateLimit(`cross-team:${clientKey(req.headers)}`, REPORT_LIMIT_PER_MIN);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Too many reports. Retry in ${limit.retryAfterSeconds}s.`, requestId },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  try {
    const body = await readJson(req, CrossTeamReportSchema);
    const { email } = await requireWriteIdentity();
    const env = getSpecEnv();
    const client = createSpecRepoClient(env);

    const paths = await client.listSpecFiles(env.baseBranch, env.specRoot);
    const manifestFile = await client.getFile(env.baseBranch, `${env.specRoot}/${TEAMS_MANIFEST}`);
    const teams = buildTeams(paths, env.specRoot, parseTeamManifest(manifestFile?.content ?? null));

    // The owning team must be a team that actually exists in the repo. A slug
    // from the client decides which followers get notified, so it is resolved
    // against the folder structure rather than trusted.
    const owning = teams.find((team) => team.slug === body.owningTeamSlug);
    if (owning === undefined) {
      return apiError(400, `No team named "${body.owningTeamSlug}" owns a knowledge base in this repo.`, requestId);
    }
    const reporting = teams.find((team) => team.slug === body.reportingTeamSlug);

    // Covers the seconds-old duplicate the GitHub list cannot see yet.
    const recent = recallRecentConflict(body.positions);
    if (recent !== null) {
      const seen: CrossTeamReportResponse = {
        issueUrl: recent.url,
        issueNumber: recent.number,
        alreadyLogged: true,
        owningTeam: owning.name,
      };
      return NextResponse.json(seen);
    }

    // The same contradiction found by two people is one conflict, not two.
    const existing = await client.findOpenIssueByMarker(
      conflictKey(body.positions),
      CROSS_TEAM_MARKER_NAME,
      CROSS_TEAM_LABEL,
    );
    if (existing !== null) {
      rememberConflict(body.positions, existing);
      const already: CrossTeamReportResponse = {
        issueUrl: existing.url,
        issueNumber: existing.number,
        alreadyLogged: true,
        owningTeam: owning.name,
      };
      return NextResponse.json(already);
    }

    // Followers of the OWNING team's knowledge base, not the reporter's.
    const followersFile = await client.getFile(env.baseBranch, followersPathFor(owning.parentPath));
    const followers = followersFile === null ? [] : parseFollowers(followersFile.content);

    const issue = await client.createIssue({
      title: conflictTitle(body.topic),
      body: renderConflictBody({
        topic: body.topic,
        positions: body.positions,
        ...(body.impact !== undefined ? { impact: body.impact } : {}),
        ...(body.question !== undefined ? { question: body.question } : {}),
        ...(body.note !== undefined ? { note: body.note } : {}),
        owningTeam: owning.name,
        ...(reporting !== undefined ? { reportingTeam: reporting.name } : {}),
        reportedBy: email,
        followers,
      }),
      labels: [CROSS_TEAM_LABEL],
    });

    rememberConflict(body.positions, issue);
    const created: CrossTeamReportResponse = {
      issueUrl: issue.url,
      issueNumber: issue.number,
      alreadyLogged: false,
      owningTeam: owning.name,
    };
    return NextResponse.json(created);
  } catch (err) {
    if (err instanceof NotSignedInError) return apiError(401, err.message, requestId);
    if (err instanceof BadRequestError) return apiError(400, err.message, requestId);

    // Issues need their own permission; the spec flow does not use it, so a
    // token scoped only for specs fails here and nowhere else.
    const status = typeof (err as { status?: unknown })?.status === 'number' ? (err as { status: number }).status : 0;
    if (status === 403 || status === 404) {
      return apiError(
        502,
        'Could not open an issue. The GitHub token needs "Issues: read and write" in addition to Contents and Pull requests.',
        requestId,
      );
    }

    return apiErrorFromUnknown('POST /api/cross-team/report', err, requestId);
  }
}
