import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from 'heroui-native/card';
import { useThemeColors } from '../../theme/colors';
import { AmountText } from '../ui/AmountText';
import type { LedgerFeedSummary } from '../../hooks/useLedgerFeed';

interface MoneyStripProps {
    summary: LedgerFeedSummary | null;
}

/**
 * Money movement strip — Mercury-style "money in / money out" readout with
 * the top accounts, computed by the backend from the same filtered set the
 * timeline renders.
 */
export function MoneyStrip({ summary }: MoneyStripProps) {
    const themeColors = useThemeColors();

    const cells = useMemo(() => {
        if (!summary) return null;
        return [
            { label: 'In', value: summary.moneyIn, tone: 'in' as const },
            { label: 'Out', value: summary.moneyOut, tone: 'out' as const },
            { label: 'Net', value: summary.net, tone: summary.net >= 0 ? ('in' as const) : ('out' as const) },
        ];
    }, [summary]);

    const inAccounts = summary?.movement?.in?.slice(0, 3) || [];
    const outAccounts = summary?.movement?.out?.slice(0, 3) || [];

    return (
        <Card className="p-[18px] gap-[14px]">
            {cells && (
                <View style={styles.cellsRow}>
                    {cells.map((cell) => (
                        <View key={cell.label} style={styles.cell}>
                            <Text style={[styles.cellLabel, { color: themeColors.textSecondary }]}>
                                {cell.label}
                            </Text>
                            <AmountText
                                value={cell.value}
                                tone={cell.tone}
                                size="title"
                                weight="bold"
                                currency="USD"
                            />
                        </View>
                    ))}
                </View>
            )}

            {(inAccounts.length > 0 || outAccounts.length > 0) && (
                <View style={[styles.movementRow, { borderTopColor: themeColors.border }]}>
                    <View style={styles.movementCol}>
                        {inAccounts.map((a) => (
                            <View key={`in-${a.account}`} style={styles.movementChip}>
                                <View style={[styles.movementDot, { backgroundColor: themeColors.moneyIn }]} />
                                <Text style={[styles.movementText, { color: themeColors.textSecondary }]} numberOfLines={1}>
                                    {a.account}
                                </Text>
                                <AmountText value={a.amount} tone="in" size="caption" weight="bold" />
                            </View>
                        ))}
                    </View>
                    <View style={styles.movementCol}>
                        {outAccounts.map((a) => (
                            <View key={`out-${a.account}`} style={styles.movementChip}>
                                <View style={[styles.movementDot, { backgroundColor: themeColors.moneyOut }]} />
                                <Text style={[styles.movementText, { color: themeColors.textSecondary }]} numberOfLines={1}>
                                    {a.account}
                                </Text>
                                <AmountText value={a.amount} tone="out" size="caption" weight="bold" />
                            </View>
                        ))}
                    </View>
                </View>
            )}
        </Card>
    );
}

const styles = StyleSheet.create({
    cellsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    cell: {
        flex: 1,
        gap: 2,
    },
    cellLabel: {
        fontSize: 12,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.4,
    },
    movementRow: {
        flexDirection: 'row',
        gap: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
        paddingTop: 12,
    },
    movementCol: {
        flex: 1,
        gap: 6,
    },
    movementChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    movementDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    movementText: {
        flex: 1,
        fontSize: 12,
    },
});