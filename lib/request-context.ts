import { AsyncLocalStorage } from 'node:async_hooks';
import type { SessionUser } from './auth/session';

type Context = { user: SessionUser | null; signal: AbortSignal };
const context = new AsyncLocalStorage<Context>();
export const REQUEST_BUDGET_MS = 120_000;

export function requestUser(): SessionUser | null | undefined {
  return context.getStore()?.user;
}

export function requestSignal(timeoutMs?: number): AbortSignal | undefined {
  const signal = context.getStore()?.signal;
  signal?.throwIfAborted();
  if (timeoutMs === undefined) return signal;
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export function throwIfRequestAborted(): void {
  context.getStore()?.signal.throwIfAborted();
}

export async function withRequestDeadline<T>(
  req: Request,
  user: SessionUser | null,
  handler: () => Promise<T>,
  budgetMs = REQUEST_BUDGET_MS,
): Promise<T> {
  const controller = new AbortController();
  const signal = AbortSignal.any([req.signal, controller.signal]);
  const timer = setTimeout(() => controller.abort(new DOMException('Request deadline exceeded', 'TimeoutError')), budgetMs);
  timer.unref?.();
  let onAbort: () => void = () => undefined;
  try {
    signal.throwIfAborted();
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () => reject(signal.reason);
      signal.addEventListener('abort', onAbort, { once: true });
    });
    return await context.run({ user, signal }, () => Promise.race([Promise.resolve().then(handler), aborted]));
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
    controller.abort(new DOMException('Request completed', 'AbortError'));
  }
}
