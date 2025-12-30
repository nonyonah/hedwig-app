import { Stack } from 'expo-router';
import { PrivyProvider } from '@privy-io/expo';
import Constants from 'expo-constants';
import {
    useFonts,
    GoogleSansFlex_400Regular,
    GoogleSansFlex_500Medium,
    GoogleSansFlex_600SemiBold,
    GoogleSansFlex_700Bold
} from '@expo-google-fonts/google-sans-flex';
import { Merriweather_300Light, Merriweather_400Regular, Merriweather_700Bold, Merriweather_900Black } from '@expo-google-fonts/merriweather';
import { View, ActivityIndicator, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SettingsProvider } from '../context/SettingsContext';

const PRIVY_APP_ID = Constants.expoConfig?.extra?.privyAppId || process.env.EXPO_PUBLIC_PRIVY_APP_ID || '';
const PRIVY_CLIENT_ID = Constants.expoConfig?.extra?.privyClientId || process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID || '';

export default function RootLayout() {
    const [fontsLoaded] = useFonts({
        GoogleSansFlex_400Regular,
        GoogleSansFlex_500Medium,
        GoogleSansFlex_600SemiBold,
        GoogleSansFlex_700Bold,
        Merriweather_300Light,
        Merriweather_400Regular,
        Merriweather_700Bold,
        Merriweather_900Black,
    });

    if (!fontsLoaded) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#2563EB" />
            </View>
        );
    }

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
                    </PrivyProvider>
                )}
            </GestureHandlerRootView>
        </SettingsProvider>
    );
}
