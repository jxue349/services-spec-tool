import { authConfigured } from './oidc';
import { currentUser } from './session';
import type { SessionUser } from './session';

/**
 * Who to attribute a write to.
 *
 * When auth is configured, every write needs a signed-in user — otherwise
 * anyone who can reach the app writes to the spec repo under the service
 * account, which is the hole this whole feature exists to close.
 *
 * When auth is NOT configured the app stays open and attributes to the
 * configured bot identity. That keeps local development and the existing
 * single-user deployment working rather than bricking them on upgrade, and
 * `authConfigured()` is what the deployment checklist should assert.
 */

export class NotSignedInError extends Error {
  constructor() {
    super('Sign in to make changes.');
    this.name = 'NotSignedInError';
  }
}

export type WriteIdentity = {
  /** Commit author, when a user is signed in. */
  author?: { name: string; email: string };
  /** Email to attribute reports to, or null when running unauthenticated. */
  email: string | null;
};

export async function requireWriteIdentity(): Promise<WriteIdentity> {
  if (!authConfigured()) return { email: null };

  const user: SessionUser | null = await currentUser();
  if (user === null) throw new NotSignedInError();

  return { author: { name: user.name, email: user.email }, email: user.email };
}
