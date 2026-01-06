import React from 'react';
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
import { View, ActivityIndicator, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SettingsProvider, useSettings } from '../context/SettingsContext';
import { useThemeColors } from '../theme/colors';
import * as Sentry from '@sentry/react-native';
import { isRunningInExpoGo } from 'expo';

const PRIVY_APP_ID = Constants.expoConfig?.extra?.privyAppId || process.env.EXPO_PUBLIC_PRIVY_APP_ID || '';
const PRIVY_CLIENT_ID = Constants.expoConfig?.extra?.privyClientId || process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID || '';
const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN || '';

// Sentry Navigation Integration for Expo Router
const navigationIntegration = Sentry.reactNavigationIntegration({
    enableTimeToInitialDisplay: !isRunningInExpoGo(),
});

// Initialize Sentry
Sentry.init({
    dsn: SENTRY_DSN,
    // Adds more context data to events
    sendDefaultPii: true,
    // Set tracesSampleRate to 1.0 to capture 100% of transactions for tracing.
    // Adjust this value in production for performance.
    tracesSampleRate: __DEV__ ? 1.0 : 0.2,
    // Enable native frames tracking (disabled in Expo Go)
    enableNativeFramesTracking: !isRunningInExpoGo(),
    // Add navigation integration for route tracking
    integrations: [navigationIntegration],
    // Only send errors in production, log in dev
    enabled: !__DEV__,
    // Environment tag
    environment: __DEV__ ? 'development' : 'production',
    // Debug mode in development
    debug: __DEV__,
});

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
            <Stack.Screen name="index" options={{ gestureEnabled: false }} />
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
            <Stack.Screen name="notifications/index" />
            <Stack.Screen name="insights/index" />
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
            <Stack.Screen name="index" options={{ gestureEnabled: false }} />
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
            <Stack.Screen name="notifications/index" />
            <Stack.Screen name="insights/index" />
        </Stack>
    );
}

// Native layout with Privy
function NativeLayout() {
    return (
        <PrivyProvider
            appId={PRIVY_APP_ID}
            clientId={PRIVY_CLIENT_ID}
        >
            <ThemedStack />
        </PrivyProvider>
    );
}

function RootLayout() {
    // Register navigation container for Sentry route tracking
    const ref = useNavigationContainerRef();

    React.useEffect(() => {
        if (ref) {
            navigationIntegration.registerNavigationContainer(ref);
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

    if (!fontsLoaded) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000000' }}>
                <ActivityIndicator size="large" color="#2563EB" />
            </View>
        );
    }

    const isWeb = Platform.OS === 'web';

    return (
        <SettingsProvider>
            <GestureHandlerRootView style={{ flex: 1 }}>
                {isWeb ? <WebLayout /> : <NativeLayout />}
            </GestureHandlerRootView>
        </SettingsProvider>
    );
}

// Wrap with Sentry for automatic error boundary and performance tracking
export default Sentry.wrap(RootLayout);
