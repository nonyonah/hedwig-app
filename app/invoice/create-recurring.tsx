import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    Alert,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Switch,
    ActionSheetIOS,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
    ChevronLeft as CaretLeft,
    RefreshCw as Repeat,
    DollarSign as CurrencyDollar,
    User,
    Mail as Envelope,
    FileText,
    Calendar as CalendarBlank,
    ChevronDown as CaretDown,
} from '../../components/ui/AppIcon';
import { useAuth } from '../../hooks/useAuth';
import { Colors, useThemeColors } from '../../theme/colors';
import { useAnalyticsScreen } from '../../hooks/useAnalyticsScreen';
import IOSGlassIconButton from '../../components/ui/IOSGlassIconButton';
import { Typography } from '../../styles/typography';
import AndroidDropdownMenu from '../../components/ui/AndroidDropdownMenu';

let ContextMenu: any = null;
let ExpoButton: any = null;
let Host: any = null;
if (Platform.OS === 'ios') {
    try {
        const SwiftUI = require('@expo/ui/swift-ui');
        ContextMenu = SwiftUI.ContextMenu;
        ExpoButton = SwiftUI.Button;
        Host = SwiftUI.Host;
    } catch (e) { }
}

const FREQUENCIES = [
    { value: 'weekly',    label: 'Weekly',    sub: 'Every 7 days' },
    { value: 'biweekly',  label: 'Bi-weekly', sub: 'Every 14 days' },
    { value: 'monthly',   label: 'Monthly',   sub: 'Same day / month' },
    { value: 'quarterly', label: 'Quarterly', sub: 'Every 3 months' },
    { value: 'annual',    label: 'Annual',    sub: 'Once a year' },
];

