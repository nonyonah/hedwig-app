import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth/session';
import { backendConfig } from '@/lib/auth/config';

export const runtime = 'nodejs';

export async function GET(req: NextRequest): Promise<Response> {
  const session = await getCurrentSession();
  if (!session.accessToken) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const query = req.nextUrl.searchParams.toString();
  const resp = await fetch(`${backendConfig.apiBaseUrl}/api/assistant/suggestions${query ? `?${query}` : ''}`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
    cache: 'no-store',
  }).catch(() => null);

  if (!resp) return NextResponse.json({ success: false, error: 'Backend unreachable' }, { status: 502 });
  if (resp.status === 404) return NextResponse.json({ success: true, data: { suggestions: [] } });
  return NextResponse.json(await resp.json().catch(() => ({ success: false })), { status: resp.status });
}

export async function POST(_req: NextRequest): Promise<Response> {
  const session = await getCurrentSession();
  if (!session.accessToken) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const resp = await fetch(`${backendConfig.apiBaseUrl}/api/assistant/suggestions/generate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.accessToken}`, 'Content-Type': 'application/json' },
    cache: 'no-store',
  }).catch(() => null);

  if (!resp) return NextResponse.json({ success: false, error: 'Backend unreachable' }, { status: 502 });
  if (resp.status === 404) return NextResponse.json({ success: true, data: { generated: 0 } });
  return NextResponse.json(await resp.json().catch(() => ({ success: false })), { status: resp.status });
}
