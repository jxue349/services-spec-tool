import { InvalidEnvError } from '../env';
import { authConfigured, emailAllowed, getOidcEnv } from './oidc';
import { currentUser } from './session';
import type { SessionUser } from './session';

export class AccessError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'AccessError';
  }
}

export function developmentAuthBypass(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.DEV_AUTH_BYPASS === 'true';
}

/** Temporary VPN-only testing; no session identity or repository writes. */
export function testReadOnlyMode(): boolean {
  return process.env.AUTH_MODE === 'test-readonly';
}

export function assertAuthConfiguration(): void {
  if (!['oidc', 'test-readonly'].includes(process.env.AUTH_MODE || 'oidc')) {
    throw new InvalidEnvError('AUTH_MODE must be oidc or test-readonly');
  }
  if (process.env.NODE_ENV === 'production' && process.env.DEV_AUTH_BYPASS === 'true') {
    throw new InvalidEnvError('DEV_AUTH_BYPASS cannot be enabled in production');
  }
  if (developmentAuthBypass() && !testReadOnlyMode()) return;
  if (process.env.NODE_ENV === 'production') {
    const base = new URL(process.env.APP_BASE_URL ?? 'http://localhost:3000');
    if (base.protocol !== 'https:' || base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
      throw new InvalidEnvError('APP_BASE_URL must be an HTTPS origin in production');
    }
  }
  if (testReadOnlyMode()) {
    if (process.env.ALLOW_DIRECT_COMMIT?.trim().toLowerCase() === 'true') {
      throw new InvalidEnvError('Direct commits must be disabled in test-readonly mode');
    }
    return;
  }
  if (!authConfigured()) throw new InvalidEnvError('Complete OIDC configuration and SESSION_SECRET are required');
  if ((process.env.SESSION_SECRET?.trim().length ?? 0) < 32) {
    throw new InvalidEnvError('SESSION_SECRET must be at least 32 characters');
  }
  const env = getOidcEnv();
  if (process.env.NODE_ENV === 'production') {
    if (new URL(env.issuer).protocol !== 'https:') throw new InvalidEnvError('OIDC_ISSUER must use HTTPS');
    if (env.allowedDomains.length === 0) throw new InvalidEnvError('OIDC_ALLOWED_EMAIL_DOMAINS is required in production');
  }
}

export async function requireApplicationUser(): Promise<SessionUser | null> {
  assertAuthConfiguration();
  if (testReadOnlyMode() || developmentAuthBypass()) return null;
  const user = await currentUser();
  if (!user) throw new AccessError(401, 'Sign in to access this service.');
  if (!emailAllowed(user.email, getOidcEnv().allowedDomains)) throw new AccessError(403, 'Account is not allowed.');
  return user;
}

export function assertSameOrigin(req: Request): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
  // Unit tests and local scripts explicitly opt into the local development mode.
  if (developmentAuthBypass() && !testReadOnlyMode() && !req.headers.has('origin')) return;
  const expected = new URL(process.env.APP_BASE_URL || 'http://localhost:3000').origin;
  if (req.headers.get('origin') !== expected) throw new AccessError(403, 'Request origin is not allowed.');
}
