import { NextResponse } from 'next/server';
import { verifyAccessToken } from '@/lib/auth/verify';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const { token } = (body ?? {}) as { token?: string };

  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  }

  const verifiedUser = await verifyAccessToken(token);

  if (!verifiedUser) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const cookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax' as const,
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/'
  };

  const response = NextResponse.json({ ok: true, user: verifiedUser });
  response.cookies.set('hedwig_access_token', token, cookieOptions);
  response.cookies.set('hedwig_user', JSON.stringify(verifiedUser), cookieOptions);

  return response;
}
