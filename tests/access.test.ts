import { readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';
import { withApiAccess } from '@/lib/api-access';
import { assertAuthConfiguration } from '@/lib/auth/access';
import { requireWriteIdentity } from '@/lib/auth/require-user';
import { validateRuntimeConfiguration } from '@/lib/runtime-config';
import { requestSignal, requestUser, withRequestDeadline } from '@/lib/request-context';
import { clientKey } from '@/lib/ratelimit';
import { askCompanyKnowledge } from '@/lib/providers/glean-knowledge';
import { readJson } from '@/lib/http';
import { z } from 'zod';
import { logServerError, redact } from '@/lib/errors';
import { JsonExtractionError } from '@/lib/json';

const currentUser = vi.hoisted(() => vi.fn());
const grant = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/session', () => ({ currentUser, createSessionToken: vi.fn(), SESSION_COOKIE: 'spec_session', sessionCookieOptions: {} }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: JSON.stringify({ codeVerifier: 'verifier', state: 'state', nonce: 'nonce' }) }) }) }));
vi.mock('openid-client', async (importOriginal) => ({ ...await importOriginal<typeof import('openid-client')>(), authorizationCodeGrant: grant }));
vi.mock('@/lib/auth/oidc', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/auth/oidc')>(), oidcConfig: vi.fn(async () => ({})) }));

beforeEach(() => {
  vi.stubEnv('AUTH_MODE', 'oidc');
  vi.stubEnv('DEV_AUTH_BYPASS', 'false');
  vi.stubEnv('OIDC_ISSUER', 'https://identity.example.com');
  vi.stubEnv('OIDC_CLIENT_ID', 'test-client');
  vi.stubEnv('OIDC_CLIENT_SECRET', 'test-secret');
  vi.stubEnv('SESSION_SECRET', 'x'.repeat(48));
  vi.stubEnv('APP_BASE_URL', 'https://internal-specs.wyze.com');
  vi.stubEnv('OIDC_ALLOWED_EMAIL_DOMAINS', 'wyze.com');
  currentUser.mockResolvedValue(null);
});

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });

const base = 'https://internal-specs.wyze.com';

