import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PurchasesOffering, PurchasesPackage } from 'react-native-purchases';
import { useThemeColors } from '../theme/colors';
import { useAuth } from '../hooks/useAuth';
import { useBillingStatus } from '../hooks/useBillingStatus';
import {
    configureRevenueCatForUser,
    getRevenueCatUnavailableReason,
    getRevenueCatOfferings,
    isRevenueCatAvailable,
    isRevenueCatPurchaseCancelled,
    purchaseRevenueCatPackage,
    restoreRevenueCatPurchases,
} from '../services/revenuecat';
import { useAnalyticsScreen } from '../hooks/useAnalyticsScreen';

const getPackageLabel = (pkg: PurchasesPackage): string => {
    const packageType = String(pkg.packageType || '').toUpperCase();
    if (packageType === 'ANNUAL') return 'Annual';
    if (packageType === 'MONTHLY') return 'Monthly';
    return pkg.identifier;
};

export default function PaywallScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const themeColors = useThemeColors();
    const { user, isReady } = useAuth();

    useAnalyticsScreen('Mobile Paywall');

    const {
        billingStatus,
        isLoadingBillingStatus,
        billingStatusError,
        refreshBillingStatus,
        hasActiveEntitlement,
        isMobilePaywallEnabled,
        isBillingEnforcementEnabled,
    } = useBillingStatus();

    const [isLoadingOfferings, setIsLoadingOfferings] = useState(false);
    const [isPurchasing, setIsPurchasing] = useState(false);
    const [paywallError, setPaywallError] = useState<string | null>(null);
    const [offering, setOffering] = useState<PurchasesOffering | null>(null);
    const [monthlyPackage, setMonthlyPackage] = useState<PurchasesPackage | null>(null);
    const [annualPackage, setAnnualPackage] = useState<PurchasesPackage | null>(null);
    const [selectedPackageIdentifier, setSelectedPackageIdentifier] = useState<string | null>(null);

    const availablePackages = useMemo(() => {
        const packages: PurchasesPackage[] = [];
        if (annualPackage) packages.push(annualPackage);
        if (monthlyPackage) packages.push(monthlyPackage);
        return packages;
    }, [annualPackage, monthlyPackage]);

    const selectedPackage = useMemo(() => {
        if (!availablePackages.length) return null;
        if (!selectedPackageIdentifier) return availablePackages[0];
        return availablePackages.find((pkg) => pkg.identifier === selectedPackageIdentifier) || availablePackages[0];
    }, [availablePackages, selectedPackageIdentifier]);

    useEffect(() => {
        if (isReady && !user) {
            router.replace('/auth/welcome');
        }
    }, [isReady, user, router]);

    useEffect(() => {
        if (hasActiveEntitlement) {
            router.replace('/');
        }
    }, [hasActiveEntitlement, router]);

    const loadOfferings = useCallback(async () => {
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
            const currentOffering =
                offerings.current || Object.values(offerings.all || {})[0] || null;

            if (!currentOffering) {
                throw new Error('No offering found. Configure a current offering in RevenueCat.');
            }

            const monthly =
                currentOffering.monthly ||
                currentOffering.availablePackages.find(
                    (pkg) => String(pkg.packageType || '').toUpperCase() === 'MONTHLY'
                ) ||
                null;

            const annual =
                currentOffering.annual ||
                currentOffering.availablePackages.find(
                    (pkg) => String(pkg.packageType || '').toUpperCase() === 'ANNUAL'
                ) ||
                null;

            if (!monthly && !annual) {
                throw new Error('No monthly or annual package was found in the current offering.');
            }

            setOffering(currentOffering);
            setMonthlyPackage(monthly);
            setAnnualPackage(annual);
            setSelectedPackageIdentifier(annual?.identifier || monthly?.identifier || null);
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : 'Could not load paywall. Please try again.';
            setPaywallError(message);
        } finally {
            setIsLoadingOfferings(false);
        }
    }, [billingStatus?.appUserId]);

    useEffect(() => {
        void loadOfferings();
    }, [loadOfferings]);

    const handlePurchase = useCallback(async () => {
        if (!selectedPackage) return;

        setIsPurchasing(true);
        setPaywallError(null);

        try {
            await purchaseRevenueCatPackage(selectedPackage);
            await refreshBillingStatus();
            Alert.alert('Subscription active', 'Your Pro access is now active.');
            router.replace('/');
        } catch (error) {
            if (isRevenueCatPurchaseCancelled(error)) {
                return;
            }
            const message =
                error instanceof Error ? error.message : 'Purchase failed. Please try again.';
            setPaywallError(message);
            Alert.alert('Purchase failed', message);
        } finally {
            setIsPurchasing(false);
        }
    }, [refreshBillingStatus, router, selectedPackage]);

    const handleRestore = useCallback(async () => {
        setIsPurchasing(true);
        setPaywallError(null);
        try {
            await restoreRevenueCatPurchases();
            await refreshBillingStatus();
            Alert.alert('Restore complete', 'Your purchases were restored successfully.');
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Could not restore purchases.';
            setPaywallError(message);
            Alert.alert('Restore failed', message);
        } finally {
            setIsPurchasing(false);
        }
    }, [refreshBillingStatus]);

    const canCloseWithoutPurchasing = !isBillingEnforcementEnabled;

    if (!isReady || isLoadingBillingStatus || (hasActiveEntitlement && user)) {
        return (
            <View style={[styles.loadingContainer, { backgroundColor: themeColors.background }]}>
                <ActivityIndicator size="small" color={themeColors.primary} />
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: themeColors.background, paddingTop: insets.top + 16 }]}>
            <ScrollView
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
            >
                <Text style={[styles.title, { color: themeColors.textPrimary }]}>
                    Upgrade to Hedwig Pro
                </Text>
                <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
                    Unlock premium workflows and keep access synced across iOS, Android, and web.
                </Text>
                {!isMobilePaywallEnabled ? (
                    <Text style={[styles.offeringMeta, { color: themeColors.textSecondary }]}>
                        Mobile paywall enforcement is currently off. You can still test purchases and restore access from here.
                    </Text>
                ) : null}

                {offering?.identifier ? (
                    <Text style={[styles.offeringMeta, { color: themeColors.textSecondary }]}>
                        Offering: {offering.identifier}
                    </Text>
                ) : null}

                {availablePackages.map((pkg) => {
                    const isSelected = selectedPackageIdentifier === pkg.identifier;
                    return (
                        <TouchableOpacity
                            key={pkg.identifier}
                            style={[
                                styles.packageCard,
                                {
                                    borderColor: isSelected ? themeColors.primary : themeColors.border,
                                    backgroundColor: themeColors.surface,
                                },
                            ]}
                            activeOpacity={0.85}
                            onPress={() => setSelectedPackageIdentifier(pkg.identifier)}
                        >
                            <View style={styles.packageHeader}>
                                <Text style={[styles.packageTitle, { color: themeColors.textPrimary }]}>
                                    {getPackageLabel(pkg)}
                                </Text>
                                <Text style={[styles.packagePrice, { color: themeColors.textPrimary }]}>
                                    {pkg.product.priceString}
                                </Text>
                            </View>
                            <Text style={[styles.packageDescription, { color: themeColors.textSecondary }]}>
                                {pkg.product.title}
                            </Text>
                        </TouchableOpacity>
                    );
                })}

                <TouchableOpacity
                    style={[
                        styles.primaryButton,
                        {
                            backgroundColor: themeColors.primary,
                            opacity: isPurchasing || !selectedPackage || isLoadingOfferings ? 0.7 : 1,
                        },
                    ]}
                    onPress={handlePurchase}
                    disabled={isPurchasing || !selectedPackage || isLoadingOfferings}
                    activeOpacity={0.9}
                >
                    <Text style={styles.primaryButtonText}>
                        {isPurchasing ? 'Processing...' : 'Continue'}
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.secondaryButton, { borderColor: themeColors.border }]}
                    onPress={handleRestore}
                    disabled={isPurchasing}
                    activeOpacity={0.85}
                >
                    <Text style={[styles.secondaryButtonText, { color: themeColors.textPrimary }]}>
                        Restore purchases
                    </Text>
                </TouchableOpacity>

                {canCloseWithoutPurchasing ? (
                    <TouchableOpacity
                        style={styles.linkButton}
                        onPress={() => router.replace('/')}
                        disabled={isPurchasing}
                    >
                        <Text style={[styles.linkButtonText, { color: themeColors.textSecondary }]}>
                            Not now
                        </Text>
                    </TouchableOpacity>
                ) : null}

                {(billingStatusError || paywallError) ? (
                    <Text style={styles.errorText}>{billingStatusError || paywallError}</Text>
                ) : null}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    content: {
        paddingHorizontal: 20,
        paddingBottom: 32,
        gap: 12,
    },
    title: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 30,
        marginTop: 16,
    },
    subtitle: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 15,
        lineHeight: 22,
        marginBottom: 12,
    },
    offeringMeta: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 12,
        marginBottom: 8,
    },
    packageCard: {
        borderWidth: 1.5,
        borderRadius: 16,
        padding: 14,
        gap: 6,
    },
    packageHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    packageTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 16,
    },
    packagePrice: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 16,
    },
    packageDescription: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 13,
    },
    primaryButton: {
        borderRadius: 14,
        paddingVertical: 14,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 8,
    },
    primaryButtonText: {
        color: '#FFFFFF',
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 16,
    },
    secondaryButton: {
        borderWidth: 1,
        borderRadius: 14,
        paddingVertical: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    secondaryButtonText: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 15,
    },
    linkButton: {
        alignSelf: 'center',
        paddingVertical: 6,
        paddingHorizontal: 8,
    },
    linkButtonText: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 14,
        textDecorationLine: 'underline',
    },
    errorText: {
        color: '#D32F2F',
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 13,
        marginTop: 4,
    },
});
