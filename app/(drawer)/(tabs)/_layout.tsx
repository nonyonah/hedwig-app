
import { NativeTabs, Icon, Label } from 'expo-router/unstable-native-tabs';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { useThemeColors } from '../../../theme/colors';
import { useAuth } from '../../../hooks/useAuth';
import { useSettings } from '../../../context/SettingsContext';

export default function TabLayout() {
    const themeColors = useThemeColors();
    const router = useRouter();
    const { user, isReady } = useAuth();
    const { currentTheme } = useSettings();
    const isDark = currentTheme === 'dark';

    useEffect(() => {
        if (isReady && !user) {
            router.replace('/auth/welcome');
        }
    }, [isReady, user]);

    if (!isReady) return null;

    return (
        <NativeTabs
            tintColor={themeColors.primary}
            unselectedTintColor={isDark ? '#6B7280' : '#9CA3AF'}
        >
            <NativeTabs.Trigger name="index">
                <Label>Home</Label>
                <Icon sf="house.fill" md="home" />
            </NativeTabs.Trigger>

            <NativeTabs.Trigger name="invoices">
                <Label>Invoices</Label>
                <Icon sf="doc.text.fill" md="receipt_long" />
            </NativeTabs.Trigger>

            <NativeTabs.Trigger name="links">
                <Label>Links</Label>
                <Icon sf="link" md="link" />
            </NativeTabs.Trigger>

            <NativeTabs.Trigger name="contracts">
                <Label>Contracts</Label>
                <Icon sf="doc.plaintext.fill" md="description" />
            </NativeTabs.Trigger>

            <NativeTabs.Trigger name="wallet">
                <Label>Wallet</Label>
                <Icon sf="creditcard.fill" md="account_balance_wallet" />
            </NativeTabs.Trigger>
        </NativeTabs>
    );
}
