import { NextResponse } from 'next/server';
import { AUTH_CHECK_COOKIE, authCheckCookieOptions, authCookieOptions } from '@/lib/auth/cookies';
import { currentUser } from '@/lib/mock/data';

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const response = NextResponse.redirect(new URL('/dashboard', origin));

  // Enable demo mode
  response.cookies.set('hedwig_demo', 'true', authCookieOptions);
  response.cookies.set('hedwig_access_token', 'demo', authCookieOptions);
  response.cookies.set('hedwig_user', JSON.stringify(currentUser), authCookieOptions);
  response.cookies.set(AUTH_CHECK_COOKIE, Date.now().toString(), authCheckCookieOptions);

  return response;
}
