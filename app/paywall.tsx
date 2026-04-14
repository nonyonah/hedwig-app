import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PurchasesOffering } from 'react-native-purchases';
import RevenueCatUI from 'react-native-purchases-ui';
import { useThemeColors } from '../theme/colors';
import { useAuth } from '../hooks/useAuth';
import { useBillingStatus } from '../hooks/useBillingStatus';
import {
    configureRevenueCatForUser,
    getRevenueCatOfferings,
    getRevenueCatUnavailableReason,
    isRevenueCatAvailable,
    isRevenueCatPurchaseCancelled,
} from '../services/revenuecat';
import { useAnalyticsScreen } from '../hooks/useAnalyticsScreen';

type PaywallParams = {
    mode?: string;
};

export default function PaywallScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const themeColors = useThemeColors();
    const { user, isReady } = useAuth();
    const params = useLocalSearchParams<PaywallParams>();

    useAnalyticsScreen('Mobile Paywall');

    const {
        billingStatus,
        isLoadingBillingStatus,
        billingStatusError,
        refreshBillingStatus,
        hasActiveEntitlement,
        isBillingEnforcementEnabled,
    } = useBillingStatus();

    const [isLoadingOfferings, setIsLoadingOfferings] = useState(false);
    const [isManagingSubscription, setIsManagingSubscription] = useState(false);
    const [paywallError, setPaywallError] = useState<string | null>(null);
    const [offering, setOffering] = useState<PurchasesOffering | null>(null);

    const isManageMode = params.mode === 'manage';
    const canDismissScreen = isManageMode || !isBillingEnforcementEnabled || hasActiveEntitlement;

    const closeScreen = useCallback(() => {
        if (router.canGoBack()) {
            router.back();
            return;
        }
        router.replace('/(drawer)/(tabs)');
    }, [router]);

    useEffect(() => {
        if (isReady && !user) {
            router.replace('/auth/welcome');
        }
    }, [isReady, user, router]);

    useEffect(() => {
        if (!isReady || !user) return;
        if (isLoadingBillingStatus) return;

        // Keep active subscribers on manage mode only when explicitly requested.
        if (hasActiveEntitlement && !isManageMode) {
            closeScreen();
        }
    }, [closeScreen, hasActiveEntitlement, isLoadingBillingStatus, isManageMode, isReady, user]);

    const loadOfferings = useCallback(async () => {
        if (isManageMode && hasActiveEntitlement) {
            return;
        }

        if (!billingStatus?.appUserId) return;

        if (!isRevenueCatAvailable()) {
            const unavailableReason = getRevenueCatUnavailableReason();
            setPaywallError(
                unavailableReason ||
                    'RevenueCat is not configured for this build. Add platform API keys to continue.'
            );
            return;
        }

        setIsLoadingOfferings(true);
        setPaywallError(null);

        try {
            await configureRevenueCatForUser(billingStatus.appUserId);
            const offerings = await getRevenueCatOfferings();
            const currentOffering = offerings.current || Object.values(offerings.all || {})[0] || null;

            if (!currentOffering) {
                throw new Error('No Pro offering found. Configure a current offering in RevenueCat.');
            }

            setOffering(currentOffering);
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : 'Could not load paywall. Please try again.';
            setPaywallError(message);
        } finally {
            setIsLoadingOfferings(false);
        }
    }, [billingStatus?.appUserId, hasActiveEntitlement, isManageMode]);

    useEffect(() => {
        void loadOfferings();
    }, [loadOfferings]);

    const handlePaywallDismiss = useCallback(async () => {
        await refreshBillingStatus();

        if (canDismissScreen) {
            closeScreen();
        }
    }, [canDismissScreen, closeScreen, refreshBillingStatus]);

    const handlePurchaseCompleted = useCallback(async () => {
        await refreshBillingStatus();
        Alert.alert('Subscription active', 'Your Pro access is now active.');
        closeScreen();
    }, [closeScreen, refreshBillingStatus]);

    const handlePurchaseError = useCallback((error: unknown) => {
        if (isRevenueCatPurchaseCancelled(error)) {
            return;
        }

        const message =
            error instanceof Error
                ? error.message
                : 'Purchase failed. Please try again.';

        setPaywallError(message);
        Alert.alert('Purchase failed', message);
    }, []);

    const handleRestoreCompleted = useCallback(async () => {
        await refreshBillingStatus();
        Alert.alert('Restore complete', 'Your purchases were restored successfully.');
        if (!isBillingEnforcementEnabled) {
            closeScreen();
        }
    }, [closeScreen, isBillingEnforcementEnabled, refreshBillingStatus]);

    const handleRestoreError = useCallback((error: unknown) => {
        const message =
            error instanceof Error
                ? error.message
                : 'Could not restore purchases.';

        setPaywallError(message);
        Alert.alert('Restore failed', message);
    }, []);

    const openSubscriptionCenter = useCallback(async () => {
        try {
            if (!billingStatus?.appUserId) {
                Alert.alert('Subscription', 'Billing profile is still loading. Please try again in a moment.');
                return;
            }

            if (!isRevenueCatAvailable()) {
                const reason = getRevenueCatUnavailableReason() || 'RevenueCat is unavailable in this build.';
                Alert.alert('Subscription unavailable', reason);
                return;
            }

            setIsManagingSubscription(true);
            const configured = await configureRevenueCatForUser(billingStatus.appUserId);
            if (!configured) {
                Alert.alert('Subscription unavailable', 'RevenueCat is not configured for this user yet.');
                return;
            }

            await RevenueCatUI.presentCustomerCenter();
            await refreshBillingStatus();
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : 'Could not open subscription management right now.';
            Alert.alert('Subscription error', message);
        } finally {
            setIsManagingSubscription(false);
        }
    }, [billingStatus?.appUserId, refreshBillingStatus]);

    const planLabel = useMemo(() => {
        if (billingStatus?.entitlement?.isActive) {
            return 'Hedwig Pro active';
        }
        return 'Free plan';
    }, [billingStatus?.entitlement?.isActive]);

    if (!isReady || isLoadingBillingStatus) {
        return (
            <View style={[styles.loadingContainer, { backgroundColor: themeColors.background }]}> 
                <ActivityIndicator size="small" color={themeColors.primary} />
            </View>
        );
    }

    const showLoading = isLoadingOfferings;

    return (
        <View style={[styles.container, { backgroundColor: themeColors.background, paddingTop: insets.top + 8 }]}> 
            {canDismissScreen ? (
                <View style={styles.headerRow}>
                    <View style={{ flex: 1 }} />
                    <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel="Close"
                        onPress={closeScreen}
                        style={[styles.closeButton, { borderColor: themeColors.border }]}
                    >
                        <Text style={[styles.closeButtonText, { color: themeColors.textPrimary }]}>Close</Text>
                    </TouchableOpacity>
                </View>
            ) : null}

            <View style={styles.body}>
                {isManageMode && hasActiveEntitlement ? (
                    <View style={[styles.manageCard, { backgroundColor: themeColors.surface }]}> 
                        <Text style={[styles.manageTitle, { color: themeColors.textPrimary }]}>Manage subscription</Text>
                        <Text style={[styles.manageMeta, { color: themeColors.textSecondary }]}>{planLabel}</Text>
                        {billingStatus?.entitlement?.productId ? (
                            <Text style={[styles.manageMeta, { color: themeColors.textSecondary }]}>Product: {billingStatus.entitlement.productId}</Text>
                        ) : null}

                        <TouchableOpacity
                            style={[styles.primaryButton, { backgroundColor: themeColors.primary }]}
                            onPress={() => {
                                void openSubscriptionCenter();
                            }}
                            disabled={isManagingSubscription}
                        >
                            {isManagingSubscription ? (
                                <ActivityIndicator color="#FFFFFF" size="small" />
                            ) : (
                                <Text style={styles.primaryButtonText}>Cancel or change plan</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                ) : showLoading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="small" color={themeColors.primary} />
                    </View>
                ) : !offering ? (
                    <View style={styles.fallbackContainer}>
                        <Text style={[styles.fallbackText, { color: themeColors.textSecondary }]}> 
                            We could not load the Pro plan yet.
                        </Text>
                        <TouchableOpacity
                            style={[styles.retryButton, { borderColor: themeColors.border }]}
                            onPress={() => {
                                void loadOfferings();
                            }}
                        >
                            <Text style={[styles.retryButtonText, { color: themeColors.textPrimary }]}>Try again</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <RevenueCatUI.Paywall
                        options={{
                            offering,
                            displayCloseButton: canDismissScreen,
                        }}
                        onPurchaseCompleted={async () => {
                            await handlePurchaseCompleted();
                        }}
                        onPurchaseError={({ error }) => {
                            handlePurchaseError(error);
                        }}
                        onPurchaseCancelled={() => {
                            setPaywallError(null);
                        }}
                        onRestoreCompleted={async () => {
                            await handleRestoreCompleted();
                        }}
                        onRestoreError={({ error }) => {
                            handleRestoreError(error);
                        }}
                        onDismiss={() => {
                            void handlePaywallDismiss();
                        }}
                    />
                )}
            </View>

            {(billingStatusError || paywallError) ? (
                <Text style={styles.errorText}>{billingStatusError || paywallError}</Text>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingBottom: 6,
    },
    closeButton: {
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 14,
        paddingVertical: 8,
    },
    closeButtonText: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 13,
    },
    body: {
        flex: 1,
    },
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    fallbackContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
        gap: 12,
    },
    fallbackText: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 14,
        textAlign: 'center',
    },
    retryButton: {
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 16,
        paddingVertical: 10,
    },
    retryButtonText: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 14,
    },
    manageCard: {
        margin: 16,
        borderRadius: 20,
        padding: 18,
        gap: 10,
    },
    manageTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 22,
    },
    manageMeta: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 14,
    },
    primaryButton: {
        marginTop: 8,
        borderRadius: 12,
        paddingVertical: 13,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 46,
    },
    primaryButtonText: {
        color: '#FFFFFF',
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 14,
    },
    errorText: {
        color: '#D32F2F',
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 13,
        paddingHorizontal: 20,
        paddingBottom: 6,
    },
});
