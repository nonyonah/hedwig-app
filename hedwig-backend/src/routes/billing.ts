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

        const isActive = Boolean(state?.is_active);
        const plan = isActive ? 'pro' : 'free';
        const expiresAt = state?.expires_at || null;
        const updatedAt = state?.updated_at || null;
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
                    store: state?.store || null,
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

export default router;

