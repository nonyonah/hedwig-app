import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PurchasesOffering } from 'react-native-purchases';
import { PACKAGE_TYPE } from 'react-native-purchases';
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
    purchaseRevenueCatPackage,
    restoreRevenueCatPurchases,
} from '../services/revenuecat';
import { useAnalyticsScreen } from '../hooks/useAnalyticsScreen';

type PaywallParams = {
    mode?: string;
};

type BillingPeriod = 'monthly' | 'annual';

const FEATURES = [
    'Unlimited invoices & payment links',
    'Client & project management',
    'Calendar & deadline tracking',
    'Revenue insights & analytics',
    'Early access to new features',
];

function CheckCircle() {
    return (
        <View style={styles.checkCircle}>
            <Text style={styles.checkMark}>✓</Text>
        </View>
    );
}

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
        refreshBillingStatus,
        hasActiveEntitlement,
        isBillingEnforcementEnabled,
    } = useBillingStatus();

    const [isLoadingOfferings, setIsLoadingOfferings] = useState(false);
    const [isManagingSubscription, setIsManagingSubscription] = useState(false);
    const [isPurchasing, setIsPurchasing] = useState(false);
    const [isRestoring, setIsRestoring] = useState(false);
    const [paywallError, setPaywallError] = useState<string | null>(null);
    const [rcUnavailable, setRcUnavailable] = useState(false);
    const [offering, setOffering] = useState<PurchasesOffering | null>(null);
    const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('annual');

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
        if (hasActiveEntitlement && !isManageMode) {
            closeScreen();
        }
    }, [closeScreen, hasActiveEntitlement, isLoadingBillingStatus, isManageMode, isReady, user]);

    const loadOfferings = useCallback(async () => {
        if (isManageMode && hasActiveEntitlement) return;
        if (!billingStatus?.appUserId) return;

        if (!isRevenueCatAvailable()) {
            const reason = getRevenueCatUnavailableReason();
            setRcUnavailable(true);
            setPaywallError(
                reason || 'In-app purchases are not available in this environment.'
            );
            return;
        }

        setIsLoadingOfferings(true);
        setPaywallError(null);
        setRcUnavailable(false);

        try {
            await configureRevenueCatForUser(billingStatus.appUserId);
            const offerings = await getRevenueCatOfferings();
            const currentOffering =
                offerings.current || Object.values(offerings.all || {})[0] || null;

            if (!currentOffering) {
                throw new Error('No Pro offering found. Configure a current offering in RevenueCat.');
            }

            setOffering(currentOffering);
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Could not load paywall. Please try again.';
            setPaywallError(message);
        } finally {
            setIsLoadingOfferings(false);
        }
    }, [billingStatus?.appUserId, hasActiveEntitlement, isManageMode]);

    useEffect(() => {
        void loadOfferings();
    }, [loadOfferings]);

    const monthlyPackage = useMemo(
        () =>
            offering?.availablePackages.find(
                (p) =>
                    p.packageType === PACKAGE_TYPE.MONTHLY ||
                    p.identifier.toLowerCase().includes('month')
            ) ?? null,
        [offering]
    );

    const annualPackage = useMemo(
        () =>
            offering?.availablePackages.find(
                (p) =>
                    p.packageType === PACKAGE_TYPE.ANNUAL ||
                    p.identifier.toLowerCase().includes('annual') ||
                    p.identifier.toLowerCase().includes('year')
            ) ?? null,
        [offering]
    );

    const monthlyPriceLabel = useMemo(() => {
        if (monthlyPackage?.product?.priceString) return monthlyPackage.product.priceString;
        return '$5.00';
    }, [monthlyPackage]);

    const annualPriceLabel = useMemo(() => {
        if (annualPackage?.product?.priceString) return annualPackage.product.priceString;
        return '$48.00';
    }, [annualPackage]);

    const annualMonthlyPriceLabel = useMemo(() => {
        if (annualPackage?.product?.price) {
            const monthly = annualPackage.product.price / 12;
            return `$${monthly.toFixed(2)}`;
        }
        return '$4.00';
    }, [annualPackage]);

    const displayPrice = billingPeriod === 'annual' ? annualMonthlyPriceLabel : monthlyPriceLabel;
    // Extract the integer part for large display (e.g. "$4" from "$4.00")
    const priceMain = displayPrice.replace(/\.00$/, '');

    const handlePurchase = async () => {
        const pkg = billingPeriod === 'annual' ? annualPackage : monthlyPackage;
        if (!pkg) return;
        setIsPurchasing(true);
        try {
            await purchaseRevenueCatPackage(pkg);
            await refreshBillingStatus();
            Alert.alert('Welcome to Pro!', 'Your subscription is now active.');
            closeScreen();
        } catch (err) {
            if (!isRevenueCatPurchaseCancelled(err)) {
                Alert.alert(
                    'Purchase failed',
                    err instanceof Error ? err.message : 'Please try again.'
                );
            }
        } finally {
            setIsPurchasing(false);
        }
    };

    const handleRestore = async () => {
        setIsRestoring(true);
        try {
            await restoreRevenueCatPurchases();
            await refreshBillingStatus();
            Alert.alert('Restored', 'Your purchases have been restored.');
            if (hasActiveEntitlement) closeScreen();
        } catch (err) {
            Alert.alert(
                'Restore failed',
                err instanceof Error ? err.message : 'Could not restore purchases.'
            );
        } finally {
            setIsRestoring(false);
        }
    };

    const openSubscriptionCenter = useCallback(async () => {
        try {
            if (!billingStatus?.appUserId) {
                Alert.alert(
                    'Subscription',
                    'Billing profile is still loading. Please try again in a moment.'
                );
                return;
            }

            if (!isRevenueCatAvailable()) {
                const reason =
                    getRevenueCatUnavailableReason() || 'RevenueCat is unavailable in this build.';
                Alert.alert('Subscription unavailable', reason);
                return;
            }

            setIsManagingSubscription(true);
            const configured = await configureRevenueCatForUser(billingStatus.appUserId);
            if (!configured) {
                Alert.alert(
                    'Subscription unavailable',
                    'RevenueCat is not configured for this user yet.'
                );
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

    // ── Loading state ────────────────────────────────────────────────────────
    if (!isReady || isLoadingBillingStatus) {
        return (
            <View
                style={[
                    styles.fullCenter,
                    { backgroundColor: themeColors.background },
                ]}
            >
                <ActivityIndicator size="small" color={themeColors.primary} />
            </View>
        );
    }

    // ── Manage mode ──────────────────────────────────────────────────────────
    if (isManageMode && hasActiveEntitlement) {
        return (
            <View
                style={[
                    styles.container,
                    { backgroundColor: themeColors.background, paddingTop: insets.top + 8 },
                ]}
            >
                {/* Close button */}
                <View style={styles.headerRow}>
                    <View style={{ flex: 1 }} />
                    <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel="Close"
                        onPress={closeScreen}
                        style={[styles.closeButton, { borderColor: themeColors.border }]}
                    >
                        <Text style={[styles.closeButtonText, { color: themeColors.textPrimary }]}>
                            Close
                        </Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.manageCenterWrap}>
                    <View style={[styles.manageCard, { backgroundColor: themeColors.surface }]}>
                        <Text style={[styles.manageTitle, { color: themeColors.textPrimary }]}>
                            Manage subscription
                        </Text>

                        {/* Status */}
                        <View style={styles.manageStatusRow}>
                            <View style={styles.manageStatusDot} />
                            <Text style={styles.manageStatusText}>Your plan is active</Text>
                        </View>

                        {billingStatus?.entitlement?.productId ? (
                            <Text
                                style={[styles.manageMeta, { color: themeColors.textSecondary }]}
                            >
                                {billingStatus.entitlement.productId}
                            </Text>
                        ) : null}

                        {/* Manage button */}
                        <TouchableOpacity
                            style={styles.managePrimaryBtn}
                            onPress={() => void openSubscriptionCenter()}
                            disabled={isManagingSubscription}
                            accessibilityRole="button"
                        >
                            {isManagingSubscription ? (
                                <ActivityIndicator color="#FFFFFF" size="small" />
                            ) : (
                                <Text style={styles.managePrimaryBtnText}>
                                    Manage subscription
                                </Text>
                            )}
                        </TouchableOpacity>

                        {/* Done link */}
                        <TouchableOpacity onPress={closeScreen} style={styles.manageDoneWrap}>
                            <Text style={[styles.manageDoneText, { color: themeColors.textSecondary }]}>
                                Done
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        );
    }

    // ── Loading offerings ────────────────────────────────────────────────────
    if (isLoadingOfferings) {
        return (
            <View
                style={[
                    styles.fullCenter,
                    { backgroundColor: themeColors.background },
                ]}
            >
                <ActivityIndicator size="small" color={themeColors.primary} />
            </View>
        );
    }

    const activePackage = billingPeriod === 'annual' ? annualPackage : monthlyPackage;
    const ctaDisabled = isPurchasing || isRestoring || rcUnavailable || !activePackage;

    // ── Main paywall ─────────────────────────────────────────────────────────
    return (
        <View
            style={[
                styles.container,
                { backgroundColor: themeColors.background, paddingTop: insets.top + 8 },
            ]}
        >
            {/* Close button */}
            {canDismissScreen ? (
                <View style={styles.headerRow}>
                    <View style={{ flex: 1 }} />
                    <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel="Close"
                        onPress={closeScreen}
                        style={[styles.closeButton, { borderColor: themeColors.border }]}
                    >
                        <Text style={[styles.closeButtonText, { color: themeColors.textPrimary }]}>
                            Close
                        </Text>
                    </TouchableOpacity>
                </View>
            ) : null}

            <ScrollView
                contentContainerStyle={[
                    styles.scrollContent,
                    !canDismissScreen && { paddingTop: 16 },
                ]}
                showsVerticalScrollIndicator={false}
            >
                {/* ── Hero section ─────────────────────────────────────── */}
                <View style={styles.heroSection}>
                    {/* Logo */}
                    <Image
                        source={require('../assets/images/hedwig-logo-transparent.png')}
                        style={styles.heroLogo}
                        resizeMode="contain"
                    />
                    {/* Headline */}
                    <Text style={[styles.heroHeadline, { color: themeColors.textPrimary }]}>
                        Everything you need to run your freelance business
                    </Text>

                    {/* Subtext */}
                    <Text style={[styles.heroSubtext, { color: themeColors.textSecondary }]}>
                        Join thousands of freelancers getting paid faster.
                    </Text>
                </View>

                {/* ── Feature list ─────────────────────────────────────── */}
                <View style={styles.featureList}>
                    {FEATURES.map((feature) => (
                        <View key={feature} style={styles.featureRow}>
                            <CheckCircle />
                            <Text style={[styles.featureText, { color: themeColors.textPrimary }]}>
                                {feature}
                            </Text>
                        </View>
                    ))}
                </View>

                {/* ── Plan toggle ───────────────────────────────────────── */}
                <View style={styles.toggleWrapper}>
                    <View
                        style={[
                            styles.toggleContainer,
                            { backgroundColor: themeColors.surface },
                        ]}
                    >
                        {/* Monthly pill */}
                        <TouchableOpacity
                            style={[
                                styles.togglePill,
                                billingPeriod === 'monthly' && styles.togglePillActive,
                            ]}
                            onPress={() => setBillingPeriod('monthly')}
                            accessibilityRole="button"
                            accessibilityState={{ selected: billingPeriod === 'monthly' }}
                        >
                            <Text
                                style={[
                                    styles.togglePillText,
                                    billingPeriod === 'monthly'
                                        ? styles.togglePillTextActive
                                        : { color: themeColors.textSecondary },
                                ]}
                            >
                                Monthly
                            </Text>
                        </TouchableOpacity>

                        {/* Annual pill */}
                        <TouchableOpacity
                            style={[
                                styles.togglePill,
                                billingPeriod === 'annual' && styles.togglePillActive,
                            ]}
                            onPress={() => setBillingPeriod('annual')}
                            accessibilityRole="button"
                            accessibilityState={{ selected: billingPeriod === 'annual' }}
                        >
                            <View style={styles.annualPillInner}>
                                <Text
                                    style={[
                                        styles.togglePillText,
                                        billingPeriod === 'annual'
                                            ? styles.togglePillTextActive
                                            : { color: themeColors.textSecondary },
                                    ]}
                                >
                                    Annual
                                </Text>
                                <View style={styles.saveBadge}>
                                    <Text style={styles.saveBadgeText}>Save 20%</Text>
                                </View>
                            </View>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* ── Price display ─────────────────────────────────────── */}
                <View style={styles.priceSection}>
                    <View style={styles.priceRow}>
                        <Text style={[styles.priceMain, { color: themeColors.textPrimary }]}>
                            {priceMain}
                        </Text>
                        <Text style={[styles.priceSuffix, { color: themeColors.textSecondary }]}>
                            /month
                        </Text>
                    </View>
                    <Text style={[styles.priceSub, { color: themeColors.textSecondary }]}>
                        {billingPeriod === 'annual'
                            ? `Billed ${annualPriceLabel}/year · Save 20%`
                            : `Billed ${monthlyPriceLabel}/month`}
                    </Text>
                </View>

                {/* ── CTA button ────────────────────────────────────────── */}
                <TouchableOpacity
                    style={[
                        styles.ctaButton,
                        ctaDisabled && styles.ctaButtonDisabled,
                    ]}
                    onPress={() => void handlePurchase()}
                    disabled={ctaDisabled}
                    accessibilityRole="button"
                >
                    {isPurchasing ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                        <Text style={styles.ctaButtonText}>
                            {isPurchasing ? 'Getting started…' : 'Get started'}
                        </Text>
                    )}
                </TouchableOpacity>

                {/* RC unavailable notice */}
                {rcUnavailable && paywallError ? (
                    <Text style={[styles.errorNote, { color: themeColors.textSecondary }]}>
                        {paywallError}
                    </Text>
                ) : null}

                {/* Network / offering error with retry */}
                {!rcUnavailable && paywallError ? (
                    <View style={styles.errorBlock}>
                        <Text style={styles.errorBlockText}>{paywallError}</Text>
                        <TouchableOpacity
                            onPress={() => void loadOfferings()}
                            style={[styles.retryButton, { borderColor: themeColors.border }]}
                        >
                            <Text
                                style={[
                                    styles.retryButtonText,
                                    { color: themeColors.textPrimary },
                                ]}
                            >
                                Try again
                            </Text>
                        </TouchableOpacity>
                    </View>
                ) : null}

                {/* ── Footer links ──────────────────────────────────────── */}
                <View style={styles.footerRow}>
                    <TouchableOpacity
                        onPress={() => void handleRestore()}
                        disabled={isRestoring}
                        accessibilityRole="button"
                    >
                        <Text style={[styles.footerLink, { color: themeColors.textSecondary }]}>
                            {isRestoring ? 'Restoring…' : 'Restore purchases'}
                        </Text>
                    </TouchableOpacity>

                    <Text style={[styles.footerSep, { color: themeColors.textSecondary }]}>
                        ·
                    </Text>

                    <TouchableOpacity accessibilityRole="link">
                        <Text style={[styles.footerLink, { color: themeColors.textSecondary }]}>
                            Terms
                        </Text>
                    </TouchableOpacity>

                    <Text style={[styles.footerSep, { color: themeColors.textSecondary }]}>
                        ·
                    </Text>

                    <TouchableOpacity accessibilityRole="link">
                        <Text style={[styles.footerLink, { color: themeColors.textSecondary }]}>
                            Privacy
                        </Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    // ── Shell ──────────────────────────────────────────────────────────────
    container: {
        flex: 1,
    },
    fullCenter: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingBottom: 4,
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
    scrollContent: {
        paddingBottom: 40,
        paddingHorizontal: 24,
    },

    // ── Hero ───────────────────────────────────────────────────────────────
    heroSection: {
        alignItems: 'center',
        paddingTop: 20,
        paddingBottom: 28,
    },
    heroLogo: {
        width: 64,
        height: 64,
        marginBottom: 16,
    },
    heroHeadline: {
        fontSize: 26,
        fontFamily: 'GoogleSansFlex_700Bold',
        textAlign: 'center',
        lineHeight: 32,
        marginBottom: 10,
    },
    heroSubtext: {
        fontSize: 15,
        fontFamily: 'GoogleSansFlex_400Regular',
        textAlign: 'center',
        lineHeight: 22,
    },

    // ── Features ───────────────────────────────────────────────────────────
    featureList: {
        gap: 0,
        marginBottom: 28,
    },
    featureRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 8,
    },
    checkCircle: {
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: '#DBEAFE',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    checkMark: {
        color: '#1D4ED8',
        fontSize: 13,
        fontWeight: '700',
        lineHeight: 16,
    },
    featureText: {
        fontSize: 15,
        fontFamily: 'GoogleSansFlex_400Regular',
        flex: 1,
        lineHeight: 22,
    },

    // ── Plan toggle ────────────────────────────────────────────────────────
    toggleWrapper: {
        alignItems: 'center',
        marginBottom: 24,
    },
    toggleContainer: {
        flexDirection: 'row',
        borderRadius: 999,
        padding: 4,
        alignSelf: 'stretch',
    },
    togglePill: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
    },
    togglePillActive: {
        backgroundColor: '#2563EB',
    },
    togglePillText: {
        fontSize: 14,
        fontFamily: 'GoogleSansFlex_500Medium',
    },
    togglePillTextActive: {
        color: '#FFFFFF',
    },
    annualPillInner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    saveBadge: {
        backgroundColor: '#D1FAE5',
        borderRadius: 999,
        paddingHorizontal: 6,
        paddingVertical: 2,
    },
    saveBadgeText: {
        color: '#059669',
        fontSize: 10,
        fontFamily: 'GoogleSansFlex_600SemiBold',
    },

    // ── Price ──────────────────────────────────────────────────────────────
    priceSection: {
        alignItems: 'center',
        marginBottom: 24,
    },
    priceRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 2,
    },
    priceMain: {
        fontSize: 48,
        fontFamily: 'GoogleSansFlex_700Bold',
        letterSpacing: -2,
        lineHeight: Platform.OS === 'ios' ? 56 : 60,
    },
    priceSuffix: {
        fontSize: 18,
        fontFamily: 'GoogleSansFlex_400Regular',
        paddingBottom: Platform.OS === 'ios' ? 8 : 10,
    },
    priceSub: {
        fontSize: 13,
        fontFamily: 'GoogleSansFlex_400Regular',
        marginTop: 4,
    },

    // ── CTA ────────────────────────────────────────────────────────────────
    ctaButton: {
        backgroundColor: '#2563EB',
        borderRadius: 999,
        paddingVertical: 16,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 54,
        marginBottom: 12,
    },
    ctaButtonDisabled: {
        opacity: 0.55,
    },
    ctaButtonText: {
        color: '#FFFFFF',
        fontSize: 17,
        fontFamily: 'GoogleSansFlex_700Bold',
    },

    // ── Errors ─────────────────────────────────────────────────────────────
    errorNote: {
        fontSize: 12,
        fontFamily: 'GoogleSansFlex_400Regular',
        textAlign: 'center',
        marginBottom: 12,
        lineHeight: 18,
    },
    errorBlock: {
        alignItems: 'center',
        gap: 10,
        marginBottom: 12,
    },
    errorBlockText: {
        color: '#EF4444',
        fontSize: 13,
        fontFamily: 'GoogleSansFlex_400Regular',
        textAlign: 'center',
        lineHeight: 18,
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

    // ── Footer ─────────────────────────────────────────────────────────────
    footerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        flexWrap: 'wrap',
        gap: 6,
        marginTop: 8,
    },
    footerLink: {
        fontSize: 12,
        fontFamily: 'GoogleSansFlex_400Regular',
    },
    footerSep: {
        fontSize: 12,
        fontFamily: 'GoogleSansFlex_400Regular',
    },

    // ── Manage mode ────────────────────────────────────────────────────────
    manageCenterWrap: {
        flex: 1,
        justifyContent: 'center',
        paddingHorizontal: 20,
    },
    manageCard: {
        borderRadius: 20,
        padding: 24,
        gap: 12,
    },
    manageTitle: {
        fontFamily: 'GoogleSansFlex_700Bold',
        fontSize: 22,
    },
    manageStatusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    manageStatusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#10B981',
    },
    manageStatusText: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 14,
        color: '#10B981',
    },
    manageMeta: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 13,
    },
    managePrimaryBtn: {
        backgroundColor: '#2563EB',
        borderRadius: 999,
        paddingVertical: 14,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 50,
        marginTop: 4,
    },
    managePrimaryBtnText: {
        color: '#FFFFFF',
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 15,
    },
    manageDoneWrap: {
        alignItems: 'center',
        paddingVertical: 4,
    },
    manageDoneText: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 14,
    },
});
