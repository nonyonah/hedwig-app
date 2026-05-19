// Crypto polyfills - MUST be first before any other imports
import 'react-native-get-random-values';
import 'fast-text-encoding';

import React, { useCallback, useEffect, useState } from 'react';
import { Stack, useNavigationContainerRef } from 'expo-router';
import { ThemeProvider, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { PrivyProvider } from '@privy-io/expo';
import Constants from 'expo-constants';
import {
    useFonts,
    GoogleSansFlex_300Light,
    GoogleSansFlex_400Regular,
    GoogleSansFlex_500Medium,
    GoogleSansFlex_600SemiBold,
    GoogleSansFlex_700Bold,
} from '@expo-google-fonts/google-sans-flex';
import { Merriweather_300Light, Merriweather_400Regular, Merriweather_700Bold, Merriweather_900Black } from '@expo-google-fonts/merriweather';
import { View, Platform, Image, ActivityIndicator, StyleSheet, AppState, Text, TextInput, StatusBar as RNStatusBar } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { LockScreen } from '../components/LockScreen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import {
    SettingsProvider,
    useSettings,
} from '../context/SettingsContext';
import { TutorialProvider } from '../context/TutorialContext';
import { useThemeColors } from '../theme/colors';
import * as Sentry from '@sentry/react-native';
import { isRunningInExpoGo } from 'expo';
import { initializeAnalytics, trackScreen } from '../services/analytics';
import Analytics from '../services/analytics';
import { StatusBar, setStatusBarStyle } from 'expo-status-bar';
import { useAuth } from '../hooks/useAuth';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { getApiBaseUrl, getProductionApiBaseUrl, joinApiUrl, rewriteApiUrlForRuntime } from '../utils/apiBaseUrl';
import { privyConfig } from '../lib/privy';

const PRIVY_APP_ID = Constants.expoConfig?.extra?.privyAppId || process.env.EXPO_PUBLIC_PRIVY_APP_ID || '';
const PRIVY_CLIENT_ID = Constants.expoConfig?.extra?.privyClientId || process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID || '';
const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN || '';

declare global {
    var __hedwigApiFetchPatched: boolean | undefined;
}

const installApiFetchRewrite = () => {
    if (globalThis.__hedwigApiFetchPatched || typeof fetch !== 'function') {
        return;
    }

    const originalFetch = globalThis.fetch.bind(globalThis);

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const shouldRewriteUrl = (url: string): boolean => {
            if (!url || !/^https?:\/\//i.test(url)) return false;
            try {
                const parsed = new URL(url);
                const configuredApi = new URL(getApiBaseUrl());
                const productionApi = new URL(getProductionApiBaseUrl());
                return parsed.origin === configuredApi.origin || parsed.origin === productionApi.origin;
            } catch {
                return false;
            }
        };

        if (typeof input === 'string') {
            return originalFetch(shouldRewriteUrl(input) ? rewriteApiUrlForRuntime(input) : input, init);
        }

        if (input instanceof URL) {
            const url = input.toString();
            return originalFetch(shouldRewriteUrl(url) ? new URL(rewriteApiUrlForRuntime(url)) : input, init);
        }

        if (typeof Request !== 'undefined' && input instanceof Request) {
            const rewrittenUrl = shouldRewriteUrl(input.url) ? rewriteApiUrlForRuntime(input.url) : input.url;
            if (rewrittenUrl !== input.url) {
                return originalFetch(new Request(rewrittenUrl, input), init);
            }
        }

        return originalFetch(input as RequestInfo, init);
    }) as typeof fetch;

    globalThis.__hedwigApiFetchPatched = true;
};

installApiFetchRewrite();

const applyGlobalTypographyDefaults = () => {
    const defaultFontFamily = 'GoogleSansFlex_400Regular';
    const textDefaults = (Text as any).defaultProps || {};
    (Text as any).defaultProps = {
        ...textDefaults,
        style: [{ fontFamily: defaultFontFamily }, textDefaults.style].filter(Boolean),
    };

    const textInputDefaults = (TextInput as any).defaultProps || {};
    (TextInput as any).defaultProps = {
        ...textInputDefaults,
        style: [{ fontFamily: defaultFontFamily }, textInputDefaults.style].filter(Boolean),
    };
};

