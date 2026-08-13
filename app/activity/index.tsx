import React, { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useThemeColors } from '../../theme/colors';
import { useLedgerFeed, LedgerFeedEntry } from '../../hooks/useLedgerFeed';
import { buildDayGroups } from '../../utils/activityGroups';
import { MoneyStrip } from '../../components/timeline/MoneyStrip';
import { EventRow } from '../../components/timeline/EventRow';
import { EventDetailSheet } from '../../components/timeline/EventDetailSheet';
import { FeedSkeleton } from '../../components/timeline/FeedSkeleton';
import { Card } from 'heroui-native/card';
import IOSGlassIconButton from '../../components/ui/IOSGlassIconButton';
import { ChevronLeft as CaretLeft, Inbox as InboxIcon } from '../../components/ui/AppIcon';

const Inbox = (props: any) => <InboxIcon {...props} />;

export default function ActivityScreen() {
    const router = useRouter();
    const themeColors = useThemeColors();
    const { entries, summary, loading, refreshing, error, refetch } = useLedgerFeed('30d');

    const [selectedEntry, setSelectedEntry] = useState<LedgerFeedEntry | null>(null);
    const eventDetailSheetRef = useRef<{ present: () => void } | null>(null);

    const groups = buildDayGroups(entries);

    const openEntry = useCallback((entry: LedgerFeedEntry) => {
        setSelectedEntry(entry);
        requestAnimationFrame(() => eventDetailSheetRef.current?.present());
    }, []);

    return (
        <SafeAreaView
            collapsable={false}
            edges={['top']}
            style={[styles.container, { backgroundColor: themeColors.background }]}
        >
            <View style={styles.header}>
                <IOSGlassIconButton
                    onPress={() => router.back()}
                    systemImage="chevron.left"
                    containerStyle={styles.backButton}
                    circleStyle={[styles.backButtonCircle, { backgroundColor: themeColors.surface }]}
                    icon={<CaretLeft size={20} color={themeColors.textPrimary} strokeWidth={3} />}
                />
                <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]}>Activity</Text>
                <View style={styles.headerSpacer} />
            </View>

            <ScrollView
                style={styles.scrollView}
                showsVerticalScrollIndicator={false}
                bounces
                overScrollMode="always"
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={refetch}
                        tintColor={themeColors.primary}
                    />
                }
                contentContainerStyle={styles.scrollContent}
            >
                {!loading && <MoneyStrip summary={summary} />}

                {loading ? (
                    <FeedSkeleton />
                ) : error ? (
                    <View style={styles.centerState}>
                        <Inbox size={48} color={themeColors.textSecondary} strokeWidth={1.2} />
                        <Text style={[styles.emptyTitle, { color: themeColors.textPrimary }]}>
                            Could not load your activity
                        </Text>
                        <Text style={[styles.centerHint, { color: themeColors.textSecondary }]}>
                            {error}
                        </Text>
                        <TouchableOpacity
                            style={[styles.retryButton, { backgroundColor: themeColors.primary }]}
                            onPress={refetch}
                            activeOpacity={0.85}
                        >
                            <Text style={styles.retryText}>Try again</Text>
                        </TouchableOpacity>
                    </View>
                ) : groups.length === 0 ? (
                    <View style={styles.centerState}>
                        <Inbox size={56} color={themeColors.textSecondary} strokeWidth={1.1} />
                        <Text style={[styles.emptyTitle, { color: themeColors.textPrimary }]}>
                            No activity yet
                        </Text>
                        <Text style={[styles.centerHint, { color: themeColors.textSecondary }]}>
                            Captured receipts, invoices, and transfers land here.
                        </Text>
                    </View>
                ) : (
                    <Card className="p-0 mt-4 rounded-[20px]">
                        {groups.flatMap((group, gi) =>
                            group.items.map((entry, idx) => {
                                const isLast = gi === groups.length - 1 && idx === group.items.length - 1;
                                return (
                                    <EventRow
                                        key={`${entry.referenceId}-${gi}-${idx}`}
                                        entry={entry}
                                        onPress={openEntry}
                                        last={isLast}
                                    />
                                );
                            }),
                        )}
                    </Card>
                )}
            </ScrollView>

            <EventDetailSheet
                ref={eventDetailSheetRef as any}
                entry={selectedEntry}
                onDismiss={() => setSelectedEntry(null)}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 12,
    },
    backButton: { flexShrink: 0 },
    backButtonCircle: { width: 40, height: 40, borderRadius: 20 },
    headerTitle: {
        fontFamily: 'GoogleSansFlex_700Bold',
        fontSize: Platform.OS === 'android' ? 18 : 22,
    },
    headerSpacer: { width: 40 },
    scrollView: { flex: 1, paddingHorizontal: 20 },
    scrollContent: { flexGrow: 1, paddingTop: 4, paddingBottom: 60 },
    centerState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 56,
        paddingHorizontal: 32,
        gap: 8,
    },
    emptyTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 18,
        marginTop: 6,
        textAlign: 'center',
    },
    centerHint: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 14,
        textAlign: 'center',
        lineHeight: 20,
    },
    retryButton: {
        borderRadius: 14,
        paddingHorizontal: 20,
        paddingVertical: 12,
        marginTop: 10,
    },
    retryText: {
        color: '#FFFFFF',
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 15,
    },
});
