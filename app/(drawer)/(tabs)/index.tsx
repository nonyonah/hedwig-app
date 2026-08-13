import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Image,
    RefreshControl,
    Platform,
    DeviceEventEmitter,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect } from 'expo-router';

import { useThemeColors } from '../../../theme/colors';
import { useAuth } from '../../../hooks/useAuth';
import { getUserGradient } from '../../../utils/gradientUtils';
import { fetchApiJson } from '../../../utils/apiBaseUrl';
import { parseAvatar } from '../../../utils/avatar';
import { useLedgerFeed, LedgerFeedEntry } from '../../../hooks/useLedgerFeed';
import { buildDayGroups } from '../../../utils/activityGroups';
import HeaderActionButtons from '../../../components/ui/HeaderActionButtons';
import { MoneyStrip } from '../../../components/timeline/MoneyStrip';
import { EventRow } from '../../../components/timeline/EventRow';
import { EventDetailSheet } from '../../../components/timeline/EventDetailSheet';
import { AiBriefCard } from '../../../components/timeline/AiBriefCard';
import { ActivityListSkeleton, MoneyStripSkeleton } from '../../../components/timeline/FeedSkeleton';
import { Card } from 'heroui-native/card';
import { Button } from 'heroui-native/button';
import { Inbox as InboxIcon, ChevronRight as ChevronRightIcon } from '../../../components/ui/AppIcon';

const Inbox = (props: any) => <InboxIcon {...props} />;
const ChevronRight = (props: any) => <ChevronRightIcon {...props} />;

const ACTIVITY_PREVIEW_LIMIT = 5;

const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
};

