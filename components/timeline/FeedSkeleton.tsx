import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Card } from 'heroui-native/card';
import { Skeleton } from 'heroui-native/skeleton';

/**
 * Loading placeholders for the Timeline/Activity feed. Mirror the real layout:
 * a money strip card on top and an activity card with fixed-height rows
 * (60px, 38px icon, text block + amount bar per the design reference).
 */

export function MoneyStripSkeleton() {
    return (
        <Card className="p-[18px] gap-[14px]">
            <View style={styles.cellsRow}>
                {[0, 1, 2].map((i) => (
                    <View key={i} style={styles.cell}>
                        <Skeleton className="h-[12px] w-[36px] rounded-md" />
                        <Skeleton className="h-[20px] w-[72px] rounded-md" />
                    </View>
                ))}
            </View>
            <View style={styles.divider} />
            {[0, 1].map((i) => (
                <View key={i} style={styles.movementChip}>
                    <Skeleton className="h-[8px] w-[8px] rounded-full" />
                    <Skeleton className="h-[12px] w-[110px] rounded-md" />
                    <Skeleton className="h-[12px] w-[48px] rounded-md" />
                </View>
            ))}
        </Card>
    );
}

export function ActivityListSkeleton({ rows = 5 }: { rows?: number }) {
    return (
        <Card className="p-0 rounded-[20px]">
            {Array.from({ length: rows }).map((_, i) => (
                <View key={i} style={[styles.row, i < rows - 1 && styles.rowDivider]}>
                    <Skeleton className="h-[38px] w-[38px] rounded-full" />
                    <View style={styles.info}>
                        <Skeleton className="h-[14px] w-[55%] rounded-md" />
                        <Skeleton className="h-[12px] w-[38%] rounded-md" />
                    </View>
                    <Skeleton className="h-[15px] w-[64px] rounded-md" />
                </View>
            ))}
        </Card>
    );
}

export function FeedSkeleton({ rows = 5 }: { rows?: number }) {
    return (
        <View style={styles.container}>
            <MoneyStripSkeleton />
            <View style={styles.listWrap}>
                <ActivityListSkeleton rows={rows} />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: '100%',
    },
    listWrap: {
        marginTop: 16,
    },
    cellsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 12,
    },
    cell: {
        flex: 1,
        gap: 6,
    },
    divider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: 'rgba(28, 26, 20, 0.07)',
    },
    movementChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        height: 60,
        paddingHorizontal: 14,
    },
    rowDivider: {
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: 'rgba(28, 26, 20, 0.07)',
    },
    info: {
        flex: 1,
        gap: 8,
        justifyContent: 'center',
    },
});
