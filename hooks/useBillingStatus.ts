import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useAuth } from './useAuth';
import { joinApiUrl } from '../utils/apiBaseUrl';
import { configureRevenueCatForUser } from '../services/revenuecat';

export interface BillingStatusSummary {
    plan: 'free' | 'pro';
    appUserId: string;
    entitlement: {
        id: string;
        isActive: boolean;
        expiresAt: string | null;
        productId: string | null;
        store: string | null;
        environment: string | null;
        willRenew: boolean | null;
        isTrial: boolean;
        billingIssueDetected: boolean;
        latestEventType: string | null;
        latestEventAt: string | null;
        updatedAt: string | null;
    };
    featureFlags: {
        webCheckoutEnabled: boolean;
        mobilePaywallEnabled: boolean;
        enforcementEnabled: boolean;
    };
}

const getDemoBillingStatus = (): BillingStatusSummary => ({
    plan: 'pro',
    appUserId: 'demo-user-hedwig-app-review',
    entitlement: {
        id: 'pro',
        isActive: true,
        expiresAt: null,
        productId: null,
        store: null,
        environment: null,
        willRenew: null,
        isTrial: false,
        billingIssueDetected: false,
        latestEventType: null,
        latestEventAt: null,
        updatedAt: null,
    },
    featureFlags: {
        webCheckoutEnabled: true,
        mobilePaywallEnabled: false,
        enforcementEnabled: false,
    },
});

interface UseBillingStatusOptions {
    autoConfigureRevenueCat?: boolean;
}

export const useBillingStatus = ({ autoConfigureRevenueCat = true }: UseBillingStatusOptions = {}) => {
    const { user, isReady, isDemo, getAccessToken } = useAuth();

    const [billingStatus, setBillingStatus] = useState<BillingStatusSummary | null>(null);
    const [isLoadingBillingStatus, setIsLoadingBillingStatus] = useState(false);
    const [billingStatusError, setBillingStatusError] = useState<string | null>(null);

    const refreshBillingStatus = useCallback(async () => {
        if (!isReady) return;

        if (!user) {
            setBillingStatus(null);
            setBillingStatusError(null);
            setIsLoadingBillingStatus(false);
            return;
        }

        if (isDemo) {
            setBillingStatus(getDemoBillingStatus());
            setBillingStatusError(null);
            setIsLoadingBillingStatus(false);
            return;
        }

        setIsLoadingBillingStatus(true);
        setBillingStatusError(null);

        try {
            const token = await getAccessToken();
            if (!token) {
                throw new Error('Missing auth token.');
            }

            const response = await fetch(joinApiUrl('/api/billing/status'), {
                headers: { Authorization: `Bearer ${token}` },
            });

            const payload = await response.json().catch(() => null);
            if (!response.ok) {
                const message = payload?.error?.message || 'Could not load billing status.';
                throw new Error(message);
            }

            if (payload?.success === false) {
                const message = payload?.error?.message || 'Could not load billing status.';
                throw new Error(message);
            }

            const data = payload?.data as BillingStatusSummary | undefined;
            if (!data?.appUserId) {
                throw new Error('Invalid billing status response.');
            }

            setBillingStatus(data);

            if (
                autoConfigureRevenueCat &&
                Platform.OS !== 'web' &&
                String(data.appUserId || '').trim()
            ) {
                await configureRevenueCatForUser(data.appUserId);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Could not load billing status.';
            setBillingStatusError(message);
        } finally {
            setIsLoadingBillingStatus(false);
        }
    }, [autoConfigureRevenueCat, getAccessToken, isDemo, isReady, user]);

    useEffect(() => {
        void refreshBillingStatus();
    }, [refreshBillingStatus]);

    return {
        billingStatus,
        isLoadingBillingStatus,
        billingStatusError,
        refreshBillingStatus,
        hasActiveEntitlement: Boolean(billingStatus?.entitlement?.isActive),
        isMobilePaywallEnabled: Boolean(billingStatus?.featureFlags?.mobilePaywallEnabled),
        isBillingEnforcementEnabled: Boolean(billingStatus?.featureFlags?.enforcementEnabled),
    };
};
