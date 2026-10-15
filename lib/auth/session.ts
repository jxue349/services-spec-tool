import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { InvalidEnvError, MissingEnvError } from '../env';

/**
 * The signed-in user, and the cookie that carries them.
 *
 * The session is a signed JWT in an HttpOnly cookie rather than server state,
 * because this app has no database and a spec tool should not grow one just
 * to remember who is looking at it. The cost is that sessions cannot be
 * revoked before expiry, which is why the lifetime is short.
 *
 * Nothing from the identity provider beyond name, email and subject is kept:
 * the access token is used once at sign-in and deliberately discarded, since
 * this app never calls JumpCloud again on the user's behalf.
 */

export const SESSION_COOKIE = 'spec_session';
const SESSION_TTL_SECONDS = 8 * 60 * 60; // a working day

export type SessionUser = {
  /** Stable identifier from the identity provider. */
  sub: string;
  email: string;
  name: string;
};

let cachedSecret: Uint8Array | null = null;

function sessionSecret(): Uint8Array {
  if (cachedSecret !== null) return cachedSecret;

  const raw = process.env.SESSION_SECRET?.trim();
  if (raw === undefined || raw === '') throw new MissingEnvError(['SESSION_SECRET']);

  // 32 bytes minimum: a short secret makes the signature forgeable, which
  // here means forging an identity that gets written into Git history.
  if (raw.length < 32) {
    throw new InvalidEnvError('SESSION_SECRET must be at least 32 characters');
  }

  cachedSecret = new TextEncoder().encode(raw);
  return cachedSecret;
}

/** Test hook: drops the memoised secret. */
export function __resetSessionSecret(): void {
  cachedSecret = null;
}

export async function createSessionToken(user: SessionUser, now: number = Date.now()): Promise<string> {
  const issued = Math.floor(now / 1000);
  return new SignJWT({ email: user.email, name: user.name })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.sub)
    .setIssuedAt(issued)
    .setExpirationTime(issued + SESSION_TTL_SECONDS)
    .sign(sessionSecret());
}

/** Verifies a session token, returning null for anything not valid right now. */
export async function readSessionToken(token: string | undefined): Promise<SessionUser | null> {
  if (token === undefined || token === '') return null;

  try {
    const { payload } = await jwtVerify(token, sessionSecret(), { algorithms: ['HS256'] });
    const { sub, email, name } = payload as { sub?: unknown; email?: unknown; name?: unknown };

    if (typeof sub !== 'string' || typeof email !== 'string' || email === '') return null;
    return { sub, email, name: typeof name === 'string' && name !== '' ? name : email };
  } catch {
    // Expired, tampered with, or signed by a rotated secret.
    return null;
  }
}

/** The current user, or null when nobody is signed in. */
export async function currentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  return readSessionToken(jar.get(SESSION_COOKIE)?.value);
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: SESSION_TTL_SECONDS,
  // Set over HTTPS in anything but local development.
  secure: process.env.NODE_ENV === 'production',
};
