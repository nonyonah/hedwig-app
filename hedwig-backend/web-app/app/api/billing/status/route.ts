import { NextResponse } from 'next/server';
import { hedwigApi } from '@/lib/api/client';
import { getCurrentSession } from '@/lib/auth/session';

export async function GET(): Promise<Response> {
  const session = await getCurrentSession();

  if (!session.accessToken) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const billing = await hedwigApi.billingStatus({ accessToken: session.accessToken }).catch(() => null);

  return NextResponse.json({ success: true, billing });
}
