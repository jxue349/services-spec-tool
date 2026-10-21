import type { NextResponse } from 'next/server';
import { AccessError, assertAuthConfiguration, assertSameOrigin, requireApplicationUser, testReadOnlyMode } from './auth/access';
import { apiError, apiErrorFromUnknown, newRequestId } from './errors';
import { withRequestDeadline } from './request-context';

/** Every exported API handler applies the guard before parsing bodies or calling providers. */
export function withApiAccess(
  handler: (req: Request) => Promise<NextResponse>,
  options: { public?: boolean; readOnly?: boolean; oidcOnly?: boolean } = {},
): (req: Request) => Promise<NextResponse> {
  return async (req) => {
    const requestId = newRequestId();
    try {
      assertAuthConfiguration();
      // Every new protected route is denied in test mode until explicitly reviewed as read-only.
      if (testReadOnlyMode() && (options.oidcOnly || (!options.public && !options.readOnly))) {
        throw new AccessError(403, 'Temporary read-only test mode: sign-in and repository changes are disabled.');
      }
      const user = options.public ? null : await requireApplicationUser();
      assertSameOrigin(req);
      const response = await withRequestDeadline(req, user, () => handler(req));
      response.headers.set('cache-control', 'no-store');
      return response;
    } catch (err) {
      const response = err instanceof AccessError
        ? apiError(err.status, err.message, requestId)
        : apiErrorFromUnknown('API request', err, requestId);
      response.headers.set('cache-control', 'no-store');
      return response;
    }
  };
}
