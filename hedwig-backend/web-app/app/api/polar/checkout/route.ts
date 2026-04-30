import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth/session';
import {
  resolvePolarCheckoutReturnUrl,
  resolvePolarCheckoutSuccessUrl,
  resolvePolarProductId,
  resolvePolarServer
} from '@/lib/billing/polar';

export const runtime = 'nodejs';

const polarAccessToken = String(process.env.POLAR_ACCESS_TOKEN || '').trim();

const polarBaseUrl = () =>
  resolvePolarServer() === 'sandbox'
    ? 'https://sandbox-api.polar.sh'
    : 'https://api.polar.sh';

const parseJsonParam = (value: string | null): Record<string, string | number | boolean> | undefined => {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
    const result: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') result[k] = v;
    }
    return Object.keys(result).length ? result : undefined;
  } catch {
    return undefined;
  }
};

export async function GET(req: NextRequest): Promise<Response> {
  const session = await getCurrentSession();

  if (!session.accessToken || !session.user?.id) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  if (!polarAccessToken) {
    return NextResponse.json(
      { success: false, error: 'POLAR_ACCESS_TOKEN is not configured.' },
      { status: 503 }
    );
  }

  const products = req.nextUrl.searchParams
    .getAll('products')
    .map((v) => v.trim())
    .filter(Boolean);

  if (!products.length) {
    return NextResponse.json(
      { success: false, error: 'Missing products in query params.' },
      { status: 400 }
    );
  }

  const allowedProductIds = new Set(
    [resolvePolarProductId('monthly'), resolvePolarProductId('annual')].filter(Boolean)
  );
  if (products.some((product) => !allowedProductIds.has(product))) {
    return NextResponse.json(
      { success: false, error: 'Invalid product for this workspace.' },
      { status: 400 }
    );
  }

  const successUrl = new URL(resolvePolarCheckoutSuccessUrl());
  successUrl.searchParams.set('checkoutId', '{CHECKOUT_ID}');

  const externalCustomerId = req.nextUrl.searchParams.get('customerExternalId')?.trim() || undefined;
  const customerEmail = req.nextUrl.searchParams.get('customerEmail')?.trim() || undefined;
  const customerName = req.nextUrl.searchParams.get('customerName')?.trim() || undefined;
  const metadata = parseJsonParam(req.nextUrl.searchParams.get('metadata'));
  const discountId = req.nextUrl.searchParams.get('discountId')?.trim() || undefined;
  const trialDays = parseInt(req.nextUrl.searchParams.get('trialDays') || '0', 10);

  // Build body with snake_case as required by the Polar REST API
  const body: Record<string, unknown> = {
    products,
    success_url: successUrl.toString(),
    return_url: resolvePolarCheckoutReturnUrl(),
  };
  body.external_customer_id = session.user.id;
  if (customerEmail && customerEmail !== session.user.email) {
    return NextResponse.json(
      { success: false, error: 'Customer email does not match the current session.' },
      { status: 400 }
    );
  }
  if (externalCustomerId && externalCustomerId !== session.user.id) {
    return NextResponse.json(
      { success: false, error: 'Customer id does not match the current session.' },
      { status: 400 }
    );
  }
  if (session.user.email) body.customer_email = session.user.email;
  if (customerName) body.customer_name = customerName;
  body.metadata = {
    ...(metadata || {}),
    userId: session.user.id,
  };
  if (discountId) body.discount_id = discountId;
  if (trialDays > 0) body.subscription_trial_period_days = trialDays;

  try {
    const response = await fetch(`${polarBaseUrl()}/v1/checkouts/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${polarAccessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      return NextResponse.json(
        { success: false, error: 'Polar checkout creation failed.', details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json() as { url?: string };
    const checkoutUrl = String(data?.url || '').trim();
    if (!checkoutUrl) {
      return NextResponse.json(
        { success: false, error: 'Polar did not return a checkout URL.' },
        { status: 502 }
      );
    }

    return NextResponse.redirect(checkoutUrl, { status: 302 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: 'Unable to reach Polar API.', details: error?.message || String(error) },
      { status: 502 }
    );
  }
}