export default function CreateRecurringInvoiceScreen() {
    const router = useRouter();
    const { getAccessToken } = useAuth();
    const themeColors = useThemeColors();
    const params = useLocalSearchParams<{
        prefillAmount?: string;
        prefillClientName?: string;
        prefillClientEmail?: string;
        prefillFrequency?: string;
        prefillTitle?: string;
        prefillAutoSend?: string;
    }>();

    useAnalyticsScreen('Create Recurring Invoice');

    const [form, setForm] = useState({
        clientName: params.prefillClientName ?? '',
        clientEmail: params.prefillClientEmail ?? '',
        title: params.prefillTitle ?? '',
        amount: params.prefillAmount ?? '',
        frequency: params.prefillFrequency ?? 'monthly',
        startDate: new Date().toISOString().split('T')[0],
        endDate: '',
        autoSend: params.prefillAutoSend === '1',
        memo: '',
    });

    const [saving, setSaving] = useState(false);

    const set = (field: keyof typeof form, value: string | boolean) =>
        setForm((f) => ({ ...f, [field]: value }));

    const selectedFrequency = FREQUENCIES.find((f) => f.value === form.frequency) ?? FREQUENCIES[2];

    const openFrequencyPicker = () => {
        ActionSheetIOS.showActionSheetWithOptions(
            {
                options: [...FREQUENCIES.map((f) => f.label), 'Cancel'],
                cancelButtonIndex: FREQUENCIES.length,
            },
            (buttonIndex) => {
                if (buttonIndex < FREQUENCIES.length) {
                    set('frequency', FREQUENCIES[buttonIndex].value);
                }
            }
        );
    };

    const handleCreate = async () => {
        if (!form.amount || parseFloat(form.amount) <= 0) {
            Alert.alert('Amount required', 'Please enter a valid amount.');
            return;
        }

        setSaving(true);
        try {
            const token = await getAccessToken();
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

            const body: Record<string, any> = {
                amount: parseFloat(form.amount),
                chain: 'BASE',
                frequency: form.frequency,
                startDate: form.startDate,
                autoSend: form.autoSend,
            };
            if (form.clientName) body.clientName = form.clientName;
            if (form.clientEmail) body.clientEmail = form.clientEmail;
            if (form.title) body.title = form.title;
            if (form.endDate) body.endDate = form.endDate;
            if (form.memo) body.memo = form.memo;

            const response = await fetch(`${apiUrl}/api/recurring-invoices`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            });

            const result = await response.json();

            if (result.success || result.id || result.recurringInvoice) {
                Alert.alert(
                    'Recurring invoice created',
                    `Will generate a ${form.frequency} invoice${form.clientName ? ` for ${form.clientName}` : ''}. First on ${form.startDate}.`,
                    [{ text: 'Done', onPress: () => router.back() }]
                );
            } else {
                throw new Error(result.error?.message ?? result.message ?? 'Failed to create');
            }
        } catch (err: any) {
            Alert.alert('Error', err?.message ?? 'Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const primary = themeColors.primary;
    const bg = themeColors.background;
    const textPrimary = themeColors.textPrimary;
    const textSecondary = themeColors.textSecondary;

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
            {/* Header */}
            <View style={styles.header}>
                <IOSGlassIconButton
                    onPress={() => router.back()}
                    systemImage="chevron.left"
                    containerStyle={styles.backBtn}
                    circleStyle={[styles.backCircle, { backgroundColor: themeColors.surface }]}
                    icon={<CaretLeft size={20} color={themeColors.textPrimary} strokeWidth={3} />}
                />
                <Text style={[styles.headerTitle, { color: textPrimary }]}>Recurring Invoice</Text>
                <View style={{ width: 40 }} />
            </View>

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={styles.content}>

                    {/* Amount */}
                    <View style={styles.formGroup}>
                        <Text style={[styles.label, { color: textSecondary }]}>Amount (USDC)</Text>
                        <View style={[styles.inputWrapper, { backgroundColor: themeColors.surface }]}>
                            <CurrencyDollar size={20} color={textSecondary} style={styles.inputIcon} />
                            <TextInput
                                style={[styles.input, { color: textPrimary }]}
                                placeholder="0.00"
                                placeholderTextColor={textSecondary}
                                keyboardType="decimal-pad"
                                value={form.amount}
                                onChangeText={(v) => set('amount', v)}
                            />
                        </View>
                    </View>

                    {/* Frequency */}
                    <View style={styles.formGroup}>
                        <Text style={[styles.label, { color: textSecondary }]}>Frequency</Text>
                        {Platform.OS === 'ios' && Host && ContextMenu && ExpoButton ? (
                            <Host>
                                <ContextMenu>
                                    <ContextMenu.Trigger>
                                        <View style={[styles.inputWrapper, { backgroundColor: themeColors.surface }]}>
                                            <Repeat size={20} color={textSecondary} style={styles.inputIcon} />
                                            <Text style={[styles.input, styles.selectText, { color: textPrimary }]}>
                                                {selectedFrequency.label}
                                            </Text>
                                            <CaretDown size={20} color={textSecondary} strokeWidth={3} />
                                        </View>
                                    </ContextMenu.Trigger>
                                    <ContextMenu.Items>
                                        {FREQUENCIES.map((frequency) => (
                                            <ExpoButton
                                                key={frequency.value}
                                                onPress={() => set('frequency', frequency.value)}
                                            >
                                                {frequency.label}
                                            </ExpoButton>
                                        ))}
                                    </ContextMenu.Items>
                                </ContextMenu>
                            </Host>
                        ) : Platform.OS === 'ios' ? (
                            <TouchableOpacity onPress={openFrequencyPicker} activeOpacity={0.8}>
                                <View style={[styles.inputWrapper, { backgroundColor: themeColors.surface }]}>
                                    <Repeat size={20} color={textSecondary} style={styles.inputIcon} />
                                    <Text style={[styles.input, styles.selectText, { color: textPrimary }]}>
                                        {selectedFrequency.label}
                                    </Text>
                                    <CaretDown size={20} color={textSecondary} strokeWidth={3} />
                                </View>
                            </TouchableOpacity>
                        ) : (
                            <AndroidDropdownMenu
                                options={FREQUENCIES.map((frequency) => ({
                                    label: frequency.label,
                                    onPress: () => set('frequency', frequency.value),
                                    icon: <Repeat size={16} color={themeColors.textPrimary} strokeWidth={2.5} />,
                                }))}
                                trigger={
                                    <View style={[styles.inputWrapper, { backgroundColor: themeColors.surface }]}>
                                        <Repeat size={20} color={textSecondary} style={styles.inputIcon} />
                                        <Text style={[styles.input, styles.selectText, { color: textPrimary }]}>
                                            {selectedFrequency.label}
                                        </Text>
                                        <CaretDown size={20} color={textSecondary} strokeWidth={3} />
                                    </View>
                                }
                            />
                        )}
                        <Text style={[styles.helperText, { color: textSecondary }]}>{selectedFrequency.sub}</Text>
                    </View>

                    {/* Client */}
                    <View style={styles.formGroup}>
                        <Text style={[styles.label, { color: textSecondary }]}>Client Name (Optional)</Text>
                        <View style={[styles.inputWrapper, { backgroundColor: themeColors.surface }]}>
                            <User size={20} color={textSecondary} style={styles.inputIcon} />
                            <TextInput
                                style={[styles.input, { color: textPrimary }]}
                                placeholder="Acme Corp"
                                placeholderTextColor={textSecondary}
                                value={form.clientName}
                                onChangeText={(v) => set('clientName', v)}
                            />
                        </View>
                    </View>

                    <View style={styles.formGroup}>
                        <Text style={[styles.label, { color: textSecondary }]}>Recipient Email (Optional)</Text>
                        <View style={[styles.inputWrapper, { backgroundColor: themeColors.surface }]}>
                            <Envelope size={20} color={textSecondary} style={styles.inputIcon} />
                            <TextInput
                                style={[styles.input, { color: textPrimary }]}
                                placeholder="client@example.com"
                                placeholderTextColor={textSecondary}
                                keyboardType="email-address"
                                autoCapitalize="none"
                                value={form.clientEmail}
                                onChangeText={(v) => set('clientEmail', v)}
                            />
                        </View>
                    </View>

                    {/* Title */}
                    <View style={styles.formGroup}>
                        <Text style={[styles.label, { color: textSecondary }]}>Description</Text>
                        <View style={[styles.inputWrapper, { backgroundColor: themeColors.surface }]}>
                            <FileText size={20} color={textSecondary} style={styles.inputIcon} />
                            <TextInput
                                style={[styles.input, { color: textPrimary }]}
                                placeholder="e.g. Monthly retainer"
                                placeholderTextColor={textSecondary}
                                value={form.title}
                                onChangeText={(v) => set('title', v)}
                            />
                        </View>
                    </View>

                    {/* Start date */}
                    <View style={styles.formGroup}>
                        <Text style={[styles.label, { color: textSecondary }]}>First Invoice Date</Text>
                        <View style={[styles.inputWrapper, { backgroundColor: themeColors.surface }]}>
                            <CalendarBlank size={20} color={textSecondary} style={styles.inputIcon} />
                            <TextInput
                                style={[styles.input, { color: textPrimary }]}
                                placeholder="YYYY-MM-DD"
                                placeholderTextColor={textSecondary}
                                value={form.startDate}
                                onChangeText={(v) => set('startDate', v)}
                            />
                        </View>
                    </View>

                    {/* End date */}
                    <View style={styles.formGroup}>
                        <Text style={[styles.label, { color: textSecondary }]}>End Date (Optional)</Text>
                        <View style={[styles.inputWrapper, { backgroundColor: themeColors.surface }]}>
                            <CalendarBlank size={20} color={textSecondary} style={styles.inputIcon} />
                            <TextInput
                                style={[styles.input, { color: textPrimary }]}
                                placeholder="YYYY-MM-DD"
                                placeholderTextColor={textSecondary}
                                value={form.endDate}
                                onChangeText={(v) => set('endDate', v)}
                            />
                        </View>
                    </View>

                    {/* Auto-send toggle */}
                    <View style={[styles.autoSendRow, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.autoSendTitle, { color: textPrimary }]}>Auto-send invoices</Text>
                            <Text style={[styles.autoSendSub, { color: textSecondary }]}>
                                {form.autoSend
                                    ? 'Hedwig will send each invoice automatically on the due date.'
                                    : 'Each invoice is saved as a draft for you to review before sending.'}
                            </Text>
                        </View>
                        <Switch
                            value={form.autoSend}
                            onValueChange={(v) => set('autoSend', v)}
                            trackColor={{ false: themeColors.border, true: primary }}
                            thumbColor="#fff"
                        />
                    </View>

                    {/* Create button */}
                    <TouchableOpacity
                        style={[styles.createBtn, saving && styles.createButtonDisabled, { backgroundColor: Colors.primary }]}
                        onPress={handleCreate}
                        disabled={saving}
                    >
                        {saving ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <>
                                <Repeat size={18} color="#fff" strokeWidth={2.5} />
                                <Text style={styles.createBtnText}>Create recurring invoice</Text>
                            </>
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
    },
    backBtn: { padding: 4 },
    backCircle: {
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
        paddingBottom: 40,
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
        borderRadius: 16,
        paddingHorizontal: 16,
        paddingVertical: 4,
        minHeight: 56,
    },
    inputIcon: {
        marginRight: 12,
    },
    input: {
        flex: 1,
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 16,
        lineHeight: 24,
    },
    selectText: {
        paddingVertical: 12,
    },
    helperText: {
        ...Typography.caption,
        color: Colors.textSecondary,
        marginTop: 8,
    },
    autoSendRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderRadius: 12,
        borderWidth: 1,
        padding: 16,
        marginBottom: 24,
    },
    autoSendTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 14,
        marginBottom: 2,
    },
    autoSendSub: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 12,
        lineHeight: 18,
    },
    createBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        borderRadius: 28,
        height: 56,
        marginTop: 20,
        marginBottom: 40,
    },
    createButtonDisabled: {
        opacity: 0.7,
    },
    createBtnText: {
        ...Typography.button,
        color: '#FFF',
        fontWeight: '600',
    },
});
