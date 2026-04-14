import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft as CaretLeft, DollarSign as CurrencyDollar, Calendar as CalendarBlank, User, Mail as Envelope, FileText } from '../../components/ui/AppIcon';
import { usePrivy } from '@privy-io/expo';
import { Colors, useThemeColors } from '../../theme/colors';
import { Typography } from '../../styles/typography';
import { useAnalyticsScreen } from '../../hooks/useAnalyticsScreen';
import IOSGlassIconButton from '../../components/ui/IOSGlassIconButton';
import { getPostHogClient } from '../../services/analytics';

export default function CreateInvoiceScreen() {
    const router = useRouter();
    const params = useLocalSearchParams<{
        clientName?: string;
        amount?: string;
        description?: string;
        dueDate?: string;
        recipientEmail?: string;
    }>();
    const { getAccessToken } = usePrivy();
    const [isLoading, setIsLoading] = useState(false);
    const themeColors = useThemeColors();

    // Track page view
    useAnalyticsScreen('Create Invoice');

    const [formData, setFormData] = useState({
        clientName:     params.clientName     || '',
        amount:         params.amount         || '',
        description:    params.description    || '',
        dueDate:        params.dueDate        || '',
        recipientEmail: params.recipientEmail || '',
    });

    const handleCreate = async () => {
        if (!formData.amount || !formData.clientName) {
            Alert.alert('Missing Fields', 'Please enter at least a client name and amount.');
            return;
        }

        setIsLoading(true);
        try {
            const token = await getAccessToken();
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

            const response = await fetch(`${apiUrl}/api/documents/invoice`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    ...formData,
                    amount: parseFloat(formData.amount),
                }),
            });

            const data = await response.json();

            if (data.success) {
                const document = data?.data?.document;
                const posthog = getPostHogClient();
                await posthog.capture('invoice_created', {
                    invoice_id: document?.id,
                    amount: document?.amount,
                    currency: document?.currency,
                    client_id: document?.client_id ?? document?.clientId,
                });

                Alert.alert('Success', 'Invoice created successfully!', [
                    { text: 'OK', onPress: () => router.back() }
                ]);
            } else {
                Alert.alert('Error', data.error?.message || 'Failed to create invoice');
            }
        } catch (error) {
            console.error('Create invoice error:', error);
            Alert.alert('Error', 'An unexpected error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <IOSGlassIconButton
                    onPress={() => router.back()}
                    systemImage="chevron.left"
                    containerStyle={styles.backButton}
                    circleStyle={[styles.backButtonCircle, { backgroundColor: themeColors.surface }]}
                    icon={<CaretLeft size={20} color={themeColors.textPrimary} strokeWidth={3} />}
                />
                <Text style={styles.headerTitle}>Create Invoice</Text>
                <View style={{ width: 40 }} />
            </View>

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
            >
                <ScrollView contentContainerStyle={styles.content}>
                    <View style={styles.formGroup}>
                        <Text style={styles.label}>Client Name</Text>
                        <View style={styles.inputWrapper}>
                            <User size={20} color={Colors.textSecondary} style={styles.inputIcon} />
                            <TextInput
                                style={styles.input}
                                placeholder="e.g. Acme Corp"
                                placeholderTextColor={Colors.textPlaceholder}
                                value={formData.clientName}
                                onChangeText={(text) => setFormData({ ...formData, clientName: text })}
                            />
                        </View>
                    </View>

                    <View style={styles.formGroup}>
                        <Text style={styles.label}>Amount (USDC)</Text>
                        <View style={styles.inputWrapper}>
                            <CurrencyDollar size={20} color={Colors.textSecondary} style={styles.inputIcon} />
                            <TextInput
                                style={styles.input}
                                placeholder="0.00"
                                placeholderTextColor={Colors.textPlaceholder}
                                keyboardType="decimal-pad"
                                value={formData.amount}
                                onChangeText={(text) => setFormData({ ...formData, amount: text })}
                            />
                        </View>
                    </View>

                    <View style={styles.formGroup}>
                        <Text style={styles.label}>Description</Text>
                        <View style={styles.inputWrapper}>
                            <FileText size={20} color={Colors.textSecondary} style={styles.inputIcon} />
                            <TextInput
                                style={styles.input}
                                placeholder="Services rendered..."
                                placeholderTextColor={Colors.textPlaceholder}
                                value={formData.description}
                                onChangeText={(text) => setFormData({ ...formData, description: text })}
                            />
                        </View>
                    </View>

                    <View style={styles.formGroup}>
                        <Text style={styles.label}>Due Date (Optional)</Text>
                        <View style={styles.inputWrapper}>
                            <CalendarBlank size={20} color={Colors.textSecondary} style={styles.inputIcon} />
                            <TextInput
                                style={styles.input}
                                placeholder="YYYY-MM-DD"
                                placeholderTextColor={Colors.textPlaceholder}
                                value={formData.dueDate}
                                onChangeText={(text) => setFormData({ ...formData, dueDate: text })}
                            />
                        </View>
                    </View>

                    <View style={styles.formGroup}>
                        <Text style={styles.label}>Recipient Email (Optional)</Text>
                        <View style={styles.inputWrapper}>
                            <Envelope size={20} color={Colors.textSecondary} style={styles.inputIcon} />
                            <TextInput
                                style={styles.input}
                                placeholder="client@example.com"
                                placeholderTextColor={Colors.textPlaceholder}
                                keyboardType="email-address"
                                autoCapitalize="none"
                                value={formData.recipientEmail}
                                onChangeText={(text) => setFormData({ ...formData, recipientEmail: text })}
                            />
                        </View>
                    </View>

                    <TouchableOpacity
                        style={[styles.createButton, isLoading && styles.createButtonDisabled]}
                        onPress={handleCreate}
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <ActivityIndicator color="#FFF" />
                        ) : (
                            <Text style={styles.createButtonText}>Create Invoice</Text>
                        )}
                    </TouchableOpacity>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
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
        ...Typography.h3,
        color: Colors.textPrimary,
    },
    content: {
        padding: 20,
    },
    formGroup: {
        marginBottom: 20,
    },
    label: {
        ...Typography.body,
        color: Colors.textSecondary,
        marginBottom: 8,
        fontWeight: '500',
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.surface,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: Colors.border,
        paddingHorizontal: 12,
        height: 50,
    },
    inputIcon: {
        marginRight: 10,
    },
    input: {
        flex: 1,
        ...Typography.body,
    },
    createButton: {
        backgroundColor: Colors.primary,
        borderRadius: 12,
        height: 56,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 20,
        marginBottom: 40,
    },
    createButtonDisabled: {
        opacity: 0.7,
    },
    createButtonText: {
        ...Typography.button,
        color: '#FFF',
        fontWeight: '600',
    },
});
