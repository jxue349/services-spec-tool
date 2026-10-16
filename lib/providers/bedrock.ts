import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import type { ContentBlock, Message } from '@aws-sdk/client-bedrock-runtime';
import { getBedrockEnv } from '../env';
import { COMPILE_MAX_TOKENS, COMPILE_TIMEOUT_MS, isRetryableStatus, isTimeout } from './types';
import type { CompilerProvider } from './types';

/**
 * Amazon Bedrock, via the Converse API.
 *
 * Converse rather than InvokeModel on purpose: it gives one request and
 * response shape across every model Bedrock hosts, so switching between an
 * OpenAI, Anthropic or Amazon model is a change of `BEDROCK_MODEL_ID` and
 * nothing else. InvokeModel would mean a payload branch per vendor.
 *
 * Credentials come from the standard AWS provider chain — environment, shared
 * config file, SSO, or an instance/task role. Deliberately not read or stored
 * by this app: on AWS the right answer is a role with no long-lived secret for
 * anyone to leak, and the SDK already knows how to find one.
 */

export class BedrockError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'BedrockError';
    this.status = status;
  }
}

let cached: { client: BedrockRuntimeClient; region: string } | null = null;

/** Test hook: drops the memoised client so a mocked constructor is picked up. */
export function __resetBedrockClient(): void {
  cached = null;
}

function getClient(region: string): BedrockRuntimeClient {
  if (cached !== null && cached.region === region) return cached.client;
  cached = {
    region,
    client: new BedrockRuntimeClient({
      region,
      // One SDK-level retry; the compiler adds its own corrective retry on top.
      maxAttempts: 2,
      requestHandler: { requestTimeout: COMPILE_TIMEOUT_MS },
    }),
  };
  return cached.client;
}

/** Concatenates the text blocks of a Converse reply. */
export function textFromConverse(output: unknown): string {
  const message = (output as { output?: { message?: Message } } | null)?.output?.message;
  const content: ContentBlock[] = Array.isArray(message?.content) ? message.content : [];

  const text = content
    .map((block) => (typeof (block as { text?: unknown }).text === 'string' ? (block as { text: string }).text : ''))
    .join('')
    .trim();

  if (text === '') throw new BedrockError(502, 'Bedrock returned no text content');
  return text;
}

async function once(systemPrompt: string, userPrompt: string): Promise<string> {
  const { modelId, region, temperature } = getBedrockEnv();

  try {
    const res = await getClient(region).send(
      new ConverseCommand({
        modelId,
        system: [{ text: systemPrompt }],
        messages: [{ role: 'user', content: [{ text: userPrompt }] }],
        inferenceConfig: { maxTokens: COMPILE_MAX_TOKENS, temperature },
      }),
    );
    return textFromConverse(res);
  } catch (err) {
    if (err instanceof BedrockError) throw err;

    // Surface the status only. A Bedrock error can echo the request, and the
    // request contains the whole spec extract.
    const status =
      typeof (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode === 'number'
        ? (err as { $metadata: { httpStatusCode: number } }).$metadata.httpStatusCode
        : 0;
    const name = err instanceof Error ? err.name : 'Error';

    // A wrong or ungranted model id is the most likely first-run failure, and
    // is terminal — say which it is rather than retrying into the same wall.
    if (name === 'ValidationException' || name === 'ResourceNotFoundException') {
      throw new BedrockError(
        400,
        `Bedrock rejected model "${modelId}" in ${region} (${name}). Check BEDROCK_MODEL_ID, the region, and that model access is granted.`,
      );
    }
    if (name === 'AccessDeniedException') {
      throw new BedrockError(403, `Bedrock denied access to "${modelId}" in ${region}. Check the IAM policy and model access.`);
    }
    if (isTimeout(err)) throw err;

    throw new BedrockError(status, `Bedrock request failed (${name}${status ? ` ${status}` : ''})`);
  }
}

export const bedrockProvider: CompilerProvider = {
  name: 'bedrock',

  async complete(systemPrompt, userPrompt) {
    try {
      return await once(systemPrompt, userPrompt);
    } catch (err) {
      const retryable = (err instanceof BedrockError && isRetryableStatus(err.status)) || isTimeout(err);
      if (!retryable) throw err;
      return once(systemPrompt, userPrompt);
    }
  },
};
