import { View, Text, StyleSheet, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, useRef, useEffect } from 'react';
import { useLoginWithEmail, usePrivy } from '@privy-io/expo';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../theme/colors';
import { Metrics } from '../../theme/metrics';
import { Typography } from '../../styles/typography';

export default function VerifyScreen() {
    const router = useRouter();
    const { email } = useLocalSearchParams<{ email: string }>();
    const { loginWithCode } = useLoginWithEmail();
    const { getAccessToken } = usePrivy();

    const [otp, setOtp] = useState('');
    const inputRef = useRef<TextInput>(null);

    useEffect(() => {
        // Auto-focus input on mount
        setTimeout(() => {
            inputRef.current?.focus();
        }, 100);
    }, []);

    const handleVerify = async () => {
        if (otp.length !== 6) return;

        try {
            const user = await loginWithCode({ code: otp, email });

            // Sync user with backend
            if (user) {
                const accessToken = await getAccessToken();
                const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
                const response = await fetch(`${apiUrl}/api/auth/register`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${accessToken}`,
                    },
                    body: JSON.stringify({
                        email: (user as any).email?.address,
                        walletAddresses: {
                            base: (user as any).wallet?.address, // Assuming wallet is linked
                            // Add other wallets if available from Privy user object
                        }
                    }),
                });

                if (!response.ok) {
                    console.warn('Failed to sync user with backend');
                }
            }

            // On success, navigate to biometrics or home
            router.push('/auth/biometrics');
        } catch (error: any) {
            console.error('Verification failed:', error);
            Alert.alert('Error', error.message || 'Verification failed. Please check the code and try again.');
        }
    };

    useEffect(() => {
        if (otp.length === 6) {
            handleVerify();
        }
    }, [otp]);

    return (
        <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.keyboardView}
            >
                <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                    <View style={styles.content}>
                        <View style={styles.header}>
                            <Text style={styles.title}>Verify your email</Text>
                            <Text style={styles.subtitle}>
                                Enter the code sent to <Text style={styles.email}>{email}</Text>
                            </Text>
                        </View>

                        <View style={styles.otpContainer}>
                            {/* Hidden Input */}
                            <TextInput
                                ref={inputRef}
                                style={styles.hiddenInput}
                                value={otp}
                                onChangeText={(text) => setOtp(text.replace(/[^0-9]/g, '').slice(0, 6))}
                                keyboardType="number-pad"
                                returnKeyType="done"
                            />

                            {/* Visual Boxes */}
                            <TouchableWithoutFeedback onPress={() => inputRef.current?.focus()}>
                                <View style={styles.boxesContainer}>
                                    {[...Array(6)].map((_, index) => (
                                        <View
                                            key={index}
                                            style={[
                                                styles.box,
                                                otp.length === index && styles.boxActive,
                                                otp.length > index && styles.boxFilled,
                                            ]}
                                        >
                                            <Text style={styles.boxText}>
                                                {otp[index] || ''}
                                            </Text>
                                        </View>
                                    ))}
                                </View>
                            </TouchableWithoutFeedback>
                        </View>

                        <View style={styles.footer}>
                            <TouchableOpacity
                                style={[styles.button, otp.length !== 6 && styles.buttonDisabled]}
                                onPress={handleVerify}
                                disabled={otp.length !== 6}
                            >
                                <Text style={styles.buttonText}>Continue</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </TouchableWithoutFeedback>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    keyboardView: {
        flex: 1,
    },
    content: {
        flex: 1,
        paddingHorizontal: Metrics.spacing.lg,
        paddingTop: Metrics.spacing.xxxl,
        paddingBottom: Metrics.spacing.lg,
        justifyContent: 'space-between',
    },
    header: {
        alignItems: 'center',
        marginBottom: Metrics.spacing.xxl,
    },
    title: {
        ...Typography.title,
        marginBottom: Metrics.spacing.sm,
    },
    subtitle: {
        ...Typography.subtitle,
        marginBottom: Metrics.spacing.sm,
    },
    email: {
        ...Typography.email,
    },
    otpContainer: {
        alignItems: 'center',
        marginBottom: Metrics.spacing.xxl,
    },
    hiddenInput: {
        position: 'absolute',
        width: 1,
        height: 1,
        opacity: 0,
    },
    boxesContainer: {
        flexDirection: 'row',
        gap: Metrics.spacing.sm,
        justifyContent: 'center',
        width: '100%',
    },
    box: {
        width: 48,
        height: 56,
        backgroundColor: '#E5E7EB', // Keep specific or add to theme
        borderRadius: Metrics.borderRadius.sm,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'transparent',
    },
    boxActive: {
        borderColor: Colors.primary,
        backgroundColor: Colors.background,
    },
    boxFilled: {
        backgroundColor: Colors.background,
        borderColor: '#E5E7EB',
    },
    boxText: {
        ...Typography.button, // Or create a specific style for OTP text
        color: Colors.textPrimary,
        fontSize: 24, // Override size
    },
    footer: {
        marginTop: 'auto',
    },
    button: {
        backgroundColor: Colors.primary,
        paddingVertical: Metrics.spacing.md,
        borderRadius: Metrics.borderRadius.md,
        alignItems: 'center',
    },
    buttonDisabled: {
        opacity: 0.5,
        backgroundColor: Colors.buttonDisabled,
    },
    buttonText: {
        ...Typography.button,
    },
});
