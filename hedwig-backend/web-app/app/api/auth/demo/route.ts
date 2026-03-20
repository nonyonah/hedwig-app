import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';
  const dashboardUrl = new URL('/dashboard', appUrl);

  // Use request URL base to build the redirect (works in both dev and prod)
  const origin = new URL(request.url).origin;
  const response = NextResponse.redirect(new URL('/dashboard', origin));

  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 60 * 60 * 24, // 24 hours
    path: '/'
  };

  response.cookies.set('hedwig_demo', 'true', cookieOptions);
  response.cookies.set('hedwig_access_token', 'demo', cookieOptions);

  void dashboardUrl;
  return response;
}
