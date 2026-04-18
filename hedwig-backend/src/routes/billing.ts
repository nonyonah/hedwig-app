import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { createLogger } from '../utils/logger';
import { getOrCreateUser } from '../utils/userHelper';
import {
    getRevenueCatStateForUser,
    REVENUECAT_PRIMARY_ENTITLEMENT,
    syncRevenueCatStateForUser,
} from '../services/revenuecat';

const logger = createLogger('Billing');
const router = Router();

const PRO_MONTHLY_PRICE_USD = 5;
const PRO_ANNUAL_PRICE_USD = 48;
const PRO_ANNUAL_DISCOUNT_PERCENT = 20;

type BillingInterval = 'monthly' | 'annual';

const normalizeString = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    return normalized || null;
};

const resolveUnifiedStatus = (user: any): 'active' | 'inactive' | null => {
    const raw = normalizeString(user?.subscription_status ?? user?.subscriptionStatus);
    if (!raw) return null;
    const normalized = raw.toLowerCase();
    if (normalized === 'active') return 'active';
    if (normalized === 'inactive') return 'inactive';
    return null;
};

const resolveUnifiedProvider = (user: any): 'polar' | 'revenue_cat' | null => {
    const raw = normalizeString(user?.subscription_provider ?? user?.subscriptionProvider);
    if (!raw) return null;
    const normalized = raw.toLowerCase();
    if (normalized === 'polar') return 'polar';
    if (normalized === 'revenue_cat') return 'revenue_cat';
    return null;
};

const resolveUnifiedExpiry = (user: any): string | null => (
    normalizeString(user?.subscription_expiry ?? user?.subscriptionExpiry)
);

const isNotExpired = (isoDate: string | null): boolean => {
    if (!isoDate) return true;
    const parsed = Date.parse(isoDate);
    if (!Number.isFinite(parsed)) return true;
    return parsed > Date.now();
};

const getCheckoutBaseUrl = (interval: BillingInterval): string | null => {
    const envKey = interval === 'annual'
        ? process.env.REVENUECAT_WEB_CHECKOUT_ANNUAL_URL
        : process.env.REVENUECAT_WEB_CHECKOUT_MONTHLY_URL;
    const normalized = String(envKey || '').trim();
    return normalized || null;
};

const buildCheckoutUrl = (params: {
    interval: BillingInterval;
    appUserId: string;
    returnUrl?: string | null;
}): string | null => {
    const base = getCheckoutBaseUrl(params.interval);
    if (!base) return null;

    try {
        const url = new URL(base);
        if (!url.searchParams.has('app_user_id')) {
            url.searchParams.set('app_user_id', params.appUserId);
        }
        if (params.returnUrl && !url.searchParams.has('return_url')) {
            url.searchParams.set('return_url', params.returnUrl);
        }
        return url.toString();
    } catch {
        const query = new URLSearchParams();
        query.set('app_user_id', params.appUserId);
        if (params.returnUrl) query.set('return_url', params.returnUrl);
        const separator = base.includes('?') ? '&' : '?';
        return `${base}${separator}${query.toString()}`;
    }
};

const pricingResponse = {
    monthly: {
        id: 'pro-monthly',
        interval: 'monthly',
        priceUsd: PRO_MONTHLY_PRICE_USD,
        label: '$5/month',
    },
    annual: {
        id: 'pro-annual',
        interval: 'annual',
        priceUsd: PRO_ANNUAL_PRICE_USD,
        label: '$48/year',
        monthlyEquivalentUsd: Number((PRO_ANNUAL_PRICE_USD / 12).toFixed(2)),
        discountPercent: PRO_ANNUAL_DISCOUNT_PERCENT,
    },
} as const;

