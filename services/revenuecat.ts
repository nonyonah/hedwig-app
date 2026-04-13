import Constants from 'expo-constants';
import { Platform } from 'react-native';
import Purchases, {
    LOG_LEVEL,
    PURCHASES_ERROR_CODE,
    type CustomerInfo,
    type PurchasesOfferings,
    type PurchasesPackage,
} from 'react-native-purchases';

const IOS_API_KEY =
    Constants.expoConfig?.extra?.revenueCatAppleApiKey ||
    process.env.EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY ||
    process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ||
    '';

const ANDROID_API_KEY =
    Constants.expoConfig?.extra?.revenueCatGoogleApiKey ||
    process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY ||
    process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY ||
    '';

let configuredAppUserId: string | null = null;

const isNativePlatform = Platform.OS === 'ios' || Platform.OS === 'android';
const isExpoGo = Constants.appOwnership === 'expo';

const getRevenueCatApiKey = (): string | null => {
    if (Platform.OS === 'ios') {
        const key = String(IOS_API_KEY || '').trim();
        return key || null;
    }

    if (Platform.OS === 'android') {
        const key = String(ANDROID_API_KEY || '').trim();
        return key || null;
    }

    return null;
};

export const isRevenueCatAvailable = (): boolean => {
    return isNativePlatform && !isExpoGo && Boolean(getRevenueCatApiKey());
};

export const getRevenueCatUnavailableReason = (): string | null => {
    if (!isNativePlatform) {
        return 'RevenueCat is only available in iOS/Android native builds.';
    }

    if (isExpoGo) {
        return 'RevenueCat is unavailable in Expo Go. Use an EAS development build, preview build, TestFlight, or Play beta build.';
    }

    if (!getRevenueCatApiKey()) {
        if (Platform.OS === 'ios') {
            return 'Missing iOS RevenueCat API key. Set EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY.';
        }
        if (Platform.OS === 'android') {
            return 'Missing Android RevenueCat API key. Set EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY.';
        }
        return 'Missing RevenueCat API key for this platform.';
    }

    return null;
};

export const isRevenueCatPurchaseCancelled = (error: unknown): boolean => {
    const candidate = error as { code?: string; userCancelled?: boolean | null } | null;
    return (
        candidate?.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR ||
        candidate?.userCancelled === true
    );
};

export const configureRevenueCatForUser = async (appUserId: string): Promise<boolean> => {
    if (!isNativePlatform) return false;

    const normalizedAppUserId = String(appUserId || '').trim();
    if (!normalizedAppUserId) return false;

    const apiKey = getRevenueCatApiKey();
    if (!apiKey) return false;

    await Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.INFO);

    const alreadyConfigured = await Purchases.isConfigured();
    if (!alreadyConfigured) {
        Purchases.configure({ apiKey, appUserID: normalizedAppUserId });
        configuredAppUserId = normalizedAppUserId;
        return true;
    }

    if (configuredAppUserId !== normalizedAppUserId) {
        await Purchases.logIn(normalizedAppUserId);
        configuredAppUserId = normalizedAppUserId;
    }

    return true;
};

export const getRevenueCatOfferings = async (): Promise<PurchasesOfferings> => {
    return Purchases.getOfferings();
};

export const purchaseRevenueCatPackage = async (pkg: PurchasesPackage): Promise<CustomerInfo> => {
    const result = await Purchases.purchasePackage(pkg);
    return result.customerInfo;
};

export const restoreRevenueCatPurchases = async (): Promise<CustomerInfo> => {
    return Purchases.restorePurchases();
};
