import React, { useState, useRef, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    Alert,
    Animated,
    Keyboard,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CaretLeft, GoogleLogo, AppleLogo } from 'phosphor-react-native';
import { Colors, useThemeColors, useKeyboardAppearance } from '../../theme/colors';
import { Button } from '../../components/Button';
import { useAnalyticsScreen } from '../../hooks/useAnalyticsScreen';
import { useAuth } from '../../hooks/useAuth';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
const DEMO_EMAIL = 'demo@hedwig.app';
const DEMO_CODE = '123456';

export default function SignInScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const themeColors = useThemeColors();
    const keyboardAppearance = useKeyboardAppearance();

    useAnalyticsScreen('SignIn');

    // State
    const [step, setStep] = useState<'credentials' | 'otp'>('credentials');
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [otp, setOtp] = useState('');
    const [isDemo, setIsDemo] = useState(false);

    // Animation
    const keyboardOffset = useRef(new Animated.Value(0)).current;
    const inputRef = useRef<TextInput>(null);

    // Hooks
    const { loginWithEmail, verifyOtp, login, getAccessToken } = useAuth();

    // Detect demo email
    useEffect(() => {
        setIsDemo(email.toLowerCase().trim() === DEMO_EMAIL);
    }, [email]);

    // Keyboard listeners
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

    // Handle email sign in
    const handleSignIn = async () => {
        if (!email || !email.includes('@')) {
            Alert.alert('Invalid Email', 'Please enter a valid email address.');
            return;
        }

        setLoading(true);
        try {
            if (isDemo) {
                // Demo flow - send code and go to OTP step
                setStep('otp');
                setTimeout(() => setOtp(DEMO_CODE), 300);
            } else {
                // Supabase OTP flow
                await loginWithEmail(email);
                setStep('otp');
            }
        } catch (error) {
            console.error('Sign in error:', error);
            Alert.alert('Error', 'Failed to send verification code. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    // Handle OTP verification
    const handleVerifyOtp = async () => {
        if (otp.length !== 6) return;

        setLoading(true);
        try {
            if (isDemo) {
                // Demo account flow
                const response = await fetch(`${API_URL}/api/auth/demo-login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: DEMO_EMAIL, code: otp }),
                });

                const data = await response.json();

                if (data.success && data.data.demoToken) {
                    await AsyncStorage.setItem('demoToken', data.data.demoToken);
                    await AsyncStorage.setItem('isDemo', 'true');
                    router.replace('/');
                } else {
                    throw new Error(data.error?.message || 'Demo login failed');
                }
            } else {
                // Supabase OTP verification
                await verifyOtp(email, otp);

                // Check if user exists in backend
                const token = await getAccessToken();
                const response = await fetch(`${API_URL}/api/auth/me`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (response.ok) {
                    router.replace('/');
                } else if (response.status === 404) {
                    router.replace({ pathname: '/auth/profile', params: { email } });
                } else {
                    throw new Error('Failed to check user status');
                }
            }
        } catch (error) {
            console.error('Verification failed:', error);
            Alert.alert('Verification Failed', 'Invalid code. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    // Auto-submit OTP when 6 digits entered
    useEffect(() => {
        if (step === 'otp' && otp.length === 6) {
            handleVerifyOtp();
        }
    }, [otp, step]);

    // Handle OAuth sign in
    const handleOAuthSignIn = async (provider: 'google' | 'apple') => {
        setLoading(true);
        try {
            await login(provider);
            // OAuth will redirect back to the app
        } catch (error) {
            console.error('OAuth error:', error);
            Alert.alert('Error', `Failed to sign in with ${provider}. Please try again.`);
        } finally {
            setLoading(false);
        }
    };

    const handleBack = () => {
        if (step === 'otp') {
            setStep('credentials');
            setOtp('');
        } else {
            router.back();
        }
    };

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: themeColors.background }]}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={handleBack} style={styles.backButton}>
                    <View style={[styles.backButtonCircle, { backgroundColor: themeColors.surface }]}>
                        <CaretLeft size={20} color={themeColors.textPrimary} weight="bold" />
                    </View>
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]}>Sign in</Text>
                <View style={styles.headerSpacer} />
            </View>

            <KeyboardAvoidingView
                style={styles.content}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                {step === 'credentials' ? (
                    <>
                        {/* Welcome Title */}
                        <Text style={[styles.title, { color: themeColors.textPrimary }]}>Welcome back</Text>

                        {/* Email Input */}
                        <View style={[styles.inputContainer, { borderColor: themeColors.border }]}>
                            <TextInput
                                style={[styles.input, { color: themeColors.textPrimary }]}
                                placeholder="Email"
                                placeholderTextColor={themeColors.textTertiary}
                                value={email}
                                onChangeText={setEmail}
                                autoCapitalize="none"
                                keyboardType="email-address"
                                keyboardAppearance={keyboardAppearance}
                                autoFocus
                            />
                        </View>

                        {/* Sign In Button */}
                        <Button
                            title="Sign in"
                            onPress={handleSignIn}
                            variant="primary"
                            size="large"
                            loading={loading}
                            disabled={!email || loading}
                        />

                        {/* Divider */}
                        <View style={styles.divider}>
                            <View style={[styles.dividerLine, { backgroundColor: themeColors.border }]} />
                            <Text style={[styles.dividerText, { color: themeColors.textTertiary }]}>or</Text>
                            <View style={[styles.dividerLine, { backgroundColor: themeColors.border }]} />
                        </View>

                        {/* OAuth Buttons */}
                        <TouchableOpacity
                            style={[styles.oauthButton, { borderColor: themeColors.border }]}
                            onPress={() => handleOAuthSignIn('google')}
                            disabled={loading}
                        >
                            <GoogleLogo size={20} color="#4285F4" weight="fill" style={{ marginRight: 12 }} />
                            <Text style={[styles.oauthText, { color: themeColors.textPrimary }]}>
                                Continue With Google
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.oauthButton, { borderColor: themeColors.border }]}
                            onPress={() => handleOAuthSignIn('apple')}
                            disabled={loading}
                        >
                            <AppleLogo size={20} color={themeColors.textPrimary} weight="fill" style={{ marginRight: 12 }} />
                            <Text style={[styles.oauthText, { color: themeColors.textPrimary }]}>
                                Continue With Apple
                            </Text>
                        </TouchableOpacity>

                        {/* Sign Up Link */}
                        <View style={styles.bottomLink}>
                            <Text style={[styles.bottomLinkText, { color: themeColors.textSecondary }]}>
                                First time here?{' '}
                            </Text>
                            <TouchableOpacity onPress={() => router.push('/auth/signup')}>
                                <Text style={[styles.bottomLinkAction, { color: Colors.primary }]}>
                                    Create an account
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </>
                ) : (
                    <>
                        {/* OTP Step */}
                        <Text style={[styles.title, { color: themeColors.textPrimary }]}>Enter Code</Text>
                        <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
                            We sent a verification code to{' '}
                            <Text style={{ fontWeight: '600', color: themeColors.textPrimary }}>{email}</Text>
                        </Text>

                        <View style={styles.otpContainer}>
                            {[0, 1, 2, 3, 4, 5].map((index) => (
                                <View
                                    key={index}
                                    style={[
                                        styles.otpBox,
                                        {
                                            backgroundColor: themeColors.surface,
                                            borderColor: otp.length === index ? themeColors.textPrimary : 'transparent'
                                        }
                                    ]}
                                >
                                    <Text style={[styles.otpText, { color: themeColors.textPrimary }]}>
                                        {otp[index] || ''}
                                    </Text>
                                </View>
                            ))}
                        </View>

                        <TextInput
                            ref={inputRef}
                            style={styles.hiddenInput}
                            value={otp}
                            onChangeText={(text) => {
                                if (text.length <= 6 && /^\d*$/.test(text)) {
                                    setOtp(text);
                                }
                            }}
                            keyboardType="number-pad"
                            keyboardAppearance={keyboardAppearance}
                            autoFocus
                            maxLength={6}
                        />

                        <TouchableOpacity onPress={() => inputRef.current?.focus()} style={styles.otpOverlay} />

                        <Button
                            title="Verify"
                            onPress={handleVerifyOtp}
                            variant="primary"
                            size="large"
                            loading={loading}
                            disabled={otp.length !== 6 || loading}
                        />
                    </>
                )}
            </KeyboardAvoidingView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FFFFFF',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 12,
    },
    backButton: {
        padding: 4,
    },
    backButtonCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#F3F4F6',
    },
    headerTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 17,
        color: Colors.textPrimary,
    },
    headerSpacer: {
        width: 40,
    },
    content: {
        flex: 1,
        paddingHorizontal: 24,
        paddingTop: 24,
    },
    title: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 28,
        color: Colors.textPrimary,
        marginBottom: 24,
    },
    subtitle: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 16,
        color: Colors.textSecondary,
        marginBottom: 24,
        lineHeight: 24,
    },
    inputContainer: {
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 16,
        marginBottom: 16,
        paddingHorizontal: 16,
        paddingVertical: 4,
    },
    input: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 16,
        paddingVertical: 14,
        color: Colors.textPrimary,
    },
    divider: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 24,
    },
    dividerLine: {
        flex: 1,
        height: 1,
        backgroundColor: '#E5E7EB',
    },
    dividerText: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 14,
        color: '#9CA3AF',
        marginHorizontal: 16,
    },
    oauthButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 16,
        paddingVertical: 14,
        marginBottom: 12,
    },
    oauthIcon: {
        width: 20,
        height: 20,
        marginRight: 12,
    },
    oauthText: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 16,
        color: Colors.textPrimary,
    },
    bottomLink: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginTop: 'auto',
        marginBottom: 32,
    },
    bottomLinkText: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 15,
        color: Colors.textSecondary,
    },
    bottomLinkAction: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 15,
        color: Colors.primary,
    },
    otpContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 32,
    },
    otpBox: {
        width: 48,
        height: 56,
        backgroundColor: '#F3F4F6',
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'transparent',
    },
    otpText: {
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
    otpOverlay: {
        position: 'absolute',
        top: 180,
        left: 24,
        right: 24,
        height: 60,
    },
});
