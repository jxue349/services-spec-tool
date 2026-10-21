import type { NextResponse } from 'next/server';
import { AccessError, assertAuthConfiguration, assertSameOrigin, requireApplicationUser } from './auth/access';
import { apiError, apiErrorFromUnknown, newRequestId } from './errors';
import { withRequestDeadline } from './request-context';

/** Every exported API handler applies the guard before parsing bodies or calling providers. */
export function withApiAccess(
  handler: (req: Request) => Promise<NextResponse>,
  options: { public?: boolean } = {},
): (req: Request) => Promise<NextResponse> {
  return async (req) => {
    const requestId = newRequestId();
    try {
      assertAuthConfiguration();
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
