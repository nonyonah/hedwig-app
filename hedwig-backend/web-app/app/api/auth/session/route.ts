import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { AUTH_CHECK_COOKIE, authCheckCookieOptions, authCookieOptions } from '@/lib/auth/cookies';
import { verifyAccessToken } from '@/lib/auth/verify';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  // Rate limit auth session creation — main lever against credential stuffing.
  // Allow normal UX retries (OAuth callback reloads, flaky networks) while still
  // constraining abuse bursts on a per-minute basis.
  const limit = checkRateLimit(request, { name: 'auth_session', limit: 30, windowMs: 60_000 });
  if (!limit.ok) return rateLimitResponse(limit.retryAfter);

  const body = await request.json().catch(() => null);
  const { token } = (body ?? {}) as { token?: string };

  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  }

  const verifiedUser = await verifyAccessToken(token);

  if (verifiedUser === 'network_error') {
    return NextResponse.json(
      { error: 'Auth service is temporarily unavailable. Please try again.' },
      { status: 503 }
    );
  }

  if (!verifiedUser) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true, user: verifiedUser });
  response.cookies.set('hedwig_access_token', token, authCookieOptions);
  response.cookies.set('hedwig_user', JSON.stringify(verifiedUser), authCookieOptions);
  response.cookies.set(AUTH_CHECK_COOKIE, Date.now().toString(), authCheckCookieOptions);

  return response;
}
