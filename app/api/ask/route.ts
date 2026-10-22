import { withApiAccess } from '@/lib/api-access';
import { NextResponse } from 'next/server';
import { compile } from '@/lib/compiler';
import { getSpecEnv } from '@/lib/env';
import { apiError, apiErrorFromUnknown, logServerError, newRequestId } from '@/lib/errors';
import { createSpecRepoClient } from '@/lib/github';
import { BadRequestError, readJson } from '@/lib/http';
import { JsonExtractionError, SchemaValidationError } from '@/lib/json';
import { askPrompt, federatedAskPrompt } from '@/lib/prompts';
import { checkRateLimit, clientKey } from '@/lib/ratelimit';
import { resolveSpecPathValue } from '@/lib/resolve-spec-path';
import { InvalidSpecPathError } from '@/lib/spec-paths';
import { AskRequestSchema, AskResponseSchema } from '@/lib/schemas';
import type { AskResult, RetrievedRule, TeamRetrieval } from '@/lib/schemas';
import { askCompanyKnowledge } from '@/lib/providers/glean-knowledge';
import { parseRuleBlocks, renderContext, retrieveContext } from '@/lib/spec-retrieval';
import { retrieveAcrossTeams, renderFederatedContext } from '@/lib/federated-retrieval';
import { loadOneTeamKnowledge, loadTeamKnowledge } from '@/lib/team-knowledge';
import { parseRegister, resolveStatus } from '@/lib/register';

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
 * Three scopes. `spec` reads the one document the editor sent. `team` reads
 * a whole team's knowledge base, loaded server-side because the folder
 * layout has no single document to send. `teams` reads across every team at
 * once — the federated read from docs/multi-team.md, for questions no single
 * team's document answers. Reading is federated; writing never is, and no
 * route that changes a spec accepts a scope at all.
 *
 * A higher rate limit than the compile routes: asking a question is the cheap,
 * frequent action here, not an occasional heavyweight compile.
 */
const ASK_LIMIT_PER_MIN = 40;
/** Lower: a federated question reads every team's parent out of GitHub. */
const FEDERATED_LIMIT_PER_MIN = 15;

/** Keeps the rule text shown in the UI to a readable length. */
function trim(text: string): string {
  return text.length > 400 ? `${text.slice(0, 397)}…` : text;
}

function tooMany(retryAfterSeconds: number, requestId: string): NextResponse {
  return NextResponse.json(
    { error: `Too many questions. Retry in ${retryAfterSeconds}s.`, requestId },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
  );
}

async function handlePOST(req: Request): Promise<NextResponse> {
  const requestId = newRequestId();

  const key = clientKey();

  // Before parsing, not after: this gate is what stops a flood of 100 KB
  // bodies from being parsed at all.
  const limit = checkRateLimit(`ask:${key}`, ASK_LIMIT_PER_MIN);
  if (!limit.ok) return tooMany(limit.retryAfterSeconds, requestId);

  try {
    const body = await readJson(req, AskRequestSchema);
    const federated = body.scope === 'teams';

    // Federated questions get a second, tighter budget of their own: each one
    // reads every team's parent out of GitHub, so they are far from free.
    if (federated) {
      const fed = checkRateLimit(`ask:teams:${key}`, FEDERATED_LIMIT_PER_MIN);
      if (!fed.ok) return tooMany(fed.retryAfterSeconds, requestId);
    }

    const result = federated
      ? await askAcrossTeams(body.spec, body.question, body.specPath)
      : body.scope === 'team' && body.teamSlug !== undefined
        ? await askOneTeam(body.teamSlug, body.question, body.specLabel, body.specPath, body.spec)
        : await askOneSpec(body.spec, body.question, body.specLabel, body.teamCodes ?? []);

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof BadRequestError) return apiError(400, err.message, requestId);
    if (err instanceof InvalidSpecPathError) return apiError(400, err.message, requestId);

    if (err instanceof SchemaValidationError || err instanceof JsonExtractionError) {
      logServerError(requestId, 'POST /api/ask', err);
      return apiError(502, 'The answer came back in an unusable shape, twice. Try rephrasing.', requestId);
    }

    return apiErrorFromUnknown('POST /api/ask', err, requestId);
  }
}

