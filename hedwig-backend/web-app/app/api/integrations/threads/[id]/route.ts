import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth/session';
import { backendConfig } from '@/lib/auth/config';

export const runtime = 'nodejs';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const session = await getCurrentSession();
  if (!session.accessToken) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ success: false, error: 'Missing id' }, { status: 400 });
  }

  const body = await req.json().catch(() => null);

  const resp = await fetch(`${backendConfig.apiBaseUrl}/api/integrations/threads/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.accessToken}`,
    },
    body: JSON.stringify(body),
  }).catch(() => null);

  if (!resp) {
    return NextResponse.json({ success: false, error: 'Backend unreachable' }, { status: 502 });
  }

  const data = await resp.json().catch(() => ({ success: false }));
  return NextResponse.json(data, { status: resp.ok ? 200 : resp.status });
}
