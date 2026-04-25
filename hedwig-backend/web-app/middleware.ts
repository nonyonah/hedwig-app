import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const BACKEND_DIRECT_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://pay.hedwigbot.xyz';

const PUBLIC_PATHS = [
  '/sign-in',
  '/sign-out',
  '/pricing',
  '/api/auth/session',
  '/api/auth/sign-out',
  '/api/auth/demo',
  // Polar checkout + portal: handle their own auth internally
  '/api/polar',
  '/api/billing/polar',
  // OAuth callbacks arrive from external providers with only a state cookie
  '/api/integrations/callback',
  '/invoice',
  '/invoices',
  '/pay',
  '/payment-link',
  '/contract',
  '/contracts',
  '/success',
  '/export-wallet',
  '/privacy',
  '/feedback-widget',
  // Contract approval is a public action — contract recipients have no Hedwig account
  '/api/backend/api/documents/approve',
];

const isPublicPath = (pathname: string) =>
  pathname === '/' ||
  PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));

const CLEAR_COOKIE_OPTS = {
  expires: new Date(0),
  path: '/',
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const
};

const clearAuthCookies = (response: NextResponse) => {
  response.cookies.set('hedwig_access_token', '', CLEAR_COOKIE_OPTS);
  response.cookies.set('hedwig_user', '', CLEAR_COOKIE_OPTS);
  return response;
};

// Returns true = valid, false = definitively rejected (401/403), null = uncertain (network/server error)
async function isValidAccessToken(token: string): Promise<boolean | null> {
  try {
    const response = await fetch(`${BACKEND_DIRECT_URL}/api/auth/me`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`
      },
      cache: 'no-store'
    });

    // Definitive rejection — token is bad
    if (response.status === 401 || response.status === 403) {
      return false;
    }

    // Server/network error — don't sign the user out, assume the token is still good
    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    return Boolean(payload?.success && payload?.data?.user?.id);
  } catch {
    // Network error (backend unreachable, timeout, etc.) — fail open to avoid
    // signing users out during transient backend issues or during the Polar checkout flow
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get('hedwig_access_token')?.value;
  const isDemo = request.cookies.get('hedwig_demo')?.value === 'true';

  // Serve a static, crawler-friendly legal page for OAuth verifiers.
  if (pathname === '/privacy' || pathname === '/privacy/') {
    return NextResponse.rewrite(new URL('/privacy.html', request.url));
  }

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

  // Only validate the token when it actually matters:
  //   - Protected routes: must confirm the token is valid before granting access
  //   - Sign-in page: validate so we can redirect authenticated users to dashboard
  // All other public routes (invoice, pay, contract, etc.) can skip the backend
  // round-trip entirely — they don't gate on auth.
  if (isPublic && pathname !== '/sign-in') {
    return NextResponse.next();
  }

  const validToken = await isValidAccessToken(token);

  // Only clear the session and sign the user out on a definitive rejection (false).
  // null means we couldn't reach the backend — keep the session intact so the user
  // isn't logged out during the Polar checkout flow or a transient backend blip.
  if (validToken === false) {
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
