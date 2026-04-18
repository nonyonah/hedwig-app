import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth/session';
import { resolvePolarProductId, type BillingInterval } from '@/lib/billing/polar';

const normalizeInterval = (value: string | null): BillingInterval => (
  value?.toLowerCase() === 'monthly' ? 'monthly' : 'annual'
);

const discountIdAnnual = String(process.env.POLAR_DISCOUNT_ID_ANNUAL || '').trim();
const trialDays = parseInt(String(process.env.POLAR_TRIAL_DAYS || '0'), 10);

export async function GET(req: NextRequest): Promise<Response> {
  const session = await getCurrentSession();

  if (!session.accessToken || !session.user?.id) {
    return NextResponse.redirect(new URL('/sign-in', req.url));
  }

  const interval = normalizeInterval(req.nextUrl.searchParams.get('interval'));
  const productId = resolvePolarProductId(interval);

  if (!productId) {
    return NextResponse.json(
      {
        success: false,
        error: `Missing ${interval === 'annual' ? 'POLAR_PRODUCT_ID_ANNUAL' : 'POLAR_PRODUCT_ID_MONTHLY'} configuration.`,
      },
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
      interval,
      userId: session.user.id,
    })
  );

  if (interval === 'annual' && discountIdAnnual) {
    redirectUrl.searchParams.set('discountId', discountIdAnnual);
  }
  if (trialDays > 0) {
    redirectUrl.searchParams.set('trialDays', String(trialDays));
  }

  return NextResponse.redirect(redirectUrl);
}
