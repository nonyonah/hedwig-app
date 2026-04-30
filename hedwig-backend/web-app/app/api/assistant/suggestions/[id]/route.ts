import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth/session';
import { backendConfig } from '@/lib/auth/config';

export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const session = await getCurrentSession();
  if (!session.accessToken) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;

  const resp = await fetch(`${backendConfig.apiBaseUrl}/api/assistant/suggestions/${id}`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
    cache: 'no-store',
  }).catch(() => null);

  if (!resp) return NextResponse.json({ success: false, error: 'Backend unreachable' }, { status: 502 });
  return NextResponse.json(await resp.json().catch(() => ({ success: false })), { status: resp.status });
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const session = await getCurrentSession();
  if (!session.accessToken) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const { id } = await context.params;

  const resp = await fetch(`${backendConfig.apiBaseUrl}/api/assistant/suggestions/${id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${session.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => null);

  if (!resp) return NextResponse.json({ success: false, error: 'Backend unreachable' }, { status: 502 });
  return NextResponse.json(await resp.json().catch(() => ({ success: false })), { status: resp.status });
}
