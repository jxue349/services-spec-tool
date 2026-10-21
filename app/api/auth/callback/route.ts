import { withApiAccess } from '@/lib/api-access';
import { NextResponse } from 'next/server';
import * as client from 'openid-client';
import { cookies } from 'next/headers';
import { logServerError, newRequestId } from '@/lib/errors';
import { PKCE_COOKIE, emailAllowed, getOidcEnv, oidcConfig, parsePkce, userFromClaims } from '@/lib/auth/oidc';
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions } from '@/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Completes sign-in.
 *
 * Failures redirect back to the app with a short reason rather than rendering
 * an error page: the user cannot act on a stack trace, and the detail belongs
 * in the server log with a request id.
 */
async function handleGET(req: Request): Promise<NextResponse> {
  const requestId = newRequestId();
  const base = process.env.APP_BASE_URL?.trim() || 'http://localhost:3000';
  const fail = (reason: string) => NextResponse.redirect(new URL(`/?auth_error=${reason}`, base));

  try {
    const env = getOidcEnv();
    const config = await oidcConfig(env);

    const jar = await cookies();
    const parsed = parsePkce(jar.get(PKCE_COOKIE)?.value);
    if (parsed === null) return fail('expired');

    // openid-client validates state, nonce, issuer, audience, signature and
    // expiry here; a mismatch throws rather than returning claims.
    // TLS terminates at the ALB. Use the registered external origin, never
    // the task's HTTP origin or caller-controlled forwarding headers.
    const callbackUrl = new URL('/api/auth/callback', base);
    callbackUrl.search = new URL(req.url).search;
    const tokens = await client.authorizationCodeGrant(config, callbackUrl, {
      pkceCodeVerifier: parsed.codeVerifier,
      expectedState: parsed.state,
      expectedNonce: parsed.nonce,
    });

    const claims = tokens.claims();
    if (claims === undefined) return fail('no_claims');

    const user = userFromClaims(claims as Record<string, unknown>);
    if (user === null) return fail('no_email');

    if (!emailAllowed(user.email, env.allowedDomains)) {
      logServerError(requestId, 'auth callback', new Error(`domain not allowed for ${user.email.split('@')[1]}`));
      return fail('domain');
    }

    const res = NextResponse.redirect(new URL('/', base));
    res.cookies.set(SESSION_COOKIE, await createSessionToken(user), sessionCookieOptions);
    // The handshake is over; the access token is deliberately not kept.
    res.cookies.delete(PKCE_COOKIE);
    return res;
  } catch (err) {
    logServerError(requestId, 'GET /api/auth/callback', err);
    return fail('failed');
  }
}

export const GET = withApiAccess(handleGET, { public: true });
