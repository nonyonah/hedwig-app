import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, TouchableWithoutFeedback, Keyboard, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useLoginWithEmail } from '@privy-io/expo';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../theme/colors';
import { Metrics } from '../../theme/metrics';
import { Typography } from '../../styles/typography';

export default function SignupScreen() {
    const router = useRouter();
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { sendCode } = useLoginWithEmail();

    const handleSignup = async () => {
        if (isLoading) return; // Prevent multiple submissions

        try {
            setIsLoading(true);
            await sendCode({ email });
            router.push({
                pathname: '/auth/verify',
                params: {
                    email,
                    firstName,
                    lastName
                }
            });
        } catch (error: any) {
            console.error('Signup failed:', error);
            Alert.alert('Error', error.message || 'Failed to create account. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const isValid = firstName && lastName && email && !isLoading;

    return (
        <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.keyboardView}
            >
                <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                    <ScrollView contentContainerStyle={styles.scrollContent}>
                        <View style={styles.header}>
                            <Text style={styles.title}>Create your account</Text>
                            <Text style={styles.subtitle}>Enter your details before you continue</Text>
                        </View>

                        <View style={styles.form}>
                            <TextInput
                                style={styles.input}
                                placeholder="First name"
                                placeholderTextColor="#9CA3AF"
                                value={firstName}
                                onChangeText={setFirstName}
                            />
                            <TextInput
                                style={styles.input}
                                placeholder="Last name"
                                placeholderTextColor="#9CA3AF"
                                value={lastName}
                                onChangeText={setLastName}
                            />
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
                                onPress={handleSignup}
                                disabled={!isValid}
                            >
                                <Text style={styles.buttonText}>{isLoading ? 'Creating account...' : 'Continue'}</Text>
                            </TouchableOpacity>
                        </View>
                    </ScrollView>
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
    scrollContent: {
        flexGrow: 1,
        paddingHorizontal: Metrics.spacing.lg,
        paddingTop: Metrics.spacing.xxxl,
        paddingBottom: Metrics.spacing.lg,
    },
    header: {
        marginBottom: Metrics.spacing.xxl,
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
        gap: Metrics.spacing.md,
        marginBottom: Metrics.spacing.xxl,
    },
    input: {
        backgroundColor: Colors.surface,
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
