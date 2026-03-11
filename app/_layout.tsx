// Crypto polyfills - MUST be first before any other imports
import 'react-native-get-random-values';
import 'fast-text-encoding';

import React, { useCallback, useEffect } from 'react';
import { Stack, useNavigationContainerRef } from 'expo-router';
import { PrivyProvider } from '@privy-io/expo';
import Constants from 'expo-constants';
import {
    useFonts,
    GoogleSansFlex_400Regular,
    GoogleSansFlex_500Medium,
    GoogleSansFlex_600SemiBold,
} from '@expo-google-fonts/google-sans-flex';
import { Merriweather_300Light, Merriweather_400Regular, Merriweather_700Bold, Merriweather_900Black } from '@expo-google-fonts/merriweather';
import { View, Platform, Image, ActivityIndicator, StyleSheet, AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { SettingsProvider, useSettings } from '../context/SettingsContext';
import { TutorialProvider } from '../context/TutorialContext';
import { useThemeColors } from '../theme/colors';
import * as Sentry from '@sentry/react-native';
import { isRunningInExpoGo } from 'expo';
import { initializeAnalytics, trackScreen } from '../services/analytics';
import Analytics from '../services/analytics';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../hooks/useAuth';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { getApiBaseUrl, rewriteApiUrlForRuntime } from '../utils/apiBaseUrl';

// Prevent the splash screen from auto-hiding before asset loading is complete
SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({
    fade: true,
    duration: 250,
});

const PRIVY_APP_ID = Constants.expoConfig?.extra?.privyAppId || process.env.EXPO_PUBLIC_PRIVY_APP_ID || '';
const PRIVY_CLIENT_ID = Constants.expoConfig?.extra?.privyClientId || process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID || '';
const ONESIGNAL_APP_ID = Constants.expoConfig?.extra?.oneSignalAppId || process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID || '';
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
        if (typeof input === 'string') {
            return originalFetch(rewriteApiUrlForRuntime(input), init);
        }

        if (input instanceof URL) {
            return originalFetch(new URL(rewriteApiUrlForRuntime(input.toString())), init);
        }

        if (typeof Request !== 'undefined' && input instanceof Request) {
            const rewrittenUrl = rewriteApiUrlForRuntime(input.url);
            if (rewrittenUrl !== input.url) {
                return originalFetch(new Request(rewrittenUrl, input), init);
            }
        }

        return originalFetch(input as RequestInfo, init);
    }) as typeof fetch;

    globalThis.__hedwigApiFetchPatched = true;
};

installApiFetchRewrite();

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
            <Stack.Screen name="wallet/send" />
            <Stack.Screen name="wallet/send-address" />
            <Stack.Screen name="wallet/send-token" />

            <Stack.Screen name="notifications/index" />
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
            <Stack.Screen name="wallet/send" />
            <Stack.Screen name="wallet/send-address" />
            <Stack.Screen name="wallet/send-token" />
            <Stack.Screen name="notifications/index" />
            <Stack.Screen name="insights/index" />
        </Stack>
    );
}

import { UserProvider } from '../context/UserContext';

