import { withApiAccess } from '@/lib/api-access';
import { NextResponse } from 'next/server';
import { getSpecEnv } from '@/lib/env';
import { apiError, apiErrorFromUnknown, newRequestId } from '@/lib/errors';
import { followersPathFor, parseFollowers } from '@/lib/followers';
import { SpecNotFoundError, createSpecRepoClient } from '@/lib/github';
import { BadRequestError, readJson } from '@/lib/http';
import { NotSignedInError, requireWriteIdentity } from '@/lib/auth/require-user';
import { appendAdditions } from '@/lib/merge-additions';
import { resolveSpecPathValue } from '@/lib/resolve-spec-path';
import { RequestChangeSchema } from '@/lib/schemas';
import type { RequestChangeResponse } from '@/lib/schemas';
import { InvalidSpecPathError } from '@/lib/spec-paths';
import { TEAMS_MANIFEST, buildTeams, parentPathForSpec, parseTeamManifest } from '@/lib/teams';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Requests a change to the parent knowledge base on behalf of a child spec.
 *
 * Opens a pull request against the parent: additions are applied
 * deterministically, contradictions are written into the PR body for the
 * followers to decide. Never commits to the base branch, whatever
 * ALLOW_DIRECT_COMMIT says — the knowledge base is the one document that
 * always gets reviewed.
 */
async function handlePOST(req: Request): Promise<NextResponse> {
  const requestId = newRequestId();
  try {
    const body = await readJson(req, RequestChangeSchema);
    const env = getSpecEnv();
    const childPath = resolveSpecPathValue(body.childPath, env);
    const { author, email } = await requireWriteIdentity();
    const client = createSpecRepoClient(env);

    // A spec's knowledge base is its OWN team's. Using the configured
    // parent would check a hardware spec against the services KB and then
    // merge its rules into the wrong team's document.
    const parentPath = parentPathForSpec(childPath, env.specRoot, env.parentPath);

    const parent = await client.getFile(env.baseBranch, parentPath);
    if (parent === null) throw new SpecNotFoundError(parentPath);

    // Team codes so a proposed `ENT-007` is recognised as already present
    // when the parent now writes it as `SVC-ENT-007`.
    const manifestFile = await client.getFile(env.baseBranch, `${env.specRoot}/${TEAMS_MANIFEST}`);
    const teamCodes = buildTeams(
      await client.listSpecFiles(env.baseBranch, env.specRoot),
      env.specRoot,
      parseTeamManifest(manifestFile?.content ?? null),
    ).map((team) => team.code);

    const merge = appendAdditions(parent.content, body.additions, body.childLabel, teamCodes);

    const contradictions = body.conflicts.filter((c) => c.kind === 'contradiction');
    if (merge.applied.length === 0 && contradictions.length === 0) {
      return apiError(
        400,
        'Nothing to request: no new rules to merge and no contradictions to resolve.',
        requestId,
      );
    }

    // Followers live next to the parent spec. Missing file is fine — the PR
    // still opens, just with nobody explicitly asked.
    const followersFile = await client.getFile(env.baseBranch, followersPathFor(parentPath));
    const followers = followersFile === null ? [] : parseFollowers(followersFile.content);

    const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace(/Z$/, '');
    const branch = `spec/parent-request-${stamp}`;
    const baseHead = await client.getBranchHeadSha(env.baseBranch);
    await client.createBranch(branch, baseHead);

    // Only write the parent when additions actually changed it. A
    // contradiction-only request is a discussion, and an empty commit would
    // have nothing to review.
    if (merge.applied.length > 0) {
      await client.putFile({
        branch,
        path: parentPath,
        content: merge.content,
        message: `spec(parent): merge ${merge.applied.length} rule(s) from ${body.childLabel}`,
        sha: parent.sha,
        ...(author ? { author } : {}),
      });
    } else {
      // Keep the branch non-empty so a PR can exist at all: re-commit the
      // parent unchanged is not possible, so touch the child's own path is
      // wrong too. Instead record the request alongside the parent.
      await client.putFile({
        branch,
        path: `${parentPath.replace(/\.md$/i, '')}.requests/${stamp}.md`,
        content: renderRequestNote(body.childLabel, childPath, contradictions),
        message: `spec(parent): conflict report from ${body.childLabel}`,
        ...(author ? { author } : {}),
      });
    }

    const pr = await client.createPullRequest({
      head: branch,
      title: `spec(parent): ${body.summary}`,
      body: renderPrBody({
        childLabel: body.childLabel,
        childPath,
        applied: merge.applied,
        skipped: merge.skipped,
        conflicts: body.conflicts,
        followers: [],
        requestedBy: email,
      }),
    });

    const { requested, refused } = await client.requestReviewers(pr.number, followers);

    // Anyone GitHub would not accept as a reviewer still gets notified, by
    // being @-mentioned in the body.
    if (refused.length > 0) {
      await client.updatePullRequestBody(
        pr.number,
        renderPrBody({
          childLabel: body.childLabel,
          childPath,
          applied: merge.applied,
          skipped: merge.skipped,
          conflicts: body.conflicts,
          followers: refused,
          requestedBy: email,
        }),
      );
    }

    const result: RequestChangeResponse = {
      prUrl: pr.url,
      branch,
      reviewersRequested: requested,
      reviewersMentioned: refused,
      additionsApplied: merge.applied.length,
    };
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof NotSignedInError) return apiError(401, err.message, requestId);
    if (err instanceof BadRequestError) return apiError(400, err.message, requestId);
    if (err instanceof InvalidSpecPathError) return apiError(400, err.message, requestId);
    if (err instanceof SpecNotFoundError) return apiError(404, err.message, requestId);
    return apiErrorFromUnknown('POST /api/spec/request-change', err, requestId);
  }
}

