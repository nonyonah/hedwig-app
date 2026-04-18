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

  // Verify state
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

  if (storedState.state !== state) {
    return NextResponse.redirect(`${WEB_BASE_URL}/settings?integration_error=state_mismatch`);
  }

  // Clear state cookie
  cookieStore.set('oauth_state', '', { maxAge: 0, path: '/' });

  const provider   = storedState.provider as 'gmail' | 'google_calendar';
  const redirectUri = `${WEB_BASE_URL}/api/integrations/callback/google`;

  // Get user session
  const session = await getCurrentSession();
  if (!session.accessToken) {
    return NextResponse.redirect(`${WEB_BASE_URL}/sign-in`);
  }

  // Forward the code to backend to exchange + store tokens
  const resp = await fetch(`${backendConfig.apiBaseUrl}/api/integrations/oauth/google/callback`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      Authorization:   `Bearer ${session.accessToken}`,
    },
    body: JSON.stringify({ code, redirectUri, provider }),
  });

  if (!resp.ok) {
    const data = await resp.json().catch(() => null) as any;
    const msg  = data?.error || 'oauth_failed';
    return NextResponse.redirect(`${WEB_BASE_URL}/settings?integration_error=${encodeURIComponent(msg)}`);
  }

  return NextResponse.redirect(`${WEB_BASE_URL}/settings?integration_connected=${provider}`);
}
