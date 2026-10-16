import { NextResponse } from 'next/server';
import { getSpecEnv } from '@/lib/env';
import { apiError, apiErrorFromUnknown, newRequestId } from '@/lib/errors';
import { NEW_FILE_SHA, SpecConflictError, commitSpec, createSpecRepoClient } from '@/lib/github';
import { BadRequestError, readJson } from '@/lib/http';
import { NotSignedInError, requireWriteIdentity } from '@/lib/auth/require-user';
import { UploadRejected, uploadPathFor, validateUpload } from '@/lib/spec-files';
import { resolveSpecPathValue } from '@/lib/resolve-spec-path';
import { UploadRequestSchema } from '@/lib/schemas';
import { InvalidSpecPathError } from '@/lib/spec-paths';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Uploads a new spec as version 1.
 *
 * Goes out as a branch and pull request like every other spec change — a new
 * spec entering the repo is a product-truth change too, and the first version
 * deserves the same review as the hundredth. That also means an upload never
 * silently overwrites: a name already in use comes back as a conflict rather
 * than replacing someone's document.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const requestId = newRequestId();
  try {
    const body = await readJson(req, UploadRequestSchema);
    const env = getSpecEnv();

    validateUpload(body.filename, body.content);

    // Build the path from the name, then run it through the same validator
    // every client-supplied path goes through.
    const specPath = resolveSpecPathValue(uploadPathFor(env.specRoot, body.name), env);

    const { author } = await requireWriteIdentity();
    const client = createSpecRepoClient(env);

    const result = await commitSpec(client, env, {
      ...(author ? { author } : {}),
      specPath,
      content: body.content,
      // Asserting the file is new: if it exists, this comes back a conflict.
      baseSha: NEW_FILE_SHA,
      commitMessage: `spec: add ${body.name} v1`,
      prTitle: `spec: add ${body.name}`,
      prBody: [
        `Uploads **${body.name}** as a new specification.`,
        '',
        `Source file: \`${body.filename}\``,
        `Path: \`${specPath}\``,
        '',
        body.note?.trim() ? `${body.note.trim()}\n` : '',
        'Review the behavior, not just the prose — everything downstream compiles',
        'from this file, and the Compare tab will check it against the knowledge base',
        'once it lands.',
        '',
        '🤖 Uploaded via AI Spec Explorer',
      ].join('\n'),
    });

    return NextResponse.json({ ...result, specPath });
  } catch (err) {
    if (err instanceof NotSignedInError) return apiError(401, err.message, requestId);
    if (err instanceof BadRequestError) return apiError(400, err.message, requestId);
    if (err instanceof UploadRejected) return apiError(400, err.message, requestId);
    if (err instanceof InvalidSpecPathError) return apiError(400, err.message, requestId);

    if (err instanceof SpecConflictError) {
      return apiError(
        409,
        'A spec with that name already exists. Pick a different name, or select it and check in a change instead.',
        requestId,
      );
    }

    return apiErrorFromUnknown('POST /api/spec/upload', err, requestId);
  }
}
