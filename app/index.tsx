import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { usePrivy } from '@privy-io/expo';
import { View, StyleSheet, Text, ActivityIndicator, Image as RNImage } from 'react-native';

import { Colors } from '../theme/colors';
import { Metrics } from '../theme/metrics';
import { Typography } from '../styles/typography';

export default function Index() {
    const router = useRouter();
    const { isReady, user } = usePrivy();
    const [isSplashFinished, setIsSplashFinished] = useState(false);

    useEffect(() => {
        // Simulate splash delay
        const timer = setTimeout(() => {
            setIsSplashFinished(true);
        }, 2000);

        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        if (isReady && isSplashFinished) {
            if (user) {
                // User is authenticated, stay here (Home)
                // TODO: Navigate to main app tabs if applicable
                console.log('User is authenticated');
            } else {
                // User is not authenticated, navigate to welcome screen
                router.replace('/auth/welcome');
            }
        }
    }, [isReady, user, isSplashFinished]);

    if (!isReady || !isSplashFinished) {
        return (
            <View style={styles.container}>
                <RNImage
                    source={require('../assets/logo.jpg')}
                    style={styles.logoImage}
                    resizeMode="contain"
                />
            </View>
        );
    }

    // Authenticated Home View (Placeholder)
    return (
        <View style={styles.container}>
            <Text style={styles.text}>Welcome back, {(user as any)?.email?.address || 'User'}!</Text>
            {/* Add Logout button for testing */}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: Colors.background,
    },
    logoImage: {
        width: Metrics.logo.width,
        height: Metrics.logo.height,
    },
    text: {
        ...Typography.body,
    },
});
