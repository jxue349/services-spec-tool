import { withApiAccess } from '@/lib/api-access';
import { NextResponse } from 'next/server';
import { authConfigured } from '@/lib/auth/oidc';
import { currentUser } from '@/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Who is signed in, and whether sign-in is available at all. */
async function handleGET(): Promise<NextResponse> {
  const configured = authConfigured();
  const user = configured ? await currentUser() : null;
  return NextResponse.json({
    authConfigured: configured,
    user: user === null ? null : { email: user.email, name: user.name },
  });
}

export const GET = withApiAccess(handleGET, { public: true });
