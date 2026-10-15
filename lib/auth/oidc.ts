import * as client from 'openid-client';
import { InvalidEnvError, MissingEnvError } from '../env';

/**
 * JumpCloud sign-in over OIDC.
 *
 * Uses openid-client rather than a hand-rolled handshake: discovery, PKCE,
 * state and nonce, and ID-token signature and claim validation are all places
 * where a subtle mistake silently becomes "anyone can be anyone", and this
 * identity ends up written into Git history.
 */

/** Short-lived cookie holding the PKCE verifier, state and nonce. */
export const PKCE_COOKIE = 'spec_pkce';

export const pkceCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 10 * 60,
  secure: process.env.NODE_ENV === 'production',
};

/** Parses the handshake cookie, rejecting anything malformed. */
export function parsePkce(raw: string | undefined): { codeVerifier: string; state: string; nonce: string } | null {
  if (raw === undefined || raw === '') return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const { codeVerifier, state, nonce } = parsed;
    if (typeof codeVerifier !== 'string' || typeof state !== 'string' || typeof nonce !== 'string') return null;
    return { codeVerifier, state, nonce };
  } catch {
    return null;
  }
}

export type OidcEnv = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** Optional: only these email domains may sign in. */
  allowedDomains: string[];
};

export function getOidcEnv(): OidcEnv {
  const missing: string[] = [];
  const issuer = process.env.OIDC_ISSUER?.trim();
  const clientId = process.env.OIDC_CLIENT_ID?.trim();
  const clientSecret = process.env.OIDC_CLIENT_SECRET?.trim();

  if (!issuer) missing.push('OIDC_ISSUER');
  if (!clientId) missing.push('OIDC_CLIENT_ID');
  if (!clientSecret) missing.push('OIDC_CLIENT_SECRET');
  if (missing.length > 0) throw new MissingEnvError(missing);

  const base = process.env.APP_BASE_URL?.trim() || 'http://localhost:3000';
  let redirectUri: string;
  try {
    redirectUri = new URL('/api/auth/callback', base).toString();
  } catch {
    throw new InvalidEnvError('APP_BASE_URL must be an absolute URL');
  }

  return {
    issuer: issuer ?? '',
    clientId: clientId ?? '',
    clientSecret: clientSecret ?? '',
    redirectUri,
    allowedDomains: (process.env.OIDC_ALLOWED_EMAIL_DOMAINS ?? '')
      .split(',')
      .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
      .filter((d) => d !== ''),
  };
}

/** True when auth is configured at all. */
export function authConfigured(): boolean {
  return Boolean(
    process.env.OIDC_ISSUER?.trim() &&
      process.env.OIDC_CLIENT_ID?.trim() &&
      process.env.OIDC_CLIENT_SECRET?.trim() &&
      process.env.SESSION_SECRET?.trim(),
  );
}

let cachedConfig: { config: client.Configuration; issuer: string; clientId: string } | null = null;

/** Discovery result, memoised — the document rarely changes and is a network hop. */
export async function oidcConfig(env: OidcEnv): Promise<client.Configuration> {
  if (cachedConfig !== null && cachedConfig.issuer === env.issuer && cachedConfig.clientId === env.clientId) {
    return cachedConfig.config;
  }

  const config = await client.discovery(new URL(env.issuer), env.clientId, env.clientSecret);
  cachedConfig = { config, issuer: env.issuer, clientId: env.clientId };
  return config;
}

/** Test hook: drops the memoised discovery result. */
export function __resetOidcConfig(): void {
  cachedConfig = null;
}

/**
 * Enforces the email-domain allowlist.
 *
 * Without it, anyone the identity provider will authenticate could write to
 * the spec repo — which for a JumpCloud tenant shared with contractors or
 * guests is not the same set as "Wyze staff".
 */
export function emailAllowed(email: string, allowedDomains: readonly string[]): boolean {
  if (allowedDomains.length === 0) return true;
  const domain = email.toLowerCase().split('@')[1];
  if (domain === undefined) return false;
  return allowedDomains.includes(domain);
}

/** Pulls the identity out of validated ID-token claims. */
export function userFromClaims(claims: Record<string, unknown>): { sub: string; email: string; name: string } | null {
  const sub = claims.sub;
  const email = claims.email;
  if (typeof sub !== 'string' || sub === '') return null;
  if (typeof email !== 'string' || !email.includes('@')) return null;

  const name =
    (typeof claims.name === 'string' && claims.name) ||
    [claims.given_name, claims.family_name].filter((p) => typeof p === 'string' && p !== '').join(' ') ||
    email;

  return { sub, email: email.toLowerCase(), name: String(name) };
}
