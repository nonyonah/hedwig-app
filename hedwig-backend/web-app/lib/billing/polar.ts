export type BillingInterval = 'monthly' | 'annual';
export type PolarServer = 'sandbox' | 'production';
export type PlanTier = 'starter' | 'pro';

const normalize = (value: string | undefined): string => String(value || '').trim();

const appBaseUrl = () => normalize(process.env.NEXT_PUBLIC_APP_URL) || 'http://localhost:3001';

export const resolvePolarServer = (): PolarServer => (
  normalize(process.env.POLAR_SERVER).toLowerCase() === 'sandbox' ? 'sandbox' : 'production'
);

export const resolvePolarCheckoutSuccessUrl = (): string => (
  normalize(process.env.POLAR_CHECKOUT_SUCCESS_URL) || `${appBaseUrl()}/pricing/success`
);

export const resolvePolarCheckoutReturnUrl = (): string => (
  normalize(process.env.POLAR_CHECKOUT_RETURN_URL) || `${appBaseUrl()}/pricing`
);

export const resolvePolarPortalReturnUrl = (): string => (
  normalize(process.env.POLAR_PORTAL_RETURN_URL) || `${appBaseUrl()}/settings`
);

export function resolvePolarProductId(interval: BillingInterval, plan: PlanTier = 'starter'): string {
  if (plan === 'pro') {
    return interval === 'annual'
      ? normalize(process.env.POLAR_PRO_ANNUAL_ID)
      : normalize(process.env.POLAR_PRO_MONTHLY_ID);
  }
  return interval === 'annual'
    ? normalize(process.env.POLAR_STARTER_ANNUAL_ID)
    : normalize(process.env.POLAR_STARTER_MONTHLY_ID);
}

export function resolvePolarDiscountId(interval: BillingInterval, plan: PlanTier = 'starter'): string {
  if (plan === 'pro') {
    return normalize(process.env.POLAR_PRO_ANNUAL_DISCOUNT_ID);
  }
  return normalize(process.env.POLAR_STARTER_ANNUAL_DISCOUNT_ID);
}

/**
 * Detect which plan a product ID belongs to by checking against all
 * configured Polar product IDs.
 */
export function resolvePlanFromProductId(productId: string | null | undefined): PlanTier | null {
  if (!productId) return null;
  const id = productId.trim();

  const proIds = [
    normalize(process.env.POLAR_PRO_MONTHLY_ID),
    normalize(process.env.POLAR_PRO_ANNUAL_ID),
  ].filter(Boolean);
  if (proIds.includes(id)) return 'pro';

  const starterIds = [
    normalize(process.env.POLAR_STARTER_MONTHLY_ID),
    normalize(process.env.POLAR_STARTER_ANNUAL_ID),
    normalize(process.env.POLAR_PRODUCT_ID_MONTHLY),
    normalize(process.env.POLAR_PRODUCT_ID_ANNUAL),
  ].filter(Boolean);
  if (starterIds.includes(id)) return 'starter';

  return null;
}

/** All configured Polar product IDs across all plans and intervals. */
export function resolveAllPolarProductIds(): string[] {
  const ids = [
    process.env.POLAR_STARTER_MONTHLY_ID,
    process.env.POLAR_STARTER_ANNUAL_ID,
    process.env.POLAR_PRO_MONTHLY_ID,
    process.env.POLAR_PRO_ANNUAL_ID,
    process.env.POLAR_PRODUCT_ID_MONTHLY,
    process.env.POLAR_PRODUCT_ID_ANNUAL,
  ];
  return ids.filter(Boolean).map((v) => v!.trim()).filter(Boolean);
}
