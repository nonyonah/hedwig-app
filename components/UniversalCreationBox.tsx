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
    Dimensions,
    Keyboard,
    Modal,
    useColorScheme,
    ScrollView,
    Animated,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SymbolView } from 'expo-symbols';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import IOSGlassIconButton from './ui/IOSGlassIconButton';
import SwiftUIBottomSheetModal from './ui/SwiftUIBottomSheetModal';
import { useThemeColors } from '../theme/colors';
import { useRouter } from 'expo-router';
import { useAuth } from '../hooks/useAuth';

type UniversalSheetIconName =
    | 'chevron.left'
    | 'receipt'
    | 'link'
    | 'doc.text'
    | 'pencil'
    | 'plus'
    | 'arrow.up'
    | 'square.fill'
    | 'doc.on.doc'
    | 'hand.thumbsup'
    | 'hand.thumbsdown'
    | 'checkmark.circle'
    | 'xmark.circle.fill';

const MATERIAL_ICON_MAP: Record<UniversalSheetIconName, string> = {
    'chevron.left': 'chevron-left',
    'receipt': 'receipt-text-outline',
    'link': 'link-variant',
    'doc.text': 'file-document-outline',
    'pencil': 'pencil-outline',
    'plus': 'plus',
    'arrow.up': 'arrow-up',
    'square.fill': 'stop',
    'doc.on.doc': 'content-copy',
    'hand.thumbsup': 'thumb-up-outline',
    'hand.thumbsdown': 'thumb-down-outline',
    'checkmark.circle': 'check-circle',
    'xmark.circle.fill': 'close-circle',
};

function UniversalSheetIcon({ name, size, color }: { name: UniversalSheetIconName; size: number; color: string }) {
    const iconFrameStyle = {
        width: size,
        height: size,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
    };

    if (Platform.OS === 'ios') {
        return (
            <View style={iconFrameStyle}>
                <SymbolView
                    name={name as any}
                    size={size}
                    tintColor={color}
                    type="monochrome"
                    weight="semibold"
                    resizeMode="scaleAspectFit"
                />
            </View>
        );
    }

    return (
        <View style={iconFrameStyle}>
            <MaterialCommunityIcons
                name={(MATERIAL_ICON_MAP[name] as any) || 'help-circle-outline'}
                size={size}
                color={color}
            />
        </View>
    );
}

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

interface UploadedDocument {
    uri: string;
    name: string;
    mimeType: string;
    size?: number;
}

interface UniversalCreationBoxProps {
    visible: boolean;
    onClose: () => void;
    onTransfer?: (data: any) => void;
    presentation?: 'auto' | 'inline';
}

const MAX_ATTACHMENTS = 5;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

/* ─────────────────────────────────────────── suggestions */

const SUGGESTIONS: Array<{ label: string; prompt: string; icon: UniversalSheetIconName }> = [
    { label: 'Create an invoice',       prompt: 'Create an invoice for ',       icon: 'receipt' },
    { label: 'Send a payment link',     prompt: 'Send a payment link for ',     icon: 'link' },
    { label: 'Set up recurring invoice', prompt: 'Set up a recurring invoice for ', icon: 'doc.text' },
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

/* ─────────────────────────────────────────── animated message wrapper */

function AnimatedMessage({ children }: { children: React.ReactNode }) {
    const opacity = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(10)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(opacity, { toValue: 1, duration: 260, useNativeDriver: true }),
            Animated.spring(translateY, { toValue: 0, damping: 18, stiffness: 160, useNativeDriver: true }),
        ]).start();
    }, []);

    return (
        <Animated.View style={{ opacity, transform: [{ translateY }] }}>
            {children}
        </Animated.View>
    );
}

function AnimatedThinkingDots({ color }: { color: string }) {
    const dot1 = useRef(new Animated.Value(0.25)).current;
    const dot2 = useRef(new Animated.Value(0.25)).current;
    const dot3 = useRef(new Animated.Value(0.25)).current;

    useEffect(() => {
        const makePulse = (value: Animated.Value, delay: number) =>
            Animated.loop(
                Animated.sequence([
                    Animated.delay(delay),
                    Animated.timing(value, { toValue: 1, duration: 260, useNativeDriver: true }),
                    Animated.timing(value, { toValue: 0.25, duration: 260, useNativeDriver: true }),
                ])
            );

        const a1 = makePulse(dot1, 0);
        const a2 = makePulse(dot2, 120);
        const a3 = makePulse(dot3, 240);
        a1.start();
        a2.start();
        a3.start();

        return () => {
            a1.stop();
            a2.stop();
            a3.stop();
        };
    }, [dot1, dot2, dot3]);

    return (
        <View style={s.typingRow}>
            <Animated.View style={[s.dot, { backgroundColor: color, opacity: dot1 }]} />
            <Animated.View style={[s.dot, { backgroundColor: color, opacity: dot2 }]} />
            <Animated.View style={[s.dot, { backgroundColor: color, opacity: dot3 }]} />
        </View>
    );
}

