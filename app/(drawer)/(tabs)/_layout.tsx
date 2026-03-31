
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { Tabs, useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { Platform, View, TouchableOpacity, Text, StyleSheet, Animated, DeviceEventEmitter, Easing, DynamicColorIOS, PlatformColor } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Home, Receipt, Link2, Wallet2, Search } from '../../../components/ui/AppIcon';

import { useThemeColors } from '../../../theme/colors';
import { useAuth } from '../../../hooks/useAuth';
import { useSettings } from '../../../context/SettingsContext';

type AndroidTabRouteName = 'index' | 'invoices' | 'links' | 'wallet' | 'search';

function AndroidTabBar({ state, descriptors, navigation }: any) {
    const themeColors = useThemeColors();
    const { currentTheme } = useSettings();
    const insets = useSafeAreaInsets();
    const isDark = currentTheme === 'dark';
    const bottomOffset = Math.max(12, insets.bottom + 8);
    const glassTint = isDark ? 'dark' : 'light';
    const selectedSystemColor = PlatformColor('?attr/colorPrimary');
    const compactAnim = React.useRef(new Animated.Value(0)).current;
    const compactStateRef = React.useRef(false);

    const setCompact = React.useCallback((compact: boolean) => {
        if (compactStateRef.current === compact) return;
        compactStateRef.current = compact;
        Animated.timing(compactAnim, {
            toValue: compact ? 1 : 0,
            duration: 180,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();
    }, [compactAnim]);

    useEffect(() => {
        const listener = DeviceEventEmitter.addListener('hedwig:tabbar-scroll', (offsetY: number) => {
            if (typeof offsetY !== 'number') return;
            setCompact(offsetY > 4);
        });
        return () => listener.remove();
    }, [setCompact]);

    useEffect(() => {
        setCompact(false);
    }, [state.index, setCompact]);

    const tabBarScale = compactAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 0.82],
    });
    const tabBarTranslateY = compactAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 14],
    });
    const labelOpacity = compactAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 0],
    });
    const labelTranslateY = compactAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 6],
    });

    const getIconForRoute = (routeName: AndroidTabRouteName, isFocused: boolean) => {
        const color = isFocused ? selectedSystemColor : (isDark ? '#9CA3AF' : '#6B7280');
        const size = 22;

        switch (routeName) {
            case 'index':
                return <Home size={size} color={color} />;
            case 'invoices':
                return <Receipt size={size} color={color} />;
            case 'links':
                return <Link2 size={size} color={color} />;
            case 'wallet':
                return <Wallet2 size={size} color={color} />;
            case 'search':
                return <Search size={size} color={color} />;
            default:
                return null;
        }
    };

    return (
        <Animated.View
            style={[
                styles.tabBar,
                {
                    bottom: bottomOffset,
                    borderColor: 'transparent',
                    shadowColor: isDark ? '#000000' : '#0F172A',
                    shadowOpacity: 0,
                    elevation: 0,
                    transform: [{ translateY: tabBarTranslateY }, { scale: tabBarScale }],
                },
            ]}
        >
            <BlurView
                tint={glassTint}
                intensity={38}
                experimentalBlurMethod="dimezisBlurView"
                style={[StyleSheet.absoluteFill, { backgroundColor: 'transparent' }]}
            />
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
                                backgroundColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.28)',
                            },
                        ]}
                    >
                        {getIconForRoute(route.name as AndroidTabRouteName, isFocused)}
                        <Animated.Text
                            style={[
                                styles.tabLabel,
                                {
                                    color: isFocused
                                        ? selectedSystemColor
                                        : isDark
                                            ? '#B0B6C1'
                                            : '#6B7280',
                                    opacity: labelOpacity,
                                    transform: [{ translateY: labelTranslateY }],
                                },
                            ]}
                        >
                            {label}
                        </Animated.Text>
                    </TouchableOpacity>
                );
            })}
        </Animated.View>
    );
}

export default function TabLayout() {
    const router = useRouter();
    const { user, isReady } = useAuth();
    const iosTintColor = PlatformColor('systemBlueColor');
    const iosUnselectedColor = DynamicColorIOS({ light: '#6B7280', dark: '#9CA3AF' });

    useEffect(() => {
        if (isReady && !user) {
            router.replace('/auth/welcome');
        }
    }, [isReady, user]);

    if (!isReady) return null;

    // Android: custom tab bar
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
                <Tabs.Screen name="wallet" options={{ title: 'Wallet' }} />
                <Tabs.Screen name="search" options={{ title: 'Search' }} />
            </Tabs>
        );
    }

    // iOS: follow Expo Router native-tabs recommendations for liquid glass.
    return (
        <NativeTabs
            tintColor={iosTintColor}
            iconColor={{ default: iosUnselectedColor, selected: iosTintColor }}
            minimizeBehavior="onScrollDown"
        >
            <NativeTabs.Trigger name="index">
                <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
                <NativeTabs.Trigger.Icon sf="house.fill" />
            </NativeTabs.Trigger>

            <NativeTabs.Trigger name="invoices">
                <NativeTabs.Trigger.Label>Invoices</NativeTabs.Trigger.Label>
                <NativeTabs.Trigger.Icon sf="doc.text.fill" />
            </NativeTabs.Trigger>

            <NativeTabs.Trigger name="links">
                <NativeTabs.Trigger.Label>Links</NativeTabs.Trigger.Label>
                <NativeTabs.Trigger.Icon sf="link" />
            </NativeTabs.Trigger>

            <NativeTabs.Trigger name="wallet">
                <NativeTabs.Trigger.Label>Wallet</NativeTabs.Trigger.Label>
                <NativeTabs.Trigger.Icon sf="creditcard.fill" />
            </NativeTabs.Trigger>

            <NativeTabs.Trigger name="search" role="search">
                <NativeTabs.Trigger.Label>Search</NativeTabs.Trigger.Label>
                <NativeTabs.Trigger.Icon sf="magnifyingglass" />
            </NativeTabs.Trigger>
        </NativeTabs>
    );
}

const styles = StyleSheet.create({
    tabBar: {
        position: 'absolute',
        left: 16,
        right: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderRadius: 28,
        overflow: 'hidden',
        borderWidth: 0,
        backgroundColor: 'transparent',
        paddingHorizontal: 10,
        paddingVertical: 8,
        shadowOpacity: 0.18,
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
        fontSize: 13,
        fontFamily: 'GoogleSansFlex_400Regular',
    },
});