function PushNotificationBootstrap() {
    const { user, isReady, getAccessToken } = useAuth();
    const { isRegistered, registerForPushNotifications, registerWithBackend } = usePushNotifications();
    const initializedOneSignalRef = React.useRef(false);
    const oneSignalRef = React.useRef<any>(null);

    const ensureOneSignalPermission = useCallback(async () => {
        const OneSignal = oneSignalRef.current;
        if (!OneSignal) return;

        try {
            const hasPermission = Boolean(OneSignal.Notifications?.permission);
            const canRequestPermission = Boolean(OneSignal.Notifications?.canRequestPermission);

            // Ask on first run; if already denied, OneSignal will route user to app settings.
            if (!hasPermission || canRequestPermission) {
                await OneSignal.Notifications.requestPermission(true);
            }

            // Ensure device is opted in on OneSignal side.
            if (OneSignal.User?.pushSubscription?.optIn) {
                OneSignal.User.pushSubscription.optIn();
            }
        } catch (error) {
            console.error('[Push] Failed to ensure OneSignal permission:', error);
        }
    }, []);

    useEffect(() => {
        const setupPushNotifications = async () => {
            if (!isReady) return;

            // Prefer OneSignal when configured.
            if (Platform.OS !== 'web' && ONESIGNAL_APP_ID) {
                try {
                    const oneSignalModule = require('react-native-onesignal');
                    const OneSignal = oneSignalModule?.default || oneSignalModule;
                    oneSignalRef.current = OneSignal;

                    if (!initializedOneSignalRef.current) {
                        OneSignal.initialize(ONESIGNAL_APP_ID);
                        initializedOneSignalRef.current = true;
                    }

                    if (user?.id) {
                        OneSignal.login(user.id);
                        await ensureOneSignalPermission();
                    } else if (initializedOneSignalRef.current) {
                        OneSignal.logout();
                    }
                    // OneSignal handles delivery — no need for Expo token path.
                    return;
                } catch (error) {
                    console.error('[Push] OneSignal initialization failed, falling back to Expo push tokens:', error);
                    // Falls through to Expo token registration below.
                }
            }

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
    }, [isReady, user, isRegistered, getAccessToken, registerForPushNotifications, registerWithBackend, ensureOneSignalPermission]);

    useEffect(() => {
        if (Platform.OS === 'web' || !ONESIGNAL_APP_ID) return;
        const appStateSubscription = AppState.addEventListener('change', (state) => {
            if (state === 'active') {
                void ensureOneSignalPermission();
            }
        });

        return () => {
            appStateSubscription.remove();
        };
    }, [ensureOneSignalPermission]);

    return null;
}

// Native layout with Privy
function NativeLayout() {
    return (
        <PrivyProvider
            appId={PRIVY_APP_ID}
            clientId={PRIVY_CLIENT_ID}
        >
            <UserProvider>
                <PushNotificationBootstrap />
                <ThemedStack />
            </UserProvider>
        </PrivyProvider>
    );
}

function ThemeAwareStatusBar() {
    const { currentTheme } = useSettings();
    const isDark = currentTheme === 'dark';

    if (Platform.OS !== 'android') {
        return null;
    }

    return (
        <StatusBar
            style={isDark ? 'light' : 'dark'}
            backgroundColor={isDark ? '#000000' : '#FFFFFF'}
        />
    );
}

function StartupGate({ children, isApiWarmed }: { children: React.ReactNode; isApiWarmed: boolean }) {
    if (isApiWarmed) {
        return <>{children}</>;
    }

    return (
        <View style={styles.startupOverlay}>
            <Image source={require('../assets/splash-icon.png')} style={styles.startupLogo} resizeMode="contain" />
            <ActivityIndicator size="small" color="#FFFFFF" style={styles.startupSpinner} />
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
        GoogleSansFlex_400Regular,
        GoogleSansFlex_500Medium,
        GoogleSansFlex_600SemiBold,
        Merriweather_300Light,
        Merriweather_400Regular,
        Merriweather_700Bold,
        Merriweather_900Black,
    });
    const [isApiWarmed, setIsApiWarmed] = React.useState(false);

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

    // Hide splash screen once fonts are ready; API warmup continues in the app gate.
    const onLayoutRootView = useCallback(async () => {
        if (fontsLoaded) {
            await SplashScreen.hideAsync();
        }
    }, [fontsLoaded]);

    // Keep native splash for initial boot until fonts are available.
    if (!fontsLoaded) {
        return null;
    }

    const isWeb = Platform.OS === 'web';

    return (
        <SettingsProvider>
            <TutorialProvider>
                <GestureHandlerRootView style={{ flex: 1 }} onLayout={onLayoutRootView}>
                    <ThemeAwareStatusBar />
                    <BottomSheetModalProvider>
                        <StartupGate isApiWarmed={isApiWarmed}>
                            {isWeb ? <WebLayout /> : <NativeLayout />}
                        </StartupGate>
                    </BottomSheetModalProvider>
                </GestureHandlerRootView>
            </TutorialProvider>
        </SettingsProvider>
    );
}

// Wrap with Sentry for automatic error boundary and performance tracking
export default Sentry.wrap(RootLayout);

const styles = StyleSheet.create({
    startupOverlay: {
        flex: 1,
        backgroundColor: '#FFFFFF',
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
