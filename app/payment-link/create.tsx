import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft as CaretLeft } from '../../components/ui/AppIcon';
import { usePrivy } from '@privy-io/expo';
import { useThemeColors } from '../../theme/colors';
import { useAnalyticsScreen } from '../../hooks/useAnalyticsScreen';
import IOSGlassIconButton from '../../components/ui/IOSGlassIconButton';
import { getPostHogClient } from '../../services/analytics';
import { Button } from '../../components/Button';

export default function CreatePaymentLinkScreen() {
    const router = useRouter();
    const params = useLocalSearchParams<{ amount?: string; description?: string }>();
    const { getAccessToken } = usePrivy();
    const [isLoading, setIsLoading] = useState(false);
    const themeColors = useThemeColors();

    useAnalyticsScreen('Create Payment Link');

    const [formData, setFormData] = useState({
        amount: params.amount || '',
        description: params.description || '',
        currency: 'USDC',
    });

    const setAmount = (raw: string) => {
        const cleaned = raw.replace(/[^0-9.]/g, '');
        const parts = cleaned.split('.');
        const normalized = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : cleaned;
        setFormData((prev) => ({ ...prev, amount: normalized }));
    };

    const handleCreate = async () => {
        if (!formData.amount) {
            Alert.alert('Missing fields', 'Please enter an amount.');
            return;
        }

        setIsLoading(true);
        try {
            const token = await getAccessToken();
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

            const response = await fetch(`${apiUrl}/api/documents/payment-link`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    amount: parseFloat(formData.amount),
                    description: formData.description.trim() || undefined,
                    currency: formData.currency,
                    title: `Payment link ${new Date().toLocaleDateString()}`,
                }),
            });

            const data = await response.json().catch(() => null);
            if (!response.ok || !data?.success) {
                throw new Error(data?.error?.message || 'Failed to create payment link');
            }

            const document = data?.data?.document;
            const posthog = getPostHogClient();
            await posthog.capture('payment_link_created', {
                payment_link_id: document?.id,
                amount: document?.amount,
                currency: document?.currency,
                client_id: document?.client_id ?? document?.clientId,
            });

            Alert.alert('Success', 'Payment link created successfully!', [
                { text: 'OK', onPress: () => router.back() },
            ]);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'An unexpected error occurred';
            Alert.alert('Error', message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}> 
            <View style={[styles.header, { borderBottomColor: themeColors.border }]}> 
                <IOSGlassIconButton
                    onPress={() => router.back()}
                    systemImage="chevron.left"
                    containerStyle={styles.backButton}
                    circleStyle={[styles.backButtonCircle, { backgroundColor: themeColors.surface }]}
                    icon={<CaretLeft size={20} color={themeColors.textPrimary} strokeWidth={3} />}
                />
                <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]}>Create Payment Link</Text>
                <View style={{ width: 40 }} />
            </View>

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.flex}
            >
                <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                    <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>Payment link details</Text>

                    <View style={[styles.inputContainer, styles.amountContainer, { backgroundColor: themeColors.surface }]}> 
                        <Image source={require('../../assets/icons/tokens/usdc.png')} style={styles.tokenLogo} />
                        <TextInput
                            style={[styles.input, styles.amountInput, { color: themeColors.textPrimary }]}
                            placeholder="Amount"
                            placeholderTextColor={themeColors.textSecondary}
                            keyboardType="decimal-pad"
                            value={formData.amount}
                            onChangeText={setAmount}
                        />
                        <Text style={[styles.currencyText, { color: themeColors.textSecondary }]}>USDC</Text>
                    </View>

                    <Text style={[styles.helperText, { color: themeColors.textSecondary }]}>USDC is supported across Hedwig.</Text>

                    <View style={[styles.inputContainer, { backgroundColor: themeColors.surface }]}> 
                        <TextInput
                            style={[styles.input, { color: themeColors.textPrimary }]}
                            placeholder="Description (optional)"
                            placeholderTextColor={themeColors.textSecondary}
                            value={formData.description}
                            onChangeText={(text) => setFormData((prev) => ({ ...prev, description: text }))}
                        />
                    </View>

                    <Button
                        title={isLoading ? 'Creating...' : 'Create Payment Link'}
                        onPress={handleCreate}
                        disabled={isLoading}
                        size="large"
                        style={{ ...styles.ctaButton, backgroundColor: themeColors.primary }}
                        textStyle={styles.ctaText}
                    />

                    {isLoading ? <ActivityIndicator style={styles.loader} color={themeColors.primary} /> : null}
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    flex: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: 1,
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
    },
    headerTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 22,
    },
    content: {
        paddingHorizontal: 20,
        paddingTop: 18,
        paddingBottom: 40,
    },
    sectionTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 24,
        marginBottom: 16,
    },
    inputContainer: {
        borderRadius: 16,
        marginBottom: 12,
        paddingHorizontal: 16,
        paddingVertical: 4,
    },
    input: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 16,
        paddingVertical: 14,
    },
    amountContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    amountInput: {
        flex: 1,
    },
    tokenLogo: {
        width: 20,
        height: 20,
        borderRadius: 10,
    },
    currencyText: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 14,
    },
    helperText: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 12,
        marginBottom: 10,
        marginLeft: 2,
    },
    ctaButton: {
        marginTop: 10,
    },
    ctaText: {
        color: '#FFFFFF',
    },
    loader: {
        marginTop: 12,
    },
});
