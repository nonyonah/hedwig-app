import { Stack } from 'expo-router';
import { PrivyProvider } from '@privy-io/expo';
import Constants from 'expo-constants';
import { useFonts, Outfit_400Regular, Outfit_500Medium, Outfit_600SemiBold, Outfit_700Bold } from '@expo-google-fonts/outfit';
import { View, ActivityIndicator } from 'react-native';

const PRIVY_APP_ID = Constants.expoConfig?.extra?.privyAppId || process.env.EXPO_PUBLIC_PRIVY_APP_ID || '';
const PRIVY_CLIENT_ID = Constants.expoConfig?.extra?.privyClientId || process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID || '';

export default function RootLayout() {
    const [fontsLoaded] = useFonts({
        Outfit_400Regular,
        Outfit_500Medium,
        Outfit_600SemiBold,
        Outfit_700Bold,
    });

    if (!fontsLoaded) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#2563EB" />
            </View>
        );
    }

    return (
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
                <Stack.Screen name="index" />
                <Stack.Screen name="auth/welcome" />
                <Stack.Screen name="auth/login" />
                <Stack.Screen name="auth/signup" />
                <Stack.Screen name="auth/verify" />
                <Stack.Screen name="auth/biometrics" />
            </Stack>
        </PrivyProvider>
    );
}