router.get('/status', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const privyId = req.user!.id;
        const user = await getOrCreateUser(privyId);
        if (!user) {
            res.status(404).json({ success: false, error: { message: 'User not found' } });
            return;
        }

        await syncRevenueCatStateForUser(user as any);
        const state = await getRevenueCatStateForUser(user as any);
        const unifiedStatus = resolveUnifiedStatus(user);
        const unifiedProvider = resolveUnifiedProvider(user);
        const unifiedExpiry = resolveUnifiedExpiry(user);
        const unifiedIsActive = unifiedStatus ? (unifiedStatus === 'active' && isNotExpired(unifiedExpiry)) : null;

        const isActive = unifiedIsActive ?? Boolean(state?.is_active);
        const plan = isActive ? 'pro' : 'free';
        const expiresAt = unifiedExpiry || state?.expires_at || null;
        const updatedAt = normalizeString(user?.updated_at ?? user?.updatedAt) || state?.updated_at || null;
        const featureFlags = {
            webCheckoutEnabled: process.env.BILLING_WEB_CHECKOUT_ENABLED !== 'false',
            mobilePaywallEnabled: process.env.BILLING_MOBILE_PAYWALL_ENABLED === 'true',
            enforcementEnabled: process.env.BILLING_ENFORCEMENT_ENABLED === 'true',
        };

        res.json({
            success: true,
            data: {
                plan,
                entitlement: {
                    id: REVENUECAT_PRIMARY_ENTITLEMENT,
                    isActive,
                    expiresAt,
                    productId: state?.product_id || null,
                    store: state?.store || (unifiedProvider === 'polar' ? 'POLAR' : unifiedProvider === 'revenue_cat' ? 'REVENUE_CAT' : null),
                    environment: state?.environment || null,
                    willRenew: state?.will_renew ?? null,
                    isTrial: Boolean(state?.is_trial),
                    billingIssueDetected: Boolean(state?.billing_issue_detected),
                    latestEventType: state?.latest_event_type || null,
                    latestEventAt: state?.event_timestamp_ms
                        ? new Date(Number(state.event_timestamp_ms)).toISOString()
                        : null,
                    updatedAt,
                },
                appUserId: state?.app_user_id || user.id,
                featureFlags,
            },
        });
    } catch (error) {
        logger.error('Failed to fetch billing status', {
            error: error instanceof Error ? error.message : 'Unknown',
        });
        next(error);
    }
});

router.get('/checkout-config', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const privyId = req.user!.id;
        const user = await getOrCreateUser(privyId);
        if (!user) {
            res.status(404).json({ success: false, error: { message: 'User not found' } });
            return;
        }

        await syncRevenueCatStateForUser(user as any);
        const state = await getRevenueCatStateForUser(user as any);
        const unifiedStatus = resolveUnifiedStatus(user);
        const unifiedExpiry = resolveUnifiedExpiry(user);
        const unifiedIsActive = unifiedStatus ? (unifiedStatus === 'active' && isNotExpired(unifiedExpiry)) : null;

        const isActive = unifiedIsActive ?? Boolean(state?.is_active);
        const appUserId = String(state?.app_user_id || user.id);

        res.json({
            success: true,
            data: {
                appUserId,
                plan: isActive ? 'pro' : 'free',
                entitlement: {
                    id: REVENUECAT_PRIMARY_ENTITLEMENT,
                    isActive,
                },
                pricing: pricingResponse,
                checkout: {
                    monthlyEnabled: Boolean(getCheckoutBaseUrl('monthly')),
                    annualEnabled: Boolean(getCheckoutBaseUrl('annual')),
                },
            },
        });
    } catch (error) {
        logger.error('Failed to fetch billing checkout config', {
            error: error instanceof Error ? error.message : 'Unknown',
        });
        next(error);
    }
});

router.post('/checkout-link', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const intervalRaw = String(req.body?.interval || 'monthly').trim().toLowerCase();
        const interval: BillingInterval = intervalRaw === 'annual' ? 'annual' : 'monthly';
        const returnUrl = typeof req.body?.returnUrl === 'string' ? req.body.returnUrl.trim() : null;

        const privyId = req.user!.id;
        const user = await getOrCreateUser(privyId);
        if (!user) {
            res.status(404).json({ success: false, error: { message: 'User not found' } });
            return;
        }

        await syncRevenueCatStateForUser(user as any);
        const state = await getRevenueCatStateForUser(user as any);
        const appUserId = String(state?.app_user_id || user.id);

        const checkoutUrl = buildCheckoutUrl({
            interval,
            appUserId,
            returnUrl,
        });

        if (!checkoutUrl) {
            res.status(503).json({
                success: false,
                error: {
                    message: `Checkout is not configured for ${interval} billing.`,
                },
            });
            return;
        }

        res.json({
            success: true,
            data: {
                interval,
                appUserId,
                checkoutUrl,
                pricing: pricingResponse[interval],
            },
        });
    } catch (error) {
        logger.error('Failed to create billing checkout link', {
            error: error instanceof Error ? error.message : 'Unknown',
        });
        next(error);
    }
});

export default router;
