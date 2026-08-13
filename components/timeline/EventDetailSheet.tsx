import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { usePrivy } from '@privy-io/expo';
import { TrueSheet } from '@hedwig/true-sheet';

import { useThemeColors } from '../../theme/colors';
import { fetchApiJson } from '../../utils/apiBaseUrl';
import { AmountText } from '../ui/AmountText';
import IOSGlassIconButton from '../ui/IOSGlassIconButton';
import {
    X,
    Copy,
    TrendingUp as TrendingUpIcon,
    Receipt as ReceiptIcon,
    Coins as CoinsIcon,
    Wallet as WalletIcon,
    FileText as FileTextIcon,
    Clock as ClockIcon,
} from '../ui/AppIcon';
import type { LedgerFeedEntry } from '../../hooks/useLedgerFeed';

export interface LedgerEventDetail {
    id: string;
    eventType: string;
    occurredAt: string;
    recordedAt: string;
    amount: number | null;
    currency: string | null;
    amountUsd: number | null;
    fxRateUsd: number | null;
    fxSource: string | null;
    direction: string | null;
    source: string | null;
    correlationId: string | null;
    payload: Record<string, unknown>;
}

interface LedgerEventData {
    entityType: string;
    entityId: string;
    events: LedgerEventDetail[];
}

interface EventDetailSheetProps {
    entry: LedgerFeedEntry | null;
    onDismiss?: () => void;
}

export interface EventDetailSheetHandle {
    present: () => void;
}

const EVENT_LABELS: Record<string, string> = {
    'document.paid': 'Invoice paid',
    'payment_link.paid': 'Payment link paid',
    'wallet.deposit.received': 'Deposit received',
    'offramp.settled': 'Withdrawal settled',
    'offramp.refunded': 'Withdrawal refunded',
    'expense.created': 'Expense created',
    'expense.updated': 'Expense updated',
    'expense.deleted': 'Expense removed',
    'imported_transaction.created': 'Bank import created',
    'imported_transaction.updated': 'Bank import updated',
    'imported_transaction.matched': 'Bank import matched',
    'imported_transaction.confirmed': 'Import confirmed',
    'imported_transaction.bulk_confirmed': 'Import confirmed',
};

function eventLabel(eventType: string): string {
    return EVENT_LABELS[eventType] || eventType.replace(/[._]/g, ' ');
}

function eventIcon(eventType: string, color: string, size: number): React.ReactNode {
    if (eventType.startsWith('imported_transaction.')) {
        return <FileTextIcon size={size} color={color} strokeWidth={2} />;
    }
    if (eventType === 'wallet.deposit.received') {
        return <WalletIcon size={size} color={color} strokeWidth={2} />;
    }
    if (eventType.startsWith('offramp.')) {
        return <CoinsIcon size={size} color={color} strokeWidth={2} />;
    }
    if (eventType.startsWith('expense.')) {
        return <ReceiptIcon size={size} color={color} strokeWidth={2} />;
    }
    if (eventType.endsWith('.paid')) {
        return <TrendingUpIcon size={size} color={color} strokeWidth={2} />;
    }
    return <ClockIcon size={size} color={color} strokeWidth={2} />;
}

function eventTone(direction: string | null): 'in' | 'out' | 'neutral' {
    if (direction === 'in') return 'in';
    if (direction === 'out') return 'out';
    return 'neutral';
}

