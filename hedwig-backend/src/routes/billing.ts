import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { authenticate } from '../middleware/auth';
import { createLogger } from '../utils/logger';
import { getOrCreateUser } from '../utils/userHelper';
import { supabase } from '../lib/supabase';
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

const resolveProviderFromStore = (store: unknown): 'polar' | 'revenue_cat' | null => {
    const normalized = normalizeString(store)?.toUpperCase();
    if (!normalized) return null;
    if (normalized === 'POLAR') return 'polar';
    return 'revenue_cat';
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
        const providerFromStore = resolveProviderFromStore(state?.store);
        const subscriptionProvider = unifiedProvider ?? providerFromStore;
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
                    store: state?.store || (subscriptionProvider === 'polar' ? 'POLAR' : subscriptionProvider === 'revenue_cat' ? 'REVENUE_CAT' : null),
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
                subscriptionProvider,
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

// Called by Next.js /api/billing/polar/sync after a successful checkout redirect.
// Directly writes subscription_status so we don't depend solely on webhook timing.
router.post('/polar-sync', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { externalCustomerId, customerEmail, status, expiry, subscriptionId } = req.body as {
            externalCustomerId?: string | null;
            customerEmail?: string | null;
            status: 'active' | 'inactive';
            expiry?: string | null;
            subscriptionId?: string | null;
        };

        const privyId = req.user!.id;

        // Resolve user — prefer the calling user (most reliable), fall back to payload lookup
        let userId: string | null = null;

        const callerUser = await getOrCreateUser(privyId);
        if (callerUser) {
            userId = String(callerUser.id);
        }

        // Also try external_customer_id / email if different user (admin scenario)
        if (!userId && externalCustomerId) {
            const { data } = await supabase
                .from('users')
                .select('id')
                .or(`id.eq.${externalCustomerId},privy_id.eq.${externalCustomerId}`)
                .maybeSingle();
            if (data?.id) userId = String(data.id);
        }

        if (!userId && customerEmail) {
            const { data } = await supabase
                .from('users')
                .select('id')
                .ilike('email', customerEmail)
                .maybeSingle();
            if (data?.id) userId = String(data.id);
        }

        if (!userId) {
            res.status(404).json({ success: false, error: 'Could not resolve user for subscription sync.' });
            return;
        }

        const { error } = await supabase
            .from('users')
            .update({
                subscription_status:   status,
                subscription_provider: 'polar',
                subscription_expiry:   expiry ?? null,
                updated_at:            new Date().toISOString(),
            })
            .eq('id', userId);

        if (error) throw new Error(error.message);

        logger.info('Polar subscription synced via checkout', { userId, status, subscriptionId });

        res.json({ success: true, data: { synced: true, userId, status } });
    } catch (err) {
        logger.error('polar-sync failed', { error: err instanceof Error ? err.message : err });
        next(err);
    }
});

// Polar subscription status → our unified status
const mapPolarStatus = (status: string): 'active' | 'inactive' => {
    const s = status.toLowerCase();
    if (s === 'active' || s === 'trialing') return 'active';
    return 'inactive'; // canceled, cancelled, past_due, unpaid, incomplete, incomplete_expired
};

// Resolve user from Polar webhook payload — tries external_id (privy_id or UUID) and email.
const resolveUserFromWebhook = async (payload: any): Promise<string | null> => {
    const customer = payload?.data?.customer ?? {};
    const externalId = normalizeString(customer.external_id);
    const email = normalizeString(customer.email);

    if (externalId) {
        const { data } = await supabase
            .from('users')
            .select('id')
            .or(`id.eq.${externalId},privy_id.eq.${externalId}`)
            .maybeSingle();
        if (data?.id) return String(data.id);
    }

    if (email) {
        const { data } = await supabase
            .from('users')
            .select('id')
            .ilike('email', email)
            .maybeSingle();
        if (data?.id) return String(data.id);
    }

    return null;
};

// POST /api/billing/polar-webhook — called by Polar servers (no auth middleware)
router.post('/polar-webhook', async (req: Request, res: Response) => {
    // Validate signature when secret is configured
    const secret = process.env.POLAR_WEBHOOK_SECRET;
    if (secret) {
        const rawBody: Buffer | undefined = (req as any).rawBody;
        const sig = String(req.headers['x-polar-signature'] ?? req.headers['webhook-signature'] ?? '');
        if (rawBody && sig) {
            const expected = crypto
                .createHmac('sha256', secret)
                .update(rawBody)
                .digest('hex');
            // Polar may prefix with "sha256=" or "v1="
            const sigHex = sig.replace(/^(sha256=|v1=)/, '');
            const expectedBuf = Buffer.from(expected, 'hex');
            const sigBuf = Buffer.from(sigHex, 'hex');
            const valid = expectedBuf.length === sigBuf.length &&
                crypto.timingSafeEqual(expectedBuf, sigBuf);
            if (!valid) {
                logger.warn('Polar webhook: invalid signature');
                res.status(401).json({ error: 'Invalid signature' });
                return;
            }
        }
    }

    const eventType = String(req.body?.type ?? '');
    const HANDLED = ['subscription.updated', 'subscription.canceled', 'subscription.activated', 'subscription.revoked'];

    if (!HANDLED.includes(eventType)) {
        res.json({ received: true, handled: false });
        return;
    }

    try {
        const userId = await resolveUserFromWebhook(req.body);
        if (!userId) {
            logger.warn('Polar webhook: could not resolve user', { eventType });
            // Still 200 so Polar doesn't retry forever
            res.json({ received: true, handled: false, reason: 'user_not_found' });
            return;
        }

        const data = req.body?.data ?? {};
        const polarStatus: string = String(data.status ?? 'canceled');
        const status = mapPolarStatus(polarStatus);
        const expiry = normalizeString(data.current_period_end ?? data.ended_at) ?? null;

        const { error } = await supabase
            .from('users')
            .update({
                subscription_status:   status,
                subscription_provider: 'polar',
                subscription_expiry:   expiry,
                updated_at:            new Date().toISOString(),
            })
            .eq('id', userId);

        if (error) throw new Error(error.message);

        logger.info('Polar webhook: subscription updated', { userId, eventType, status, expiry });
        res.json({ received: true, handled: true });
    } catch (err) {
        logger.error('Polar webhook: processing failed', { error: err instanceof Error ? err.message : err });
        res.status(500).json({ error: 'Internal error' });
    }
});

export default router;
