import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';

export const runtime = 'nodejs';

const WEB_BASE_URL = (process.env.NEXT_PUBLIC_WEB_URL || 'https://hedwigbot.xyz').replace(/\/$/, '');

function googleRedirectUri(provider: string) {
  return `${WEB_BASE_URL}/api/integrations/callback/${provider === 'google_calendar' ? 'google' : provider}`;
}

function slackRedirectUri() {
  return `${WEB_BASE_URL}/api/integrations/callback/slack`;
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
      'https://www.googleapis.com/auth/calendar.readonly',
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

function buildSlackAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id:    process.env.SLACK_CLIENT_ID || '',
    redirect_uri: redirectUri,
    scope:        'channels:read,chat:write,users:read',
    state,
  });
  return `https://slack.com/oauth/v2/authorize?${params}`;
}

export async function GET(req: NextRequest): Promise<Response> {
  const provider = req.nextUrl.searchParams.get('provider');

  if (!provider || !['gmail', 'google_calendar', 'slack'].includes(provider)) {
    return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
  }

  // Generate a cryptographically random state tied to this session
  const state = crypto.randomBytes(24).toString('hex');

  // Store state + provider in a short-lived cookie (10 min)
  const cookieStore = await cookies();
  cookieStore.set('oauth_state', JSON.stringify({ state, provider }), {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   600,
    path:     '/',
  });

  let authUrl: string;
  if (provider === 'gmail' || provider === 'google_calendar') {
    const redirectUri = googleRedirectUri(provider);
    authUrl = buildGoogleAuthUrl(provider as 'gmail' | 'google_calendar', redirectUri, state);
  } else {
    authUrl = buildSlackAuthUrl(slackRedirectUri(), state);
  }

  return NextResponse.redirect(authUrl);
}
