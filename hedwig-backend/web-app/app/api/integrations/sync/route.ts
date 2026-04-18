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

  if (!provider) {
    return NextResponse.json({ success: false, error: 'Missing provider' }, { status: 400 });
  }

  const resp = await fetch(`${backendConfig.apiBaseUrl}/api/integrations/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${session.accessToken}`,
    },
    body: JSON.stringify({ provider }),
  });

  const data = await resp.json().catch(() => ({ success: false }));
  return NextResponse.json(data, { status: resp.status });
}
