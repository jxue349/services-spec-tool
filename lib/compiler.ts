import type { ZodType } from 'zod';
import { getCompilerProvider } from './env';
import { SchemaValidationError, parseAndValidate } from './json';
import { bedrockProvider } from './providers/bedrock';
import { gleanProvider } from './providers/glean';
import type { CompilerProvider } from './providers/types';

/**
 * The behavior compiler, independent of which LLM backs it.
 *
 * The provider supplies text; everything that makes the text usable lives
 * here: the JSON-only contract, the strict parse, schema validation, and one
 * corrective retry. Those rules are the same whatever model answers, and
 * duplicating them per provider is how they drift apart.
 */

const JSON_ONLY_SYSTEM = [
  'You are a behavior compiler. You read a Product Behavior Specification and emit',
  'structured representations of it.',
  '',
  'Output contract — this is not negotiable:',
  '- Respond with a single raw JSON object and NOTHING else. No preamble, no',
  '  explanation, no code fences, no closing remark.',
  '- Cite the spec rule IDs that justify every conclusion, in the `rules` fields.',
  '- Never invent a rule. If the spec does not define a behavior, say so explicitly as a',
  '  spec gap rather than guessing what the product probably does.',
  '- Use ONLY the specification given below. Do not use any other company document,',
  '  ticket, wiki page, or message, and do not use general knowledge of how',
  '  subscriptions usually work.',
].join('\n');

const PROVIDERS: Record<string, CompilerProvider> = {
  glean: gleanProvider,
  bedrock: bedrockProvider,
};

export function activeProvider(): CompilerProvider {
  const name = getCompilerProvider();
  const provider = PROVIDERS[name];
  if (provider === undefined) throw new Error(`No compiler provider registered for "${name}"`);
  return provider;
}

/**
 * Sends `prompt`, validates the reply against `schema`, and retries once with
 * the validation error appended if the first reply does not conform.
 *
 * The retry earns its place: no provider here offers guaranteed structured
 * output, so a malformed first reply is a normal event rather than a fault.
 */
export async function compile<T>(prompt: string, schema: ZodType<T>): Promise<T> {
  const provider = activeProvider();

  const first = await provider.complete(JSON_ONLY_SYSTEM, prompt);
  try {
    return parseAndValidate(first, schema);
  } catch (err) {
    const detail =
      err instanceof SchemaValidationError ? err.issues : err instanceof Error ? err.message : String(err);

    const retryPrompt = [
      prompt,
      '',
      '---',
      'Your previous response could not be used. Problem:',
      detail,
      '',
      'Return the corrected result as a single raw JSON object matching the requested',
      'shape exactly. No prose, no code fences.',
    ].join('\n');

    return parseAndValidate(await provider.complete(JSON_ONLY_SYSTEM, retryPrompt), schema);
  }
}
