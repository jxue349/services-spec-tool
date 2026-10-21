import { withApiAccess } from '@/lib/api-access';
import type { NextResponse } from 'next/server';
import { compile } from '@/lib/compiler';
import { runCompileRoute } from '@/lib/compile-route';
import { stateMachinePrompt } from '@/lib/prompts';
import { SpecOnlyRequestSchema, StateMachineSchema } from '@/lib/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Subscription lifecycle state machine. */
function handlePOST(req: Request): Promise<NextResponse> {
  return runCompileRoute('POST /api/compile/states', req, SpecOnlyRequestSchema, (body) =>
    compile(stateMachinePrompt(body.spec), StateMachineSchema),
  );
}

export const POST = withApiAccess(handlePOST);
