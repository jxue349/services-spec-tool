import { NextResponse } from 'next/server';
import * as client from 'openid-client';
import { apiErrorFromUnknown, newRequestId } from '@/lib/errors';
import { PKCE_COOKIE, getOidcEnv, oidcConfig, pkceCookieOptions } from '@/lib/auth/oidc';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Starts sign-in: redirects to JumpCloud with PKCE, state and nonce. */
export async function GET(): Promise<NextResponse> {
  const requestId = newRequestId();
  try {
    const env = getOidcEnv();
    const config = await oidcConfig(env);

    const codeVerifier = client.randomPKCECodeVerifier();
    const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
    const state = client.randomState();
    const nonce = client.randomNonce();

    const url = client.buildAuthorizationUrl(config, {
      redirect_uri: env.redirectUri,
      scope: 'openid email profile',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
      nonce,
    });

    const res = NextResponse.redirect(url.toString());
    // Verifier, state and nonce must survive the round trip but never reach
    // JavaScript, and must not outlive the handshake.
    res.cookies.set(PKCE_COOKIE, JSON.stringify({ codeVerifier, state, nonce }), pkceCookieOptions);
    return res;
  } catch (err) {
    return apiErrorFromUnknown('GET /api/auth/login', err, requestId);
  }
}
