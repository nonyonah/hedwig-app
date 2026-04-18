export type BillingInterval = 'monthly' | 'annual';
export type PolarServer = 'sandbox' | 'production';

const normalize = (value: string | undefined): string => String(value || '').trim();

const appBaseUrl = () => normalize(process.env.NEXT_PUBLIC_APP_URL) || 'http://localhost:3001';

export const resolvePolarServer = (): PolarServer => (
  normalize(process.env.POLAR_SERVER).toLowerCase() === 'sandbox' ? 'sandbox' : 'production'
);

export const resolvePolarCheckoutSuccessUrl = (): string => (
  normalize(process.env.POLAR_CHECKOUT_SUCCESS_URL) || `${appBaseUrl()}/pricing`
);

export const resolvePolarCheckoutReturnUrl = (): string => (
  normalize(process.env.POLAR_CHECKOUT_RETURN_URL) || `${appBaseUrl()}/pricing`
);

export const resolvePolarPortalReturnUrl = (): string => (
  normalize(process.env.POLAR_PORTAL_RETURN_URL) || `${appBaseUrl()}/settings`
);

export const resolvePolarProductId = (interval: BillingInterval): string => (
  interval === 'annual'
    ? normalize(process.env.POLAR_PRODUCT_ID_ANNUAL)
    : normalize(process.env.POLAR_PRODUCT_ID_MONTHLY)
);
