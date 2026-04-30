import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth/session';
import { backendConfig } from '@/lib/auth/config';
import { resolvePolarProductId, resolvePolarServer, type BillingInterval } from '@/lib/billing/polar';

export const runtime = 'nodejs';

const polarAccessToken = String(process.env.POLAR_ACCESS_TOKEN || '').trim();

const polarBaseUrl = () =>
  resolvePolarServer() === 'sandbox'
    ? 'https://sandbox-api.polar.sh'
    : 'https://api.polar.sh';

const normalizeInterval = (value: unknown): BillingInterval => (
  String(value || '').toLowerCase() === 'monthly' ? 'monthly' : 'annual'
);

const getIso = (value: unknown): string | null => {
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
};

class PublicApiError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = 'BILLING_SWITCH_FAILED',
    public details?: string
  ) {
    super(message);
    this.name = 'PublicApiError';
  }
}

const isTrialSubscription = (subscription: any): boolean => {
  const status = String(subscription?.status || '').toLowerCase();
  return status === 'trialing' || Boolean(subscription?.trial_end || subscription?.trial_ends_at);
};

async function listActiveSubscriptions(externalCustomerId: string): Promise<any[]> {
  const url = new URL(`${polarBaseUrl()}/v1/subscriptions`);
  url.searchParams.set('external_customer_id', externalCustomerId);
  url.searchParams.set('active', 'true');
  url.searchParams.set('limit', '10');
  url.searchParams.set('sorting', '-started_at');

  const resp = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${polarAccessToken}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new PublicApiError('Could not check your current subscription. Please try again in a moment.', 502, 'BILLING_LOOKUP_FAILED', text);
  }

  const data = await resp.json();
  return Array.isArray(data?.items) ? data.items : [];
}

async function updateSubscriptionProduct(subscriptionId: string, productId: string, interval: BillingInterval): Promise<any> {
  const resp = await fetch(`${polarBaseUrl()}/v1/subscriptions/${subscriptionId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${polarAccessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      product_id: productId,
      proration_behavior: 'prorate',
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    if (/trial/i.test(text)) {
      throw new PublicApiError(
        'Your Pro trial is already active. Polar does not allow changing billing cadence while the subscription is still in trial.',
        409,
        'BILLING_TRIAL_PLAN_CHANGE_LOCKED',
        text
      );
    }
    throw new PublicApiError('Could not switch your billing plan right now. Please try again in a moment.', 502, 'BILLING_UPDATE_FAILED', text);
  }

  return resp.json();
}

export async function POST(req: NextRequest): Promise<Response> {
  const session = await getCurrentSession();

  if (!session.accessToken || !session.user?.id) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  if (!polarAccessToken) {
    return NextResponse.json(
      { success: false, error: 'Polar is not configured.' },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => null) as { interval?: string } | null;
  const interval = normalizeInterval(body?.interval);
  const targetProductId = resolvePolarProductId(interval);

  if (!targetProductId) {
    return NextResponse.json(
      {
        success: false,
        error: `Missing ${interval === 'annual' ? 'POLAR_PRODUCT_ID_ANNUAL' : 'POLAR_PRODUCT_ID_MONTHLY'} configuration.`,
      },
      { status: 503 }
    );
  }

  try {
    const subscriptions = await listActiveSubscriptions(session.user.id);
    const subscription = subscriptions.find((item) => String(item?.product_id || '') !== targetProductId) || subscriptions[0];

    if (!subscription?.id) {
      return NextResponse.json(
        { success: false, error: 'No active Polar subscription was found for this account.', code: 'BILLING_SUBSCRIPTION_NOT_FOUND' },
        { status: 404 }
      );
    }

    if (String(subscription.product_id || '') === targetProductId) {
      return NextResponse.json({
        success: true,
        data: { interval, changed: false, reason: 'already_on_interval' },
      });
    }

    if (isTrialSubscription(subscription)) {
      return NextResponse.json(
        {
          success: false,
          code: 'BILLING_TRIAL_PLAN_CHANGE_LOCKED',
          error: 'Your Pro trial is already active. You can switch between monthly and yearly billing after the trial ends, or open subscription management to end the trial first.',
          data: {
            interval,
            trialEndsAt: getIso(subscription.trial_end || subscription.trial_ends_at || subscription.current_period_end || subscription.current_period_end_at),
          },
        },
        { status: 409 }
      );
    }

    const updated = await updateSubscriptionProduct(String(subscription.id), targetProductId, interval);
    const expiry = getIso(updated?.current_period_end || updated?.current_period_end_at || updated?.ends_at || updated?.expires_at);

    await fetch(`${backendConfig.apiBaseUrl}/api/billing/polar-sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.accessToken}`,
      },
      body: JSON.stringify({
        externalCustomerId: session.user.id,
        customerEmail: session.user.email || null,
        status: ['active', 'trialing'].includes(String(updated?.status || '').toLowerCase()) ? 'active' : 'inactive',
        expiry,
        subscriptionId: updated?.id || subscription.id,
        productId: updated?.product_id || targetProductId,
      }),
    }).catch(() => null);

    return NextResponse.json({
      success: true,
      data: {
        interval,
        changed: true,
        subscriptionId: updated?.id || subscription.id,
        productId: updated?.product_id || targetProductId,
        pendingUpdate: updated?.pending_update || null,
      },
    });
  } catch (error: any) {
    if (error instanceof PublicApiError) {
      return NextResponse.json(
        { success: false, code: error.code, error: error.message },
        { status: error.status }
      );
    }
    return NextResponse.json(
      { success: false, code: 'BILLING_SWITCH_FAILED', error: 'Could not switch your billing plan right now. Please try again in a moment.' },
      { status: 502 }
    );
  }
}