describe('API access boundary', () => {
  const routes = readdirSync(resolve('app/api'), { recursive: true })
    .filter((entry): entry is string => typeof entry === 'string' && entry.endsWith('/route.ts'))
    .filter((entry) => !entry.startsWith('auth/') && !entry.startsWith('healthz/'));

  it.each(routes)('rejects unauthenticated %s before external calls', async (route) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const modulePath = relative(resolve('tests'), resolve('app/api', route));
    const routesModule = await import(/* @vite-ignore */ modulePath) as Record<string, (req: Request) => Promise<Response>>;
    for (const method of ['GET', 'POST']) {
      const handler = routesModule[method];
      if (!handler) continue;
      const response = await handler(new Request(`${base}/api/${route.replace('/route.ts', '')}`, { method }));
      expect(response.status).toBe(401);
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires the configured origin and uses validated user identity', async () => {
    const user = { sub: 'subject-1', email: 'staff@wyze.com', name: 'Staff' };
    currentUser.mockResolvedValue(user);
    const handler = vi.fn(async () => NextResponse.json({ key: clientKey(), sub: requestUser()?.sub }));
    const route = withApiAccess(handler);
    for (const origin of [undefined, 'null', 'https://attacker.example']) {
      const res = await route(new Request(`${base}/api/spec/init`, { method: 'POST', headers: origin ? { origin } : {} }));
      expect(res.status).toBe(403);
    }
    expect(handler).not.toHaveBeenCalled();
    const res = await route(new Request(`${base}/api/ask`, { method: 'POST', headers: { origin: base, 'x-forwarded-for': 'spoofed' } }));
    expect(await res.json()).toEqual({ key: 'user:subject-1', sub: 'subject-1' });
  });

  it('rejects a session whose email no longer belongs to an allowed domain', async () => {
    currentUser.mockResolvedValue({ sub: 'guest', email: 'guest@example.com', name: 'Guest' });
    const handler = vi.fn(async () => NextResponse.json({ ok: true }));
    expect((await withApiAccess(handler)(new Request(base))).status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it('uses the registered HTTPS callback behind an HTTP reverse proxy', async () => {
    grant.mockResolvedValue({ claims: () => undefined });
    const { GET } = await import('@/app/api/auth/callback/route');
    const response = await GET(new Request('http://task:3000/api/auth/callback?code=example&state=state', {
      headers: { 'x-forwarded-host': 'attacker.example' },
    }));
    expect(grant.mock.calls.at(-1)?.[1].toString()).toBe(`${base}/api/auth/callback?code=example&state=state`);
    expect(response.headers.get('location')).toBe(`${base}/?auth_error=no_claims`);
  });
});

describe('temporary read-only testing', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('AUTH_MODE', 'test-readonly');
    for (const key of ['OIDC_ISSUER', 'OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET', 'GITHUB_TOKEN', 'GLEAN_API_KEY', 'GLEAN_CLIENT_ID', 'GLEAN_CLIENT_SECRET']) {
      vi.stubEnv(key, '');
    }
    vi.stubEnv('ALLOW_DIRECT_COMMIT', 'false');
    vi.stubEnv('COMPILER_PROVIDER', 'glean');
    vi.stubEnv('GLEAN_INSTANCE', 'wyze');
  });

  it('starts without SSO or integration credentials and reports setup status without a user', async () => {
    validateRuntimeConfiguration();
    currentUser.mockResolvedValue({ sub: 'old-session', email: 'staff@wyze.com', name: 'Staff' });
    const { GET } = await import('@/app/api/auth/me/route');
    const response = await GET(new Request(`${base}/api/auth/me`));
    expect(await response.json()).toEqual({ authConfigured: false, authMode: 'test-readonly', integrations: { github: false, compiler: false }, user: null });
  });

  it.each(['spec/upload', 'spec/commit', 'spec/init', 'spec/request-change', 'cross-team/report', 'gaps'])('blocks %s before parsing or external calls even with an old session', async (path) => {
    currentUser.mockResolvedValue({ sub: 'old-session', email: 'staff@wyze.com', name: 'Staff' });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { POST } = await import(/* @vite-ignore */ `../app/api/${path}/route.ts`);
    const response = await POST(new Request(`${base}/api/${path}`, { method: 'POST', headers: { origin: base }, body: 'invalid JSON' }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('read-only test mode') });
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(requireWriteIdentity()).rejects.toMatchObject({ status: 403 });
  });

  it('permits explicitly read-only model POSTs, keeps origin checks, and denies unclassified routes', async () => {
    const handler = vi.fn(async () => NextResponse.json({ key: clientKey(), user: requestUser() }));
    const route = withApiAccess(handler, { readOnly: true });
    const req = new Request(`${base}/api/compile/tests`, { method: 'POST', headers: { origin: base } });
    const response = await route(req);
    expect(await response.json()).toEqual({ key: 'shared-readonly-test', user: null });
    expect((await route(new Request(req.url, { method: 'POST' }))).status).toBe(403);
    expect((await withApiAccess(handler)(new Request(base))).status).toBe(403);
  });

  it.each(['login', 'callback'])('disables OIDC %s without contacting the identity provider', async (path) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { GET } = await import(/* @vite-ignore */ `../app/api/auth/${path}/route.ts`);
    expect((await GET(new Request(`${base}/api/auth/${path}`))).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps HTTPS, direct-commit and development-bypass restrictions; rejects unknown auth modes', () => {
    vi.stubEnv('APP_BASE_URL', 'http://internal-specs.wyze.com');
    expect(validateRuntimeConfiguration).toThrow(/HTTPS/);
    vi.stubEnv('APP_BASE_URL', base);
    vi.stubEnv('ALLOW_DIRECT_COMMIT', 'true');
    expect(validateRuntimeConfiguration).toThrow(/Direct commits/);
    vi.stubEnv('ALLOW_DIRECT_COMMIT', 'false');
    vi.stubEnv('DEV_AUTH_BYPASS', 'true');
    expect(validateRuntimeConfiguration).toThrow(/cannot be enabled/);
    vi.stubEnv('DEV_AUTH_BYPASS', 'false');
    vi.stubEnv('AUTH_MODE', 'off');
    expect(validateRuntimeConfiguration).toThrow(/AUTH_MODE/);
  });
});

