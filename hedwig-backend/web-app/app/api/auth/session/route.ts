import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const body = await request.json();
  const { token, user } = body as { token: string; user?: Record<string, unknown> };

  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const cookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax' as const,
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/'
  };

  const response = NextResponse.json({ ok: true });
  response.cookies.set('hedwig_access_token', token, cookieOptions);

  if (user) {
    response.cookies.set('hedwig_user', JSON.stringify(user), cookieOptions);
  }

  return response;
}
