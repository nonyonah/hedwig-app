/**
 * UniversalCreationBox — full-screen AI composer
 *
 * Uses a native full-screen modal so the experience feels closer to
 * a dedicated workspace than a bottom sheet.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
    View,
    Text,
    TextInput,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
    Platform,
    Keyboard,
    useColorScheme,
    Modal,
    ScrollView,
    KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../theme/colors';
import { useRouter } from 'expo-router';
import { useAuth } from '../hooks/useAuth';
import { ChevronLeft as CaretLeft } from './ui/AppIcon';
import {
    Receipt,
    LinkSimple,
    FileText,
    PencilSimple,
    Plus,
    SlidersHorizontal,
    ArrowUp,
    Copy,
    ThumbsUp,
    ThumbsDown,
    CheckCircle,
    XCircle,
} from 'phosphor-react-native';

/* ─────────────────────────────────────────── types */

interface ParsedData {
    intent: 'invoice' | 'payment_link' | 'contract' | 'transfer' | 'recurring_invoice' | 'unknown';
    clientName: string | null;
    clientEmail: string | null;
    amount: number | null;
    currency: string | null;
    chain: string | null;
    dueDate: string | null;
    priority: 'low' | 'medium' | 'high' | null;
    title: string | null;
    items?: Array<{ description: string; amount: number }>;
    recipient?: string | null;
    frequency?: string | null;
    autoSend?: boolean;
    startDate?: string | null;
    endDate?: string | null;
    naturalResponse?: string;
    confidence: number;
}

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    parsed?: ParsedData;
    actionState?: 'pending' | 'creating' | 'done' | 'error';
    actionResult?: string;
}

interface UniversalCreationBoxProps {
    visible: boolean;
    onClose: () => void;
    onTransfer?: (data: any) => void;
}

/* ─────────────────────────────────────────── suggestions */

type IconComponent = React.ComponentType<{ size: number; color: string }>;

const SUGGESTIONS: Array<{ label: string; prompt: string; Icon: IconComponent }> = [
    { label: 'Create an invoice',   prompt: 'Create an invoice for ',   Icon: Receipt as IconComponent },
    { label: 'Send a payment link', prompt: 'Send a payment link for ', Icon: LinkSimple as IconComponent },
    { label: 'Draft a contract',    prompt: 'Draft a contract for ',    Icon: FileText as IconComponent },
    { label: 'Write a proposal',    prompt: 'Write a proposal for ',    Icon: PencilSimple as IconComponent },
];

/* ─────────────────────────────────────────── intent meta */

const INTENT_META: Record<string, { label: string; bg: string; color: string }> = {
    invoice:           { label: 'Invoice',          bg: '#EFF4FF', color: '#2563EB' },
    payment_link:      { label: 'Payment Link',      bg: '#F0FDF4', color: '#16A34A' },
    recurring_invoice: { label: 'Recurring Invoice', bg: '#FDF4FF', color: '#9333EA' },
};

/* ─────────────────────────────────────────── action card */

