import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, CurrencyDollar, FileText, Coins } from 'phosphor-react-native';
import { usePrivy } from '@privy-io/expo';
import { Colors } from '../../theme/colors';
import { Typography } from '../../styles/typography';

export default function CreatePaymentLinkScreen() {
    const router = useRouter();
    const { getAccessToken } = usePrivy();
    const [isLoading, setIsLoading] = useState(false);

    const [formData, setFormData] = useState({
        amount: '',
        description: '',
        currency: 'USDC'
    });

    const handleCreate = async () => {
        if (!formData.amount) {
            Alert.alert('Missing Fields', 'Please enter an amount.');
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
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    ...formData,
                    amount: parseFloat(formData.amount),
                }),
            });

            const data = await response.json();

            if (data.success) {
                Alert.alert('Success', 'Payment Link created successfully!', [
                    { text: 'OK', onPress: () => router.back() }
                ]);
            } else {
                Alert.alert('Error', data.error?.message || 'Failed to create payment link');
            }
        } catch (error) {
            console.error('Create payment link error:', error);
            Alert.alert('Error', 'An unexpected error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <ArrowLeft size={24} color={Colors.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Create Payment Link</Text>
                <View style={{ width: 24 }} />
            </View>

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
            >
                <ScrollView contentContainerStyle={styles.content}>
                    <View style={styles.formGroup}>
                        <Text style={styles.label}>Amount</Text>
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
                        <Text style={styles.label}>Currency</Text>
                        <View style={styles.inputWrapper}>
                            <Coins size={20} color={Colors.textSecondary} style={styles.inputIcon} />
                            <TextInput
                                value={formData.currency}
                                editable={false} // Fixed to USDC for now
                                style={[styles.input, { color: Colors.textSecondary }]}
                            />
                        </View>
                        <Text style={styles.helperText}>Currently only USDC on Base is supported.</Text>
                    </View>

                    <View style={styles.formGroup}>
                        <Text style={styles.label}>Description (Optional)</Text>
                        <View style={styles.inputWrapper}>
                            <FileText size={20} color={Colors.textSecondary} style={styles.inputIcon} />
                            <TextInput
                                style={styles.input}
                                placeholder="What is this for?"
                                placeholderTextColor={Colors.textPlaceholder}
                                value={formData.description}
                                onChangeText={(text) => setFormData({ ...formData, description: text })}
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
                            <Text style={styles.createButtonText}>Create Link</Text>
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
    helperText: {
        ...Typography.caption,
        color: Colors.textPlaceholder,
        marginTop: 4,
        marginLeft: 4,
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