async function askOneSpec(
  spec: string,
  question: string,
  specLabel: string,
  teamCodes: readonly string[],
): Promise<AskResult> {
  const context = retrieveContext(spec, question, undefined, teamCodes);
  const rendered = renderContext(context, spec);

  // Surfaced to the client so the answer can be checked against its sources.
  const retrievedRules: RetrievedRule[] = context.blocks.slice(0, 12).map((block) => ({
    ruleId: block.id,
    section: block.section,
    status: block.status ?? 'unknown',
    text: trim(block.text),
  }));

  // Nothing in the spec matched. Answer that honestly rather than sending an
  // empty extract and letting the model improvise from the question alone.
  if (!context.wholeDocument && context.blocks.length === 0) {
    return {
      headline: 'This specification does not cover that.',
      answer: 'No rule in the document matched the question, so there is nothing here to answer from.',
      keyFacts: [],
      citations: [],
      confidence: 'none',
      specGap: 'The specification defines no rule covering this question.',
      caveat: null,
      retrieval: { rulesConsidered: parseRuleBlocks(spec).length, rulesSent: 0, wholeDocument: false },
      retrievedRules: [],
      // Even with nothing in the spec, company knowledge may know.
      companyKnowledge: await askCompanyKnowledge(question),
    };
  }

  // Run both at once: the spec answer and the separate second opinion.
  // The knowledge lookup resolves to null on any failure, so it can never
  // take down an answer the specification already gave.
  const [answer, companyKnowledge] = await Promise.all([
    compile(askPrompt(rendered, question, specLabel), AskResponseSchema),
    askCompanyKnowledge(question),
  ]);

  return {
    ...answer,
    retrieval: {
      rulesConsidered: parseRuleBlocks(spec).length,
      rulesSent: context.wholeDocument ? parseRuleBlocks(spec).length : context.blocks.length,
      wholeDocument: context.wholeDocument,
    },
    retrievedRules,
    companyKnowledge,
  };
}

/**
 * One team's whole knowledge base.
 *
 * Loaded server-side because the folder layout has no single document: the
 * Services base is sixteen rule files plus a register, and status is a join
 * between the two — a rule carries `refs: V-25` and only the register knows
 * whether V-25 is still open.
 */