function formatWhen(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

const COPYABLE_KEYS: Record<string, string> = {
    transactionHash: 'Transaction hash',
    transaction_hash: 'Transaction hash',
    txHash: 'Transaction hash',
    hash: 'Transaction hash',
    senderAddress: 'From',
    sender_address: 'From',
    recipientAddress: 'To',
    recipient_address: 'To',
    address: 'Address',
    walletAddress: 'Wallet address',
    wallet_address: 'Wallet address',
    chain: 'Chain',
    network: 'Network',
    bankName: 'Bank',
    bank_name: 'Bank',
    accountLast4: 'Account',
    account_last4: 'Account',
    last4: 'Account',
    invoiceNumber: 'Invoice',
    invoice_number: 'Invoice',
    clientName: 'Client',
    client_name: 'Client',
    status: 'Status',
    reference: 'Reference',
    memo: 'Memo',
    routingNumber: 'Routing',
    routing_number: 'Routing',
};

const SKIP_KEYS = new Set([
    'id', 'user_id', 'workspace_id', 'document_id', 'expense_id', 'offramp_id',
    'project_id', 'client_id', 'amount', 'currency', 'amount_usd', 'fx_rate_usd',
    'fx_source', 'direction', 'paid_at', 'recorded_at', 'created_at', 'updated_at',
]);

function surfacePayload(payload: Record<string, unknown>): { label: string; value: string }[] {
    const rows: { label: string; value: string }[] = [];
    for (const [key, value] of Object.entries(payload || {})) {
        if (SKIP_KEYS.has(key)) continue;
        if (value === null || value === undefined) continue;
        if (typeof value === 'object') continue;
        const label = COPYABLE_KEYS[key] || key.replace(/[_.]/g, ' ');
        rows.push({ label, value: String(value) });
        if (rows.length >= 8) break;
    }
    return rows;
}

function isCopyable(label: string): boolean {
    const lower = label.toLowerCase();
    return (
        lower.includes('hash') ||
        lower.includes('address') ||
        lower.includes('account') ||
        lower.includes('routing') ||
        lower.includes('reference') ||
        lower.includes('id')
    );
}

function EventDetailSheetComponent(
    { entry, onDismiss }: EventDetailSheetProps,
    ref: React.Ref<EventDetailSheetHandle>,
) {
    const themeColors = useThemeColors();
    const { getAccessToken } = usePrivy();
    const sheetRef = useRef<TrueSheet | null>(null);

    const [data, setData] = useState<LedgerEventData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState<string | null>(null);

    useImperativeHandle(ref, () => ({
        present: () => sheetRef.current?.present(),
    }));

    const loadEvents = useCallback(async () => {
        if (!entry) return;
        setLoading(true);
        setError(null);
        try {
            const token = await getAccessToken();
            if (!token) {
                setError('Please sign in again.');
                return;
            }
            const result = await fetchApiJson(`/api/revenue/ledger/events/${entry.referenceId}`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (!result?.success) {
                setError(result?.error?.message || 'Could not load event details.');
                return;
            }
            setData(result.data as LedgerEventData);
        } catch (err: any) {
            setError(err?.message || 'Could not load event details.');
        } finally {
            setLoading(false);
        }
    }, [entry, getAccessToken]);

    useEffect(() => {
        if (entry) {
            setData(null);
            void loadEvents();
        }
    }, [entry, loadEvents]);

    const copy = useCallback(
        async (value: string, label: string) => {
            await Clipboard.setStringAsync(value);
            setCopied(label);
            setTimeout(() => setCopied(null), 1600);
        },
        [],
    );

    const isIn = entry ? entry.credit > 0 : false;
    const heroAmount = entry ? (isIn ? entry.credit : entry.debit) : 0;
    const hasFx = data?.events?.some(
        (ev) => ev.amountUsd !== null && ev.currency && ev.currency !== 'USD',
    );
    const fxNote = data?.events?.find((ev) => ev.fxRateUsd !== null && ev.currency && ev.currency !== 'USD');
    const detailRows = data && entry
        ? surfacePayload(data.events[data.events.length - 1]?.payload || {})
        : [];

    return (
        <TrueSheet
            ref={sheetRef}
            detents={[0.75]}
            cornerRadius={Platform.OS === 'ios' ? 50 : 24}
            {...(Platform.OS === 'ios'
                ? { backgroundBlur: 'regular' as const }
                : { backgroundColor: themeColors.background })}
            grabber={true}
            scrollable={true}
            onDidDismiss={onDismiss}
        >
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.content}
                bounces={false}
                overScrollMode="never"
                nestedScrollEnabled={Platform.OS === 'android'}
            >
                <View style={styles.headerRow}>
                    <View style={styles.headerText}>
                        <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]} numberOfLines={1}>
                            {entry?.description || 'Activity'}
                        </Text>
                        <Text style={[styles.headerSubtitle, { color: themeColors.textSecondary }]} numberOfLines={1}>
                            {entry?.account || 'Ledger entry'}
                        </Text>
                    </View>
                    <IOSGlassIconButton
                        onPress={() => sheetRef.current?.dismiss()}
                        systemImage="xmark"
                        circleStyle={styles.closeCircle}
                        icon={<X size={22} color={themeColors.textSecondary} strokeWidth={3.5} />}
                    />
                </View>

                {loading ? (
                    <View style={styles.centerState}>
                        <ActivityIndicator color={themeColors.primary} />
                    </View>
                ) : error ? (
                    <View style={styles.centerState}>
                        <Text style={[styles.errorText, { color: themeColors.textSecondary }]}>{error}</Text>
                        <TouchableOpacity
                            style={[styles.retryButton, { backgroundColor: themeColors.primary }]}
                            onPress={loadEvents}
                            activeOpacity={0.85}
                        >
                            <Text style={styles.retryText}>Try again</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <>
                        <View style={[styles.heroCard, { backgroundColor: themeColors.surface }]}>
                            <AmountText
                                value={heroAmount}
                                currency={entry?.currency || 'USD'}
                                signed
                                tone={isIn ? 'in' : 'out'}
                                size="display"
                                weight="bold"
                            />
                            {entry?.status ? (
                                <Text style={[styles.heroStatus, { color: themeColors.textSecondary }]}>
                                    {entry.status}
                                </Text>
                            ) : null}
                        </View>

                        {hasFx && fxNote ? (
                            <Text style={[styles.fxNote, { color: themeColors.textSecondary }]}>
                                Frozen at {fxNote.fxRateUsd} {fxNote.currency} → USD at capture time
                                {fxNote.fxSource ? ` · ${fxNote.fxSource}` : ''}
                            </Text>
                        ) : null}

                        {data && (
                            <View style={styles.section}>
                                <Text style={[styles.sectionLabel, { color: themeColors.textSecondary }]}>
                                    Event history
                                </Text>
                                <View style={[styles.timelineCard, { backgroundColor: themeColors.surface }]}>
                                    {data.events.map((ev, idx) => {
                                        const tone = eventTone(ev.direction);
                                        const color =
                                            tone === 'in'
                                                ? themeColors.moneyIn
                                                : tone === 'out'
                                                  ? themeColors.moneyOut
                                                  : themeColors.textPrimary;
                                        const isLast = idx === data.events.length - 1;
                                        return (
                                            <View key={ev.id} style={[styles.eventRow, !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: themeColors.border }]}>
                                                <View style={styles.eventIconWrap}>{eventIcon(ev.eventType, color, 16)}</View>
                                                <View style={styles.eventText}>
                                                    <Text style={[styles.eventLabel, { color: themeColors.textPrimary }]}>
                                                        {eventLabel(ev.eventType)}
                                                    </Text>
                                                    <Text style={[styles.eventTime, { color: themeColors.textSecondary }]}>
                                                        {formatWhen(ev.occurredAt)}
                                                    </Text>
                                                </View>
                                                <View style={styles.eventAmount}>
                                                    {ev.amountUsd !== null ? (
                                                        <AmountText value={ev.amountUsd} tone={tone} size="caption" weight="bold" currency="USD" />
                                                    ) : ev.amount !== null ? (
                                                        <AmountText value={ev.amount} tone={tone} size="caption" weight="bold" currency={ev.currency || 'USD'} />
                                                    ) : null}
                                                </View>
                                            </View>
                                        );
                                    })}
                                </View>
                            </View>
                        )}

                        {detailRows.length > 0 && (
                            <View style={styles.section}>
                                <Text style={[styles.sectionLabel, { color: themeColors.textSecondary }]}>
                                    Details
                                </Text>
                                <View style={[styles.detailsCard, { backgroundColor: themeColors.surface }]}>
                                    {detailRows.map((row) => (
                                        <TouchableOpacity
                                            key={row.label}
                                            style={[styles.detailRow, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: themeColors.border }]}
                                            onPress={() => isCopyable(row.label) ? copy(row.value, row.label) : undefined}
                                            disabled={!isCopyable(row.label)}
                                            activeOpacity={0.7}
                                        >
                                            <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>
                                                {row.label}
                                            </Text>
                                            <Text style={[styles.detailValue, { color: themeColors.textPrimary }]} numberOfLines={1}>
                                                {row.value}
                                            </Text>
                                            {isCopyable(row.label) ? (
                                                <View style={styles.copyIcon}>
                                                    <Copy size={14} color={copied === row.label ? themeColors.moneyIn : themeColors.textSecondary} strokeWidth={2} />
                                                </View>
                                            ) : null}
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                        )}

                        {data?.events?.[0]?.correlationId ? (
                            <TouchableOpacity
                                style={[styles.correlationRow, { backgroundColor: themeColors.surface }]}
                                onPress={() => copy(String(data!.events![0].correlationId), 'correlationId')}
                                activeOpacity={0.7}
                            >
                                <Text style={[styles.correlationLabel, { color: themeColors.textSecondary }]}>
                                    Correlation ID
                                </Text>
                                <Text style={[styles.correlationValue, { color: themeColors.textPrimary }]} numberOfLines={1}>
                                    {copied === 'correlationId' ? 'Copied' : data.events[0].correlationId}
                                </Text>
                                <Copy size={14} color={themeColors.textSecondary} strokeWidth={2} />
                            </TouchableOpacity>
                        ) : null}
                    </>
                )}
            </ScrollView>
        </TrueSheet>
    );
}

