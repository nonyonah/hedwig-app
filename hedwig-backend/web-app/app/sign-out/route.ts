import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const redirectUrl = new URL('/sign-in', request.url);
  const response = NextResponse.redirect(redirectUrl);

  response.cookies.set('hedwig_access_token', '', { expires: new Date(0), path: '/' });
  response.cookies.set('hedwig_user', '', { expires: new Date(0), path: '/' });

  return response;
}
