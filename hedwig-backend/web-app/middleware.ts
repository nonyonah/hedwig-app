import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const BACKEND_DIRECT_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://pay.hedwigbot.xyz';

const PUBLIC_PATHS = [
  '/sign-in',
  '/sign-out',
  '/api/auth/session',
  '/api/auth/sign-out',
  '/api/auth/demo',
  '/invoice',
  '/invoices',
  '/pay',
  '/payment-link',
  '/contract',
  '/contracts',
  '/success',
  '/export-wallet',
  '/privacy'
];

const isPublicPath = (pathname: string) =>
  pathname === '/' ||
  PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));

const clearAuthCookies = (response: NextResponse) => {
  response.cookies.set('hedwig_access_token', '', { expires: new Date(0), path: '/' });
  response.cookies.set('hedwig_user', '', { expires: new Date(0), path: '/' });
  return response;
};

async function isValidAccessToken(token: string) {
  try {
    const response = await fetch(`${BACKEND_DIRECT_URL}/api/auth/me`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`
      },
      cache: 'no-store'
    });

    if (!response.ok) {
      return false;
    }

    const payload = await response.json();
    return Boolean(payload?.success && payload?.data?.user?.id);
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get('hedwig_access_token')?.value;
  const isDemo = request.cookies.get('hedwig_demo')?.value === 'true';

  // Demo sessions bypass backend token validation entirely
  if (isDemo && token === 'demo') {
    if (pathname === '/sign-in') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    return NextResponse.next();
  }

  const isPublic = isPublicPath(pathname);

  if (!isPublic && !token) {
    return NextResponse.redirect(new URL('/sign-in', request.url));
  }

  if (!token) {
    return NextResponse.next();
  }

  const validToken = await isValidAccessToken(token);

  if (!validToken) {
    if (isPublic) {
      return clearAuthCookies(NextResponse.next());
    }

    return clearAuthCookies(NextResponse.redirect(new URL('/sign-in', request.url)));
  }

  if (pathname === '/sign-in') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)']
};
