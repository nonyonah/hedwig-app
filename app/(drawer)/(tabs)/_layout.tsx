import { Color, Tabs, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { DynamicColorIOS, Platform, PlatformColor, useColorScheme } from 'react-native';

import { useAuth } from '../../../hooks/useAuth';
import { useThemeColors } from '../../../theme/colors';

const NativeTabs = (() => {
    try {
        return require('expo-router/unstable-native-tabs').NativeTabs;
    } catch {
        return null;
    }
})();

const getPlatformColorSafe = (resource: string, fallback: string): string => {
    try {
        return PlatformColor(resource) as unknown as string;
    } catch {
        return fallback;
    }
};

export default function TabLayout() {
    const router = useRouter();
    const { user, isReady } = useAuth();
    const [authGraceElapsed, setAuthGraceElapsed] = useState(false);
    const themeColors = useThemeColors();
    const isAndroid = Platform.OS === 'android';
    const isIOS = Platform.OS === 'ios';
    const systemColorScheme = useColorScheme();

    useEffect(() => {
        if (user) {
            setAuthGraceElapsed(false);
            return;
        }
        if (!isReady) return;
        const timer = setTimeout(() => setAuthGraceElapsed(true), 1800);
        return () => clearTimeout(timer);
    }, [isReady, user]);

    useEffect(() => {
        if (isReady && !user && authGraceElapsed) {
            router.replace('/auth/welcome');
        }
    }, [authGraceElapsed, isReady, user, router]);

    if (!isReady) return null;

    if (!NativeTabs) {
        return (
            <Tabs screenOptions={{ headerShown: false }}>
                <Tabs.Screen name="wallet" options={{ title: 'Wallet' }} />
                <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
            </Tabs>
        );
    }

    const iosTintColor = getPlatformColorSafe('systemBlueColor', '#007AFF');
    const iosUnselectedColor =
        isIOS && typeof DynamicColorIOS === 'function'
            ? DynamicColorIOS({ light: '#6B7280', dark: '#9CA3AF' })
            : '#6B7280';

    const androidTintColor = isAndroid
        ? (((Color as any).android?.dynamic?.primary as any) ?? getPlatformColorSafe('?attr/colorPrimary', themeColors.primary))
        : '#2563EB';
    const androidUnselectedColor = isAndroid
        ? (((Color as any).android?.dynamic?.onSurfaceVariant as any)
            ?? themeColors.textSecondary
            ?? (systemColorScheme === 'dark' ? '#9CA3AF' : '#6B7280'))
        : '#6B7280';
    const androidBackgroundColor = isAndroid
        ? (((Color as any).android?.dynamic?.surfaceContainer as any) ?? ((Color as any).android?.dynamic?.surface as any) ?? getPlatformColorSafe('?attr/colorSurface', themeColors.background))
        : undefined;

    const tintColor = isAndroid ? androidTintColor : iosTintColor;
    const iconColor = isAndroid
        ? { default: androidUnselectedColor, selected: androidTintColor }
        : { default: iosUnselectedColor, selected: iosTintColor };

    return (
        <NativeTabs
            tintColor={tintColor}
            iconColor={iconColor}
            labelStyle={
                isAndroid
                    ? ({
                        default: { color: androidUnselectedColor, fontSize: 12, fontWeight: '600', fontFamily: 'GoogleSansFlex_600SemiBold' },
                        selected: { color: androidTintColor, fontSize: 12, fontWeight: '700', fontFamily: 'GoogleSansFlex_600SemiBold' },
                    } as const)
                    : ({
                        default: { color: iosUnselectedColor, fontSize: 11, fontWeight: '600', fontFamily: 'GoogleSansFlex_600SemiBold' },
                        selected: { color: iosTintColor, fontSize: 11, fontWeight: '700', fontFamily: 'GoogleSansFlex_600SemiBold' },
                    } as const)
            }
            {...(isAndroid ? { labelVisibilityMode: 'labeled' as const } : {})}
            {...(isAndroid ? { backgroundColor: androidBackgroundColor as any } : {})}
            {...(isAndroid ? { disableTransparentOnScrollEdge: true as const } : {})}
            {...(!isAndroid ? { minimizeBehavior: 'onScrollDown' as const } : {})}
        >
            <NativeTabs.Trigger name="wallet">
                <NativeTabs.Trigger.Label>Wallet</NativeTabs.Trigger.Label>
                <NativeTabs.Trigger.Icon sf="creditcard.fill" md="account_balance_wallet" />
            </NativeTabs.Trigger>

            <NativeTabs.Trigger name="settings">
                <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
                <NativeTabs.Trigger.Icon sf="gearshape.fill" md="settings" />
            </NativeTabs.Trigger>
        </NativeTabs>
    );
}
