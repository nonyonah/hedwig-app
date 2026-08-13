import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useThemeColors } from '../../theme/colors';
import { AmountText } from '../ui/AmountText';
import type { LedgerFeedEntry } from '../../hooks/useLedgerFeed';
import {
    TrendingUp as TrendingUpIcon,
    Receipt as ReceiptIcon,
    Coins as CoinsIcon,
    Wallet as WalletIcon,
    FileText as FileTextIcon,
    Clock as ClockIcon,
} from '../ui/AppIcon';

type EventIconKind = 'income' | 'expense' | 'withdrawal' | 'deposit' | 'imported' | 'default';

function resolveKind(entry: LedgerFeedEntry): EventIconKind {
    const ev = entry.event_type || '';
    if (ev.startsWith('imported_transaction.')) return 'imported';
    if (ev === 'wallet.deposit.received') return 'deposit';
    if (ev === 'offramp.settled') return 'withdrawal';
    if (entry.type === 'revenue') return 'income';
    if (entry.type === 'expense') return 'expense';
    if (entry.type === 'credit') return entry.debit > 0 ? 'withdrawal' : 'deposit';
    if (entry.type === 'transfer') return entry.debit > 0 ? 'withdrawal' : 'deposit';
    return 'default';
}

const KIND_ICONS: Record<EventIconKind, (color: string, size: number) => React.ReactNode> = {
    income: (color, size) => <TrendingUpIcon size={size} color={color} strokeWidth={2} />,
    expense: (color, size) => <ReceiptIcon size={size} color={color} strokeWidth={2} />,
    withdrawal: (color, size) => <CoinsIcon size={size} color={color} strokeWidth={2} />,
    deposit: (color, size) => <WalletIcon size={size} color={color} strokeWidth={2} />,
    imported: (color, size) => <FileTextIcon size={size} color={color} strokeWidth={2} />,
    default: (color, size) => <ClockIcon size={size} color={color} strokeWidth={2} />,
};

function timeLabel(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function dayLabel(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function eventStatusLabel(entry: LedgerFeedEntry): string | null {
    const status = entry.status?.trim();
    if (!status || status.toLowerCase() === 'none') return null;
    return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}

interface EventRowProps {
    entry: LedgerFeedEntry;
    onPress: (entry: LedgerFeedEntry) => void;
    last?: boolean;
}

export function EventRow({ entry, onPress, last = false }: EventRowProps) {
    const themeColors = useThemeColors();
    const isIn = entry.credit > 0;

    const { icon, tone } = useMemo(() => {
        const kind = resolveKind(entry);
        const color = isIn ? themeColors.moneyIn : themeColors.textPrimary;
        return { icon: KIND_ICONS[kind](color, 18), tone: isIn ? ('in' as const) : ('out' as const) };
    }, [entry, isIn, themeColors]);

    const status = eventStatusLabel(entry);
    const day = dayLabel(entry.date);
    const secondaryParts = [day, status].filter(Boolean);

    return (
        <TouchableOpacity
            style={[styles.row, { borderColor: themeColors.border }, last && styles.rowLast]}
            onPress={() => onPress(entry)}
            activeOpacity={0.7}
        >
            <View style={[styles.iconWrap, { backgroundColor: themeColors.surfaceHighlight }]}>{icon}</View>
            <View style={styles.textWrap}>
                <Text style={[styles.title, { color: themeColors.textPrimary }]} numberOfLines={1}>
                    {entry.description || entry.account || 'Activity'}
                </Text>
                {secondaryParts.length > 0 && (
                    <Text style={[styles.subtitle, { color: themeColors.textSecondary }]} numberOfLines={1}>
                        {secondaryParts.join(' \u00B7 ')}
                    </Text>
                )}
            </View>
            <View style={styles.amountWrap}>
                <AmountText
                    value={isIn ? entry.credit : entry.debit}
                    currency={entry.currency}
                    signed
                    tone={tone}
                    size="body"
                    weight="bold"
                />
            </View>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        height: 60,
        paddingHorizontal: 14,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    rowLast: {
        borderBottomWidth: 0,
    },
    iconWrap: {
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: 'center',
        justifyContent: 'center',
    },
    textWrap: {
        flex: 1,
        gap: 3,
    },
    title: {
        fontSize: 14.5,
        fontWeight: '600',
        fontFamily: 'GoogleSansFlex_600SemiBold',
    },
    subtitle: {
        fontSize: 12.5,
        fontFamily: 'GoogleSansFlex_400Regular',
    },
    amountWrap: {
        alignItems: 'flex-end',
    },
});