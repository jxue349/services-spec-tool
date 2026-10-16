import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Signs out locally by dropping the session cookie.
 *
 * Does not end the JumpCloud session: single logout would sign the user out
 * of every app behind the same IdP, which is rarely what someone closing one
 * tool intends.
 */
export async function POST(): Promise<NextResponse> {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