/* ─────────────────────────────────────────── main */

export function UniversalCreationBox({ visible, onClose, onTransfer, presentation = 'auto' }: UniversalCreationBoxProps) {
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
    const [keyboardHeight, setKeyboardHeight] = useState(0);
    const [composerHeight, setComposerHeight] = useState(120);
    const [attachments, setAttachments] = useState<UploadedDocument[]>([]);
    const abortControllerRef = useRef<AbortController | null>(null);

    // Typewriter state — tracks the in-progress assistant message
    const [typingState, setTypingState] = useState<{ id: string; text: string } | null>(null);
    const typingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const stopTyping = useCallback(() => {
        if (typingTimerRef.current !== null) {
            clearInterval(typingTimerRef.current);
            typingTimerRef.current = null;
        }
        setTypingState(null);
    }, []);

    const startTyping = useCallback((id: string, full: string) => {
        stopTyping();
        if (!full) return;

        // Chunk size and interval tuned so ~80 wpm feels natural but finishes quickly
        const CHARS_PER_TICK = 4;
        const INTERVAL_MS    = 16; // ~60fps

        let pos = 0;
        setTypingState({ id, text: '' });

        typingTimerRef.current = setInterval(() => {
            pos = Math.min(pos + CHARS_PER_TICK, full.length);
            setTypingState({ id, text: full.slice(0, pos) });
            if (pos >= full.length) {
                clearInterval(typingTimerRef.current!);
                typingTimerRef.current = null;
                // Leave typingState as the full string — will be cleared on next send
            }
        }, INTERVAL_MS);
    }, [stopTyping]);

    // Two-pass scroll: snap immediately, then animate after layout settles.
    const scrollToBottom = useCallback((animated = true) => {
        // Pass 1 — immediate snap so content is never off-screen
        requestAnimationFrame(() => {
            scrollRef.current?.scrollToEnd?.({ animated: false });
        });
        // Pass 2 — smooth scroll after spring animation / text reflow completes
        const followUp = Platform.OS === 'ios' ? 260 : 160;
        setTimeout(() => {
            scrollRef.current?.scrollToEnd?.({ animated });
        }, followUp);
    }, []);

    /* ── keyboard visibility tracking (for bottom padding) ── */
    useEffect(() => {
        const show = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hide = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
        const s = Keyboard.addListener(show, (event) => {
            setKbOpen(true);
            setKeyboardHeight(event?.endCoordinates?.height ?? 0);
        });
        const h = Keyboard.addListener(hide, () => {
            setKbOpen(false);
            setKeyboardHeight(0);
        });
        const frame = Platform.OS === 'ios'
            ? Keyboard.addListener('keyboardWillChangeFrame', (event) => {
                setKbOpen((event?.endCoordinates?.height ?? 0) > 0);
                setKeyboardHeight(event?.endCoordinates?.height ?? 0);
            })
            : null;
        return () => {
            s.remove();
            h.remove();
            frame?.remove();
        };
    }, []);

    /* ── open / close ── */
    useEffect(() => {
        if (visible) {
            setMessages([]);
            setInput('');
            setIsParsing(false);
            setAttachments([]);
            stopTyping();
            scrollRef.current?.scrollTo?.({ y: 0, animated: false });
            setTimeout(() => inputRef.current?.focus(), 380);
        } else {
            abortControllerRef.current?.abort();
            abortControllerRef.current = null;
            stopTyping();
            Keyboard.dismiss();
        }
    }, [visible, stopTyping]);

    /* ── scroll to bottom on new content ── */
    useEffect(() => {
        if (messages.length === 0 && !isParsing) {
            return;
        }
        // First pass: fast, catches most cases
        const d1 = Platform.OS === 'ios' ? 80 : 60;
        // Second pass: after spring animation + text reflow settle
        const d2 = Platform.OS === 'ios' ? 480 : 320;
        const t1 = setTimeout(() => scrollToBottom(false), d1);
        const t2 = setTimeout(() => scrollToBottom(true), d2);
        return () => { clearTimeout(t1); clearTimeout(t2); };
    }, [messages, isParsing, scrollToBottom]);

    const handleClose = useCallback(() => {
        Keyboard.dismiss();
        onClose();
    }, [onClose]);

    const removeAttachment = useCallback((uri: string) => {
        setAttachments((prev) => prev.filter((doc) => doc.uri !== uri));
    }, []);

    const appendAttachments = useCallback((docs: UploadedDocument[]) => {
        if (!docs.length) return;
        setAttachments((prev) => {
            const deduped = docs.filter((doc) => !prev.some((existing) => existing.uri === doc.uri));
            const merged = [...prev, ...deduped];
            return merged.slice(0, MAX_ATTACHMENTS);
        });
    }, []);

    const pickPdfDocuments = useCallback(async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: ['application/pdf'],
                multiple: true,
                copyToCacheDirectory: false,
            });

            if (result.canceled || !result.assets?.length) {
                return;
            }

            const mapped = result.assets.map((asset, index) => ({
                uri: asset.uri,
                name: asset.name || `document-${Date.now()}-${index + 1}.pdf`,
                mimeType: asset.mimeType || 'application/pdf',
                size: asset.size,
            }));
            appendAttachments(mapped);
        } catch (error) {
            console.error('[CreationBox] Failed to pick PDF:', error);
            Alert.alert('Upload failed', 'Unable to attach PDF right now. Please try again.');
        }
    }, [appendAttachments]);

    const pickImages = useCallback(async () => {
        try {
            const permission = await ImagePicker.getMediaLibraryPermissionsAsync();
            if (!permission.granted) {
                const requested = await ImagePicker.requestMediaLibraryPermissionsAsync();
                if (!requested.granted) {
                    Alert.alert('Permission required', 'Please allow photo access to attach images.');
                    return;
                }
            }

            const remainingSlots = Math.max(1, MAX_ATTACHMENTS - attachments.length);
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsMultipleSelection: true,
                selectionLimit: remainingSlots,
                quality: 0.85,
                base64: false,
                exif: false,
            });

            if (result.canceled || !result.assets?.length) {
                return;
            }

            const mapped = result.assets.map((asset, index) => ({
                uri: asset.uri,
                name: asset.fileName || `image-${Date.now()}-${index + 1}.jpg`,
                mimeType: asset.mimeType || 'image/jpeg',
                size: asset.fileSize,
            }));

            const validImages = mapped.filter((file) => {
                if (typeof file.size === 'number' && file.size > MAX_IMAGE_BYTES) {
                    return false;
                }
                return true;
            });

            if (validImages.length < mapped.length) {
                Alert.alert('Image too large', 'Some images were skipped. Max image size is 15MB.');
            }

            appendAttachments(validImages);
        } catch (error) {
            console.error('[CreationBox] Failed to pick images:', error);
            Alert.alert('Upload failed', 'Unable to attach images right now. Please try again.');
        }
    }, [appendAttachments, attachments.length]);

    const pickDocuments = useCallback(() => {
        Keyboard.dismiss();

        if (attachments.length >= MAX_ATTACHMENTS) {
            Alert.alert('Attachment limit reached', 'You can attach up to 5 files.');
            return;
        }

        Alert.alert('Attach files', 'Choose what to upload', [
            { text: 'Image', onPress: () => { void pickImages(); } },
            { text: 'PDF', onPress: () => { void pickPdfDocuments(); } },
            { text: 'Cancel', style: 'cancel' },
        ]);
    }, [attachments.length, pickImages, pickPdfDocuments]);

    const stopParsing = useCallback(() => {
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
        setIsParsing(false);
    }, []);

    useEffect(() => {
        const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const listener = Keyboard.addListener(showEvent, () => {
            if (messages.length > 0 || isParsing) {
                setTimeout(() => scrollToBottom(false), Platform.OS === 'ios' ? 140 : 90);
            }
        });
        return () => listener.remove();
    }, [messages.length, isParsing, scrollToBottom]);

    /* ── send ── */
    const sendMessage = useCallback(async () => {
        const text = input.trim();
        if ((!text && attachments.length === 0) || isParsing) return;

        const currentAttachments = attachments;
        const userMessageText = text || `[Uploaded ${currentAttachments.length} document${currentAttachments.length > 1 ? 's' : ''}]`;
        const requestText = text || 'Use the attached documents to create the right draft.';
        setMessages((p) => [...p, { id: `u-${Date.now()}`, role: 'user', content: userMessageText }]);
        setInput('');
        setAttachments([]);
        setIsParsing(true);

        try {
            const token  = await getAccessToken();
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
            const abortController = new AbortController();
            abortControllerRef.current = abortController;
            const res    = await fetch(`${apiUrl}/api/creation-box/parse`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: requestText,
                    currentDate: new Date().toISOString(),
                    attachments: currentAttachments.map((doc) => ({
                        name: doc.name,
                        mimeType: doc.mimeType,
                        size: doc.size ?? null,
                    })),
                }),
                signal: abortController.signal,
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
                const msgId = `a-${Date.now()}`;
                const msgContent = raw.naturalResponse || (actionable
                    ? "Here's what I found — confirm to create:"
                    : "I'm not sure what you need. Try describing an invoice, payment link, or recurring invoice.");
                setMessages((p) => [...p, {
                    id: msgId, role: 'assistant',
                    content: msgContent,
                    parsed: actionable ? parsed : undefined,
                    actionState: actionable ? 'pending' : undefined,
                }]);
                startTyping(msgId, msgContent);
            } else {
                const msgId = `a-${Date.now()}`;
                const msgContent = 'Try: "Invoice for $500 web design for john@acme.com due Friday".';
                setMessages((p) => [...p, { id: msgId, role: 'assistant', content: msgContent }]);
                startTyping(msgId, msgContent);
            }
        } catch (error: any) {
            if (error?.name === 'AbortError') {
                return;
            }
            const msgId = `a-${Date.now()}`;
            const msgContent = 'Something went wrong. Please try again.';
            setMessages((p) => [...p, { id: msgId, role: 'assistant', content: msgContent }]);
            startTyping(msgId, msgContent);
        } finally {
            abortControllerRef.current = null;
            setIsParsing(false);
        }
    }, [input, attachments, isParsing, getAccessToken, startTyping]);

    /* ── confirm action ── */
    const confirmAction = useCallback(async (msgId: string, parsed: ParsedData) => {
        if (parsed.intent === 'recurring_invoice') {
            onClose();
            router.push({
                pathname: '/invoice/create-recurring' as any,
                params: {
                    prefillAmount: parsed.amount ? String(parsed.amount) : '',
                    prefillClientName: parsed.clientName || '',
                    prefillClientEmail: parsed.clientEmail || '',
                    prefillFrequency: parsed.frequency || 'monthly',
                    prefillTitle: parsed.title || '',
                    prefillAutoSend: '0',
                }
            });
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
    const canSend     = input.trim().length > 0 || attachments.length > 0;
    const isSwiftUISheet = Platform.OS === 'ios';
    const isInlinePresentation = presentation === 'inline';
    const keyboardLift = Platform.OS === 'android' && kbOpen
        ? Math.max(0, keyboardHeight)
        : 0;
    const keyboardGap = Platform.OS === 'android'
        ? Math.max(14, Math.round(Dimensions.get('window').height * 0.02))
        : Math.max(4, Math.round(Dimensions.get('window').height * 0.01));
    const bottomPad = kbOpen
        ? (keyboardLift + keyboardGap)
        : (isSwiftUISheet ? 0 : Math.max(insets.bottom, 12));
    const topPad      = isSwiftUISheet ? 12 : Math.max(insets.top, 16);
    // The composer sits BELOW the ScrollView in the flex column — not overlapping.
    // We only need a small visual gap so the last message isn't flush with the edge.
    const scrollBottomPad = 20;

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

    const boxContent = (
        <View style={[s.modalRoot, { backgroundColor: shellBg }]}>
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
                    <IOSGlassIconButton
                        onPress={handleClose}
                        systemImage="chevron.left"
                        useGlass={false}
                        containerStyle={s.backButton}
                        circleStyle={[s.backButtonCircle, { backgroundColor: colors.surface }]}
                        icon={<UniversalSheetIcon name="chevron.left" size={20} color={textPri} />}
                    />
                </View>

                {/* ── Scrollable content ── */}
                <ScrollView
                    ref={scrollRef}
                    style={s.scroll}
                    contentContainerStyle={[
                        s.scrollContent,
                        !hasMessages && s.scrollGrow,
                        { paddingBottom: scrollBottomPad },
                    ]}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                    showsVerticalScrollIndicator={false}
                    onContentSizeChange={() => {
                        if (messages.length > 0 || isParsing) {
                            // Immediate snap — content size just changed
                            scrollRef.current?.scrollToEnd?.({ animated: false });
                            // Follow-up after a frame in case layout isn't committed yet
                            requestAnimationFrame(() => {
                                scrollRef.current?.scrollToEnd?.({ animated: false });
                            });
                        }
                    }}
                >
                    {!hasMessages ? (
                        /* ── Empty state ── */
                        <View style={[s.empty, kbOpen && s.emptyKeyboard]}>
                            <Text style={[s.heading, { color: textPri }]}>
                                How can I help you today?
                            </Text>

                            {SUGGESTIONS.map(({ label, prompt, icon }) => (
                                <TouchableOpacity
                                    key={label}
                                    style={[s.suggRow, kbOpen && s.suggRowKeyboard]}
                                    onPress={() => { setInput(prompt); inputRef.current?.focus(); }}
                                    activeOpacity={0.55}
                                >
                                    <UniversalSheetIcon name={icon} size={21} color={textSec} />
                                    <Text style={[s.suggText, { color: textPri }]}>{label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    ) : (
                        /* ── Messages ── */
                        <>
                            {messages.map((msg) => (
                                <AnimatedMessage key={msg.id}>
                                <View style={s.msgBlock}>
                                    {msg.role === 'user' ? (
                                        <View style={s.userRow}>
                                            <View style={[s.userBubble, { backgroundColor: userBubble }]}>
                                                <Text style={[s.userText, { color: textPri }]}>{msg.content}</Text>
                                            </View>
                                        </View>
                                    ) : (
                                        <View style={s.aiBlock}>
                                            <Text style={[s.aiText, { color: textPri }]}>
                                                {typingState?.id === msg.id ? typingState.text : msg.content}
                                            </Text>

                                            {msg.parsed && msg.actionState === 'pending' && typingState?.id !== msg.id && (
                                                <ActionCard
                                                    parsed={msg.parsed}
                                                    colors={colors}
                                                    onConfirm={() => confirmAction(msg.id, msg.parsed!)}
                                                    onDismiss={() => setMessages((p) => p.map((m) =>
                                                        m.id === msg.id ? { ...m, actionState: undefined, parsed: undefined } : m
                                                    ))}
                                                />
                                            )}

                                            {msg.actionState === 'creating' && typingState?.id !== msg.id && (
                                                <View style={s.statusRow}>
                                                    <ActivityIndicator size="small" color={primary} />
                                                    <Text style={[s.statusText, { color: textSec }]}>Creating…</Text>
                                                </View>
                                            )}
                                            {msg.actionState === 'done' && typingState?.id !== msg.id && (
                                                <View style={s.statusRow}>
                                                    <UniversalSheetIcon name="checkmark.circle" size={14} color="#16A34A" />
                                                    <Text style={[s.statusText, { color: '#16A34A' }]}>{msg.actionResult}</Text>
                                                </View>
                                            )}
                                            {msg.actionState === 'error' && typingState?.id !== msg.id && (
                                                <View style={s.statusRow}>
                                                    <UniversalSheetIcon name="xmark.circle.fill" size={14} color="#B42318" />
                                                    <Text style={[s.statusText, { color: '#B42318' }]}>{msg.actionResult}</Text>
                                                </View>
                                            )}

                                            {msg.actionState !== 'creating' && typingState?.id !== msg.id && (
                                                <View style={s.aiActions}>
                                                    <TouchableOpacity style={s.aiActionBtn} activeOpacity={0.55}>
                                                        <UniversalSheetIcon name="doc.on.doc" size={15} color={textSec} />
                                                    </TouchableOpacity>
                                                    <TouchableOpacity style={s.aiActionBtn} activeOpacity={0.55}>
                                                        <UniversalSheetIcon name="hand.thumbsup" size={15} color={textSec} />
                                                    </TouchableOpacity>
                                                    <TouchableOpacity style={s.aiActionBtn} activeOpacity={0.55}>
                                                        <UniversalSheetIcon name="hand.thumbsdown" size={15} color={textSec} />
                                                    </TouchableOpacity>
                                                </View>
                                            )}
                                        </View>
                                    )}
                                </View>
                                </AnimatedMessage>
                            ))}

                            {isParsing && (
                                <View style={s.aiBlock}>
                                    <AnimatedThinkingDots color={textSec} />
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
                        onLayout={(event) => {
                            const height = Math.round(event.nativeEvent.layout.height);
                            if (height > 0 && Math.abs(height - composerHeight) > 1) {
                                setComposerHeight(height);
                            }
                        }}
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
                        {attachments.length > 0 && (
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={s.attachmentRow}
                            >
                                {attachments.map((file) => (
                                    <View key={file.uri} style={[s.attachmentChip, { borderColor: panelBorder }]}>
                                        <Text style={[s.attachmentChipText, { color: textPri }]} numberOfLines={1}>
                                            {file.name}
                                        </Text>
                                        <TouchableOpacity
                                            onPress={() => removeAttachment(file.uri)}
                                            style={s.attachmentRemove}
                                            activeOpacity={0.7}
                                        >
                                            <UniversalSheetIcon name="xmark.circle.fill" size={14} color={textSec} />
                                        </TouchableOpacity>
                                    </View>
                                ))}
                            </ScrollView>
                        )}
                        <View style={s.inputFooter}>
                            <View style={s.inputLeft}>
                                <TouchableOpacity style={s.inputIconBtn} activeOpacity={0.7} onPress={pickDocuments}>
                                    <UniversalSheetIcon name="plus" size={20} color={textSec} />
                                </TouchableOpacity>
                            </View>
                            <TouchableOpacity
                                style={[s.sendBtn, { backgroundColor: (canSend || isParsing) ? primary : sendDisBg }]}
                                onPress={isParsing ? stopParsing : sendMessage}
                                disabled={!canSend && !isParsing}
                                activeOpacity={0.85}
                            >
                                <View style={s.sendIconWrap}>
                                    {isParsing ? (
                                        <UniversalSheetIcon name="square.fill" size={15} color="#FFFFFF" />
                                    ) : (
                                        <UniversalSheetIcon
                                            name="arrow.up"
                                            size={18}
                                            color={canSend ? '#FFF' : (isDark ? '#555' : '#9CA3AF')}
                                        />
                                    )}
                                </View>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </View>
        </View>
    );

    if (isInlinePresentation) {
        return boxContent;
    }

    if (Platform.OS === 'android') {
        return (
            <Modal
                visible={visible}
                animationType="slide"
                statusBarTranslucent
                navigationBarTranslucent
                hardwareAccelerated
                onRequestClose={handleClose}
                presentationStyle="fullScreen"
            >
                {boxContent}
            </Modal>
        );
    }

    return (
        <SwiftUIBottomSheetModal
            visible={visible}
            onClose={handleClose}
            detents={[{ fraction: 0.96 }, 'large']}
            matchContents={false}
        >
            {boxContent}
        </SwiftUIBottomSheetModal>
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
    backButton: { padding: 4 },
    backButtonCircle: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },

    scroll:       { flex: 1 },
    scrollContent: { paddingHorizontal: 24, paddingBottom: 18, gap: 26 },
    scrollGrow:   { flexGrow: 1 },

    /* Empty */
    empty:   { flex: 1, paddingTop: 72 },
    emptyKeyboard: { paddingTop: 20 },
    heading: { fontSize: 24, fontFamily: 'GoogleSansFlex_600SemiBold', letterSpacing: -0.7, lineHeight: 31, marginBottom: 18, maxWidth: '88%' },
    suggRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 14 },
    suggRowKeyboard: { paddingVertical: 10 },
    suggText: { fontSize: 16, fontFamily: 'GoogleSansFlex_500Medium', lineHeight: 23 },

    /* Messages */
    msgBlock:   { width: '100%' },
    userRow:    { width: '100%', alignItems: 'flex-end' },
    userBubble: { borderRadius: 22, paddingHorizontal: 18, paddingVertical: 12, maxWidth: '78%' },
    userText:   { fontSize: 15, fontFamily: 'GoogleSansFlex_400Regular', lineHeight: 22 },
    aiBlock:    { width: '100%', gap: 12 },
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
    attachmentRow: { flexDirection: 'row', gap: 8, marginBottom: 10, paddingRight: 8 },
    attachmentChip: {
        maxWidth: 220,
        borderWidth: 1,
        borderRadius: 999,
        paddingLeft: 12,
        paddingRight: 6,
        paddingVertical: 6,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    attachmentChipText: { fontSize: 12, fontFamily: 'GoogleSansFlex_500Medium', maxWidth: 180 },
    attachmentRemove: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    inputFooter:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
    inputLeft:    { flexDirection: 'row', gap: 4, height: 44, alignItems: 'center', justifyContent: 'center' },
    inputIconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
    sendBtn:      { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', padding: 0 },
    sendIconWrap: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
});

export default UniversalCreationBox;
