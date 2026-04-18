import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { Host, Menu, Button as SwiftButton, RNHostView } from '@expo/ui/swift-ui';
import { DropdownMenu, DropdownMenuItem } from '@expo/ui/jetpack-compose';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
    ChevronLeft as CaretLeft,
    ChevronDown,
    X,
} from '../../components/ui/AppIcon';
import { usePrivy } from '@privy-io/expo';
import { useThemeColors } from '../../theme/colors';
import { useAnalyticsScreen } from '../../hooks/useAnalyticsScreen';
import IOSGlassIconButton from '../../components/ui/IOSGlassIconButton';
import { getPostHogClient } from '../../services/analytics';
import { Button } from '../../components/Button';

type Client = { id: string; name: string; email: string | null };

export default function CreatePaymentLinkScreen() {
    const router = useRouter();
    const params = useLocalSearchParams<{ amount?: string; description?: string }>();
    const { getAccessToken } = usePrivy();
    const [isLoading, setIsLoading] = useState(false);
    const themeColors = useThemeColors();

    useAnalyticsScreen('Create Payment Link');

    // ── Reference data ──
    const [clients, setClients] = useState<Client[]>([]);

    // ── Selection ──
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);

    // ── Dropdown open state (Android) ──
    const [clientDropdownOpen, setClientDropdownOpen] = useState(false);

    // ── Manual client fields ──
    const [clientName,     setClientName]     = useState('');
    const [recipientEmail, setRecipientEmail] = useState('');

    // ── Form ──
    const [amount,      setAmountRaw]  = useState(params.amount      || '');
    const [description, setDescription] = useState(params.description || '');
    const [reminders,   setReminders]  = useState(true);
    const [notes,       setNotes]      = useState('');

    const setAmount = (raw: string) => {
        const cleaned = raw.replace(/[^0-9.]/g, '');
        const parts   = cleaned.split('.');
        setAmountRaw(parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : cleaned);
    };

    // ── Fetch clients ──
    useEffect(() => {
        (async () => {
            try {
                const token  = await getAccessToken();
                const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
                const res    = await fetch(`${apiUrl}/api/clients`, { headers: { Authorization: `Bearer ${token}` } });
                const d      = await res.json();
                if (d?.success && Array.isArray(d.data?.clients)) setClients(d.data.clients);
            } catch { /* non-fatal */ }
        })();
    }, []);

    // ── Client selection ──
    const applyClient = (c: Client) => {
        setSelectedClient(c);
        setClientName(c.name);
        setRecipientEmail(c.email || '');
        setClientDropdownOpen(false);
    };

    const clearClient = () => {
        setSelectedClient(null);
        setClientName('');
        setRecipientEmail('');
    };

    const handleCreate = async () => {
        if (!amount) {
            Alert.alert('Missing fields', 'Please enter an amount.');
            return;
        }
        setIsLoading(true);
        try {
            const token  = await getAccessToken();
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

            const res = await fetch(`${apiUrl}/api/documents/payment-link`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    amount: parseFloat(amount),
                    description: description.trim() || undefined,
                    currency: 'USDC',
                    title: `Payment link ${new Date().toLocaleDateString()}`,
                    clientId: selectedClient?.id,
                    clientName: (selectedClient?.name || clientName.trim()) || undefined,
                    recipientEmail: (selectedClient?.email || recipientEmail.trim()) || undefined,
                    remindersEnabled: reminders,
                    notes: notes.trim() || undefined,
                }),
            });

            const d = await res.json().catch(() => null);
            if (!res.ok || !d?.success) throw new Error(d?.error?.message || 'Failed to create payment link');

            const posthog = getPostHogClient();
            await posthog.capture('payment_link_created', {
                payment_link_id: d?.data?.document?.id,
                amount: d?.data?.document?.amount,
                currency: d?.data?.document?.currency,
                client_id: d?.data?.document?.clientId,
            });

            Alert.alert('Success', 'Payment link created successfully!', [
                { text: 'OK', onPress: () => router.back() },
            ]);
        } catch (e) {
            Alert.alert('Error', e instanceof Error ? e.message : 'An unexpected error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <SafeAreaView style={[s.container, { backgroundColor: themeColors.background }]}>
            <View style={s.header}>
                <IOSGlassIconButton
                    onPress={() => router.back()}
                    systemImage="chevron.left"
                    containerStyle={s.backBtn}
                    circleStyle={[s.backCircle, { backgroundColor: themeColors.surface }]}
                    icon={<CaretLeft size={20} color={themeColors.textPrimary} strokeWidth={3} />}
                />
                <Text style={[s.headerTitle, { color: themeColors.textPrimary }]}>Create Payment Link</Text>
                <View style={{ width: 40 }} />
            </View>

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.flex}>
                <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">

                    {/* ─── 1. Client ─── */}
                    <Text style={[s.sectionLabel, { color: themeColors.textSecondary }]}>Client</Text>

                    {selectedClient ? (
                        <View style={[s.card, s.clientRow, { backgroundColor: themeColors.surface }]}>
                            <View style={[s.avatar, { backgroundColor: themeColors.primary + '18' }]}>
                                <Text style={[s.avatarText, { color: themeColors.primary }]}>
                                    {selectedClient.name.charAt(0).toUpperCase()}
                                </Text>
                            </View>
                            <View style={s.flex}>
                                <Text style={[s.clientName, { color: themeColors.textPrimary }]}>{selectedClient.name}</Text>
                                {selectedClient.email
                                    ? <Text style={[s.clientEmail, { color: themeColors.textSecondary }]}>{selectedClient.email}</Text>
                                    : null}
                            </View>
                            <TouchableOpacity onPress={clearClient} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                                <X size={16} color={themeColors.textSecondary} strokeWidth={2.5} />
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <>
                            {/* ── Picker trigger — native pull-down ── */}
                            {clients.length > 0 ? (
                                Platform.OS === 'ios' ? (
                                    <Host style={{ alignSelf: 'stretch' }}>
                                        <Menu label={
                                            <RNHostView matchContents>
                                                <View style={[s.card, s.pickerRow, { backgroundColor: themeColors.surface }]}>
                                                    <Text style={[s.pickerLabel, { color: themeColors.textSecondary }]}>Select existing client</Text>
                                                    <ChevronDown size={16} color={themeColors.textSecondary} strokeWidth={2.5} />
                                                </View>
                                            </RNHostView>
                                        }>
                                            {clients.map(c => (
                                                <SwiftButton key={c.id} label={c.name} onPress={() => applyClient(c)} />
                                            ))}
                                        </Menu>
                                    </Host>
                                ) : (
                                    <DropdownMenu expanded={clientDropdownOpen} onDismissRequest={() => setClientDropdownOpen(false)}>
                                        <DropdownMenu.Trigger>
                                            <TouchableOpacity
                                                style={[s.card, s.pickerRow, { backgroundColor: themeColors.surface }]}
                                                onPress={() => setClientDropdownOpen(true)}
                                                activeOpacity={0.7}
                                            >
                                                <Text style={[s.pickerLabel, { color: themeColors.textSecondary }]}>Select existing client</Text>
                                                <ChevronDown size={16} color={themeColors.textSecondary} strokeWidth={2.5} />
                                            </TouchableOpacity>
                                        </DropdownMenu.Trigger>
                                        <DropdownMenu.Items>
                                            {clients.map(c => (
                                                <DropdownMenuItem key={c.id} onClick={() => applyClient(c)}>
                                                    <DropdownMenuItem.Text>{c.name}</DropdownMenuItem.Text>
                                                </DropdownMenuItem>
                                            ))}
                                        </DropdownMenu.Items>
                                    </DropdownMenu>
                                )
                            ) : (
                                <View style={[s.card, s.pickerRow, { backgroundColor: themeColors.surface, opacity: 0.45 }]}>
                                    <Text style={[s.pickerLabel, { color: themeColors.textSecondary }]}>No saved clients</Text>
                                </View>
                            )}
                            <View style={[s.card, { backgroundColor: themeColors.surface }]}>
                                <TextInput
                                    style={[s.input, { color: themeColors.textPrimary }]}
                                    placeholder="Client name (optional)"
                                    placeholderTextColor={themeColors.textSecondary}
                                    value={clientName}
                                    onChangeText={setClientName}
                                />
                            </View>
                            <View style={[s.card, { backgroundColor: themeColors.surface }]}>
                                <TextInput
                                    style={[s.input, { color: themeColors.textPrimary }]}
                                    placeholder="Client email (optional)"
                                    placeholderTextColor={themeColors.textSecondary}
                                    keyboardType="email-address"
                                    autoCapitalize="none"
                                    value={recipientEmail}
                                    onChangeText={setRecipientEmail}
                                />
                            </View>
                        </>
                    )}

                    {/* ─── 2. Amount ─── */}
                    <Text style={[s.sectionLabel, { color: themeColors.textSecondary }]}>Amount</Text>
                    <View style={[s.card, s.amountRow, { backgroundColor: themeColors.surface }]}>
                        <Image source={require('../../assets/icons/tokens/usdc.png')} style={s.tokenLogo} />
                        <TextInput
                            style={[s.input, s.flex, { color: themeColors.textPrimary }]}
                            placeholder="0.00"
                            placeholderTextColor={themeColors.textSecondary}
                            keyboardType="decimal-pad"
                            value={amount}
                            onChangeText={setAmount}
                        />
                        <Text style={[s.currencyBadge, { color: themeColors.textSecondary }]}>USDC</Text>
                    </View>

                    {/* ─── 3. Description ─── */}
                    <Text style={[s.sectionLabel, { color: themeColors.textSecondary }]}>Description</Text>
                    <View style={[s.card, { backgroundColor: themeColors.surface }]}>
                        <TextInput
                            style={[s.input, { color: themeColors.textPrimary }]}
                            placeholder="What is this payment for? (optional)"
                            placeholderTextColor={themeColors.textSecondary}
                            value={description}
                            onChangeText={setDescription}
                        />
                    </View>

                    {/* ─── 4. Payment reminders ─── */}
                    <View style={[s.toggleRow, { backgroundColor: themeColors.surface }]}>
                        <View style={s.flex}>
                            <Text style={[s.toggleLabel, { color: themeColors.textPrimary }]}>Payment reminders</Text>
                            <Text style={[s.toggleSub, { color: themeColors.textSecondary }]}>Notify client when payment is due</Text>
                        </View>
                        <Switch
                            value={reminders}
                            onValueChange={setReminders}
                            trackColor={{ false: themeColors.border, true: themeColors.primary }}
                            thumbColor="#fff"
                        />
                    </View>

                    {/* ─── 5. Notes ─── */}
                    <Text style={[s.sectionLabel, { color: themeColors.textSecondary }]}>Notes</Text>
                    <View style={[s.card, { backgroundColor: themeColors.surface }]}>
                        <TextInput
                            style={[s.input, s.notesInput, { color: themeColors.textPrimary }]}
                            placeholder="A note visible on the payment link…"
                            placeholderTextColor={themeColors.textSecondary}
                            multiline
                            textAlignVertical="top"
                            value={notes}
                            onChangeText={setNotes}
                        />
                    </View>

                    <Button
                        title={isLoading ? 'Creating...' : 'Create Payment Link'}
                        onPress={handleCreate}
                        disabled={isLoading}
                        size="large"
                        style={{ ...s.cta, backgroundColor: themeColors.primary }}
                        textStyle={{ color: '#fff' }}
                    />
                    {isLoading && <ActivityIndicator style={{ marginTop: 12 }} color={themeColors.primary} />}
                </ScrollView>
            </KeyboardAvoidingView>

        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    container:   { flex: 1 },
    flex:        { flex: 1 },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 20, paddingVertical: 16,
    },
    backBtn:     { padding: 4 },
    backCircle:  { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
    headerTitle: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 22 },

    content:      { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 48, gap: 8 },
    sectionLabel: {
        fontFamily: 'GoogleSansFlex_500Medium', fontSize: 11,
        letterSpacing: 0.6, textTransform: 'uppercase',
        marginTop: 8, marginBottom: 2, marginLeft: 2,
    },

    card:   { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 4 },
    input:  { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 16, paddingVertical: 14 },

    clientRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
    avatar:      { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
    avatarText:  { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 15 },
    clientName:  { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 15 },
    clientEmail: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 13, marginTop: 2 },

    pickerRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
    pickerLabel: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 16, paddingVertical: 14, flex: 1 },

    amountRow:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
    tokenLogo:     { width: 20, height: 20, borderRadius: 10 },
    currencyBadge: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 13 },

    toggleRow: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14,
    },
    toggleLabel: { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 15 },
    toggleSub:   { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 12, marginTop: 2 },

    notesInput: { minHeight: 80, paddingVertical: 14 },
    cta:        { marginTop: 8, borderRadius: 100 },

});