// Sentry Navigation Integration for Expo Router
const navigationIntegration = Sentry.reactNavigationIntegration({
    enableTimeToInitialDisplay: !isRunningInExpoGo(),
});

// Initialize Sentry
Sentry.init({
    dsn: SENTRY_DSN,
    sendDefaultPii: true,
    tracesSampleRate: __DEV__ ? 1.0 : 0.2,
    enableNativeFramesTracking: !isRunningInExpoGo(),
    integrations: [navigationIntegration],
    enabled: !__DEV__,
    environment: __DEV__ ? 'development' : 'production',
    debug: __DEV__,
});

// Initialize PostHog analytics and track app launch
initializeAnalytics();
Analytics.appOpened(); // Track app_opened on every launch

// Themed Stack component that uses the theme context
function ThemedStack() {
    const colors = useThemeColors();

    return (
        <Stack
            screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.background },
            }}
        >
            <Stack.Screen name="(drawer)" options={{ headerShown: false }} />
            <Stack.Screen name="auth/welcome" />
            <Stack.Screen name="auth/login" />
            <Stack.Screen name="auth/profile" />
            <Stack.Screen name="auth/biometrics" />
            <Stack.Screen name="invoice/create" />
            <Stack.Screen name="invoice/[id]" />
            <Stack.Screen name="payment-link/create" />
            <Stack.Screen name="payment-link/[id]" />
            <Stack.Screen name="payment-links/index" />
            <Stack.Screen name="settings/index" />
            <Stack.Screen name="feedback/index" />
            <Stack.Screen name="wallet/send" />
            <Stack.Screen name="wallet/send-address" />
            <Stack.Screen name="wallet/send-token" />
            <Stack.Screen name="onramp/amount" />
            <Stack.Screen name="onramp/bank" />
            <Stack.Screen name="onramp/review" />
            <Stack.Screen name="onramp/[id]" />
            <Stack.Screen
                name="creation-box"
                options={{
                    headerShown: false,
                }}
            />

            <Stack.Screen name="notifications/index" />
            <Stack.Screen name="search/index" />
            <Stack.Screen name="insights/index" />
            <Stack.Screen
                name="offramp-history/bank-selection"
                options={{
                    presentation: 'modal',
                    headerShown: false,
                }}
            />
        </Stack>
    );
}

// Web version without Privy
function WebLayout() {
    const colors = useThemeColors();

    return (
        <Stack
            screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.background },
            }}
        >
            <Stack.Screen name="(drawer)" options={{ headerShown: false }} />
            <Stack.Screen name="auth/welcome" />
            <Stack.Screen name="auth/login" />
            <Stack.Screen name="auth/profile" />
            <Stack.Screen name="auth/biometrics" />
            <Stack.Screen name="invoice/create" />
            <Stack.Screen name="invoice/[id]" />
            <Stack.Screen name="payment-link/create" />
            <Stack.Screen name="payment-link/[id]" />
            <Stack.Screen name="payment-links/index" />
            <Stack.Screen name="settings/index" />
            <Stack.Screen name="feedback/index" />
            <Stack.Screen name="wallet/send" />
            <Stack.Screen name="wallet/send-address" />
            <Stack.Screen name="wallet/send-token" />
            <Stack.Screen
                name="creation-box"
                options={{
                    headerShown: false,
                }}
            />
            <Stack.Screen name="notifications/index" />
            <Stack.Screen name="search/index" />
            <Stack.Screen name="insights/index" />
        </Stack>
    );
}

import { UserProvider } from '../context/UserContext';

