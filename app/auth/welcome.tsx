import React, { useEffect, useRef, useState } from 'react';
import {
    View,
    Image,
    StyleSheet,
    Animated,
    Pressable,
    Text,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAnalyticsScreen } from '../../hooks/useAnalyticsScreen';
import { useAuth } from '../../hooks/useAuth';

const BRAND_BLUE = '#2563EB';

export default function WelcomeScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { user, isReady } = useAuth();
    const buttonOpacity = useRef(new Animated.Value(0)).current;
    const buttonTranslateY = useRef(new Animated.Value(20)).current;
    const textOpacity = useRef(new Animated.Value(0)).current;
    const [buttonVisible, setButtonVisible] = useState(false);

    useAnalyticsScreen('Welcome');

    useEffect(() => {
        if (isReady && user) router.replace('/');
    }, [isReady, user]);

    useEffect(() => {
        const timer = setTimeout(() => {
            setButtonVisible(true);
            Animated.parallel([
                Animated.timing(textOpacity, {
                    toValue: 1,
                    duration: 600,
                    useNativeDriver: true,
                }),
                Animated.timing(buttonOpacity, {
                    toValue: 1,
                    duration: 500,
                    useNativeDriver: true,
                }),
                Animated.timing(buttonTranslateY, {
                    toValue: 0,
                    duration: 500,
                    useNativeDriver: true,
                }),
            ]).start();
        }, 1200);
        return () => clearTimeout(timer);
    }, []);

    return (
        <View style={styles.root}>
            {/* Logo */}
            <Image
                source={require('../../assets/images/hedwig-logo-transparent.png')}
                style={styles.logo}
                resizeMode="contain"
            />

            {/* Tagline */}
            <Animated.View style={{ opacity: textOpacity, alignItems: 'center', paddingHorizontal: 40 }}>
                <Text style={styles.headline}>Your wallet, simplified</Text>
                <Text style={styles.subheadline}>
                    Receive funds in stablecoin. Send to your bank account. All in one place.
                </Text>
            </Animated.View>

            {/* Get Started button */}
            <Animated.View
                style={[
                    styles.buttonWrap,
                    {
                        paddingBottom: insets.bottom + 24,
                        opacity: buttonOpacity,
                        transform: [{ translateY: buttonTranslateY }],
                    },
                ]}
                pointerEvents={buttonVisible ? 'auto' : 'none'}
            >
                <Pressable
                    style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
                    onPress={() => router.push('/auth/login')}
                >
                    <Text style={styles.buttonText}>Get Started</Text>
                </Pressable>
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: BRAND_BLUE,
        alignItems: 'center',
        justifyContent: 'center',
    },
    logo: {
        width: 180,
        height: 70,
        tintColor: '#FFFFFF',
        marginBottom: 24,
    },
    headline: {
        fontFamily: 'GoogleSansFlex_700Bold',
        fontSize: 28,
        color: '#FFFFFF',
        textAlign: 'center',
        marginBottom: 12,
    },
    subheadline: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 16,
        color: 'rgba(255,255,255,0.85)',
        textAlign: 'center',
        lineHeight: 24,
    },
    buttonWrap: {
        position: 'absolute',
        bottom: 0,
        left: 24,
        right: 24,
    },
    button: {
        backgroundColor: '#FFFFFF',
        borderRadius: 14,
        paddingVertical: 16,
        alignItems: 'center',
    },
    buttonPressed: {
        opacity: 0.85,
    },
    buttonText: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 16,
        color: BRAND_BLUE,
    },
});
