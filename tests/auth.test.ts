import { beforeEach, describe, expect, it } from 'vitest';
import { SignJWT } from 'jose';
import {
  __resetSessionSecret,
  createSessionToken,
  readSessionToken,
} from '@/lib/auth/session';
import { authConfigured, emailAllowed, parsePkce, userFromClaims } from '@/lib/auth/oidc';

/**
 * The session decides whose email is written into Git history, so a forged or
 * stale one is an attribution forgery, not just an access problem.
 */

const SECRET = 'a'.repeat(48);

beforeEach(() => {
  __resetSessionSecret();
  process.env.SESSION_SECRET = SECRET;
});

describe('session tokens', () => {
  const user = { sub: 'jc|123', email: 'alice@wyze.com', name: 'Alice' };

  it('round-trips a signed-in user', async () => {
    const token = await createSessionToken(user);
    await expect(readSessionToken(token)).resolves.toEqual(user);
  });

  it('rejects a token signed with a different secret', async () => {
    const forged = await new SignJWT({ email: 'attacker@evil.com', name: 'x' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('jc|999')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode('b'.repeat(48)));

    await expect(readSessionToken(forged)).resolves.toBeNull();
  });

  it('rejects a tampered payload', async () => {
    const token = await createSessionToken(user);
    const [header, , signature] = token.split('.');
    const swapped = Buffer.from(JSON.stringify({ sub: 'jc|123', email: 'root@wyze.com' })).toString('base64url');
    await expect(readSessionToken(`${header}.${swapped}.${signature}`)).resolves.toBeNull();
  });

  it('rejects an expired token', async () => {
    // Issued more than the 8-hour lifetime ago.
    const token = await createSessionToken(user, Date.now() - 9 * 60 * 60 * 1000);
    await expect(readSessionToken(token)).resolves.toBeNull();
  });

  it('rejects an unsigned (alg=none) token', async () => {
    const payload = Buffer.from(JSON.stringify({ sub: 'x', email: 'a@b.c' })).toString('base64url');
    const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
    await expect(readSessionToken(`${header}.${payload}.`)).resolves.toBeNull();
  });

  it('rejects a token with no email', async () => {
    const token = await new SignJWT({ name: 'No Email' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('jc|1')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(SECRET));

    await expect(readSessionToken(token)).resolves.toBeNull();
  });

  it('treats absent and empty tokens as signed out', async () => {
    await expect(readSessionToken(undefined)).resolves.toBeNull();
    await expect(readSessionToken('')).resolves.toBeNull();
  });

  it('refuses to run with a weak secret', async () => {
    __resetSessionSecret();
    process.env.SESSION_SECRET = 'short';
    await expect(createSessionToken(user)).rejects.toThrow(/at least 32 characters/);
  });
});

describe('emailAllowed', () => {
  it('allows everyone when no allowlist is set', () => {
    expect(emailAllowed('anyone@anywhere.com', [])).toBe(true);
  });

  it('allows a listed domain, case-insensitively', () => {
    expect(emailAllowed('Alice@Wyze.com', ['wyze.com'])).toBe(true);
  });

  it('blocks an unlisted domain', () => {
    // A shared IdP authenticates contractors and guests too.
    expect(emailAllowed('contractor@other.com', ['wyze.com'])).toBe(false);
  });

  it('is not fooled by a lookalike domain', () => {
    expect(emailAllowed('attacker@notwyze.com', ['wyze.com'])).toBe(false);
    expect(emailAllowed('attacker@wyze.com.evil.net', ['wyze.com'])).toBe(false);
  });

  it('rejects a malformed address', () => {
    expect(emailAllowed('no-at-sign', ['wyze.com'])).toBe(false);
  });
});

describe('userFromClaims', () => {
  it('takes sub, email and name', () => {
    expect(userFromClaims({ sub: 'x', email: 'A@Wyze.com', name: 'Alice' })).toEqual({
      sub: 'x',
      email: 'a@wyze.com',
      name: 'Alice',
    });
  });

  it('builds a name from given/family when name is absent', () => {
    expect(userFromClaims({ sub: 'x', email: 'a@b.c', given_name: 'Ann', family_name: 'Lee' })?.name).toBe('Ann Lee');
  });

  it('falls back to the email when there is no name at all', () => {
    expect(userFromClaims({ sub: 'x', email: 'a@b.c' })?.name).toBe('a@b.c');
  });

  it('rejects claims with no usable email', () => {
    expect(userFromClaims({ sub: 'x' })).toBeNull();
    expect(userFromClaims({ sub: 'x', email: 'not-an-email' })).toBeNull();
    expect(userFromClaims({ email: 'a@b.c' })).toBeNull();
  });
});

describe('parsePkce', () => {
  it('accepts a complete handshake cookie', () => {
    const raw = JSON.stringify({ codeVerifier: 'v', state: 's', nonce: 'n' });
    expect(parsePkce(raw)).toEqual({ codeVerifier: 'v', state: 's', nonce: 'n' });
  });

  it('rejects partial or malformed cookies rather than half-completing a handshake', () => {
    expect(parsePkce(undefined)).toBeNull();
    expect(parsePkce('')).toBeNull();
    expect(parsePkce('not json')).toBeNull();
    expect(parsePkce(JSON.stringify({ codeVerifier: 'v', state: 's' }))).toBeNull();
  });
});

describe('authConfigured', () => {
  it('needs every piece before auth counts as configured', () => {
    const keys = ['OIDC_ISSUER', 'OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET', 'SESSION_SECRET'] as const;
    for (const k of keys) delete process.env[k];
    expect(authConfigured()).toBe(false);

    for (const k of keys) process.env[k] = 'x';
    expect(authConfigured()).toBe(true);

    // Missing any one of them falls back to unauthenticated rather than
    // half-enabling sign-in.
    for (const k of keys) {
      const saved = process.env[k];
      delete process.env[k];
      expect(authConfigured(), `${k} missing`).toBe(false);
      process.env[k] = saved;
    }
  });
});
