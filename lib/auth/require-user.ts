import { AccessError, requireApplicationUser, testReadOnlyMode } from './access';
import { requestUser } from '../request-context';

export class NotSignedInError extends Error {
  constructor() {
    super('Sign in to make changes.');
    this.name = 'NotSignedInError';
  }
}

export type WriteIdentity = {
  author?: { name: string; email: string };
  email: string | null;
};

/** The route guard validates identity before any read, model call, or mutation. */
export async function requireWriteIdentity(): Promise<WriteIdentity> {
  if (testReadOnlyMode()) throw new AccessError(403, 'Repository changes are disabled during read-only testing.');
  const identity = requestUser();
  const user = identity === undefined ? await requireApplicationUser() : identity;
  if (user === null) return { email: null }; // Explicit local-development bypass only.
  return { author: { name: user.name, email: user.email }, email: user.email };
}
