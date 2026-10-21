import { withApiAccess } from '@/lib/api-access';
import type { NextResponse } from 'next/server';
import { compile } from '@/lib/compiler';
import { runCompileRoute } from '@/lib/compile-route';
import { testMatrixPrompt } from '@/lib/prompts';
import { SpecOnlyRequestSchema, TestMatrixSchema } from '@/lib/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** QA test matrix, weighted toward behavior the prototype never visualized. */
function handlePOST(req: Request): Promise<NextResponse> {
  return runCompileRoute('POST /api/compile/tests', req, SpecOnlyRequestSchema, (body) =>
    compile(testMatrixPrompt(body.spec), TestMatrixSchema),
  );
}

export const POST = withApiAccess(handlePOST, { readOnly: true });
