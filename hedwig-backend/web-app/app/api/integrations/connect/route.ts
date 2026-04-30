import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';
import { getCurrentSession } from '@/lib/auth/session';
import { backendConfig } from '@/lib/auth/config';

export const runtime = 'nodejs';

const WEB_BASE_URL = (process.env.NEXT_PUBLIC_WEB_URL || 'https://hedwigbot.xyz').replace(/\/$/, '');

function googleRedirectUri() {
  // Both Gmail and Google Calendar share the same callback route.
  return `${WEB_BASE_URL}/api/integrations/callback/google`;
}

function buildGoogleAuthUrl(provider: 'gmail' | 'google_calendar', redirectUri: string, state: string): string {
  const scopes: Record<string, string[]> = {
    gmail: [
      'openid',
      'email',
      'https://www.googleapis.com/auth/gmail.readonly',
    ],
    google_calendar: [
      'openid',
      'email',
      'https://www.googleapis.com/auth/calendar.events',
    ],
  };

  const params = new URLSearchParams({
    client_id:     process.env.GOOGLE_CLIENT_ID || '',
    redirect_uri:  redirectUri,
    response_type: 'code',
    scope:         scopes[provider].join(' '),
    access_type:   'offline',
    prompt:        'consent',
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function GET(req: NextRequest): Promise<Response> {
  const provider = req.nextUrl.searchParams.get('provider');

  if (provider === 'slack') {
    return NextResponse.json({ error: 'Slack integration is temporarily disabled.' }, { status: 410 });
  }

  if (!provider || !['gmail', 'google_calendar'].includes(provider)) {
    return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
  }

  if (provider === 'google_calendar') {
    const session = await getCurrentSession();
    if (!session.accessToken) {
      return NextResponse.redirect(new URL('/sign-in', req.url));
    }

    const resp = await fetch(`${backendConfig.apiBaseUrl}/api/integrations/composio/connect/google_calendar`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.accessToken}` },
      cache: 'no-store',
    }).catch(() => null);

    if (!resp) {
      return NextResponse.redirect(new URL('/settings?integration_error=backend_unreachable', req.url));
    }

    const payload = await resp.json().catch(() => null) as any;
    if (resp.ok && payload?.success && payload?.data?.redirectUrl) {
      return NextResponse.redirect(payload.data.redirectUrl);
    }

    return NextResponse.redirect(new URL(`/settings?integration_error=${encodeURIComponent(payload?.error || 'connect_failed')}`, req.url));
  }

  // Generate a cryptographically random state tied to this session
  const state = crypto.randomBytes(24).toString('hex');

  // If a mobile client passes ?token= (Privy JWT), embed it in the state cookie
  // so it survives the Google redirect chain without needing a second cookie.
  const mobileToken = req.nextUrl.searchParams.get('token');

  // Store state + provider (+ optional mobile token) in a short-lived cookie (10 min)
  const cookieStore = await cookies();
  const cookiePayload: Record<string, string> = { state, provider };
  if (mobileToken) cookiePayload.token = mobileToken;
  cookieStore.set('oauth_state', JSON.stringify(cookiePayload), {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   600,
    path:     '/',
  });

  const redirectUri = googleRedirectUri();
  const authUrl = buildGoogleAuthUrl(provider as 'gmail' | 'google_calendar', redirectUri, state);

  return NextResponse.redirect(authUrl);
}
