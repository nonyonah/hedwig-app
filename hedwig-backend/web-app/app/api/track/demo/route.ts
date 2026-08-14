import { NextRequest, NextResponse } from 'next/server';
import { CALENDLY_DEMO_URL } from '@/lib/demo';

const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com';
const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;

/**
 * GET /api/track/demo?source=welcome_email|reminder_email&uid=<privy_id>
 *
 * Link-click tracker used by the "Book a demo" buttons in emails (email
 * clients can't run client-side analytics). Fires a server-side PostHog
 * capture then 302-redirects to Calendly. `uid` is the user's privy_id so it
 * merges with backend-tracked events. Redirect target is a fixed constant —
 * never derived from the request.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const source = searchParams.get('source');
  const uid = searchParams.get('uid');

  if (POSTHOG_KEY && (source === 'welcome_email' || source === 'reminder_email')) {
    fetch(`${POSTHOG_HOST}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: POSTHOG_KEY,
        event: 'demo_email_link_clicked',
        distinct_id: uid || 'anonymous',
        properties: { source, $current_url: `email:${source}` },
      }),
    }).catch(() => {});
  }

  return NextResponse.redirect(CALENDLY_DEMO_URL, 302);
}
