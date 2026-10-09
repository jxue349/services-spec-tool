import { getCompilerEnv } from '../env';
import { COMPILE_TIMEOUT_MS, isRetryableStatus, isTimeout } from './types';
import type { CompilerProvider } from './types';

/**
 * Glean Chat as a compiler provider.
 *
 * Server-only. The Glean token is read from the environment here and never
 * crosses the network boundary to the browser.
 *
 * Two things differ from a raw LLM API and shape this module:
 *
 * 1. There is no `system` role. Glean chat messages carry only author +
 *    fragments, so the JSON-only contract is prepended to the user turn.
 * 2. There is no structured-output / JSON-schema mode. Glean Chat is tuned to
 *    return conversational prose, so the extract-then-validate pipeline in
 *    ./json.ts is load-bearing rather than belt-and-braces, and the corrective
 *    retry below does real work.
 */

// --------------------------------------------------------------------------
// Wire types — Glean's documented chat shapes, all fields optional because
// this is untrusted input as far as we are concerned.
// --------------------------------------------------------------------------

type GleanFragment = { text?: unknown };
type GleanMessage = { author?: unknown; messageType?: unknown; fragments?: unknown };
type GleanChatResponse = { messages?: unknown };

export class GleanError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'GleanError';
    this.status = status;
  }
}

/**
 * Pulls the assistant's answer out of a chat response.
 *
 * Glean returns a list of messages that can include non-answer traffic
 * (status/update messages, and with retrieval agents, citation messages), so
 * only GLEAN_AI CONTENT messages count, and their text fragments concatenate
 * to form the reply.
 */
export function extractAnswer(body: unknown): string {
  const messages = (body as GleanChatResponse | null)?.messages;
  if (!Array.isArray(messages)) {
    throw new GleanError(502, 'Glean chat response had no messages array');
  }

  const text = messages
    .filter((message): message is GleanMessage => typeof message === 'object' && message !== null)
    .filter((message) => message.author === undefined || message.author === 'GLEAN_AI')
    .filter((message) => message.messageType === undefined || message.messageType === 'CONTENT')
    .flatMap((message) => (Array.isArray(message.fragments) ? (message.fragments as GleanFragment[]) : []))
    .map((fragment) => (typeof fragment.text === 'string' ? fragment.text : ''))
    .join('')
    .trim();

  if (text === '') throw new GleanError(502, 'Glean chat response contained no answer text');
  return text;
}

// --------------------------------------------------------------------------
// Auth
// --------------------------------------------------------------------------

/** Refresh this far before expiry so an in-flight call can't race the clock. */
const TOKEN_SKEW_MS = 60_000;

let cachedToken: { value: string; expiresAt: number } | null = null;

/** Test hook: drops any cached OAuth token. */
export function __resetGleanAuth(): void {
  cachedToken = null;
}

/**
 * Exchanges the OAuth client for a short-lived access token via the
 * client_credentials grant, using client_secret_basic.
 */
async function fetchClientCredentialsToken(
  baseUrl: string,
  clientId: string,
  clientSecret: string,
  scope: string,
): Promise<{ value: string; expiresAt: number }> {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const res = await fetch(`${baseUrl}/oauth/token`, {
    method: 'POST',
    headers: {
      authorization: `Basic ${basic}`,
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    signal: AbortSignal.timeout(COMPILE_TIMEOUT_MS),
    body: new URLSearchParams({ grant_type: 'client_credentials', scope }).toString(),
  });

  if (!res.ok) {
    // The body can echo the client id; surface the status only.
    throw new GleanError(res.status, `Glean token endpoint returned ${res.status}`);
  }

  const body = (await res.json()) as { access_token?: unknown; expires_in?: unknown };
  if (typeof body.access_token !== 'string' || body.access_token === '') {
    throw new GleanError(502, 'Glean token endpoint returned no access_token');
  }

  const lifetimeMs = (typeof body.expires_in === 'number' ? body.expires_in : 3_600) * 1_000;
  return { value: body.access_token, expiresAt: Date.now() + Math.max(0, lifetimeMs - TOKEN_SKEW_MS) };
}

async function bearerToken(env: ReturnType<typeof getCompilerEnv>): Promise<string> {
  if (env.auth.kind === 'static') return env.auth.apiKey;

  if (cachedToken !== null && Date.now() < cachedToken.expiresAt) return cachedToken.value;

  cachedToken = await fetchClientCredentialsToken(
    env.baseUrl,
    env.auth.clientId,
    env.auth.clientSecret,
    env.auth.scope,
  );
  return cachedToken.value;
}

async function chatOnce(systemPrompt: string, prompt: string): Promise<string> {
  const env = getCompilerEnv();
  const { baseUrl, agent, mode, actAs } = env;

  const headers: Record<string, string> = {
    authorization: `Bearer ${await bearerToken(env)}`,
    'content-type': 'application/json',
  };
  // Required when the token is a global (not user-scoped) Glean token.
  if (actAs !== undefined) headers['X-Glean-ActAs'] = actAs;

  const res = await fetch(`${baseUrl}/rest/api/v1/chat`, {
    method: 'POST',
    headers,
    signal: AbortSignal.timeout(COMPILE_TIMEOUT_MS),
    body: JSON.stringify({
      // Not saved as a named chat: these are one-shot compiles, not a
      // conversation the user will come back to.
      saveChat: false,
      agentConfig: { agent, mode },
      messages: [
        {
          author: 'USER',
          messageType: 'CONTENT',
          fragments: [{ text: `${systemPrompt}\n\n${prompt}` }],
        },
      ],
    }),
  });

  if (!res.ok) {
    // The body may echo request details; never surface it to the client.
    throw new GleanError(res.status, `Glean chat returned ${res.status}`);
  }

  return extractAnswer((await res.json()) as unknown);
}

/** One transport-level retry, matching the previous provider's behavior. */
async function chat(systemPrompt: string, prompt: string): Promise<string> {
  try {
    return await chatOnce(systemPrompt, prompt);
  } catch (err) {
    // A 401 while holding a cached OAuth token means it was revoked or expired
    // early: drop it and try once with a fresh one. A 401 on a static key is
    // fatal — a bad key will not get better.
    if (err instanceof GleanError && err.status === 401 && cachedToken !== null) {
      cachedToken = null;
      return chatOnce(systemPrompt, prompt);
    }

    const retryable = (err instanceof GleanError && isRetryableStatus(err.status)) || isTimeout(err);
    if (!retryable) throw err;
    return chatOnce(systemPrompt, prompt);
  }
}

export const gleanProvider: CompilerProvider = {
  name: 'glean',
  complete: (systemPrompt, userPrompt) => chat(systemPrompt, userPrompt),
};