export default function TimelineScreen() {
    const themeColors = useThemeColors();
    const router = useRouter();
    const { user, getAccessToken, isReady } = useAuth();
    const { entries, summary, loading, refreshing, error, refetch } = useLedgerFeed('30d');

    const [userName, setUserName] = useState({ firstName: '', lastName: '' });
    const [profileIcon, setProfileIcon] = useState<{ emoji?: string; colorIndex?: number; imageUri?: string }>({});
    const [selectedEntry, setSelectedEntry] = useState<LedgerFeedEntry | null>(null);
    const eventDetailSheetRef = useRef<{ present: () => void } | null>(null);
    const [briefDismissed, setBriefDismissed] = useState(false);

    const emitTabBarScrollOffset = useCallback((offsetY: number) => {
        if (Platform.OS !== 'android') return;
        DeviceEventEmitter.emit('hedwig:tabbar-scroll', offsetY);
    }, []);

    useEffect(() => {
        return () => emitTabBarScrollOffset(0);
    }, [emitTabBarScrollOffset]);

    const fetchUserData = useCallback(async () => {
        if (!user) return;
        try {
            const t = await getAccessToken();
            const profileData = await fetchApiJson(
                '/api/users/profile',
                { headers: { 'Authorization': `Bearer ${t}` } },
            );
            if (profileData.success && profileData.data) {
                const userData = profileData.data.user || profileData.data;
                setUserName({ firstName: userData.firstName || '', lastName: userData.lastName || '' });
                const icon = parseAvatar(userData.avatar);
                if (icon.imageUri || icon.emoji) setProfileIcon(icon);
            }
        } catch {
            // profile is non-critical for the feed
        }
    }, [user, getAccessToken]);

    useEffect(() => {
        if (isReady && user) fetchUserData();
    }, [isReady, user, fetchUserData]);

    useFocusEffect(
        useCallback(() => {
            if (isReady && user) fetchUserData();
        }, [isReady, user, fetchUserData]),
    );

    const groups = useMemo(() => buildDayGroups(entries), [entries]);

    const hasMoreActivities = entries.length > ACTIVITY_PREVIEW_LIMIT;

    const previewGroups = useMemo(() => {
        let remaining = ACTIVITY_PREVIEW_LIMIT;
        const out = [];
        for (const group of groups) {
            if (remaining <= 0) break;
            const slice = group.items.slice(0, remaining);
            out.push({ ...group, items: slice });
            remaining -= slice.length;
        }
        return out;
    }, [groups]);

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
            <View style={[styles.header, { backgroundColor: themeColors.background }]}>
                <View style={styles.headerLeft}>
                    <View>
                        {profileIcon?.imageUri ? (
                            <Image source={{ uri: profileIcon.imageUri }} style={styles.avatar} />
                        ) : (
                            <LinearGradient
                                colors={getUserGradient(user?.id)}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.avatar}
                            >
                                <Text style={[styles.avatarLetter, { color: '#FFFFFF' }]}>
                                    {profileIcon?.emoji || userName.firstName?.[0] || 'U'}
                                </Text>
                            </LinearGradient>
                        )}
                    </View>
                    <Text
                        style={[styles.headerTitle, { color: themeColors.textPrimary }]}
                        numberOfLines={1}
                    >
                        {getGreeting()}
                        {userName.firstName ? `, ${userName.firstName}` : ''}
                    </Text>
                </View>
                <HeaderActionButtons style={styles.headerActions} />
            </View>

            <ScrollView
                style={styles.scrollView}
                showsVerticalScrollIndicator={false}
                bounces
                overScrollMode="always"
                contentInsetAdjustmentBehavior="automatic"
                onScroll={(event) => emitTabBarScrollOffset(event?.nativeEvent?.contentOffset?.y ?? 0)}
                scrollEventThrottle={16}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={refetch}
                        tintColor={themeColors.primary}
                    />
                }
                contentContainerStyle={[styles.scrollContent, { paddingBottom: 140 }]}
            >
                {loading ? (
                    <MoneyStripSkeleton />
                ) : (
                    <MoneyStrip summary={summary} />
                )}

                <AiBriefCard
                    visible={!briefDismissed && entries.length >= 5}
                    onDismiss={() => setBriefDismissed(true)}
                />

                {loading ? (
                    <View style={styles.feedSection}>
                        <Text style={[styles.feedLabel, { color: themeColors.textSecondary }]}>Activity</Text>
                        <ActivityListSkeleton rows={ACTIVITY_PREVIEW_LIMIT} />
                    </View>
                ) : error ? (
                    <View style={styles.centerState}>
                        <Inbox size={48} color={themeColors.textSecondary} strokeWidth={1.2} />
                        <Text style={[styles.emptyTitle, { color: themeColors.textPrimary }]}>
                            Could not load your timeline
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
                        <TouchableOpacity
                            style={[styles.retryButton, { backgroundColor: themeColors.primary }]}
                            onPress={() => router.push('/capture' as never)}
                            activeOpacity={0.85}
                        >
                            <Text style={styles.retryText}>Add your first entry</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <View style={styles.feedSection}>
                        <Text style={[styles.feedLabel, { color: themeColors.textSecondary }]}>Activity</Text>
                        <Card className="p-0 rounded-[20px]">
                            {previewGroups.flatMap((group, gi) =>
                                group.items.map((entry, idx) => {
                                    const isLastPreview = gi === previewGroups.length - 1 && idx === group.items.length - 1;
                                    return (
                                        <EventRow
                                            key={`${entry.referenceId}-${gi}-${idx}`}
                                            entry={entry}
                                            onPress={openEntry}
                                            last={isLastPreview}
                                        />
                                    );
                                }),
                            )}
                            <Button
                                variant="ghost"
                                size="md"
                                className="w-full h-[52px] justify-between px-3 rounded-none border-t"
                                style={{ borderTopColor: themeColors.border }}
                                onPress={() => router.push('/activity' as never)}
                            >
                                <Button.Label className="text-[14px]">
                                    View all{hasMoreActivities ? ` (${entries.length})` : ''}
                                </Button.Label>
                                <ChevronRight size={16} color={themeColors.textSecondary} />
                            </Button>
                        </Card>
                    </View>
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
        paddingHorizontal: 20,
        paddingBottom: 12,
        paddingTop: 8,
    },
    headerLeft: {
        flex: 1,
        minWidth: 0,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingRight: 12,
        overflow: 'hidden',
    },
    headerActions: { flexShrink: 0 },
    headerTitle: {
        flex: 1,
        minWidth: 0,
        flexShrink: 1,
        fontFamily: 'GoogleSansFlex_700Bold',
        fontSize: Platform.OS === 'android' ? 18 : 22,
    },
    avatar: { width: 40, height: 40, borderRadius: 20 },
    avatarLetter: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 16,
    },
    scrollView: { flex: 1, paddingHorizontal: 20 },
    scrollContent: { flexGrow: 1, paddingTop: 4 },
    feedSection: { marginTop: 22 },
    feedLabel: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 13,
        letterSpacing: 0.2,
        textTransform: 'uppercase',
        marginBottom: 10,
    },
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