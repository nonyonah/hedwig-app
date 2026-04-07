import { NextResponse } from 'next/server';

const CLEAR_COOKIE_OPTS = {
  expires: new Date(0),
  path: '/',
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const
};

export async function POST() {
  const response = NextResponse.json({ ok: true });

  response.cookies.set('hedwig_access_token', '', CLEAR_COOKIE_OPTS);
  response.cookies.set('hedwig_user', '', CLEAR_COOKIE_OPTS);
  response.cookies.set('hedwig_demo', '', CLEAR_COOKIE_OPTS);

  return response;
}