type Conflict = { kind: string; childRule: string; parentRule: string | null; summary: string; recommendation: string };

function renderRequestNote(childLabel: string, childPath: string, conflicts: Conflict[]): string {
  return [
    `# Conflict report: ${childLabel}`,
    '',
    `Source spec: \`${childPath}\``,
    '',
    'No rules could be merged automatically. The conflicts below need a',
    'decision from the spec owners before the parent can absorb this spec.',
    '',
    ...conflicts.flatMap((c) => [
      `## ${c.childRule} vs ${c.parentRule ?? '(parent is silent)'}`,
      '',
      c.summary,
      '',
      `**Recommendation:** ${c.recommendation}`,
      '',
    ]),
  ].join('\n');
}

function renderPrBody(input: {
  childLabel: string;
  childPath: string;
  applied: string[];
  skipped: string[];
  conflicts: Conflict[];
  followers: string[];
  /** Signed-in requester, when the app knows who that is. */
  requestedBy: string | null;
}): string {
  const contradictions = input.conflicts.filter((c) => c.kind === 'contradiction');

  const lines = [
    input.requestedBy === null
      ? `Requested from the **${input.childLabel}** spec (\`${input.childPath}\`) via AI Spec Explorer.`
      : `Requested by **${input.requestedBy}** from the **${input.childLabel}** spec (\`${input.childPath}\`).`,
    '',
  ];

  if (input.applied.length > 0) {
    lines.push(`## Rules merged into the parent (${input.applied.length})`, '');
    lines.push(...input.applied.map((id) => `- \`${id}\``), '');
  }

  if (input.skipped.length > 0) {
    lines.push(
      `## Already in the parent (${input.skipped.length}) — not re-added`,
      '',
      ...input.skipped.map((id) => `- \`${id}\``),
      '',
    );
  }

  if (contradictions.length > 0) {
    lines.push(
      `## Conflicts needing a decision (${contradictions.length})`,
      '',
      'These were **not** applied. The parent and the child spec disagree, and',
      'which one wins is a product decision, not something the compiler should',
      'settle.',
      '',
      '| Child rule | Parent rule | Disagreement | Recommendation |',
      '| --- | --- | --- | --- |',
      ...contradictions.map(
        (c) =>
          `| \`${c.childRule}\` | \`${c.parentRule ?? '—'}\` | ${inline(c.summary)} | ${inline(c.recommendation)} |`,
      ),
      '',
    );
  }

  if (input.followers.length > 0) {
    lines.push(
      '## Followers',
      '',
      `${input.followers.map((name) => `@${name}`).join(' ')} — you follow the parent spec.`,
      'GitHub would not let me add you as a reviewer (that needs write access),',
      'so this mention is the notification.',
      '',
    );
  }

  lines.push('🤖 Generated with [Claude Code](https://claude.com/claude-code)');
  return lines.join('\n');
}

/** Table cells cannot contain pipes or newlines. */
function inline(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim();
}

export const POST = withApiAccess(handlePOST);