function ActionCard({ parsed, onConfirm, onDismiss, colors }: {
    parsed: ParsedData;
    onConfirm: () => void;
    onDismiss: () => void;
    colors: ReturnType<typeof useThemeColors>;
}) {
    const meta = INTENT_META[parsed.intent] ?? INTENT_META.invoice;
    const rows: { label: string; value: string }[] = [];
    if (parsed.amount != null) rows.push({ label: 'Amount', value: `$${parsed.amount.toLocaleString()}` });
    if (parsed.clientName)     rows.push({ label: 'Client', value: parsed.clientName });
    if (parsed.clientEmail)    rows.push({ label: 'Email',  value: parsed.clientEmail });
    if (parsed.dueDate)        rows.push({ label: 'Due',    value: new Date(parsed.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) });
    if (parsed.frequency)      rows.push({ label: 'Every',  value: parsed.frequency.charAt(0).toUpperCase() + parsed.frequency.slice(1) });
    if (parsed.title)          rows.push({ label: 'For',    value: parsed.title });

    return (
        <View style={[a.card, { backgroundColor: colors.surface }]}>
            <View style={[a.badge, { backgroundColor: meta.bg }]}>
                <Text style={[a.badgeText, { color: meta.color }]}>{meta.label}</Text>
            </View>
            {rows.map((r) => (
                <View key={r.label} style={a.row}>
                    <Text style={[a.label, { color: colors.textSecondary }]}>{r.label}</Text>
                    <Text style={[a.value, { color: colors.textPrimary }]} numberOfLines={1}>{r.value}</Text>
                </View>
            ))}
            <View style={a.btns}>
                <TouchableOpacity style={[a.confirm, { backgroundColor: colors.primary }]} onPress={onConfirm} activeOpacity={0.8}>
                    <Text style={a.confirmText}>
                        {parsed.intent === 'recurring_invoice' ? 'Review & Set up' : 'Create'}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity style={[a.dismiss, { borderColor: colors.border }]} onPress={onDismiss} activeOpacity={0.7}>
                    <Text style={[a.dismissText, { color: colors.textSecondary }]}>Dismiss</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const a = StyleSheet.create({
    card:        { borderRadius: 16, padding: 14, gap: 8 },
    badge:       { alignSelf: 'flex-start', borderRadius: 100, paddingHorizontal: 10, paddingVertical: 3, marginBottom: 2 },
    badgeText:   { fontSize: 11, fontFamily: 'GoogleSansFlex_600SemiBold' },
    row:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
    label:       { fontSize: 13, fontFamily: 'GoogleSansFlex_400Regular', flexShrink: 0 },
    value:       { fontSize: 13, fontFamily: 'GoogleSansFlex_500Medium', flex: 1, textAlign: 'right' },
    btns:        { flexDirection: 'row', gap: 8, marginTop: 6 },
    confirm:     { flex: 1, borderRadius: 100, paddingVertical: 10, alignItems: 'center' },
    confirmText: { fontSize: 13, fontFamily: 'GoogleSansFlex_600SemiBold', color: '#FFFFFF' },
    dismiss:     { borderRadius: 100, borderWidth: 1, paddingHorizontal: 18, paddingVertical: 10, alignItems: 'center' },
    dismissText: { fontSize: 13, fontFamily: 'GoogleSansFlex_600SemiBold' },
});

/* ─────────────────────────────────────────── main */

export function UniversalCreationBox({ visible, onClose, onTransfer }: UniversalCreationBoxProps) {
    const colors  = useThemeColors();
    const isDark  = useColorScheme() === 'dark';
    const router  = useRouter();
    const { getAccessToken } = useAuth();
    const insets  = useSafeAreaInsets();

    const scrollRef = useRef<ScrollView>(null);
    const inputRef  = useRef<TextInput>(null);

    const [messages,  setMessages]  = useState<Message[]>([]);
    const [input,     setInput]     = useState('');
    const [isParsing, setIsParsing] = useState(false);
    const [kbOpen,    setKbOpen]    = useState(false);

    /* ── keyboard visibility tracking (for bottom padding) ── */
    useEffect(() => {
        const show = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hide = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
        const s = Keyboard.addListener(show, () => setKbOpen(true));
        const h = Keyboard.addListener(hide, () => setKbOpen(false));
        return () => { s.remove(); h.remove(); };
    }, []);

    /* ── open / close ── */
    useEffect(() => {
        if (visible) {
            setMessages([]);
            setInput('');
            setIsParsing(false);
            setTimeout(() => inputRef.current?.focus(), 380);
        } else {
            Keyboard.dismiss();
        }
    }, [visible]);

    /* ── scroll to bottom on new content ── */
    useEffect(() => {
        const t = setTimeout(() => scrollRef.current?.scrollToEnd?.({ animated: true }), 120);
        return () => clearTimeout(t);
    }, [messages, isParsing]);

    const handleClose = useCallback(() => {
        Keyboard.dismiss();
        onClose();
    }, [onClose]);

    /* ── send ── */
    const sendMessage = useCallback(async () => {
        const text = input.trim();
        if (!text || isParsing) return;

        setMessages((p) => [...p, { id: `u-${Date.now()}`, role: 'user', content: text }]);
        setInput('');
        setIsParsing(true);
        Keyboard.dismiss();

        try {
            const token  = await getAccessToken();
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
            const res    = await fetch(`${apiUrl}/api/creation-box/parse`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, currentDate: new Date().toISOString() }),
            });
            const json = await res.json();

            if (json?.success && json.data) {
                const raw = json.data;
                const parsed: ParsedData = {
                    intent: raw.intent ?? 'unknown', clientName: raw.clientName ?? null,
                    clientEmail: raw.clientEmail ?? null, amount: raw.amount ?? null,
                    currency: raw.currency ?? null, chain: raw.chain ?? null,
                    dueDate: raw.dueDate ?? null, priority: raw.priority ?? null,
                    title: raw.title ?? null, items: Array.isArray(raw.items) ? raw.items : undefined,
                    recipient: raw.recipient ?? null, frequency: raw.frequency ?? null,
                    autoSend: raw.autoSend, startDate: raw.startDate ?? null,
                    endDate: raw.endDate ?? null, naturalResponse: raw.naturalResponse,
                    confidence: raw.confidence ?? 0,
                };
                const actionable = parsed.intent !== 'unknown';
                setMessages((p) => [...p, {
                    id: `a-${Date.now()}`, role: 'assistant',
                    content: raw.naturalResponse || (actionable
                        ? "Here's what I found — confirm to create:"
                        : "I'm not sure what you need. Try describing an invoice, payment link, or contract."),
                    parsed: actionable ? parsed : undefined,
                    actionState: actionable ? 'pending' : undefined,
                }]);
            } else {
                setMessages((p) => [...p, {
                    id: `a-${Date.now()}`, role: 'assistant',
                    content: 'Try: "Invoice for $500 web design for john@acme.com due Friday".',
                }]);
            }
        } catch {
            setMessages((p) => [...p, { id: `a-${Date.now()}`, role: 'assistant', content: 'Something went wrong. Please try again.' }]);
        } finally {
            setIsParsing(false);
            setTimeout(() => inputRef.current?.focus(), 350);
        }
    }, [input, isParsing, getAccessToken]);

    /* ── confirm action ── */
    const confirmAction = useCallback(async (msgId: string, parsed: ParsedData) => {
        if (parsed.intent === 'recurring_invoice') {
            onClose();
            router.push({ pathname: '/invoice/create-recurring' as any, params: { prefillAmount: parsed.amount ? String(parsed.amount) : '', prefillClientName: parsed.clientName || '', prefillClientEmail: parsed.clientEmail || '', prefillFrequency: parsed.frequency || 'monthly', prefillTitle: parsed.title || '' } });
            return;
        }
        if (parsed.intent === 'transfer') {
            if (onTransfer) { onTransfer({ amount: parsed.amount, token: parsed.currency || 'USDC', recipient: parsed.recipient, network: parsed.chain || 'base' }); onClose(); }
            else Alert.alert('Not Available', 'Transfer is not available here.');
            return;
        }

        setMessages((p) => p.map((m) => m.id === msgId ? { ...m, actionState: 'creating' } : m));
        try {
            const token       = await getAccessToken();
            const apiUrl      = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
            const isLink      = parsed.intent === 'payment_link';
            const endpoint    = isLink ? '/api/documents/payment-link' : '/api/documents/invoice';
            const typeLabel   = isLink ? 'Payment Link' : 'Invoice';
            const totalAmount = parsed.items?.length ? parsed.items.reduce((s, i) => s + i.amount, 0) : (parsed.amount ?? 0);
            const title       = parsed.title || (parsed.clientName ? `${typeLabel} for ${parsed.clientName}` : typeLabel);
            const dueDate     = parsed.dueDate ? new Date(parsed.dueDate).toISOString() : new Date(Date.now() + 7 * 86_400_000).toISOString();
            const body: Record<string, unknown> = { title, description: title, amount: totalAmount, currency: isLink ? 'USDC' : 'USD', remindersEnabled: true, items: parsed.items ?? [], dueDate };
            if (parsed.clientName)  body.clientName     = parsed.clientName;
            if (parsed.clientEmail) body.recipientEmail = parsed.clientEmail;

            const res    = await fetch(`${apiUrl}${endpoint}`, { method: 'POST', headers: { Authorization: `Bearer ${await getAccessToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            const result = await res.json();
            if (!res.ok || !result.success) throw new Error(result.error?.message ?? 'Failed');
            setMessages((p) => p.map((m) => m.id === msgId ? { ...m, actionState: 'done', actionResult: `${typeLabel} created successfully.` } : m));
        } catch (err: any) {
            setMessages((p) => p.map((m) => m.id === msgId ? { ...m, actionState: 'error', actionResult: err?.message ?? 'Failed.' } : m));
        }
    }, [getAccessToken, onClose, onTransfer, router]);

    const hasMessages = messages.length > 0 || isParsing;
    const canSend     = input.trim().length > 0 && !isParsing;
    const bottomPad   = kbOpen ? 8 : Math.max(insets.bottom, 12);
    const topPad      = Math.max(insets.top, 16);

    /* ─── colour tokens ─── */
    const textPri    = colors.textPrimary;
    const textSec    = colors.textSecondary;
    const primary    = colors.primary;
    const userBubble = isDark ? '#1B1B1D' : '#F2F4F7';
    const shellBg    = isDark ? '#050505' : '#FFFFFF';
    const panelBg    = isDark ? '#141414' : '#FFFFFF';
    const panelBorder = isDark ? '#202020' : '#E5E7EB';
    const iconBtnBg  = colors.surface;
    const inputBg    = isDark ? '#151515' : '#F7F7F8';
    const sendDisBg  = isDark ? '#2B2B2D' : '#E5E7EB';
    const placeholder= isDark ? '#666666' : '#A1A1AA';
    const inputShadow = isDark ? '#000000' : '#111827';

    return (
        <Modal
            visible={visible}
            animationType="slide"
            presentationStyle="fullScreen"
            statusBarTranslucent
            onRequestClose={handleClose}
        >
            <KeyboardAvoidingView
                style={[s.modalRoot, { backgroundColor: shellBg }]}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <View
                    style={[
                        s.panel,
                        {
                            backgroundColor: panelBg,
                            paddingTop: topPad,
                        },
                    ]}
                >
                    {/* ── Top bar ── */}
                    <View style={s.topBar}>
                        <TouchableOpacity
                            style={s.backButton}
                            onPress={handleClose}
                            activeOpacity={0.7}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                            <View style={[s.backButtonCircle, { backgroundColor: iconBtnBg }]}>
                                <CaretLeft size={20} color={textPri} strokeWidth={3} />
                            </View>
                        </TouchableOpacity>
                    </View>

                    {/* ── Scrollable content ── */}
                    <ScrollView
                        ref={scrollRef}
                        style={s.scroll}
                        contentContainerStyle={[
                            s.scrollContent,
                            !hasMessages && s.scrollGrow,
                            kbOpen ? s.scrollContentKeyboard : s.scrollContentResting,
                        ]}
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={false}
                    >
                        {!hasMessages ? (
                            /* ── Empty state ── */
                            <View style={[s.empty, kbOpen && s.emptyKeyboard]}>
                                <Text style={[s.heading, { color: textPri }]}>
                                    How can I help you today?
                                </Text>

                                {SUGGESTIONS.map(({ label, prompt, Icon }) => (
                                    <TouchableOpacity
                                        key={label}
                                        style={[s.suggRow, kbOpen && s.suggRowKeyboard]}
                                        onPress={() => { setInput(prompt); inputRef.current?.focus(); }}
                                        activeOpacity={0.55}
                                    >
                                        <Icon size={21} color={textSec} />
                                        <Text style={[s.suggText, { color: textPri }]}>{label}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        ) : (
                            /* ── Messages ── */
                            <>
                                {messages.map((msg) => (
                                    <View key={msg.id} style={s.msgBlock}>
                                        {msg.role === 'user' ? (
                                            <View style={s.userRow}>
                                                <View style={[s.userBubble, { backgroundColor: userBubble }]}>
                                                    <Text style={[s.userText, { color: textPri }]}>{msg.content}</Text>
                                                </View>
                                            </View>
                                        ) : (
                                            <View style={s.aiBlock}>
                                                <Text style={[s.aiText, { color: textPri }]}>{msg.content}</Text>

                                                {msg.parsed && msg.actionState === 'pending' && (
                                                    <ActionCard
                                                        parsed={msg.parsed}
                                                        colors={colors}
                                                        onConfirm={() => confirmAction(msg.id, msg.parsed!)}
                                                        onDismiss={() => setMessages((p) => p.map((m) =>
                                                            m.id === msg.id ? { ...m, actionState: undefined, parsed: undefined } : m
                                                        ))}
                                                    />
                                                )}

                                                {msg.actionState === 'creating' && (
                                                    <View style={s.statusRow}>
                                                        <ActivityIndicator size="small" color={primary} />
                                                        <Text style={[s.statusText, { color: textSec }]}>Creating…</Text>
                                                    </View>
                                                )}
                                                {msg.actionState === 'done' && (
                                                    <View style={s.statusRow}>
                                                        <CheckCircle size={14} color="#16A34A" weight="fill" />
                                                        <Text style={[s.statusText, { color: '#16A34A' }]}>{msg.actionResult}</Text>
                                                    </View>
                                                )}
                                                {msg.actionState === 'error' && (
                                                    <View style={s.statusRow}>
                                                        <XCircle size={14} color="#B42318" weight="fill" />
                                                        <Text style={[s.statusText, { color: '#B42318' }]}>{msg.actionResult}</Text>
                                                    </View>
                                                )}

                                                {msg.actionState !== 'creating' && (
                                                    <View style={s.aiActions}>
                                                        <TouchableOpacity style={s.aiActionBtn} activeOpacity={0.55}>
                                                            <Copy size={15} color={textSec} />
                                                        </TouchableOpacity>
                                                        <TouchableOpacity style={s.aiActionBtn} activeOpacity={0.55}>
                                                            <ThumbsUp size={15} color={textSec} />
                                                        </TouchableOpacity>
                                                        <TouchableOpacity style={s.aiActionBtn} activeOpacity={0.55}>
                                                            <ThumbsDown size={15} color={textSec} />
                                                        </TouchableOpacity>
                                                    </View>
                                                )}
                                            </View>
                                        )}
                                    </View>
                                ))}

                                {isParsing && (
                                    <View style={s.aiBlock}>
                                        <View style={s.typingRow}>
                                            <View style={[s.dot, { backgroundColor: textSec }]} />
                                            <View style={[s.dot, { backgroundColor: textSec }]} />
                                            <View style={[s.dot, { backgroundColor: textSec }]} />
                                        </View>
                                    </View>
                                )}
                            </>
                        )}
                    </ScrollView>

                    {/* ── Fixed input ── */}
                    <View style={[s.inputOuter, { paddingBottom: bottomPad }]}>
                        <View
                            style={[
                                s.inputBox,
                                {
                                    backgroundColor: inputBg,
                                    shadowColor: inputShadow,
                                    borderColor: panelBorder,
                                },
                            ]}
                        >
                            <TextInput
                                ref={inputRef}
                                value={input}
                                onChangeText={setInput}
                                placeholder="Ask, search, or make anything..."
                                placeholderTextColor={placeholder}
                                style={[s.textInput, { color: textPri }]}
                                multiline
                                blurOnSubmit={false}
                                autoCapitalize="sentences"
                            />
                            <View style={s.inputFooter}>
                                <View style={s.inputLeft}>
                                    <TouchableOpacity style={s.inputIconBtn} activeOpacity={0.7}>
                                        <Plus size={22} color={textSec} />
                                    </TouchableOpacity>
                                    <TouchableOpacity style={s.inputIconBtn} activeOpacity={0.7}>
                                        <SlidersHorizontal size={21} color={textSec} />
                                    </TouchableOpacity>
                                </View>
                                <TouchableOpacity
                                    style={[s.sendBtn, { backgroundColor: canSend ? primary : sendDisBg }]}
                                    onPress={sendMessage}
                                    disabled={!canSend}
                                    activeOpacity={0.85}
                                >
                                    <ArrowUp
                                        size={18}
                                        color={canSend ? '#FFF' : (isDark ? '#555' : '#9CA3AF')}
                                        weight="bold"
                                    />
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

/* ─────────────────────────────────────────── styles */

const s = StyleSheet.create({
    modalRoot: { flex: 1 },
    panel: {
        flex: 1,
        width: '100%',
    },

    topBar: {
        flexDirection: 'row',
        justifyContent: 'flex-start',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingBottom: 12,
    },
    backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
    backButtonCircle: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },

    scroll:       { flex: 1 },
    scrollContent: { paddingHorizontal: 24, paddingBottom: 18, gap: 26 },
    scrollContentResting: { paddingBottom: 24 },
    scrollContentKeyboard: { paddingBottom: 156 },
    scrollGrow:   { flexGrow: 1 },

    /* Empty */
    empty:   { flex: 1, paddingTop: 72 },
    emptyKeyboard: { paddingTop: 20 },
    heading: { fontSize: 24, fontFamily: 'GoogleSansFlex_700Bold', letterSpacing: -0.7, lineHeight: 31, marginBottom: 18, maxWidth: '88%' },
    suggRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 14 },
    suggRowKeyboard: { paddingVertical: 10 },
    suggText: { fontSize: 16, fontFamily: 'GoogleSansFlex_500Medium', lineHeight: 23 },

    /* Messages */
    msgBlock:   {},
    userRow:    { alignItems: 'flex-end' },
    userBubble: { borderRadius: 22, paddingHorizontal: 18, paddingVertical: 12, maxWidth: '78%' },
    userText:   { fontSize: 15, fontFamily: 'GoogleSansFlex_400Regular', lineHeight: 22 },
    aiBlock:    { gap: 12 },
    aiText:     { fontSize: 16, fontFamily: 'GoogleSansFlex_500Medium', lineHeight: 29 },
    aiActions:  { flexDirection: 'row', gap: 2, marginTop: -2 },
    aiActionBtn:{ padding: 6 },
    typingRow:  { flexDirection: 'row', gap: 5, paddingVertical: 8 },
    dot:        { width: 7, height: 7, borderRadius: 4, opacity: 0.4 },
    statusRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -4 },
    statusText: { fontSize: 13, fontFamily: 'GoogleSansFlex_500Medium' },

    /* Input */
    inputOuter:   { paddingHorizontal: 16, paddingTop: 8 },
    inputBox:     {
        borderRadius: 26,
        paddingHorizontal: 18,
        paddingTop: 16,
        paddingBottom: 12,
        borderWidth: 1,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.12,
        shadowRadius: 24,
        elevation: 6,
    },
    textInput:    { fontSize: 15, fontFamily: 'GoogleSansFlex_500Medium', lineHeight: 22, minHeight: 22, maxHeight: 120, marginBottom: 12, textAlignVertical: 'top' },
    inputFooter:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    inputLeft:    { flexDirection: 'row', gap: 4 },
    inputIconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
    sendBtn:      { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
});

export default UniversalCreationBox;
