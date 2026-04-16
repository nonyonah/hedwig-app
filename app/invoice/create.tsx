import React, { useEffect, useState } from 'react';
import {
    ActionSheetIOS,
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
    ChevronLeft as CaretLeft,
    ChevronDown,
    X,
    Plus,
    Trash2 as Trash,
} from '../../components/ui/AppIcon';
import { usePrivy } from '@privy-io/expo';
import { useThemeColors } from '../../theme/colors';
import { useAnalyticsScreen } from '../../hooks/useAnalyticsScreen';
import IOSGlassIconButton from '../../components/ui/IOSGlassIconButton';
import { getPostHogClient } from '../../services/analytics';
import { Button } from '../../components/Button';

type Client   = { id: string; name: string; email: string | null };
type Project  = { id: string; name: string };
type LineItem = { id: string; description: string; amount: string };

const FREQUENCIES = [
    { value: 'weekly',    label: 'Weekly' },
    { value: 'biweekly',  label: 'Bi-weekly' },
    { value: 'monthly',   label: 'Monthly' },
    { value: 'quarterly', label: 'Quarterly' },
    { value: 'annual',    label: 'Annual' },
];

function uid() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export default function CreateInvoiceScreen() {
    const router  = useRouter();
    const params  = useLocalSearchParams<{
        clientName?: string; amount?: string; dueDate?: string; recipientEmail?: string;
    }>();
    const { getAccessToken } = usePrivy();
    const [isLoading, setIsLoading] = useState(false);
    const themeColors = useThemeColors();

    useAnalyticsScreen('Create Invoice');

    // ── Reference data ──
    const [clients,  setClients]  = useState<Client[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);

    // ── Selections ──
    const [selectedClient,  setSelectedClient]  = useState<Client | null>(null);
    const [selectedProject, setSelectedProject] = useState<Project | null>(null);

    // ── Android-only modal state ──
    const [showClientModal,  setShowClientModal]  = useState(false);
    const [showProjectModal, setShowProjectModal] = useState(false);
    const [showFreqModal,    setShowFreqModal]    = useState(false);

    // ── Form ──
    const [clientName,     setClientName]     = useState(params.clientName     || '');
    const [recipientEmail, setRecipientEmail] = useState(params.recipientEmail || '');
    const [amount,         setAmountRaw]      = useState(params.amount         || '');
    const [dueDate,        setDueDate]        = useState<Date | null>(null);
    const [startDate,      setStartDate]      = useState<Date | null>(null);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [isRecurring,    setIsRecurring]    = useState(false);
    const [frequency,      setFrequency]      = useState('monthly');
    const [autoSend,       setAutoSend]       = useState(false);
    const [reminders,      setReminders]      = useState(true);
    const [lineItems,      setLineItems]      = useState<LineItem[]>([]);
    const [notes,          setNotes]          = useState('');

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

    // ── Fetch projects filtered by selected client ──
    useEffect(() => {
        (async () => {
            try {
                const token  = await getAccessToken();
                const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
                const query  = selectedClient ? `?clientId=${selectedClient.id}` : '';
                const res    = await fetch(`${apiUrl}/api/projects${query}`, { headers: { Authorization: `Bearer ${token}` } });
                const d      = await res.json();
                if (d?.success && Array.isArray(d.data?.projects)) {
                    // API returns `title` field; normalise to `name` for consistency
                    setProjects(d.data.projects.map((p: any) => ({ id: p.id, name: p.title ?? p.name ?? '' })));
                }
            } catch { /* non-fatal */ }
        })();
        setSelectedProject(null);
    }, [selectedClient?.id]);

    // ── Client selection ──
    const openClientPicker = () => {
        if (clients.length === 0) return;
        if (Platform.OS === 'ios') {
            ActionSheetIOS.showActionSheetWithOptions(
                { title: 'Select client', options: ['Cancel', ...clients.map(c => c.name)], cancelButtonIndex: 0 },
                idx => { if (idx > 0) applyClient(clients[idx - 1]); }
            );
        } else {
            setShowClientModal(true);
        }
    };

    const applyClient = (c: Client) => {
        setSelectedClient(c);
        setClientName(c.name);
        setRecipientEmail(c.email || '');
        setShowClientModal(false);
    };

    const clearClient = () => {
        setSelectedClient(null);
        setClientName('');
        setRecipientEmail('');
        setSelectedProject(null);
    };

    // ── Project selection ──
    const openProjectPicker = () => {
        if (projects.length === 0) return;
        if (Platform.OS === 'ios') {
            ActionSheetIOS.showActionSheetWithOptions(
                { title: selectedClient ? `Projects for ${selectedClient.name}` : 'Select project', options: ['Cancel', ...projects.map(p => p.name)], cancelButtonIndex: 0 },
                idx => { if (idx > 0) applyProject(projects[idx - 1]); }
            );
        } else {
            setShowProjectModal(true);
        }
    };

    const applyProject = (p: Project) => {
        setSelectedProject(p);
        setShowProjectModal(false);
    };

    // ── Frequency selection ──
    const openFreqPicker = () => {
        if (Platform.OS === 'ios') {
            ActionSheetIOS.showActionSheetWithOptions(
                { title: 'Frequency', options: ['Cancel', ...FREQUENCIES.map(f => f.label)], cancelButtonIndex: 0 },
                idx => { if (idx > 0) setFrequency(FREQUENCIES[idx - 1].value); }
            );
        } else {
            setShowFreqModal(true);
        }
    };

    // ── Line items ──
    const addLineItem    = () => setLineItems(prev => [...prev, { id: uid(), description: '', amount: '' }]);
    const removeLineItem = (id: string) => setLineItems(prev => prev.filter(i => i.id !== id));
    const updateLineItem = (id: string, field: 'description' | 'amount', val: string) =>
        setLineItems(prev => prev.map(i => i.id === id ? { ...i, [field]: val } : i));

    // ── Submit ──
    const handleCreate = async () => {
        const name = clientName.trim();
        if (!amount || !name) {
            Alert.alert('Missing fields', 'Client name and amount are required.');
            return;
        }
        if (isRecurring && !startDate) {
            Alert.alert('Missing fields', 'Start date is required for recurring invoices.');
            return;
        }
        setIsLoading(true);
        try {
            const token  = await getAccessToken();
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

            const parsedItems = lineItems
                .map(i => ({ description: i.description.trim(), amount: parseFloat(i.amount) || 0 }))
                .filter(i => i.description && i.amount > 0);
            const totalAmount = parsedItems.length
                ? parsedItems.reduce((s, i) => s + i.amount, 0)
                : parseFloat(amount);

            if (isRecurring) {
                const res = await fetch(`${apiUrl}/api/recurring-invoices`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({
                        clientId: selectedClient?.id, clientName: name,
                        recipientEmail: recipientEmail.trim() || undefined,
                        amount: totalAmount, frequency, startDate: startDate ? startDate.toISOString().split('T')[0] : undefined, autoSend,
                        remindersEnabled: reminders, notes: notes.trim() || undefined,
                    }),
                });
                const d = await res.json().catch(() => null);
                if (!res.ok || !d?.success) throw new Error(d?.error?.message || 'Failed');
                Alert.alert('Success', 'Recurring invoice created!', [{ text: 'OK', onPress: () => router.back() }]);
            } else {
                const res = await fetch(`${apiUrl}/api/documents/invoice`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({
                        clientId: selectedClient?.id, clientName: name,
                        amount: totalAmount, currency: 'USDC',
                        dueDate: dueDate ? dueDate.toISOString().split('T')[0] : undefined,
                        recipientEmail: recipientEmail.trim() || undefined,
                        projectId: selectedProject?.id,
                        remindersEnabled: reminders,
                        description: notes.trim() || undefined,
                        items: parsedItems,
                        title: `Invoice for ${name}`,
                    }),
                });
                const d = await res.json().catch(() => null);
                if (!res.ok || !d?.success) throw new Error(d?.error?.message || 'Failed');
                const posthog = getPostHogClient();
                await posthog.capture('invoice_created', {
                    invoice_id: d?.data?.document?.id,
                    amount: d?.data?.document?.amount,
                    currency: d?.data?.document?.currency,
                    client_id: d?.data?.document?.clientId,
                });
                Alert.alert('Success', 'Invoice created successfully!', [{ text: 'OK', onPress: () => router.back() }]);
            }
        } catch (e) {
            Alert.alert('Error', e instanceof Error ? e.message : 'An unexpected error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    const freqLabel = FREQUENCIES.find(f => f.value === frequency)?.label ?? 'Monthly';

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
                <Text style={[s.headerTitle, { color: themeColors.textPrimary }]}>Create Invoice</Text>
                <View style={{ width: 40 }} />
            </View>

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.flex}>
                <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">

                    {/* ─── Form title ─── */}
                    <Text style={[s.formTitle, { color: themeColors.textPrimary }]}>New Invoice</Text>
                    <Text style={[s.formSubtitle, { color: themeColors.textSecondary }]}>Fill in the details below to generate and send an invoice.</Text>

                    {/* ─── 1. Client ─── */}
                    <Text style={[s.sectionLabel, { color: themeColors.textSecondary }]}>Client</Text>

                    {selectedClient ? (
                        // ── Selected: show card with clear button ──
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
                            {/* ── Picker trigger — always visible ── */}
                            <TouchableOpacity
                                style={[s.card, s.pickerRow, { backgroundColor: themeColors.surface, opacity: clients.length > 0 ? 1 : 0.45 }]}
                                onPress={clients.length > 0 ? openClientPicker : undefined}
                                activeOpacity={clients.length > 0 ? 0.7 : 1}
                            >
                                <Text style={[s.pickerLabel, { color: themeColors.textSecondary }]}>
                                    {clients.length > 0 ? 'Select existing client' : 'No saved clients'}
                                </Text>
                                <ChevronDown size={16} color={themeColors.textSecondary} strokeWidth={2.5} />
                            </TouchableOpacity>
                            {/* ── Manual name ── */}
                            <View style={[s.card, { backgroundColor: themeColors.surface }]}>
                                <TextInput
                                    style={[s.input, { color: themeColors.textPrimary }]}
                                    placeholder="Client name"
                                    placeholderTextColor={themeColors.textSecondary}
                                    value={clientName}
                                    onChangeText={setClientName}
                                />
                            </View>
                            {/* ── Manual email ── */}
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

                    {/* ─── 3. Recurring toggle ─── */}
                    <View style={[s.toggleRow, { backgroundColor: themeColors.surface }]}>
                        <View style={s.flex}>
                            <Text style={[s.toggleLabel, { color: themeColors.textPrimary }]}>Recurring invoice</Text>
                            <Text style={[s.toggleSub,   { color: themeColors.textSecondary }]}>Repeat on a schedule</Text>
                        </View>
                        <Switch
                            value={isRecurring}
                            onValueChange={setIsRecurring}
                            trackColor={{ false: themeColors.border, true: themeColors.primary }}
                            thumbColor="#fff"
                        />
                    </View>

                    {/* ─── 4. Date ─── */}
                    <Text style={[s.sectionLabel, { color: themeColors.textSecondary }]}>
                        {isRecurring ? 'Start date' : 'Due date'}
                    </Text>
                    <TouchableOpacity
                        style={[s.card, s.pickerRow, { backgroundColor: themeColors.surface }]}
                        onPress={() => setShowDatePicker(true)}
                        activeOpacity={0.7}
                    >
                        <Text style={[s.pickerLabel, {
                            color: (isRecurring ? startDate : dueDate)
                                ? themeColors.textPrimary
                                : themeColors.textSecondary,
                        }]}>
                            {(isRecurring ? startDate : dueDate)
                                ? (isRecurring ? startDate! : dueDate!).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                                : 'Select date'}
                        </Text>
                        <ChevronDown size={16} color={themeColors.textSecondary} strokeWidth={2.5} />
                    </TouchableOpacity>

                    {/* Android: native calendar dialog */}
                    {showDatePicker && Platform.OS !== 'ios' && (
                        <DateTimePicker
                            value={(isRecurring ? startDate : dueDate) ?? new Date()}
                            mode="date"
                            display="default"
                            minimumDate={new Date()}
                            onChange={(_, selected) => {
                                setShowDatePicker(false);
                                if (selected) isRecurring ? setStartDate(selected) : setDueDate(selected);
                            }}
                        />
                    )}

                    {/* ─── 4b. Recurring extras ─── */}
                    {isRecurring && (
                        <>
                            <Text style={[s.sectionLabel, { color: themeColors.textSecondary }]}>Frequency</Text>
                            <TouchableOpacity
                                style={[s.card, s.pickerRow, { backgroundColor: themeColors.surface }]}
                                onPress={openFreqPicker}
                                activeOpacity={0.7}
                            >
                                <Text style={[s.input, s.flex, { color: themeColors.textPrimary }]}>{freqLabel}</Text>
                                <ChevronDown size={16} color={themeColors.textSecondary} strokeWidth={2.5} />
                            </TouchableOpacity>

                            <View style={[s.toggleRow, { backgroundColor: themeColors.surface }]}>
                                <View style={s.flex}>
                                    <Text style={[s.toggleLabel, { color: themeColors.textPrimary }]}>Auto-send</Text>
                                    <Text style={[s.toggleSub,   { color: themeColors.textSecondary }]}>Send each invoice automatically</Text>
                                </View>
                                <Switch
                                    value={autoSend}
                                    onValueChange={setAutoSend}
                                    trackColor={{ false: themeColors.border, true: themeColors.primary }}
                                    thumbColor="#fff"
                                />
                            </View>
                        </>
                    )}

                    {/* ─── 5. Linked project ─── */}
                    <Text style={[s.sectionLabel, { color: themeColors.textSecondary }]}>
                        {selectedClient ? `Projects for ${selectedClient.name}` : 'Linked project'}
                    </Text>
                    {selectedProject ? (
                        <View style={[s.card, s.clientRow, { backgroundColor: themeColors.surface }]}>
                            <Text style={[s.input, s.flex, { color: themeColors.textPrimary }]}>{selectedProject.name}</Text>
                            <TouchableOpacity onPress={() => setSelectedProject(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                                <X size={16} color={themeColors.textSecondary} strokeWidth={2.5} />
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <TouchableOpacity
                            style={[s.card, s.pickerRow, { backgroundColor: themeColors.surface }]}
                            onPress={projects.length > 0 ? openProjectPicker : undefined}
                            activeOpacity={projects.length > 0 ? 0.7 : 1}
                        >
                            <Text style={[s.pickerLabel, { color: themeColors.textSecondary }]}>
                                {projects.length > 0
                                    ? 'Select project (optional)'
                                    : selectedClient ? 'No projects for this client' : 'Select a client to see projects'}
                            </Text>
                            {projects.length > 0 && <ChevronDown size={16} color={themeColors.textSecondary} strokeWidth={2.5} />}
                        </TouchableOpacity>
                    )}

                    {/* ─── 6. Payment reminders ─── */}
                    <View style={[s.toggleRow, { backgroundColor: themeColors.surface }]}>
                        <View style={s.flex}>
                            <Text style={[s.toggleLabel, { color: themeColors.textPrimary }]}>Payment reminders</Text>
                            <Text style={[s.toggleSub,   { color: themeColors.textSecondary }]}>Notify client when payment is due</Text>
                        </View>
                        <Switch
                            value={reminders}
                            onValueChange={setReminders}
                            trackColor={{ false: themeColors.border, true: themeColors.primary }}
                            thumbColor="#fff"
                        />
                    </View>

                    {/* ─── 7. Line items ─── */}
                    <Text style={[s.sectionLabel, { color: themeColors.textSecondary }]}>Line items</Text>
                    {lineItems.map((item, idx) => (
                        <View key={item.id} style={[s.card, s.lineItemRow, { backgroundColor: themeColors.surface }]}>
                            <View style={[s.lineItemBadge, { backgroundColor: themeColors.background }]}>
                                <Text style={[s.lineItemNum, { color: themeColors.textSecondary }]}>{idx + 1}</Text>
                            </View>
                            <TextInput
                                style={[s.input, s.flex, { color: themeColors.textPrimary }]}
                                placeholder="Description"
                                placeholderTextColor={themeColors.textSecondary}
                                value={item.description}
                                onChangeText={v => updateLineItem(item.id, 'description', v)}
                            />
                            <TextInput
                                style={[s.input, s.lineItemAmt, { color: themeColors.textPrimary }]}
                                placeholder="0.00"
                                placeholderTextColor={themeColors.textSecondary}
                                keyboardType="decimal-pad"
                                value={item.amount}
                                onChangeText={v => updateLineItem(item.id, 'amount', v.replace(/[^0-9.]/g, ''))}
                            />
                            <TouchableOpacity onPress={() => removeLineItem(item.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                                <Trash size={15} color={themeColors.textSecondary} strokeWidth={2.5} />
                            </TouchableOpacity>
                        </View>
                    ))}
                    <TouchableOpacity style={[s.addBtn, { borderColor: themeColors.border }]} onPress={addLineItem} activeOpacity={0.7}>
                        <Plus size={14} color={themeColors.textSecondary} strokeWidth={2.5} />
                        <Text style={[s.addBtnText, { color: themeColors.textSecondary }]}>Add line item</Text>
                    </TouchableOpacity>

                    {/* ─── 8. Notes ─── */}
                    <Text style={[s.sectionLabel, { color: themeColors.textSecondary }]}>Notes</Text>
                    <View style={[s.card, { backgroundColor: themeColors.surface }]}>
                        <TextInput
                            style={[s.input, s.notesInput, { color: themeColors.textPrimary }]}
                            placeholder="A note visible on the invoice…"
                            placeholderTextColor={themeColors.textSecondary}
                            multiline
                            textAlignVertical="top"
                            value={notes}
                            onChangeText={setNotes}
                        />
                    </View>

                    <Button
                        title={isLoading ? 'Creating…' : isRecurring ? 'Set up recurring invoice' : 'Create Invoice'}
                        onPress={handleCreate}
                        disabled={isLoading}
                        size="large"
                        style={{ ...s.cta, backgroundColor: themeColors.primary }}
                        textStyle={{ color: '#fff' }}
                    />
                    {isLoading && <ActivityIndicator style={{ marginTop: 12 }} color={themeColors.primary} />}
                </ScrollView>
            </KeyboardAvoidingView>

            {/* ─── iOS date picker — spinner in slide-up modal ─── */}
            {showDatePicker && Platform.OS === 'ios' && (
                <Modal transparent animationType="slide" visible onRequestClose={() => setShowDatePicker(false)}>
                    <View style={s.dateModalOverlay}>
                        <View style={[s.dateModalSheet, { backgroundColor: themeColors.surface }]}>
                            <View style={[s.dateModalHeader, { borderBottomColor: themeColors.border }]}>
                                <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                                    <Text style={[s.dateModalDone, { color: themeColors.primary }]}>Done</Text>
                                </TouchableOpacity>
                            </View>
                            <DateTimePicker
                                value={(isRecurring ? startDate : dueDate) ?? new Date()}
                                mode="date"
                                display="spinner"
                                minimumDate={new Date()}
                                textColor={themeColors.textPrimary}
                                onChange={(_, selected) => {
                                    if (selected) isRecurring ? setStartDate(selected) : setDueDate(selected);
                                }}
                                style={{ height: 200, width: '100%' }}
                            />
                        </View>
                    </View>
                </Modal>
            )}

            {/* ─── Android-only modals ─── */}
            {Platform.OS !== 'ios' && (
                <>
                    <SheetModal
                        visible={showClientModal}
                        title="Select client"
                        onClose={() => setShowClientModal(false)}
                        bg={themeColors.background}
                        textPrimary={themeColors.textPrimary}
                        textSecondary={themeColors.textSecondary}
                    >
                        {clients.map(c => (
                            <TouchableOpacity
                                key={c.id}
                                style={[s.modalItem, { backgroundColor: themeColors.surface }]}
                                onPress={() => applyClient(c)}
                                activeOpacity={0.7}
                            >
                                <View style={[s.avatar, { backgroundColor: themeColors.primary + '18' }]}>
                                    <Text style={[s.avatarText, { color: themeColors.primary }]}>{c.name.charAt(0).toUpperCase()}</Text>
                                </View>
                                <View style={s.flex}>
                                    <Text style={[s.clientName, { color: themeColors.textPrimary }]}>{c.name}</Text>
                                    {c.email ? <Text style={[s.clientEmail, { color: themeColors.textSecondary }]}>{c.email}</Text> : null}
                                </View>
                            </TouchableOpacity>
                        ))}
                    </SheetModal>

                    <SheetModal
                        visible={showProjectModal}
                        title="Select project"
                        onClose={() => setShowProjectModal(false)}
                        bg={themeColors.background}
                        textPrimary={themeColors.textPrimary}
                        textSecondary={themeColors.textSecondary}
                    >
                        {projects.map(p => (
                            <TouchableOpacity
                                key={p.id}
                                style={[s.modalItem, { backgroundColor: themeColors.surface }]}
                                onPress={() => applyProject(p)}
                                activeOpacity={0.7}
                            >
                                <Text style={[s.clientName, s.flex, { color: themeColors.textPrimary }]}>{p.name}</Text>
                            </TouchableOpacity>
                        ))}
                    </SheetModal>

                    <SheetModal
                        visible={showFreqModal}
                        title="Frequency"
                        onClose={() => setShowFreqModal(false)}
                        bg={themeColors.background}
                        textPrimary={themeColors.textPrimary}
                        textSecondary={themeColors.textSecondary}
                    >
                        {FREQUENCIES.map(f => (
                            <TouchableOpacity
                                key={f.value}
                                style={[s.modalItem, { backgroundColor: f.value === frequency ? themeColors.primary + '12' : themeColors.surface }]}
                                onPress={() => { setFrequency(f.value); setShowFreqModal(false); }}
                                activeOpacity={0.7}
                            >
                                <Text style={[s.clientName, { color: f.value === frequency ? themeColors.primary : themeColors.textPrimary }]}>
                                    {f.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </SheetModal>
                </>
            )}
        </SafeAreaView>
    );
}

/* ─── Lightweight Android modal sheet ─── */
function SheetModal({
    visible, title, onClose, children, bg, textPrimary, textSecondary,
}: {
    visible: boolean; title: string; onClose: () => void; children: React.ReactNode;
    bg: string; textPrimary: string; textSecondary: string;
}) {
    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
            <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
                <View style={s.modalHeader}>
                    <Text style={[s.modalTitle, { color: textPrimary }]}>{title}</Text>
                    <TouchableOpacity onPress={onClose}>
                        <X size={20} color={textSecondary} strokeWidth={2.5} />
                    </TouchableOpacity>
                </View>
                <FlatList
                    data={[children]}
                    keyExtractor={(_, i) => String(i)}
                    contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32, gap: 8 }}
                    renderItem={({ item }) => <>{item}</>}
                />
            </SafeAreaView>
        </Modal>
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
    formTitle:    { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 28, letterSpacing: -0.5, marginBottom: 2 },
    formSubtitle: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 14, lineHeight: 20, marginBottom: 8 },
    sectionLabel: {
        fontFamily: 'GoogleSansFlex_500Medium', fontSize: 11,
        letterSpacing: 0.6, textTransform: 'uppercase',
        marginTop: 8, marginBottom: 2, marginLeft: 2,
    },

    card:   { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 4 },
    input:  { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 16, paddingVertical: 14 },

    // Client selected card
    clientRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
    avatar:      { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
    avatarText:  { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 15 },
    clientName:  { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 15 },
    clientEmail: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 13, marginTop: 2 },

    // Picker trigger row (same height as input card)
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

    lineItemRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, paddingRight: 12 },
    lineItemBadge: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    lineItemNum:   { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 11 },
    lineItemAmt:   { width: 80 },

    addBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderWidth: 1, borderRadius: 100, paddingHorizontal: 14, paddingVertical: 8 },
    addBtnText: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 13 },

    notesInput:         { minHeight: 80, paddingVertical: 14 },
    cta:                { marginTop: 8, borderRadius: 100 },
    dateModalOverlay:  { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
    dateModalSheet:    { width: '100%', paddingBottom: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
    dateModalHeader:   { flexDirection: 'row', justifyContent: 'flex-end', padding: 16, borderBottomWidth: 1 },
    dateModalDone:     { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 16 },

    // Android modal
    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16 },
    modalTitle:  { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 18 },
    modalItem:   { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14 },
});
