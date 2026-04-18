import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth/session';
import { backendConfig } from '@/lib/auth/config';
import { resolvePolarServer } from '@/lib/billing/polar';

export const runtime = 'nodejs';

const polarAccessToken = String(process.env.POLAR_ACCESS_TOKEN || '').trim();

const polarBaseUrl = () =>
  resolvePolarServer() === 'sandbox'
    ? 'https://sandbox-api.polar.sh'
    : 'https://api.polar.sh';

// Fetch checkout from Polar API to get subscription/customer details
async function fetchPolarCheckout(checkoutId: string): Promise<any> {
  const resp = await fetch(`${polarBaseUrl()}/v1/checkouts/${checkoutId}`, {
    headers: {
      Authorization: `Bearer ${polarAccessToken}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Polar checkout fetch failed (${resp.status}): ${text}`);
  }

  return resp.json();
}

// Fetch subscription from Polar API
async function fetchPolarSubscription(subscriptionId: string): Promise<any> {
  const resp = await fetch(`${polarBaseUrl()}/v1/subscriptions/${subscriptionId}`, {
    headers: {
      Authorization: `Bearer ${polarAccessToken}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  if (!resp.ok) return null;
  return resp.json();
}

// POST /api/billing/polar/sync — call after checkout redirect to write DB immediately
// Body: { checkoutId: string }
export async function POST(req: NextRequest): Promise<Response> {
  const session = await getCurrentSession();

  if (!session.accessToken) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  if (!polarAccessToken) {
    return NextResponse.json(
      { success: false, error: 'Polar is not configured.' },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => null) as any;
  const checkoutId = String(body?.checkoutId || '').trim();

  if (!checkoutId) {
    return NextResponse.json({ success: false, error: 'Missing checkoutId' }, { status: 400 });
  }

  try {
    const checkout = await fetchPolarCheckout(checkoutId);
    const status: string = String(checkout?.status || '').toLowerCase();

    // Only activate on a confirmed/succeeded checkout
    if (!['succeeded', 'confirmed'].includes(status)) {
      return NextResponse.json({
        success: true,
        data: { synced: false, reason: `Checkout status is "${status}" — not yet confirmed.` },
      });
    }

    // Pull subscription data if available
    let expiry: string | null = null;
    const subscriptionId = checkout?.subscription_id || checkout?.data?.subscription_id;
    if (subscriptionId) {
      const sub = await fetchPolarSubscription(subscriptionId).catch(() => null);
      const rawExpiry =
        sub?.current_period_end ||
        sub?.current_period_end_at ||
        sub?.ends_at ||
        sub?.expires_at ||
        null;
      if (rawExpiry) expiry = new Date(rawExpiry).toISOString();
    }

    // Forward to backend to update DB — backend resolves user via external_customer_id or email
    const syncResp = await fetch(`${backendConfig.apiBaseUrl}/api/billing/polar-sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.accessToken}`,
      },
      body: JSON.stringify({
        externalCustomerId: checkout?.external_customer_id || checkout?.customer?.external_id || null,
        customerEmail: checkout?.customer_email || checkout?.customer?.email || null,
        status: 'active',
        expiry,
        subscriptionId: subscriptionId || null,
      }),
    });

    const syncData = await syncResp.json().catch(() => ({ success: false }));
    return NextResponse.json(syncData, { status: syncResp.status });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to sync checkout' },
      { status: 502 }
    );
  }
}
