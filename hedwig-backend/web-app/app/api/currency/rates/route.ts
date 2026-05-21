import { NextRequest, NextResponse } from 'next/server';
import { backendConfig } from '@/lib/auth/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest): Promise<Response> {
  const resp = await fetch(`${backendConfig.apiBaseUrl}/api/currency/rates`, {
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);

  if (!resp) return NextResponse.json({ success: false, error: 'Backend unreachable' }, { status: 502 });
  return NextResponse.json(await resp.json().catch(() => ({ success: false })), { status: resp.status });
}
