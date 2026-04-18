import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth/session';

export async function GET(req: NextRequest): Promise<Response> {
  const session = await getCurrentSession();

  if (!session.accessToken || !session.user?.id) {
    return NextResponse.redirect(new URL('/sign-in', req.url));
  }

  const redirectUrl = new URL('/api/polar/portal', req.url);
  redirectUrl.searchParams.set('customerExternalId', session.user.id);
  return NextResponse.redirect(redirectUrl);
}
