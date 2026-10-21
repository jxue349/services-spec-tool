import { requireWriteIdentity } from '@/lib/auth/require-user';
import { withApiAccess } from '@/lib/api-access';
import { NextResponse } from 'next/server';
import { getSpecEnv } from '@/lib/env';
import { apiError, apiErrorFromUnknown, newRequestId } from '@/lib/errors';
import { NEW_FILE_SHA, SpecConflictError, commitSpec, createSpecRepoClient } from '@/lib/github';
import { SEED_COMMIT_MESSAGE, SEED_PR_BODY, SEED_PR_TITLE, SEED_SPEC } from '@/lib/seed-spec';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * "Initialize spec in repo" — commits the starter spec through the same
 * branch + PR flow as any other spec change, so the first version is reviewed
 * like every version after it.
 */
async function handlePOST(): Promise<NextResponse> {
  const requestId = newRequestId();
  try {
    const { author } = await requireWriteIdentity();
    const env = getSpecEnv();
    const client = createSpecRepoClient(env);
    const result = await commitSpec(client, env, {
      specPath: env.parentPath,
      content: SEED_SPEC,
      baseSha: NEW_FILE_SHA,
      commitMessage: SEED_COMMIT_MESSAGE,
      prTitle: SEED_PR_TITLE,
      prBody: SEED_PR_BODY,
      author,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof SpecConflictError) {
      return apiError(409, 'The spec file already exists upstream — pull latest instead.', requestId);
    }
    return apiErrorFromUnknown('POST /api/spec/init', err, requestId);
  }
}

export const POST = withApiAccess(handlePOST);
