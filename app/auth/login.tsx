import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, Alert, Animated, Keyboard } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, useThemeColors, useKeyboardAppearance } from '../../theme/colors';
import { useLoginWithEmail, usePrivy } from '@privy-io/expo';
import { Button } from '../../components/Button';
import { useAnalyticsScreen } from '../../hooks/useAnalyticsScreen';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
const DEMO_EMAIL = 'demo@hedwig.app';
const DEMO_CODE = '123456';

export default function LoginScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const themeColors = useThemeColors();
    const keyboardAppearance = useKeyboardAppearance();

    // Track page view
    useAnalyticsScreen('Login');

    // State
    const [step, setStep] = useState<'email' | 'otp'>('email');
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [isDemo, setIsDemo] = useState(false);

    // Keyboard animation
    const keyboardOffset = useRef(new Animated.Value(0)).current;

    // Hooks
    const { sendCode, loginWithCode } = useLoginWithEmail();
    const { getAccessToken, user, isReady } = usePrivy();
    const inputRef = useRef<TextInput>(null);

    // Detect demo email
    useEffect(() => {
        setIsDemo(email.toLowerCase().trim() === DEMO_EMAIL);
    }, [email]);

    // Keyboard listeners for smooth animation matching keyboard speed
    useEffect(() => {
        const keyboardWillShow = Keyboard.addListener(
            Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
            (e) => {
                Animated.timing(keyboardOffset, {
                    toValue: e.endCoordinates.height - insets.bottom,
                    duration: e.duration || 250,
                    useNativeDriver: false,
                }).start();
            }
        );

        const keyboardWillHide = Keyboard.addListener(
            Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
            (e) => {
                Animated.timing(keyboardOffset, {
                    toValue: 0,
                    duration: e.duration || 250,
                    useNativeDriver: false,
                }).start();
            }
        );

        return () => {
            keyboardWillShow.remove();
            keyboardWillHide.remove();
        };
    }, [insets.bottom]);

    // Handle sending email code
    const handleSendCode = async () => {
        if (!email || !email.includes('@')) return;

        setLoading(true);
        try {
            // For demo account, skip Privy and go directly to OTP step
            if (isDemo) {
                setStep('otp');
                // Auto-fill demo code after a short delay for better UX
                setTimeout(() => setCode(DEMO_CODE), 300);
            } else {
                await sendCode({ email });
                setStep('otp');
            }
        } catch (error) {
            console.error('Login failed:', error);
            Alert.alert('Error', 'Failed to send verification code.');
        } finally {
            setLoading(false);
        }
    };

    // Handle verifying code
    const handleVerify = async () => {
        if (code.length !== 6) return;

        setLoading(true);
        try {
            // Demo account flow - use special demo-login endpoint
            if (isDemo) {
                const response = await fetch(`${API_URL}/api/auth/demo-login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: DEMO_EMAIL, code }),
                });

                const data = await response.json();

                if (data.success && data.data.demoToken) {
                    // Store demo token for subsequent API calls
                    await AsyncStorage.setItem('demoToken', data.data.demoToken);
                    await AsyncStorage.setItem('isDemo', 'true');

                    // Navigate to home
                    router.replace('/');
                } else {
                    throw new Error(data.error?.message || 'Demo login failed');
                }
            } else {
                // Normal Privy flow
                // IMPORTANT: Clear any stale demo mode flags first
                await AsyncStorage.removeItem('isDemo');
                await AsyncStorage.removeItem('demoToken');

                if (!user) {
                    await loginWithCode({ code, email });
                }

                // Get Access Token
                const token = await getAccessToken();

                // Check if user exists in backend
                const response = await fetch(`${API_URL}/api/auth/me`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (response.ok) {
                    // User exists, go to Home
                    router.replace('/');
                } else if (response.status === 404) {
                    // User does not exist, go to Profile
                    router.replace({ pathname: '/auth/profile', params: { email } });
                } else {
                    throw new Error('Failed to check user status');
                }
            }
        } catch (error) {
            console.error('Verification failed:', error);
            Alert.alert('Verification Failed', 'Invalid code or network error.');
        } finally {
            setLoading(false);
        }
    };

    // Auto-submit code when 6 digits entered
    useEffect(() => {
        if (step === 'otp' && code.length === 6) {
            handleVerify();
        }
    }, [code, step]);

    const handleBack = () => {
        if (step === 'otp') {
            setStep('email');
            setCode('');
        } else {
            router.back();
        }
    };

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: themeColors.background }]}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={handleBack} style={styles.backButton}>
                    {/* Back button placeholder */}
                </TouchableOpacity>
            </View>

            <View style={styles.content}>
                {step === 'email' ? (
                    <>
                        <Text style={[styles.title, { color: themeColors.textPrimary }]}>Continue with Email</Text>
                        <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>Sign in or sign up with your email.</Text>

                        <TextInput
                            style={[styles.input, { backgroundColor: themeColors.surface, color: themeColors.textPrimary }]}
                            placeholder="Email Address"
                            placeholderTextColor="#9CA3AF"
                            value={email}
                            onChangeText={setEmail}
                            autoCapitalize="none"
                            keyboardType="email-address"
                            keyboardAppearance={keyboardAppearance}
                            autoFocus
                        />
                    </>
                ) : (
                    <>
                        <Text style={[styles.title, { color: themeColors.textPrimary }]}>Enter Code</Text>
                        <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
                            We sent a verification code to your email <Text style={{ fontWeight: '600', color: themeColors.textPrimary }}>{email}</Text>.
                        </Text>

                        <View style={styles.codeContainer}>
                            {[0, 1, 2, 3, 4, 5].map((index) => (
                                <View key={index} style={[
                                    styles.codeBox,
                                    { backgroundColor: themeColors.surface },
                                    code.length === index && { borderColor: themeColors.textPrimary, backgroundColor: themeColors.background }
                                ]}>
                                    <Text style={[styles.codeText, { color: themeColors.textPrimary }]}>
                                        {code[index] || ''}
                                    </Text>
                                </View>
                            ))}
                        </View>

                        <TextInput
                            ref={inputRef}
                            style={styles.hiddenInput}
                            value={code}
                            onChangeText={(text) => {
                                if (text.length <= 6 && /^\d*$/.test(text)) {
                                    setCode(text);
                                }
                            }}
                            keyboardType="number-pad"
                            keyboardAppearance={keyboardAppearance}
                            autoFocus
                            maxLength={6}
                        />

                        <TouchableOpacity onPress={() => inputRef.current?.focus()} style={styles.overlay} />
                    </>
                )}

                <View style={{ flex: 1 }} />

                {/* Animated Button Container */}
                <Animated.View style={[styles.buttonContainer, { marginBottom: keyboardOffset }]}>
                    <Button
                        title="Next"
                        onPress={step === 'email' ? handleSendCode : handleVerify}
                        variant="primary"
                        size="large"
                        loading={loading}
                        disabled={step === 'email' ? !email || loading : code.length !== 6 || loading}
                    />
                    <View style={{ height: insets.bottom + 8 }} />
                </Animated.View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FFFFFF',
    },
    header: {
        paddingHorizontal: 20,
        paddingBottom: 20,
    },
    backButton: {
        padding: 8,
        marginLeft: -8,
    },
    content: {
        flex: 1,
        paddingHorizontal: 24,
    },
    title: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 28,
        color: Colors.textPrimary,
        marginBottom: 8,
    },
    subtitle: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 16,
        color: Colors.textSecondary,
        marginBottom: 32,
        lineHeight: 24,
    },
    input: {
        backgroundColor: '#F3F4F6',
        borderRadius: 16,
        paddingHorizontal: 16,
        paddingVertical: 16,
        fontSize: 16,
        fontFamily: 'GoogleSansFlex_400Regular',
        color: Colors.textPrimary,
    },
    codeContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 32,
    },
    codeBox: {
        width: 48,
        height: 56,
        backgroundColor: '#F3F4F6',
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'transparent',
    },
    codeBoxActive: {
        borderColor: Colors.textPrimary,
        backgroundColor: '#FFFFFF',
    },
    codeText: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 24,
        color: Colors.textPrimary,
    },
    hiddenInput: {
        position: 'absolute',
        width: 1,
        height: 1,
        opacity: 0,
    },
    overlay: {
        position: 'absolute',
        top: 160,
        left: 24,
        right: 24,
        height: 60,
    },
    buttonContainer: {
        width: '100%',
    },
});
