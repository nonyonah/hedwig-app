import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth/session';
import { resolvePolarProductId, resolvePolarDiscountId, type BillingInterval, type PlanTier } from '@/lib/billing/polar';

const normalizeInterval = (value: string | null): BillingInterval => (
  value?.toLowerCase() === 'monthly' ? 'monthly' : 'annual'
);

const normalizePlan = (value: string | null): PlanTier => (
  value?.toLowerCase() === 'pro' ? 'pro' : 'starter'
);

const trialDays = parseInt(String(process.env.POLAR_TRIAL_DAYS || '0'), 10);

export async function GET(req: NextRequest): Promise<Response> {
  const session = await getCurrentSession();

  if (!session.accessToken || !session.user?.id) {
    return NextResponse.redirect(new URL('/sign-in', req.url));
  }

  const interval = normalizeInterval(req.nextUrl.searchParams.get('interval'));
  const plan = normalizePlan(req.nextUrl.searchParams.get('plan'));
  const mode = req.nextUrl.searchParams.get('mode') === 'switch' ? 'switch' : 'checkout';
  const productId = resolvePolarProductId(interval, plan);

  if (!productId) {
    const key = plan === 'pro'
      ? (interval === 'annual' ? 'POLAR_PRO_ANNUAL_ID' : 'POLAR_PRO_MONTHLY_ID')
      : (interval === 'annual' ? 'POLAR_STARTER_ANNUAL_ID' : 'POLAR_STARTER_MONTHLY_ID');
    return NextResponse.json(
      { success: false, error: `Missing ${key} configuration.` },
      { status: 503 }
    );
  }

  const redirectUrl = new URL('/api/polar/checkout', req.url);
  redirectUrl.searchParams.append('products', productId);
  redirectUrl.searchParams.set('customerExternalId', session.user.id);

  if (session.user.email) {
    redirectUrl.searchParams.set('customerEmail', session.user.email);
  }

  const fullName = `${session.user.firstName || ''} ${session.user.lastName || ''}`.trim();
  if (fullName) {
    redirectUrl.searchParams.set('customerName', fullName);
  }

  redirectUrl.searchParams.set(
    'metadata',
    JSON.stringify({
      source: 'hedwig-web',
      plan,
      interval,
      mode,
      userId: session.user.id,
    })
  );

  if (interval === 'annual') {
    const discountId = resolvePolarDiscountId(interval, plan);
    if (discountId) {
      redirectUrl.searchParams.set('discountId', discountId);
    }
  }
  if (trialDays > 0 && mode !== 'switch') {
    redirectUrl.searchParams.set('trialDays', String(trialDays));
  }

  return NextResponse.redirect(redirectUrl);
}
