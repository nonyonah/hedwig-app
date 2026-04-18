import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth/session';
import { backendConfig } from '@/lib/auth/config';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest): Promise<Response> {
  const session = await getCurrentSession();
  if (!session.accessToken) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const resp = await fetch(`${backendConfig.apiBaseUrl}/api/integrations`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });

  const data = await resp.json().catch(() => ({ success: false, data: [] }));
  return NextResponse.json(data, { status: resp.status });
}
