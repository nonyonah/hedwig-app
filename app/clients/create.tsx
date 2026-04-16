import React, { useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft as CaretLeft } from '../../components/ui/AppIcon';
import IOSGlassIconButton from '../../components/ui/IOSGlassIconButton';
import { useThemeColors } from '../../theme/colors';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../../components/Button';
import { getPostHogClient } from '../../services/analytics';

export default function CreateClientScreen() {
    const router = useRouter();
    const themeColors = useThemeColors();
    const { getAccessToken } = useAuth();

    const [isLoading, setIsLoading] = useState(false);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [company, setCompany] = useState('');

    const canSubmit = useMemo(() => name.trim().length > 0 && !isLoading, [isLoading, name]);

    const handleCreate = async () => {
        if (!name.trim()) {
            Alert.alert('Missing fields', 'Please enter the client name.');
            return;
        }

        setIsLoading(true);
        try {
            const token = await getAccessToken();
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

            const response = await fetch(`${apiUrl}/api/clients`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    name: name.trim(),
                    email: email.trim() || undefined,
                    phone: phone.trim() || undefined,
                    company: company.trim() || undefined,
                }),
            });

            const data = await response.json().catch(() => null);
            if (!response.ok || !data?.success) {
                throw new Error(data?.error?.message || 'Failed to create client.');
            }

            const client = data?.data?.client;
            const posthog = getPostHogClient();
            await posthog.capture('client_created', {
                client_id: client?.id,
                client_name: client?.name,
            });

            Alert.alert('Success', 'Client created successfully.', [
                {
                    text: 'OK',
                    onPress: () => router.back(),
                },
            ]);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Something went wrong.';
            Alert.alert('Error', message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}> 
            <View style={styles.header}>
                <IOSGlassIconButton
                    onPress={() => router.back()}
                    systemImage="chevron.left"
                    containerStyle={styles.backButton}
                    circleStyle={[styles.backButtonCircle, { backgroundColor: themeColors.surface }]}
                    icon={<CaretLeft size={20} color={themeColors.textPrimary} strokeWidth={3} />}
                />
                <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]}>Create Client</Text>
                <View style={{ width: 40 }} />
            </View>

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.flex}
            >
                <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                    <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>Client details</Text>

                    <View style={[styles.inputContainer, { backgroundColor: themeColors.surface }]}> 
                        <TextInput
                            style={[styles.input, { color: themeColors.textPrimary }]}
                            placeholder="Client name"
                            placeholderTextColor={themeColors.textSecondary}
                            value={name}
                            onChangeText={setName}
                        />
                    </View>

                    <View style={[styles.inputContainer, { backgroundColor: themeColors.surface }]}> 
                        <TextInput
                            style={[styles.input, { color: themeColors.textPrimary }]}
                            placeholder="Email (optional)"
                            placeholderTextColor={themeColors.textSecondary}
                            keyboardType="email-address"
                            autoCapitalize="none"
                            value={email}
                            onChangeText={setEmail}
                        />
                    </View>

                    <View style={[styles.inputContainer, { backgroundColor: themeColors.surface }]}> 
                        <TextInput
                            style={[styles.input, { color: themeColors.textPrimary }]}
                            placeholder="Phone (optional)"
                            placeholderTextColor={themeColors.textSecondary}
                            keyboardType="phone-pad"
                            value={phone}
                            onChangeText={setPhone}
                        />
                    </View>

                    <View style={[styles.inputContainer, { backgroundColor: themeColors.surface }]}> 
                        <TextInput
                            style={[styles.input, { color: themeColors.textPrimary }]}
                            placeholder="Company (optional)"
                            placeholderTextColor={themeColors.textSecondary}
                            value={company}
                            onChangeText={setCompany}
                        />
                    </View>

                    <Button
                        title={isLoading ? 'Creating...' : 'Create Client'}
                        onPress={handleCreate}
                        disabled={!canSubmit}
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
    ctaButton: {
        marginTop: 14,
    },
    ctaText: {
        color: '#FFFFFF',
    },
    loader: {
        marginTop: 12,
    },
});
