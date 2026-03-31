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
    GoogleSansFlex_400Regular,
    GoogleSansFlex_500Medium,
    GoogleSansFlex_600SemiBold,
} from '@expo-google-fonts/google-sans-flex';
import { Merriweather_300Light, Merriweather_400Regular, Merriweather_700Bold, Merriweather_900Black } from '@expo-google-fonts/merriweather';
import { View, Platform, Image, ActivityIndicator, StyleSheet, AppState, Text, TextInput } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { LockScreen } from '../components/LockScreen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { SettingsProvider, useSettings } from '../context/SettingsContext';
import { TutorialProvider } from '../context/TutorialContext';
import { useThemeColors } from '../theme/colors';
import * as Sentry from '@sentry/react-native';
import { isRunningInExpoGo } from 'expo';
import { initializeAnalytics, trackScreen } from '../services/analytics';
import Analytics from '../services/analytics';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../hooks/useAuth';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { getApiBaseUrl, joinApiUrl, rewriteApiUrlForRuntime } from '../utils/apiBaseUrl';

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

const applyGlobalGoogleSansFlexDefaults = () => {
    const textDefaults = (Text as any).defaultProps || {};
    (Text as any).defaultProps = {
        ...textDefaults,
        style: [{ fontFamily: 'GoogleSansFlex_400Regular' }, textDefaults.style].filter(Boolean),
    };

    const textInputDefaults = (TextInput as any).defaultProps || {};
    (TextInput as any).defaultProps = {
        ...textInputDefaults,
        style: [{ fontFamily: 'GoogleSansFlex_400Regular' }, textInputDefaults.style].filter(Boolean),
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
    const trackedAppOpenedRef = React.useRef(false);
    const oneSignalRef = React.useRef<any>(null);
    const oneSignalSubscriptionListenerRef = React.useRef<any>(null);
    const lastSyncedSubscriptionIdRef = React.useRef<string | null>(null);

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

    const registerOneSignalSubscriptionWithBackend = useCallback(async (payload: {
        externalId: string;
        subscriptionId: string;
        token?: string | null;
    }) => {
        try {
            const authToken = await getAccessToken();
            if (!authToken) return;

            await fetch(joinApiUrl('/api/notifications/register-onesignal'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`,
                },
                body: JSON.stringify({
                    externalId: payload.externalId,
                    subscriptionId: payload.subscriptionId,
                    token: payload.token || null,
                    platform: Platform.OS,
                }),
            });
        } catch (error) {
            console.error('[Push] Failed to register OneSignal subscription with backend:', error);
        }
    }, [getAccessToken]);

    const syncOneSignalSubscription = useCallback(async (externalId: string) => {
        const OneSignal = oneSignalRef.current;
        if (!OneSignal) return;

        try {
            const subscriptionId =
                (typeof OneSignal.User?.pushSubscription?.getId === 'function'
                    ? await OneSignal.User.pushSubscription.getId()
                    : OneSignal.User?.pushSubscription?.id) || null;
            const subscriptionToken =
                (typeof OneSignal.User?.pushSubscription?.getToken === 'function'
                    ? await OneSignal.User.pushSubscription.getToken()
                    : OneSignal.User?.pushSubscription?.token) || null;

            if (!subscriptionId) return;
            const normalizedId = String(subscriptionId);
            if (lastSyncedSubscriptionIdRef.current === normalizedId) return;

            lastSyncedSubscriptionIdRef.current = normalizedId;
            await registerOneSignalSubscriptionWithBackend({
                externalId,
                subscriptionId: normalizedId,
                token: subscriptionToken ? String(subscriptionToken) : null,
            });
        } catch (error) {
            console.error('[Push] Failed to sync OneSignal subscription:', error);
        }
    }, [registerOneSignalSubscriptionWithBackend]);

    const ensureOneSignalPermission = useCallback(async () => {
        const OneSignal = oneSignalRef.current;
        if (!OneSignal) return;

        try {
            const hasPermission = Boolean(OneSignal.Notifications?.permission);

            // Ask on first run; if already denied, OneSignal will route user to app settings.
            if (!hasPermission) {
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
                        await OneSignal.login(user.id);
                        if (OneSignal.User?.addAlias) {
                            OneSignal.User.addAlias('privy_id', String(user.id));
                        }
                        const userEmail =
                            (typeof (user as any)?.email === 'string' ? (user as any).email : undefined) ||
                            (user as any)?.email?.address ||
                            (user as any)?.google?.email ||
                            (user as any)?.apple?.email ||
                            (Array.isArray((user as any)?.linkedAccounts)
                                ? (user as any).linkedAccounts.find((a: any) => a?.type === 'email')?.address
                                : undefined);
                        if (userEmail && OneSignal.User?.addEmail) {
                            OneSignal.User.addEmail(String(userEmail));
                        }

                        // Tag user for segmentation and personalization per OneSignal docs
                        if (OneSignal.User?.addTags) {
                            OneSignal.User.addTags({
                                platform: Platform.OS,
                                has_email: userEmail ? 'true' : 'false',
                                app_version: String(
                                    Constants.expoConfig?.version ||
                                    Constants.manifest?.version ||
                                    '1.0.0'
                                ),
                            });
                        }

                        await ensureOneSignalPermission();

                        // Initial sync — subscription ID may not be available yet immediately
                        // after login(), so we also schedule a retry after a short delay.
                        await syncOneSignalSubscription(String(user.id));
                        setTimeout(() => {
                            void syncOneSignalSubscription(String(user.id));
                        }, 4000);

                        if (typeof OneSignal.User?.pushSubscription?.addEventListener === 'function') {
                            if (
                                oneSignalSubscriptionListenerRef.current &&
                                typeof OneSignal.User?.pushSubscription?.removeEventListener === 'function'
                            ) {
                                OneSignal.User.pushSubscription.removeEventListener('change', oneSignalSubscriptionListenerRef.current);
                            }

                            const listener = (event: any) => {
                                const current = event?.current || event || {};
                                const nextId = current?.id;
                                if (!nextId) return;
                                lastSyncedSubscriptionIdRef.current = null;
                                void syncOneSignalSubscription(String(user.id));
                            };

                            OneSignal.User.pushSubscription.addEventListener('change', listener);
                            oneSignalSubscriptionListenerRef.current = listener;
                        }
                    } else if (initializedOneSignalRef.current) {
                        OneSignal.logout();
                        lastSyncedSubscriptionIdRef.current = null;
                    }
                } catch (error) {
                    console.error('[Push] OneSignal initialization failed, continuing with Expo push fallback:', error);
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
        return () => {
            const OneSignal = oneSignalRef.current;
            if (
                OneSignal &&
                oneSignalSubscriptionListenerRef.current &&
                typeof OneSignal.User?.pushSubscription?.removeEventListener === 'function'
            ) {
                OneSignal.User.pushSubscription.removeEventListener('change', oneSignalSubscriptionListenerRef.current);
                oneSignalSubscriptionListenerRef.current = null;
            }
        };
    }, [isReady, user, isRegistered, getAccessToken, registerForPushNotifications, registerWithBackend, ensureOneSignalPermission, syncOneSignalSubscription]);

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

// Handles app-lock on launch and when returning from background
function AppLockGate({ children }: { children: React.ReactNode }) {
    const { user, isReady } = useAuth();
    const [isLocked, setIsLocked] = useState(false);
    const hasBeenToBackground = React.useRef(false);
    const initialLockChecked = React.useRef(false);

    // Lock on fresh app open (killed + reopened)
    useEffect(() => {
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
    }, [user, isReady]);

    useEffect(() => {
        const subscription = AppState.addEventListener('change', async (nextState) => {
            if (nextState === 'background') {
                // Only true background (not inactive, which happens during biometric prompts)
                if (user) hasBeenToBackground.current = true;
            } else if (nextState === 'active' && hasBeenToBackground.current && user && isReady) {
                hasBeenToBackground.current = false;
                // Only show lock if a method is available
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
    }, [user, isReady]);

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
            >
                <UserProvider>
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
            <Image source={require('../assets/splash-icon-transparent.png')} style={styles.startupLogo} resizeMode="contain" tintColor="#FFFFFF" />
            <ActivityIndicator size="small" color="rgba(255,255,255,0.6)" style={styles.startupSpinner} />
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
        if (!fontsLoaded) return;
        applyGlobalGoogleSansFlexDefaults();
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
    );
}

// Wrap with Sentry for automatic error boundary and performance tracking
export default Sentry.wrap(RootLayout);

const styles = StyleSheet.create({
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
