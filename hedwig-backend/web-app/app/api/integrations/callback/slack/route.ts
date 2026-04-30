import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getCurrentSession } from '@/lib/auth/session';
import { backendConfig } from '@/lib/auth/config';

export const runtime = 'nodejs';

const WEB_BASE_URL = (process.env.NEXT_PUBLIC_WEB_URL || 'https://hedwigbot.xyz').replace(/\/$/, '');

export async function GET(req: NextRequest): Promise<Response> {
  const code  = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const error = req.nextUrl.searchParams.get('error');

  if (error) {
    return NextResponse.redirect(`${WEB_BASE_URL}/settings?integration_error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${WEB_BASE_URL}/settings?integration_error=missing_params`);
  }

  const cookieStore = await cookies();
  const oauthCookie = cookieStore.get('oauth_state')?.value;

  if (!oauthCookie) {
    return NextResponse.redirect(`${WEB_BASE_URL}/settings?integration_error=state_expired`);
  }

  let storedState: { state: string; provider: string };
  try {
    storedState = JSON.parse(oauthCookie);
  } catch {
    return NextResponse.redirect(`${WEB_BASE_URL}/settings?integration_error=invalid_state`);
  }

  if (storedState.state !== state || storedState.provider !== 'slack') {
    return NextResponse.redirect(`${WEB_BASE_URL}/settings?integration_error=state_mismatch`);
  }

  cookieStore.set('oauth_state', '', { maxAge: 0, path: '/' });

  const redirectUri = `${WEB_BASE_URL}/api/integrations/callback/slack`;

  const session = await getCurrentSession();
  if (!session.accessToken) {
    return NextResponse.redirect(`${WEB_BASE_URL}/sign-in`);
  }

  const resp = await fetch(`${backendConfig.apiBaseUrl}/api/integrations/oauth/slack/callback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${session.accessToken}`,
    },
    body: JSON.stringify({ code, redirectUri }),
  });

  if (!resp.ok) {
    const data = await resp.json().catch(() => null) as any;
    const backendError = String(data?.error || '').trim();
    const unauthorized = resp.status === 401 || backendError.toLowerCase() === 'unauthorized';
    const msg = unauthorized ? 'session_expired' : (backendError || 'oauth_failed');
    if (unauthorized) {
      return NextResponse.redirect(`${WEB_BASE_URL}/sign-in?next=${encodeURIComponent('/settings')}`);
    }
    return NextResponse.redirect(`${WEB_BASE_URL}/settings?integration_error=${encodeURIComponent(msg)}`);
  }

  return NextResponse.redirect(`${WEB_BASE_URL}/settings?integration_connected=slack`);
}
