import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = [
  '/',
  '/sign-in',
  '/sign-out',
  '/api/auth/session',
  '/invoice',
  '/invoices',
  '/pay',
  '/payment-link',
  '/contract',
  '/contracts',
  '/success',
  '/export-wallet'
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get('hedwig_access_token')?.value;

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!isPublic && !token) {
    return NextResponse.redirect(new URL('/sign-in', request.url));
  }

  if (pathname === '/sign-in' && token) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)']
};
