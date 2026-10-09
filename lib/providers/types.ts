/**
 * A compiler provider does one thing: turn a system prompt plus a user prompt
 * into text.
 *
 * Everything that makes the output *usable* — the JSON-only contract, fence
 * stripping, schema validation, the corrective retry — lives once in
 * lib/compiler.ts rather than in each provider. Adding a provider should mean
 * adding a transport, not re-deriving the parsing rules.
 */
export interface CompilerProvider {
  /** Human-readable name, used in error messages and logs. */
  readonly name: string;
  complete(systemPrompt: string, userPrompt: string): Promise<string>;
}

export const COMPILE_TIMEOUT_MS = 30_000;
export const COMPILE_MAX_TOKENS = 2_000;

/** Status codes worth one retry: transient rather than terminal. */
export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/** An abort or timeout, whatever the transport called it. */
export function isTimeout(err: unknown): boolean {
  return err instanceof Error && /abort|timeout|timed out/i.test(err.name + err.message);
}