describe('production configuration', () => {
  it('rejects missing auth, short signing keys, HTTP origins, and production bypass', () => {
    vi.stubEnv('NODE_ENV', 'production');
    assertAuthConfiguration();
    vi.stubEnv('SESSION_SECRET', 'short');
    expect(assertAuthConfiguration).toThrow(/32/);
    vi.stubEnv('SESSION_SECRET', 'x'.repeat(48));
    vi.stubEnv('APP_BASE_URL', 'http://internal-specs.wyze.com');
    expect(assertAuthConfiguration).toThrow(/HTTPS/);
    vi.stubEnv('APP_BASE_URL', base);
    vi.stubEnv('OIDC_CLIENT_SECRET', '');
    expect(assertAuthConfiguration).toThrow(/Complete OIDC/);
    vi.stubEnv('DEV_AUTH_BYPASS', 'true');
    expect(assertAuthConfiguration).toThrow(/cannot be enabled/);
  });

  it('validates runtime provider credentials without requiring Glean for Bedrock', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('GITHUB_TOKEN', 'test-only');
    vi.stubEnv('GITHUB_OWNER', 'test');
    vi.stubEnv('GITHUB_REPO', 'test');
    vi.stubEnv('COMPILER_PROVIDER', 'bedrock');
    vi.stubEnv('BEDROCK_MODEL_ID', 'test-model');
    vi.stubEnv('ALLOW_DIRECT_COMMIT', 'false');
    validateRuntimeConfiguration();
    vi.stubEnv('ALLOW_DIRECT_COMMIT', 'true');
    expect(validateRuntimeConfiguration).toThrow(/Direct commits/);
  });
});

describe('request cancellation and optional Glean', () => {
  it('bounds total execution and aborts downstream work', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const work = withRequestDeadline(new Request(base), null, async () => {
      signal = requestSignal();
      return new Promise<never>((_, reject) => signal!.addEventListener('abort', () => reject(signal!.reason)));
    }, 100);
    const check = expect(work).rejects.toThrow(/deadline/);
    await vi.advanceTimersByTimeAsync(100);
    await check;
    expect(signal?.aborted).toBe(true);
  });

  it('propagates client disconnect and isolates concurrent identities', async () => {
    const controller = new AbortController();
    const work = withRequestDeadline(new Request(base, { signal: controller.signal }), null, async () => new Promise<never>(() => undefined));
    const check = expect(work).rejects.toThrow();
    controller.abort();
    await check;
    const users = ['a', 'b'].map((sub) => ({ sub, email: `${sub}@wyze.com`, name: sub }));
    const results = await Promise.all(users.map((user) => withRequestDeadline(new Request(base), user, async () => {
      await Promise.resolve();
      return requestUser()?.sub;
    })));
    expect(results).toEqual(['a', 'b']);
  });

  it('disabled or misconfigured optional Glean does not break Ask', async () => {
    vi.stubEnv('GLEAN_API_KEY', '');
    vi.stubEnv('GLEAN_CLIENT_ID', '');
    vi.stubEnv('GLEAN_CLIENT_SECRET', '');
    vi.stubEnv('GLEAN_COMPANY_KNOWLEDGE', 'false');
    expect(await askCompanyKnowledge('question')).toBeNull();
    vi.stubEnv('GLEAN_COMPANY_KNOWLEDGE', 'true');
    expect(await askCompanyKnowledge('question')).toBeNull();
  });
});

describe('request and logging bounds', () => {
  it('stops reading an oversized chunked body before collecting the rest', async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(160_000)); },
      cancel,
    });
    const req = new Request(base, { method: 'POST', body: stream, duplex: 'half' } as RequestInit);
    await expect(readJson(req, z.unknown())).rejects.toThrow(/too large/);
    expect(cancel).toHaveBeenCalled();
  });

  it('cancels a stalled body when its request deadline expires', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ cancel });
    const req = new Request(base, { method: 'POST', body: stream, duplex: 'half' } as RequestInit);
    const work = withRequestDeadline(req, null, () => readJson(req, z.unknown()), 100);
    const check = expect(work).rejects.toThrow(/deadline/);
    await vi.advanceTimersByTimeAsync(100);
    await check;
    expect(cancel).toHaveBeenCalled();
  });

  it('keeps model excerpts and Basic credentials out of logs', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    logServerError('request', 'compile', new JsonExtractionError('private product text'));
    expect(log.mock.calls.flat().join(' ')).not.toContain('private product text');
    expect(redact('Authorization: Basic c2VjcmV0OnNlY3JldA==')).not.toContain('c2VjcmV0');
    log.mockRestore();
  });
});
