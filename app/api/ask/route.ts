import { NextResponse } from 'next/server';
import { compile } from '@/lib/glean';
import { apiError, apiErrorFromUnknown, logServerError, newRequestId } from '@/lib/errors';
import { BadRequestError, readJson } from '@/lib/http';
import { JsonExtractionError, SchemaValidationError } from '@/lib/json';
import { askPrompt } from '@/lib/prompts';
import { checkRateLimit, clientKey } from '@/lib/ratelimit';
import { AskRequestSchema, AskResponseSchema } from '@/lib/schemas';
import type { AskResult, RetrievedRule } from '@/lib/schemas';
import { parseRuleBlocks, renderContext, retrieveContext } from '@/lib/spec-retrieval';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Ask — the main question surface for support and for users of this tool.
 *
 * Unlike the compilers, this does not send the whole spec. The parent
 * knowledge base is 74 KB and growing; retrieval selects the rules that bear
 * on the question so the prompt stays small, answers stay fast, and the model
 * is not asked to find a needle in a document it half-reads.
 *
 * A higher rate limit than the compile routes: asking a question is the cheap,
 * frequent action here, not an occasional heavyweight compile.
 */
const ASK_LIMIT_PER_MIN = 40;

export async function POST(req: Request): Promise<NextResponse> {
  const requestId = newRequestId();

  const limit = checkRateLimit(`ask:${clientKey(req.headers)}`, ASK_LIMIT_PER_MIN);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Too many questions. Retry in ${limit.retryAfterSeconds}s.`, requestId },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  try {
    const body = await readJson(req, AskRequestSchema);

    const context = retrieveContext(body.spec, body.question);
    const rendered = renderContext(context, body.spec);

    // Surfaced to the client so the answer can be checked against its sources.
    const retrievedRules: RetrievedRule[] = context.blocks.slice(0, 12).map((block) => ({
      ruleId: block.id,
      section: block.section,
      status: block.status ?? 'unknown',
      text: block.text.length > 400 ? `${block.text.slice(0, 397)}…` : block.text,
    }));

    // Nothing in the spec matched. Answer that honestly rather than sending an
    // empty extract and letting the model improvise from the question alone.
    if (!context.wholeDocument && context.blocks.length === 0) {
      const empty: AskResult = {
        answer:
          'Nothing in this specification addresses that question — no rule in the document matched it.',
        citations: [],
        confidence: 'none',
        specGap: 'The specification defines no rule covering this question.',
        caveat: null,
        retrieval: { rulesConsidered: parseRuleBlocks(body.spec).length, rulesSent: 0, wholeDocument: false },
        retrievedRules: [],
      };
      return NextResponse.json(empty);
    }

    const answer = await compile(askPrompt(rendered, body.question, body.specLabel), AskResponseSchema);

    const result: AskResult = {
      ...answer,
      retrieval: {
        rulesConsidered: parseRuleBlocks(body.spec).length,
        rulesSent: context.wholeDocument ? parseRuleBlocks(body.spec).length : context.blocks.length,
        wholeDocument: context.wholeDocument,
      },
      retrievedRules,
    };
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof BadRequestError) return apiError(400, err.message, requestId);

    if (err instanceof SchemaValidationError || err instanceof JsonExtractionError) {
      logServerError(requestId, 'POST /api/ask', err);
      return apiError(502, 'The answer came back in an unusable shape, twice. Try rephrasing.', requestId);
    }

    return apiErrorFromUnknown('POST /api/ask', err, requestId);
  }
}
