import { Stack, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { PrivyProvider, usePrivy } from '@privy-io/expo';
import Constants from 'expo-constants';
import {
    useFonts,
    RethinkSans_400Regular,
    RethinkSans_500Medium,
    RethinkSans_600SemiBold,
    RethinkSans_700Bold
} from '@expo-google-fonts/rethink-sans';
import { Merriweather_300Light, Merriweather_400Regular, Merriweather_700Bold, Merriweather_900Black } from '@expo-google-fonts/merriweather';
import { View, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SettingsProvider } from '../context/SettingsContext';
import { LoadingOverlay } from '../components/LoadingOverlay';
import { useEffect, useState } from 'react';

const PRIVY_APP_ID = Constants.expoConfig?.extra?.privyAppId || process.env.EXPO_PUBLIC_PRIVY_APP_ID || '';
const PRIVY_CLIENT_ID = Constants.expoConfig?.extra?.privyClientId || process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID || '';

function AuthRedirect({ children }: { children: React.ReactNode }) {
    const { isReady, user } = usePrivy();
    const segments = useSegments();
    const router = useRouter();
    const navigationState = useRootNavigationState();
    const [isChecking, setIsChecking] = useState(true);

    useEffect(() => {
        if (!navigationState?.key || !isReady) return;

        const inAuthGroup = segments[0] === 'auth';

        // If user is not logged in and not on auth screen, redirect to welcome
        if (!user && !inAuthGroup) {
            router.replace('/auth/welcome');
        }

        setIsChecking(false);
    }, [user, segments, isReady, navigationState?.key]);

    // Show loading while checking auth
    if (!isReady || isChecking) {
        return (
            <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
                <LoadingOverlay visible={true} />
            </View>
        );
    }

    return <>{children}</>;
}

function AppContent() {
    const [fontsLoaded] = useFonts({
        RethinkSans_400Regular,
        RethinkSans_500Medium,
        RethinkSans_600SemiBold,
        RethinkSans_700Bold,
        Merriweather_300Light,
        Merriweather_400Regular,
        Merriweather_700Bold,
        Merriweather_900Black,
    });

    if (!fontsLoaded) {
        return (
            <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
                <LoadingOverlay visible={true} />
            </View>
        );
    }

    return (
        <AuthRedirect>
            <Stack
                screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: '#FFFFFF' },
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
            </Stack>
        </AuthRedirect>
    );
}

export default function RootLayout() {
    const isWeb = Platform.OS === 'web';

    return (
        <SettingsProvider>
            <GestureHandlerRootView style={{ flex: 1 }}>
                {isWeb ? (
                    <Stack
                        screenOptions={{
                            headerShown: false,
                            contentStyle: { backgroundColor: '#FFFFFF' },
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
                    </Stack>
                ) : (
                    <PrivyProvider
                        appId={PRIVY_APP_ID}
                        clientId={PRIVY_CLIENT_ID}
                    >
                        <AppContent />
                    </PrivyProvider>
                )}
            </GestureHandlerRootView>
        </SettingsProvider>
    );
}