function PushNotificationBootstrap() {
    const { user, isReady, getAccessToken } = useAuth();
    const { isRegistered, registerForPushNotifications, registerWithBackend } = usePushNotifications();
    const trackedAppOpenedRef = React.useRef(false);

    const registerEngagementEvent = useCallback(async (event: string, properties: Record<string, any> = {}) => {
        try {
            if (!user?.id) return;
            const authToken = await getAccessToken();
            if (!authToken) return;

            await fetch(joinApiUrl('/api/engagement/events'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`,
                },
                body: JSON.stringify({
                    event,
                    properties,
                }),
            });
        } catch (error) {
            console.error('[Engagement] Failed to register event with backend:', error);
        }
    }, [user?.id, getAccessToken]);

    useEffect(() => {
        const setupPushNotifications = async () => {
            if (!isReady) return;

            if (!user || isRegistered) return;

            try {
                const pushToken = await registerForPushNotifications();
                if (!pushToken) return;

                const authToken = await getAccessToken();
                if (!authToken) return;

                await registerWithBackend(authToken, pushToken);
            } catch (error) {
                console.error('[Push] Failed to initialize notifications:', error);
            }
        };

        setupPushNotifications();
    }, [isReady, user, isRegistered, getAccessToken, registerForPushNotifications, registerWithBackend]);

    useEffect(() => {
        if (!isReady) return;

        if (user?.id && !trackedAppOpenedRef.current) {
            trackedAppOpenedRef.current = true;
            void registerEngagementEvent('app_opened', {
                source: 'mobile_app_layout',
                platform: Platform.OS,
            });
            return;
        }

        if (!user?.id) {
            trackedAppOpenedRef.current = false;
        }
    }, [isReady, user?.id, registerEngagementEvent]);

    return null;
}

function GatewayPreferenceSync() {
    const { user, isReady, getAccessToken } = useAuth();
    const { setGatewayAutoDepositEnabled } = useSettings();

    const syncGatewayPreference = useCallback(async () => {
        if (!isReady || !user) return;

        const token = await getAccessToken();
        if (!token) return;

        const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
        const res = await fetch(`${apiUrl}/api/users/preferences`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.success || typeof data.data?.gatewayAutoDepositEnabled !== 'boolean') return;

        await setGatewayAutoDepositEnabled(data.data.gatewayAutoDepositEnabled);
    }, [getAccessToken, isReady, setGatewayAutoDepositEnabled, user]);

    useEffect(() => {
        void syncGatewayPreference();
    }, [syncGatewayPreference]);

    useEffect(() => {
        const subscription = AppState.addEventListener('change', (state) => {
            if (state === 'active') void syncGatewayPreference();
        });
        return () => subscription.remove();
    }, [syncGatewayPreference]);

    return null;
}

// Handles app-lock on launch and when returning from background
function AppLockGate({ children }: { children: React.ReactNode }) {
    const { user, isReady } = useAuth();
    const { lockScreenEnabled, settingsLoaded } = useSettings();
    const [isLocked, setIsLocked] = useState(false);
    const hasBeenToBackground = React.useRef(false);
    const backgroundedAt = React.useRef<number | null>(null);
    const initialLockChecked = React.useRef(false);
    // Don't relock if the OS only blanked the screen for a few seconds; iOS
    // fires `background` for screen-off, biometric prompts, control center,
    // notification panels, etc. A short threshold prevents those from
    // re-prompting biometrics when the user immediately wakes the phone.
    const RELOCK_THRESHOLD_MS = 30_000;

    useEffect(() => {
        if (!lockScreenEnabled) {
            setIsLocked(false);
        }
    }, [lockScreenEnabled]);

    // Lock on fresh app open (killed + reopened). Wait for AsyncStorage to
    // hydrate so the setting toggle is authoritative — otherwise the
    // default-true value briefly forces a lock even when the user disabled
    // the feature.
    useEffect(() => {
        if (!settingsLoaded || !lockScreenEnabled) return;
        if (!user || !isReady || initialLockChecked.current) return;
        initialLockChecked.current = true;
        (async () => {
            try {
                const [hasHw, isEnrolled] = await Promise.all([
                    LocalAuthentication.hasHardwareAsync(),
                    LocalAuthentication.isEnrolledAsync(),
                ]);
                if (hasHw && isEnrolled) {
                    setIsLocked(true);
                }
            } catch {
                // Don't block on error
            }
        })();
    }, [user, isReady, lockScreenEnabled, settingsLoaded]);

    useEffect(() => {
        const subscription = AppState.addEventListener('change', async (nextState) => {
            if (!settingsLoaded || !lockScreenEnabled) return;
            if (nextState === 'background') {
                if (user) {
                    hasBeenToBackground.current = true;
                    backgroundedAt.current = Date.now();
                }
            } else if (nextState === 'active' && hasBeenToBackground.current && user && isReady) {
                const since = backgroundedAt.current ?? 0;
                const elapsed = since ? Date.now() - since : Infinity;
                hasBeenToBackground.current = false;
                backgroundedAt.current = null;
                if (elapsed < RELOCK_THRESHOLD_MS) return;
                try {
                    const [hasHw, isEnrolled] = await Promise.all([
                        LocalAuthentication.hasHardwareAsync(),
                        LocalAuthentication.isEnrolledAsync(),
                    ]);
                    if (hasHw && isEnrolled) {
                        setIsLocked(true);
                    }
                } catch {
                    // Don't block on error
                }
            }
        });
        return () => subscription.remove();
    }, [user, isReady, lockScreenEnabled, settingsLoaded]);

    return (
        <View style={{ flex: 1 }}>
            {children}
            {isLocked && (
                <LockScreen user={user} onUnlock={() => setIsLocked(false)} />
            )}
        </View>
    );
}

// Native layout with Privy
function NativeLayout() {
    const { currentTheme } = useSettings();
    const colors = useThemeColors();
    const navigationTheme =
        currentTheme === 'dark'
            ? {
                ...DarkTheme,
                colors: {
                    ...DarkTheme.colors,
                    background: colors.background,
                    card: colors.background,
                    text: colors.textPrimary,
                    border: colors.border,
                },
            }
            : {
                ...DefaultTheme,
                colors: {
                    ...DefaultTheme.colors,
                    background: colors.background,
                    card: colors.background,
                    text: colors.textPrimary,
                    border: colors.border,
                },
            };

    return (
        <ThemeProvider value={navigationTheme}>
            <PrivyProvider
                appId={PRIVY_APP_ID}
                clientId={PRIVY_CLIENT_ID}
                config={{
                    embedded: privyConfig.embedded,
                }}
                supportedChains={privyConfig.supportedChains as any}
            >
                <UserProvider>
                    <GatewayPreferenceSync />
                    <AppLockGate>
                        <PushNotificationBootstrap />
                        <ThemedStack />
                    </AppLockGate>
                </UserProvider>
            </PrivyProvider>
        </ThemeProvider>
    );
}

function ThemeAwareStatusBar() {
    const { currentTheme } = useSettings();
    const colors = useThemeColors();
    const isDark = currentTheme === 'dark';

    // `<StatusBar />` from expo-status-bar tracks the latest *mounted* node,
    // not re-renders of an existing node, so swapping `style` on a theme
    // toggle didn't actually push a new appearance until the app was killed
    // and relaunched. Drive `style` imperatively from a theme-bound effect so
    // every toggle takes effect on the next render frame.
    //
    // We deliberately DON'T call setStatusBarBackgroundColor here: on Android
    // edge-to-edge it toggles the translucent flag mid-session, which then
    // collapses the SafeAreaView top inset on the next screen mount (the bug
    // reproduced when popping back from the onramp order page). The status
    // bar background is left to follow the system / app config defaults.
    React.useLayoutEffect(() => {
        // Pass `animated: false` — on iOS the animated style swap briefly
        // forces the status bar into a transitional state which collapses
        // SafeAreaView top insets on the next screen mount.
        setStatusBarStyle(isDark ? 'light' : 'dark', false);
        RNStatusBar.setBarStyle(isDark ? 'light-content' : 'dark-content', false);
        const frame = requestAnimationFrame(() => {
            setStatusBarStyle(isDark ? 'light' : 'dark', false);
            RNStatusBar.setBarStyle(isDark ? 'light-content' : 'dark-content', false);
        });
        return () => cancelAnimationFrame(frame);
    }, [isDark]);

    return (
        <StatusBar
            key={isDark ? 'status-bar-dark' : 'status-bar-light'}
            style={isDark ? 'light' : 'dark'}
            backgroundColor={Platform.OS === 'android' ? (colors.background as any) : undefined}
        />
    );
}

function StartupGate({ children, isApiWarmed }: { children: React.ReactNode; isApiWarmed: boolean }) {
    if (isApiWarmed) {
        return <View style={styles.startupShell}>{children}</View>;
    }

    return (
        <View style={styles.startupShell}>
            <View style={styles.startupOverlay}>
                <Image source={require('../assets/splash-icon-transparent.png')} style={styles.startupLogo} resizeMode="contain" tintColor="#FFFFFF" />
                <ActivityIndicator size="small" color="rgba(255,255,255,0.6)" style={styles.startupSpinner} />
            </View>
        </View>
    );
}

function RootLayout() {
    // Register navigation container for Sentry route tracking
    const ref = useNavigationContainerRef();
    const routeNameRef = React.useRef<string | undefined>(undefined);

    React.useEffect(() => {
        if (ref) {
            navigationIntegration.registerNavigationContainer(ref);

            // Track initial route
            const initialRouteName = ref.getCurrentRoute?.()?.name;
            if (initialRouteName) {
                routeNameRef.current = initialRouteName;
                trackScreen(initialRouteName);
            }

            // Listen for route changes
            const unsubscribe = ref.addListener('state', () => {
                const currentRouteName = ref.getCurrentRoute?.()?.name;
                if (currentRouteName && currentRouteName !== routeNameRef.current) {
                    routeNameRef.current = currentRouteName;
                    trackScreen(currentRouteName);
                }
            });

            return () => unsubscribe();
        }
    }, [ref]);

    const [fontsLoaded] = useFonts({
        GoogleSansFlex_300Light,
        GoogleSansFlex_400Regular,
        GoogleSansFlex_500Medium,
        GoogleSansFlex_600SemiBold,
        GoogleSansFlex_700Bold,
        Merriweather_300Light,
        Merriweather_400Regular,
        Merriweather_700Bold,
        Merriweather_900Black,
    });
    const [isApiWarmed, setIsApiWarmed] = React.useState(false);

    useEffect(() => {
        if (!fontsLoaded) return;
        applyGlobalTypographyDefaults();
    }, [fontsLoaded]);

    useEffect(() => {
        let cancelled = false;

        const warmUpApi = async () => {
            const apiUrl = getApiBaseUrl();
            if (!apiUrl) {
                if (!cancelled) setIsApiWarmed(true);
                return;
            }

            const endpoints = [`${apiUrl}/api/health`, `${apiUrl}/health`, apiUrl];

            for (const endpoint of endpoints) {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 7000);
                try {
                    await fetch(endpoint, { method: 'GET', signal: controller.signal });
                    clearTimeout(timeoutId);
                    if (!cancelled) setIsApiWarmed(true);
                    return;
                } catch (error) {
                    clearTimeout(timeoutId);
                }
            }

            if (!cancelled) setIsApiWarmed(true);
        };

        warmUpApi();
        return () => {
            cancelled = true;
        };
    }, []);

    const appReady = fontsLoaded && isApiWarmed;

    const isWeb = Platform.OS === 'web';

    return (
        <SafeAreaProvider initialMetrics={initialWindowMetrics}>
            <SettingsProvider>
                <TutorialProvider>
                    <GestureHandlerRootView style={{ flex: 1 }}>
                        <ThemeAwareStatusBar />
                        <BottomSheetModalProvider>
                            <StartupGate isApiWarmed={appReady}>
                                {isWeb ? <WebLayout /> : <NativeLayout />}
                            </StartupGate>
                        </BottomSheetModalProvider>
                    </GestureHandlerRootView>
                </TutorialProvider>
            </SettingsProvider>
        </SafeAreaProvider>
    );
}

// Wrap with Sentry for automatic error boundary and performance tracking
export default Sentry.wrap(RootLayout);

const styles = StyleSheet.create({
    startupShell: {
        flex: 1,
    },
    startupOverlay: {
        flex: 1,
        backgroundColor: '#2563EB',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 32,
    },
    startupLogo: {
        width: 180,
        height: 180,
    },
    startupSpinner: {
        marginTop: 20,
    },
});
