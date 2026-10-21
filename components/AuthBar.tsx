'use client';

import { useEffect, useState } from 'react';
import { Button } from './ui';
import { getMe, signOut } from '@/lib/client/api';
import type { MeResponse } from '@/lib/schemas';

const AUTH_ERRORS: Record<string, string> = {
  expired: 'Sign-in took too long. Try again.',
  domain: 'That account is not allowed to sign in here.',
  no_email: 'The identity provider did not return an email address.',
  no_claims: 'Sign-in did not complete.',
  failed: 'Sign-in failed.',
};

/**
 * Who is signed in, and the way in and out.
 *
 * Shows the email rather than a display name on purpose: the email is what
 * gets written into Git history as the commit author, so this is a preview of
 * the attribution, not decoration.
 */
export function AuthBar({ onUserChange }: { onUserChange: (user: MeResponse['user']) => void }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    // The callback redirects back with ?auth_error=… on failure. Read it, then
    // strip it so a refresh does not resurrect a stale message.
    const params = new URLSearchParams(window.location.search);
    const reason = params.get('auth_error');
    if (reason !== null) {
      setAuthError(AUTH_ERRORS[reason] ?? 'Sign-in failed.');
      params.delete('auth_error');
      const rest = params.toString();
      window.history.replaceState({}, '', `${window.location.pathname}${rest ? `?${rest}` : ''}`);
    }

    void getMe()
      .then((res) => {
        setMe(res);
        onUserChange(res.user);
      })
      .catch(() => setAuthError('Unable to check sign-in. Refresh to try again.'));
  }, [onUserChange]);

  if (me === null) return authError ? <span className="text-sm text-warning">{authError}</span> : null;

  if (!me.authConfigured) {
    return (
      <span
        className="rounded border border-warning/50 bg-warning/10 px-2 py-0.5 font-mono text-[10px] text-warning"
        title="Local development is running without sign-in."
      >
        local development
      </span>
    );
  }

  return (
    <span className="flex items-center gap-2">
      {authError !== null ? (
        <span className="rounded border border-warning/50 bg-warning/10 px-2 py-0.5 text-[10px] text-warning">
          {authError}
        </span>
      ) : null}

      {me.user === null ? (
        <Button variant="primary" onClick={() => window.location.assign('/api/auth/login')}>
          Sign in
        </Button>
      ) : (
        <>
          <span
            className="font-mono text-[10px] text-inkDim"
            title="Changes you make are committed under this address"
          >
            {me.user.email}
          </span>
          <Button
            onClick={() => {
              void signOut().then(() => window.location.reload());
            }}
          >
            Sign out
          </Button>
        </>
      )}
    </span>
  );
}
