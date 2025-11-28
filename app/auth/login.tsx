import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useLoginWithEmail } from '@privy-io/expo';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../theme/colors';
import { Metrics } from '../../theme/metrics';
import { Typography } from '../../styles/typography';

export default function LoginScreen() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { sendCode } = useLoginWithEmail();

    const handleLogin = async () => {
        if (isLoading) return; // Prevent multiple submissions

        try {
            setIsLoading(true);
            // First, check if user exists in Supabase
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
            const response = await fetch(`${apiUrl}/api/auth/check-user?email=${encodeURIComponent(email)}`);

            if (!response.ok) {
                throw new Error('Failed to check user status');
            }

            const { data } = await response.json();

            if (!data.exists) {
                Alert.alert('No Account Found', 'Please sign up first to create an account.', [
                    {
                        text: 'Sign Up',
                        onPress: () => router.push('/auth/signup'),
                    },
                    {
                        text: 'Cancel',
                        style: 'cancel',
                    },
                ]);
                return;
            }

            // User exists, proceed with login
            await sendCode({ email });
            router.push({ pathname: '/auth/verify', params: { email } });
        } catch (error: any) {
            console.error('Login failed:', error);
            Alert.alert('Error', error.message || 'Failed to send login code. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const isValid = email && !isLoading;

    return (
        <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.keyboardView}
            >
                <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                    <View style={styles.content}>
                        <View style={styles.header}>
                            <Text style={styles.title}>Log in</Text>
                            <Text style={styles.subtitle}>Hey, welcome back</Text>
                        </View>

                        <View style={styles.form}>
                            <TextInput
                                style={styles.input}
                                placeholder="Email"
                                placeholderTextColor="#9CA3AF"
                                value={email}
                                onChangeText={setEmail}
                                autoCapitalize="none"
                                keyboardType="email-address"
                            />
                        </View>

                        <View style={styles.footer}>
                            <TouchableOpacity
                                style={[styles.button, !isValid && styles.buttonDisabled]}
                                onPress={handleLogin}
                                disabled={!isValid}
                            >
                                <Text style={styles.buttonText}>{isLoading ? 'Logging in...' : 'Continue'}</Text>
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
        backgroundColor: '#FFFFFF',
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
    },
    title: {
        ...Typography.title,
        marginBottom: Metrics.spacing.sm,
    },
    subtitle: {
        ...Typography.subtitle,
    },
    form: {
        marginTop: Metrics.spacing.xxl,
        flex: 1,
    },
    input: {
        backgroundColor: '#f5f5f5',
        borderRadius: Metrics.borderRadius.sm,
        padding: Metrics.spacing.md,
        ...Typography.input,
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
        opacity: 0.7,
    },
    buttonText: {
        ...Typography.button,
    },
});
