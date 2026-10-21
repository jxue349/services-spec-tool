import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Process health only: upstream outages must not cause a task restart loop. */
export function GET(): NextResponse {
  return NextResponse.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
}
