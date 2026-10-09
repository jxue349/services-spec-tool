import { NextResponse } from 'next/server';
import { getSpecEnv } from '@/lib/env';
import { apiError, apiErrorFromUnknown, newRequestId } from '@/lib/errors';
import { followersPathFor, parseFollowers } from '@/lib/followers';
import { GAP_LABEL, gapTitle, recallRecentGap, rememberGap } from '@/lib/gaps';
import { createSpecRepoClient } from '@/lib/github';
import { BadRequestError, readJson } from '@/lib/http';
import { checkRateLimit, clientKey } from '@/lib/ratelimit';
import { GapRequestSchema } from '@/lib/schemas';
import type { GapResponse } from '@/lib/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Logs a question the knowledge base could not answer.
 *
 * A question the spec does not cover is the most useful signal this tool
 * produces: it is a real person needing an answer the organisation has not
 * written down. Each one becomes a GitHub issue labelled `kb-gap` so the
 * owners accumulate a reviewable backlog and can decide what to distil into
 * the knowledge base.
 *
 * Issues rather than a pull request: a gap is a question to be answered, not
 * a change to be merged, and it needs somewhere to be discussed before anyone
 * knows what the rule should say.
 */
const GAP_LIMIT_PER_MIN = 10;

/**
 * Recently filed gaps, by title.
 *
 * GitHub's issue list is eventually consistent: an issue created a moment ago
 * is not reliably returned by the next list call, so two identical flags a few
 * seconds apart both look new and both get filed. Observed in practice. This
 * closes that window for the case that actually happens — the same question
 * flagged twice in quick succession.
 *
 * Per-process and short-lived, like the rate limiter: a best-effort guard, not
 * distributed coordination. The API check below remains the real dedupe.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const requestId = newRequestId();

  const limit = checkRateLimit(`gap:${clientKey(req.headers)}`, GAP_LIMIT_PER_MIN);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Too many flags. Retry in ${limit.retryAfterSeconds}s.`, requestId },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  try {
    const body = await readJson(req, GapRequestSchema);
    const env = getSpecEnv();
    const client = createSpecRepoClient(env);

    const title = gapTitle(body.question);

    // Covers the seconds-old duplicate the API list cannot see yet.
    const recent = recallRecentGap(title);
    if (recent !== null) {
      const seen: GapResponse = { issueUrl: recent.url, issueNumber: recent.number, alreadyLogged: true };
      return NextResponse.json(seen);
    }

    // Asking the same thing twice should join the existing issue, not add
    // another row to the owners' backlog.
    const existing = await client.findOpenGapIssue(title, GAP_LABEL);
    if (existing !== null) {
      rememberGap(title, existing);
      const already: GapResponse = { issueUrl: existing.url, issueNumber: existing.number, alreadyLogged: true };
      return NextResponse.json(already);
    }

    const followersFile = await client.getFile(env.baseBranch, followersPathFor(env.parentPath));
    const followers = followersFile === null ? [] : parseFollowers(followersFile.content);

    const issue = await client.createIssue({
      title,
      body: renderGapBody({ ...body, specPath: body.specPath, followers }),
      labels: [GAP_LABEL],
    });

    rememberGap(title, issue);
    const created: GapResponse = { issueUrl: issue.url, issueNumber: issue.number, alreadyLogged: false };
    return NextResponse.json(created);
  } catch (err) {
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

    return apiErrorFromUnknown('POST /api/gaps', err, requestId);
  }
}


function renderGapBody(input: {
  question: string;
  specPath: string;
  specLabel: string;
  answer?: string;
  specGap?: string;
  rulesConsidered?: number;
  rulesRetrieved?: number;
  followers: string[];
}): string {
  const lines = [
    'A question was asked in AI Spec Explorer that the specification could not answer.',
    '',
    '## Question',
    '',
    `> ${input.question.replace(/\n/g, '\n> ')}`,
    '',
    '## Asked against',
    '',
    `\`${input.specPath}\` — ${input.specLabel}`,
    '',
  ];

  if (typeof input.rulesConsidered === 'number') {
    lines.push(
      '## Retrieval',
      '',
      `${input.rulesRetrieved ?? 0} of ${input.rulesConsidered} rules were retrieved as potentially relevant.`,
      'They were searched and none of them settled the question — so this is a genuine',
      'gap rather than a retrieval miss.',
      '',
    );
  }

  if (input.specGap !== undefined && input.specGap.trim() !== '') {
    lines.push('## What is missing', '', input.specGap.trim(), '');
  }

  if (input.answer !== undefined && input.answer.trim() !== '') {
    lines.push('## What the tool said', '', `> ${input.answer.trim().replace(/\n/g, '\n> ')}`, '');
  }

  lines.push(
    '## What to do with this',
    '',
    '- If the answer exists elsewhere, distil it into the knowledge base as a new rule.',
    '- If nobody knows, this is a product decision that needs an owner.',
    '- If the question is out of scope for this spec, close with a note saying where it belongs.',
    '',
  );

  if (input.followers.length > 0) {
    lines.push(`${input.followers.map((f) => `@${f}`).join(' ')} — you follow the parent spec.`, '');
  }

  lines.push('🤖 Logged by [AI Spec Explorer](https://claude.com/claude-code)');
  return lines.join('\n');
}
