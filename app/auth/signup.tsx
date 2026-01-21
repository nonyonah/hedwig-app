import React, { useState, useRef, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    KeyboardAvoidingView,
    Platform,
    Alert,
    Keyboard,
    ScrollView,
    Image,
    Linking
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CaretLeft } from 'phosphor-react-native';
import { Colors, useThemeColors, useKeyboardAppearance } from '../../theme/colors';
import { Button } from '../../components/Button';
import { useAnalyticsScreen } from '../../hooks/useAnalyticsScreen';
import { useAuth } from '../../hooks/useAuth';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

export default function SignUpScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const themeColors = useThemeColors();
    const keyboardAppearance = useKeyboardAppearance();

    useAnalyticsScreen('SignUp');

    // State
    const [step, setStep] = useState<'credentials' | 'otp'>('credentials');
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [otp, setOtp] = useState('');
    const [emailFocused, setEmailFocused] = useState(false);

    // Refs
    const otpInputRef = useRef<TextInput>(null);

    // Hooks
    const { loginWithEmail, verifyOtp, login, getAccessToken } = useAuth();

    // Dismiss keyboard when tapping outside
    const dismissKeyboard = () => {
        Keyboard.dismiss();
    };

    // Handle email sign up
    const handleContinue = async () => {
        Keyboard.dismiss();
        if (!email || !email.includes('@')) {
            Alert.alert('Invalid Email', 'Please enter a valid email address.');
            return;
        }

        setLoading(true);
        try {
            await loginWithEmail(email);
            setStep('otp');
        } catch (error) {
            console.error('Sign up error:', error);
            Alert.alert('Error', 'Failed to send verification code. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    // Handle OTP verification
    const handleVerifyOtp = async () => {
        if (otp.length !== 6) return;

        Keyboard.dismiss();
        setLoading(true);
        try {
            await verifyOtp(email, otp);

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

    // Handle OAuth sign up
    const handleOAuthSignUp = async (provider: 'google' | 'apple') => {
        Keyboard.dismiss();
        setLoading(true);
        try {
            await login(provider);
        } catch (error) {
            console.error('OAuth error:', error);
            Alert.alert('Error', `Failed to sign up with ${provider}. Please try again.`);
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

    const openTerms = () => {
        Linking.openURL('https://hedwig.app/terms');
    };

    const openPrivacy = () => {
        Linking.openURL('https://hedwig.app/privacy');
    };

    return (
        <TouchableWithoutFeedback onPress={dismissKeyboard}>
            <View style={[styles.container, { paddingTop: insets.top, backgroundColor: themeColors.background }]}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={handleBack} style={styles.backButton}>
                        <View style={[styles.backButtonCircle, { backgroundColor: themeColors.surface }]}>
                            <CaretLeft size={20} color={themeColors.textPrimary} weight="bold" />
                        </View>
                    </TouchableOpacity>
                    <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]}>Sign up</Text>
                    <View style={styles.headerSpacer} />
                </View>

                <KeyboardAvoidingView
                    style={styles.keyboardView}
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
                >
                    <ScrollView
                        style={styles.scrollView}
                        contentContainerStyle={styles.scrollContent}
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={false}
                    >
                        {step === 'credentials' ? (
                            <>
                                {/* Welcome Title */}
                                <Text style={[styles.title, { color: themeColors.textPrimary }]}>
                                    Let's get your account set up
                                </Text>

                                {/* Email Input */}
                                <View style={[
                                    styles.inputContainer,
                                    {
                                        backgroundColor: themeColors.surface,
                                        borderColor: emailFocused ? Colors.primary : 'transparent',
                                        borderWidth: emailFocused ? 2 : 0
                                    }
                                ]}>
                                    <TextInput
                                        style={[styles.input, { color: themeColors.textPrimary }]}
                                        placeholder="Email"
                                        placeholderTextColor={themeColors.textTertiary}
                                        value={email}
                                        onChangeText={setEmail}
                                        autoCapitalize="none"
                                        keyboardType="email-address"
                                        keyboardAppearance={keyboardAppearance}
                                        onFocus={() => setEmailFocused(true)}
                                        onBlur={() => setEmailFocused(false)}
                                    />
                                </View>

                                {/* Terms and Privacy */}
                                <Text style={[styles.termsText, { color: themeColors.textSecondary }]}>
                                    By creating an account using email, Google,{'\n'}or Apple, I agree to the{' '}
                                    <Text style={styles.termsLink} onPress={openTerms}>Terms and Conditions</Text>
                                    ,{'\n'}and acknowledge the{' '}
                                    <Text style={styles.termsLink} onPress={openPrivacy}>Privacy Policy</Text>
                                </Text>

                                {/* Continue Button */}
                                <Button
                                    title="Continue"
                                    onPress={handleContinue}
                                    variant="primary"
                                    size="large"
                                    loading={loading}
                                    disabled={!email || loading}
                                />

                                {/* Sign In Button */}
                                <TouchableOpacity
                                    style={[styles.secondaryButton, { backgroundColor: themeColors.surface }]}
                                    onPress={() => router.push('/auth/signin')}
                                    activeOpacity={0.7}
                                >
                                    <Text style={[styles.secondaryButtonText, { color: themeColors.textPrimary }]}>
                                        Already have an account? Sign in
                                    </Text>
                                </TouchableOpacity>

                                {/* Divider */}
                                <View style={styles.divider}>
                                    <View style={[styles.dividerLine, { backgroundColor: themeColors.border }]} />
                                    <Text style={[styles.dividerText, { color: themeColors.textTertiary }]}>or</Text>
                                    <View style={[styles.dividerLine, { backgroundColor: themeColors.border }]} />
                                </View>

                                {/* OAuth Buttons */}
                                <TouchableOpacity
                                    style={[styles.oauthButton, { backgroundColor: themeColors.surface }]}
                                    onPress={() => handleOAuthSignUp('google')}
                                    disabled={loading}
                                    activeOpacity={0.7}
                                >
                                    <Image
                                        source={require('../../assets/icons/google.png')}
                                        style={styles.oauthIcon}
                                        resizeMode="contain"
                                    />
                                    <Text style={[styles.oauthText, { color: themeColors.textPrimary }]}>
                                        Continue with Google
                                    </Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[styles.oauthButton, { backgroundColor: themeColors.surface }]}
                                    onPress={() => handleOAuthSignUp('apple')}
                                    disabled={loading}
                                    activeOpacity={0.7}
                                >
                                    <Image
                                        source={require('../../assets/icons/apple.png')}
                                        style={styles.oauthIcon}
                                        resizeMode="contain"
                                    />
                                    <Text style={[styles.oauthText, { color: themeColors.textPrimary }]}>
                                        Continue with Apple
                                    </Text>
                                </TouchableOpacity>
                            </>
                        ) : (
                            <>
                                {/* OTP Step */}
                                <Text style={[styles.title, { color: themeColors.textPrimary }]}>Enter Code</Text>
                                <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
                                    We sent a verification code to{' '}
                                    <Text style={{ fontWeight: '600', color: themeColors.textPrimary }}>{email}</Text>
                                </Text>

                                <TouchableOpacity
                                    activeOpacity={1}
                                    onPress={() => otpInputRef.current?.focus()}
                                    style={styles.otpContainer}
                                >
                                    {[0, 1, 2, 3, 4, 5].map((index) => (
                                        <View
                                            key={index}
                                            style={[
                                                styles.otpBox,
                                                {
                                                    backgroundColor: themeColors.surface,
                                                    borderColor: otp.length === index ? Colors.primary : 'transparent',
                                                    borderWidth: otp.length === index ? 2 : 0
                                                }
                                            ]}
                                        >
                                            <Text style={[styles.otpText, { color: themeColors.textPrimary }]}>
                                                {otp[index] || ''}
                                            </Text>
                                        </View>
                                    ))}
                                </TouchableOpacity>

                                <TextInput
                                    ref={otpInputRef}
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
                    </ScrollView>
                </KeyboardAvoidingView>
            </View>
        </TouchableWithoutFeedback>
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
    },
    headerSpacer: {
        width: 40,
    },
    keyboardView: {
        flex: 1,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        paddingHorizontal: 24,
        paddingTop: 24,
        paddingBottom: 40,
    },
    title: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 26,
        marginBottom: 24,
        lineHeight: 34,
    },
    subtitle: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 16,
        marginBottom: 24,
        lineHeight: 24,
    },
    inputContainer: {
        borderRadius: 16,
        marginBottom: 16,
        paddingHorizontal: 16,
        paddingVertical: 4,
    },
    input: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 16,
        paddingVertical: 14,
    },
    termsText: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 14,
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 24,
    },
    termsLink: {
        color: Colors.textPrimary,
        textDecorationLine: 'underline',
    },
    secondaryButton: {
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 16,
        paddingVertical: 16,
        marginTop: 12,
    },
    secondaryButtonText: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 16,
    },
    divider: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 20,
    },
    dividerLine: {
        flex: 1,
        height: 1,
    },
    dividerText: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 14,
        marginHorizontal: 16,
    },
    oauthButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 16,
        paddingVertical: 16,
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
    },
    otpContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 32,
    },
    otpBox: {
        width: 48,
        height: 56,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    otpText: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 24,
    },
    hiddenInput: {
        position: 'absolute',
        width: 1,
        height: 1,
        opacity: 0,
    },
});
