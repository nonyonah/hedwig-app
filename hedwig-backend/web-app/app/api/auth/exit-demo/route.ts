import { NextResponse } from 'next/server';
import { AUTH_CHECK_COOKIE, clearAuthCookieOptions } from '@/lib/auth/cookies';

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const response = NextResponse.redirect(new URL('/sign-in', origin));

  response.cookies.set('hedwig_access_token', '', clearAuthCookieOptions);
  response.cookies.set('hedwig_user', '', clearAuthCookieOptions);
  response.cookies.set(AUTH_CHECK_COOKIE, '', clearAuthCookieOptions);
  response.cookies.set('hedwig_demo', '', clearAuthCookieOptions);

  return response;
}
