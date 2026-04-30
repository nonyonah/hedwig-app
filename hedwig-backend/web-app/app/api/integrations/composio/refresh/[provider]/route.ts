import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth/session';
import { backendConfig } from '@/lib/auth/config';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ provider: string }> };

export async function POST(_req: NextRequest, context: RouteContext): Promise<Response> {
  const session = await getCurrentSession();
  if (!session.accessToken) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { provider } = await context.params;

  const resp = await fetch(`${backendConfig.apiBaseUrl}/api/integrations/composio/refresh/${encodeURIComponent(provider)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.accessToken}` },
    cache: 'no-store',
  }).catch(() => null);

  if (!resp) return NextResponse.json({ success: false, error: 'Backend unreachable' }, { status: 502 });
  return NextResponse.json(await resp.json().catch(() => ({ success: false })), { status: resp.status });
}
