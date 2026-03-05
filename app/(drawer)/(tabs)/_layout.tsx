
import { NativeTabs, Icon, Label } from 'expo-router/unstable-native-tabs';
import { Tabs, useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { Platform, View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, Receipt, Link2, FileText, Wallet2 } from '../../../components/ui/AppIcon';

import { useThemeColors } from '../../../theme/colors';
import { useAuth } from '../../../hooks/useAuth';
import { useSettings } from '../../../context/SettingsContext';

type AndroidTabRouteName = 'index' | 'invoices' | 'links' | 'contracts' | 'wallet';

function AndroidTabBar({ state, descriptors, navigation }: any) {
    const themeColors = useThemeColors();
    const { currentTheme } = useSettings();
    const insets = useSafeAreaInsets();
    const isDark = currentTheme === 'dark';
    const bottomOffset = Math.max(12, insets.bottom + 8);

    const getIconForRoute = (routeName: AndroidTabRouteName, isFocused: boolean) => {
        const color = isFocused ? themeColors.primary : (isDark ? '#9CA3AF' : '#6B7280');
        const size = 22;

        switch (routeName) {
            case 'index':
                return <Home size={size} color={color} />;
            case 'invoices':
                return <Receipt size={size} color={color} />;
            case 'links':
                return <Link2 size={size} color={color} />;
            case 'contracts':
                return <FileText size={size} color={color} />;
            case 'wallet':
                return <Wallet2 size={size} color={color} />;
            default:
                return null;
        }
    };

    return (
        <View style={[styles.tabBarWrapper, { bottom: bottomOffset }]}>
            <View
                style={[
                    styles.tabBar,
                    {
                        backgroundColor: isDark ? '#0A0A0A' : '#FFFFFF',
                        shadowColor: isDark ? '#000000' : '#0F172A',
                    },
                ]}
            >
                {state.routes.map((route: any, index: number) => {
                    const isFocused = state.index === index;
                    const { options } = descriptors[route.key];
                    const label =
                        options.tabBarLabel !== undefined
                            ? options.tabBarLabel
                            : options.title !== undefined
                                ? options.title
                                : route.name;

                    const onPress = () => {
                        const event = navigation.emit({
                            type: 'tabPress',
                            target: route.key,
                            canPreventDefault: true,
                        });

                        if (!isFocused && !event.defaultPrevented) {
                            navigation.navigate(route.name);
                        }
                    };

                    return (
                        <TouchableOpacity
                            key={route.key}
                            accessibilityRole="button"
                            accessibilityState={isFocused ? { selected: true } : {}}
                            onPress={onPress}
                            style={[
                                styles.tabItem,
                                isFocused && {
                                    backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(37,99,235,0.08)',
                                },
                            ]}
                        >
                            {getIconForRoute(route.name as AndroidTabRouteName, isFocused)}
                            <Text
                                style={[
                                    styles.tabLabel,
                                    {
                                        color: isFocused
                                            ? themeColors.primary
                                            : isDark
                                                ? '#9CA3AF'
                                                : '#6B7280',
                                    },
                                ]}
                            >
                                {label}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
}

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

    // Android: custom Revolut-style tab bar using lucide icons
    if (Platform.OS === 'android') {
        return (
            <Tabs
                screenOptions={{
                    headerShown: false,
                    tabBarStyle: { display: 'none' },
                }}
                tabBar={(props) => <AndroidTabBar {...props} />}
            >
                <Tabs.Screen name="index" options={{ title: 'Home' }} />
                <Tabs.Screen name="invoices" options={{ title: 'Invoices' }} />
                <Tabs.Screen name="links" options={{ title: 'Links' }} />
                <Tabs.Screen name="contracts" options={{ title: 'Contracts' }} />
                <Tabs.Screen name="wallet" options={{ title: 'Wallet' }} />
            </Tabs>
        );
    }

    // iOS: keep NativeTabs with SF Symbols
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
                <Icon sf="doc.text.fill" md="receipt-long" />
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
                <Icon sf="creditcard.fill" md="account-balance-wallet" />
            </NativeTabs.Trigger>
        </NativeTabs>
    );
}

const styles = StyleSheet.create({
    tabBarWrapper: {
        position: 'absolute',
        left: 16,
        right: 16,
        bottom: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    tabBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderWidth: 0,
        shadowOpacity: 0.15,
        shadowOffset: { width: 0, height: 10 },
        shadowRadius: 24,
        elevation: 10,
    },
    tabItem: {
        flex: 1,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 6,
        marginHorizontal: 4,
        borderRadius: 999,
    },
    tabLabel: {
        marginTop: 2,
        fontSize: 11,
        fontFamily: 'GoogleSansFlex_500Medium',
    },
});
