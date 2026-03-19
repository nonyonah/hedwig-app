import React, { useEffect, useState, useRef } from 'react';
import {
    View,
    Text,
    Image,
    StyleSheet,
    Pressable,
    ActivityIndicator,
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const BRAND_BLUE = '#2563EB';

interface Props {
    user: any;
    onUnlock: () => void;
}

type AuthState = 'idle' | 'authing' | 'failed';

export function LockScreen({ user, onUnlock }: Props) {
    const insets = useSafeAreaInsets();
    const [checking, setChecking] = useState(true);
    const [hasBiometrics, setHasBiometrics] = useState(false);
    const [biometricType, setBiometricType] = useState('Face ID');
    const [authState, setAuthState] = useState<AuthState>('idle');
    const triggered = useRef(false);
    const isAuthing = useRef(false);

    useEffect(() => {
        initialize();
    }, []);

    const initialize = async () => {
        try {
            const [hasHw, isEnrolled, types] = await Promise.all([
                LocalAuthentication.hasHardwareAsync(),
                LocalAuthentication.isEnrolledAsync(),
                LocalAuthentication.supportedAuthenticationTypesAsync(),
            ]);

            const biometricsAvailable = hasHw && isEnrolled;

            // Detect Face ID vs Touch ID
            if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
                setBiometricType('Face ID');
            } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
                setBiometricType('Touch ID');
            }

            setHasBiometrics(biometricsAvailable);
            setChecking(false);

            // Auto-trigger biometrics once if available
            if (!triggered.current && biometricsAvailable) {
                triggered.current = true;
                await triggerBiometrics();
            }
        } catch {
            setChecking(false);
        }
    };

    const triggerBiometrics = async () => {
        if (isAuthing.current) return;
        isAuthing.current = true;
        setAuthState('authing');
        try {
            const result = await LocalAuthentication.authenticateAsync({
                promptMessage: 'Unlock Hedwig',
                fallbackLabel: 'Use Passcode',
                cancelLabel: 'Cancel',
            });
            if (result.success) {
                onUnlock();
            } else {
                setAuthState('failed');
            }
        } catch {
            setAuthState('failed');
        } finally {
            isAuthing.current = false;
        }
    };

    return (
        <View
            style={[
                styles.root,
                { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24 },
            ]}
        >
            {/* Logo */}
            <Image
                source={require('../assets/images/hedwig-logo-transparent.png')}
                style={styles.logo}
                resizeMode="contain"
                tintColor="#FFFFFF"
            />

            {/* Center message */}
            <View style={styles.center}>
                {checking ? (
                    <ActivityIndicator color="rgba(255,255,255,0.7)" size="large" />
                ) : (
                    <>
                        <Text style={styles.title}>Welcome back</Text>
                        <Text style={styles.subtitle}>
                            {hasBiometrics
                                ? `Use ${biometricType} to unlock`
                                : 'Verify your identity to continue'}
                        </Text>
                        {authState === 'failed' && (
                            <Text style={styles.errorText}>Authentication failed. Try again.</Text>
                        )}
                    </>
                )}
            </View>

            {/* Footer buttons */}
            {!checking && hasBiometrics && (
                <View style={styles.footer}>
                    <Pressable
                        style={({ pressed }) => [styles.button, styles.buttonWhite, pressed && { opacity: 0.85 }]}
                        onPress={triggerBiometrics}
                    >
                        <Text style={[styles.buttonText, { color: BRAND_BLUE }]}>
                            {`Use ${biometricType}`}
                        </Text>
                    </Pressable>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: BRAND_BLUE,
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 9999,
    },
    logo: {
        width: 210,
        height: 80,
    },
    center: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        paddingHorizontal: 40,
    },
    title: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 26,
        color: '#FFFFFF',
        textAlign: 'center',
    },
    subtitle: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 16,
        color: 'rgba(255,255,255,0.75)',
        textAlign: 'center',
        lineHeight: 24,
    },
    errorText: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 14,
        color: 'rgba(255,255,255,0.65)',
        textAlign: 'center',
        marginTop: 4,
    },
    footer: {
        width: '100%',
        paddingHorizontal: 24,
        gap: 12,
    },
    button: {
        borderRadius: 999,
        paddingVertical: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonWhite: {
        backgroundColor: '#FFFFFF',
    },
    buttonText: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 16,
        letterSpacing: -0.2,
    },
});