export const EventDetailSheet = forwardRef<EventDetailSheetHandle, EventDetailSheetProps>(
    EventDetailSheetComponent,
);

const styles = StyleSheet.create({
    content: {
        paddingHorizontal: 24,
        paddingTop: 8,
        paddingBottom: 40,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 12,
        paddingVertical: 12,
    },
    headerText: {
        flex: 1,
    },
    headerTitle: {
        fontSize: 21,
        fontWeight: '700',
        letterSpacing: -0.4,
    },
    headerSubtitle: {
        fontSize: 14,
        marginTop: 3,
    },
    closeCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
    },
    centerState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 48,
        gap: 10,
    },
    errorText: {
        fontSize: 15,
        textAlign: 'center',
        lineHeight: 21,
    },
    retryButton: {
        borderRadius: 14,
        paddingHorizontal: 20,
        paddingVertical: 11,
    },
    retryText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '600',
    },
    heroCard: {
        borderRadius: 22,
        padding: 20,
        alignItems: 'center',
        marginTop: 6,
    },
    heroStatus: {
        fontSize: 13,
        marginTop: 4,
        textTransform: 'capitalize',
    },
    fxNote: {
        fontSize: 12,
        textAlign: 'center',
        marginTop: 8,
    },
    section: {
        marginTop: 22,
    },
    sectionLabel: {
        fontSize: 12,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 8,
    },
    timelineCard: {
        borderRadius: 20,
        paddingHorizontal: 16,
    },
    eventRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 13,
    },
    eventIconWrap: {
        width: 30,
        alignItems: 'center',
    },
    eventText: {
        flex: 1,
        gap: 2,
    },
    eventLabel: {
        fontSize: 14,
        fontWeight: '600',
    },
    eventTime: {
        fontSize: 12,
    },
    eventAmount: {
        alignItems: 'flex-end',
    },
    detailsCard: {
        borderRadius: 20,
        paddingHorizontal: 16,
    },
    detailRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 13,
    },
    detailLabel: {
        width: 96,
        fontSize: 13,
    },
    detailValue: {
        flex: 1,
        fontSize: 13,
        fontWeight: '500',
    },
    copyIcon: {
        width: 20,
        alignItems: 'flex-end',
    },
    correlationRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 13,
        marginTop: 22,
    },
    correlationLabel: {
        fontSize: 13,
        width: 110,
    },
    correlationValue: {
        flex: 1,
        fontSize: 13,
        fontWeight: '500',
    },
});