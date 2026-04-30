import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth/session';
import { backendConfig } from '@/lib/auth/config';

export const runtime = 'nodejs';

export async function POST(req: NextRequest): Promise<Response> {
  const session = await getCurrentSession();
  if (!session.accessToken) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null) as any;
  const provider = body?.provider;

  if (!provider || !['gmail', 'google_calendar'].includes(provider)) {
    return NextResponse.json({ success: false, error: 'Invalid provider' }, { status: 400 });
  }

  const target = provider === 'google_calendar'
    ? `${backendConfig.apiBaseUrl}/api/integrations/composio/connect/google_calendar`
    : `${backendConfig.apiBaseUrl}/api/integrations/${provider}`;

  const resp = await fetch(target, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });

  const data = await resp.json().catch(() => ({ success: false }));
  return NextResponse.json(data, { status: resp.status });
}