async function askOneTeam(
  slug: string,
  question: string,
  specLabel: string,
  draftPath?: string,
  draftContent?: string,
): Promise<AskResult> {
  const env = getSpecEnv();
  const client = createSpecRepoClient(env);

  // Validate before it reaches GitHub, exactly as any other path would be.
  const safePath = draftPath === undefined ? undefined : resolveSpecPathValue(draftPath, env);
  const draft =
    safePath === undefined || draftContent === undefined
      ? undefined
      : { path: safePath, content: draftContent };

  const team = await loadOneTeamKnowledge(client, env, slug, draft);
  if (team === null) {
    return {
      headline: 'That team has no readable knowledge base.',
      answer: `No rule files could be read for "${slug}".`,
      keyFacts: [],
      citations: [],
      confidence: 'none',
      specGap: 'The team defines no rules this tool can read.',
      caveat: null,
      retrieval: { rulesConsidered: 0, rulesSent: 0, wholeDocument: false },
      retrievedRules: [],
      companyKnowledge: await askCompanyKnowledge(question),
    };
  }

  const register = parseRegister(team.register ?? null);
  const context = retrieveContext(team.content, question, undefined, [team.code]);
  const considered = parseRuleBlocks(team.content).length;

  if (!context.wholeDocument && context.blocks.length === 0) {
    return {
      headline: `${team.name}’s knowledge base does not cover that.`,
      answer: 'No rule matched the question, so there is nothing here to answer from.',
      keyFacts: [],
      citations: [],
      confidence: 'none',
      specGap: 'The knowledge base defines no rule covering this question.',
      caveat: null,
      retrieval: { rulesConsidered: considered, rulesSent: 0, wholeDocument: false },
      retrievedRules: [],
      companyKnowledge: await askCompanyKnowledge(question),
    };
  }

  // Status comes from the register, not the rule text. A rule whose open
  // register item is still unresolved must be caveated (README GOV-5).
  const retrievedRules: RetrievedRule[] = context.blocks.slice(0, 16).map((block) => ({
    ruleId: block.id,
    section: block.section,
    status: resolveStatus(block, register) ?? 'unknown',
    text: trim(block.text),
  }));

  const [answer, companyKnowledge] = await Promise.all([
    compile(askPrompt(renderContext(context, team.content), question, specLabel), AskResponseSchema),
    askCompanyKnowledge(question),
  ]);

  return {
    ...answer,
    retrieval: {
      rulesConsidered: considered,
      rulesSent: context.wholeDocument ? considered : context.blocks.length,
      wholeDocument: context.wholeDocument,
    },
    retrievedRules,
    companyKnowledge,
  };
}

/**
 * Federated read across every team's knowledge base.
 *
 * The answer may span teams and may report that two of them disagree; what it
 * may never do is change anything. Every write path stays scoped to the
 * owning team — this function only reads.
 */
async function askAcrossTeams(draft: string, question: string, draftPath?: string): Promise<AskResult> {
  const env = getSpecEnv();
  const client = createSpecRepoClient(env);

  // Validate before it reaches GitHub, exactly as any other path would be.
  // It is only used to match a team's parent, but it arrived from a client.
  const safePath = draftPath === undefined ? undefined : resolveSpecPathValue(draftPath, env);

  const specs = await loadTeamKnowledge(
    client,
    env,
    safePath === undefined ? undefined : { path: safePath, content: draft },
  );

  const context = retrieveAcrossTeams(specs, question);
  const teams: TeamRetrieval[] = context.perTeam;

  const totalConsidered = context.perTeam.reduce((sum, t) => sum + t.rulesConsidered, 0);

  if (context.blocks.length === 0) {
    return {
      headline: 'No team’s knowledge base covers that.',
      answer: `Searched ${specs.length} knowledge base${specs.length === 1 ? '' : 's'} and no rule matched the question.`,
      keyFacts: [],
      citations: [],
      confidence: 'none',
      specGap: 'No team defines a rule covering this question.',
      caveat: null,
      retrieval: { rulesConsidered: totalConsidered, rulesSent: 0, wholeDocument: false, teams },
      retrievedRules: [],
      companyKnowledge: await askCompanyKnowledge(question),
    };
  }

  const rendered = renderFederatedContext(context);
  const teamNames = context.perTeam.filter((t) => t.rulesSent > 0).map((t) => t.name);

  const [answer, companyKnowledge] = await Promise.all([
    compile(federatedAskPrompt(rendered, question, teamNames), AskResponseSchema),
    askCompanyKnowledge(question),
  ]);

  const retrievedRules: RetrievedRule[] = context.blocks.slice(0, 16).map((block) => ({
    ruleId: block.id,
    section: block.section,
    status: block.status ?? 'unknown',
    text: trim(block.text),
    team: { slug: block.teamSlug, name: block.teamName, code: block.teamCode },
  }));

  return {
    ...answer,
    retrieval: {
      rulesConsidered: totalConsidered,
      rulesSent: context.blocks.length,
      wholeDocument: false,
      teams,
    },
    retrievedRules,
    companyKnowledge,
  };
}

export const POST = withApiAccess(handlePOST, { readOnly: true });
