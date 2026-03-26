import React, { useEffect, useMemo, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Platform,
    Dimensions,
    RefreshControl,
} from 'react-native';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { TrendingUp as TrendUp, TrendingDown as TrendDown, ArrowRight, Sparkles as Sparkle, ChevronLeft as CaretLeft } from '../../components/ui/AppIcon';
import Svg, { Circle, Polyline } from 'react-native-svg';
import { Colors, useThemeColors } from '../../theme/colors';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Insight, InsightsRange, useInsights } from '../../hooks/useInsights';
import { TargetGoalModal } from '../../components/TargetGoalModal';
import { useAnalyticsScreen } from '../../hooks/useAnalyticsScreen';
import IOSGlassIconButton from '../../components/ui/IOSGlassIconButton';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 54) / 2;
const isAndroid = Platform.OS === 'android';

interface RingChartProps {
    value: number;
    total: number;
    size?: number;
    strokeWidth?: number;
    color?: string;
}

const RingChart: React.FC<RingChartProps> = ({ value, total, size = 140, strokeWidth = 12, color = Colors.primary }) => {
    const themeColors = useThemeColors();
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const progress = total > 0 ? Math.min(value / total, 1) : 0;
    const strokeDashoffset = circumference * (1 - progress);

    return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
                <Circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke={themeColors.border}
                    strokeWidth={strokeWidth}
                    fill="none"
                />
                <Circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke={color}
                    strokeWidth={strokeWidth}
                    fill="none"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                />
            </Svg>
        </View>
    );
};

const Sparkline: React.FC<{ values: number[]; color: string }> = ({ values, color }) => {
    const w = 110;
    const h = 34;
    if (values.length < 2) {
        return <View style={{ width: w, height: h }} />;
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const points = values
        .map((v, i) => {
            const x = (i / (values.length - 1)) * w;
            const y = h - ((v - min) / range) * h;
            return `${x},${y}`;
        })
        .join(' ');

    return (
        <Svg width={w} height={h}>
            <Polyline points={points} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
    );
};

interface StatCardProps {
    label: string;
    value: string;
    comparison?: string;
    trend?: 'up' | 'down' | 'neutral';
    onPress?: () => void;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, comparison, trend, onPress }) => {
    const themeColors = useThemeColors();

    const getTrendColor = () => {
        if (trend === 'up') return Colors.success;
        if (trend === 'down') return Colors.error;
        return themeColors.textSecondary;
    };

    return (
        <TouchableOpacity
            activeOpacity={0.85}
            onPress={onPress}
            style={[styles.statCard, { backgroundColor: themeColors.surface }]}
        >
            <Text style={[styles.statLabel, { color: themeColors.textSecondary }]}>{label}</Text>
            <Text style={[styles.statValue, { color: themeColors.textPrimary }]} numberOfLines={1}>{value}</Text>
            {comparison ? (
                <View style={styles.trendRow}>
                    {trend === 'up' ? <TrendUp size={14} color={Colors.success} strokeWidth={3} /> : null}
                    {trend === 'down' ? <TrendDown size={14} color={Colors.error} strokeWidth={3} /> : null}
                    <Text style={[styles.trendText, { color: getTrendColor() }]} numberOfLines={1}>
                        {comparison}
                    </Text>
                </View>
            ) : null}
        </TouchableOpacity>
    );
};

const SkeletonCard = () => {
    const themeColors = useThemeColors();
    return (
        <View style={[styles.statCard, { backgroundColor: themeColors.surface }]}>
            <View style={[styles.skeletonLine, { width: '55%', backgroundColor: themeColors.border }]} />
            <View style={[styles.skeletonLine, { width: '78%', height: 18, backgroundColor: themeColors.border, marginTop: 10 }]} />
            <View style={[styles.skeletonLine, { width: '70%', backgroundColor: themeColors.border, marginTop: 12 }]} />
        </View>
    );
};

const rangeLabels: Record<InsightsRange, string> = {
    '7d': '7D',
    '30d': '30D',
    '90d': '90D',
    '1y': '1 Year',
};

const formatTimeAgo = (iso: string | null): string => {
    if (!iso) return 'Not updated';
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.max(0, Math.floor(diffMs / 60000));
    if (mins < 1) return 'Updated just now';
    if (mins < 60) return `Updated ${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `Updated ${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `Updated ${days}d ago`;
};

export default function InsightsScreen() {
    const router = useRouter();
    const themeColors = useThemeColors();
    const { getAccessToken, user } = useAuth();
    const {
        insights,
        summary,
        series,
        range,
        setRange,
        lastUpdatedAt,
        loading,
        refreshing,
        error,
        refetch,
    } = useInsights('30d');

    const targetGoalSheetRef = useRef<TrueSheet>(null);
    const [monthlyTarget, setMonthlyTarget] = React.useState(10000);

    useAnalyticsScreen('Insights');

    useFocusEffect(
        React.useCallback(() => {
            refetch();
        }, [refetch])
    );

    useEffect(() => {
        const loadTarget = async () => {
            try {
                if (!user) return;
                const token = await getAccessToken();
                if (!token) return;
                const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
                const response = await fetch(`${apiUrl}/api/users/profile`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                const result = await response.json();
                if (response.ok && result?.success) {
                    const userData = result?.data?.user || result?.data;
                    if (typeof userData?.monthlyTarget === 'number' && userData.monthlyTarget > 0) {
                        setMonthlyTarget(userData.monthlyTarget);
                    }
                }
            } catch {
                // Non-critical; fallback target remains.
            }
        };
        loadTarget();
    }, [user, getAccessToken]);

    const monthlyEarnings = summary?.monthlyEarnings || 0;
    const remainingAmount = Math.max(0, monthlyTarget - monthlyEarnings);
    const hasExceededTarget = monthlyEarnings > monthlyTarget;
    const earningsDeltaPct = summary?.earningsDeltaPct || 0;
    const earningsTrend: 'up' | 'down' | 'neutral' = earningsDeltaPct > 0 ? 'up' : earningsDeltaPct < 0 ? 'down' : 'neutral';
    const sparkValues = series.earnings.map((p) => p.value);

    const stats = useMemo(() => {
        if (!summary) return [];
        return [
            {
                label: 'Monthly Earnings',
                value: `$${summary.monthlyEarnings.toLocaleString()}`,
                comparison: `${earningsDeltaPct >= 0 ? '+' : ''}${earningsDeltaPct.toFixed(0)}% vs previous`,
                trend: earningsTrend,
                route: '/transactions',
            },
            {
                label: 'Pending Invoices',
                value: String(summary.pendingInvoicesCount),
                comparison: `$${summary.pendingInvoicesTotal.toLocaleString()} outstanding`,
                trend: summary.pendingInvoicesCount > 0 ? ('down' as const) : ('neutral' as const),
                route: '/invoices',
            },
            {
                label: 'Active Clients',
                value: String(summary.clientsCount),
                comparison: summary.topClient?.name ? `Top: ${summary.topClient.name}` : 'No top client yet',
                trend: summary.clientsCount > 0 ? ('up' as const) : ('neutral' as const),
                route: '/clients',
            },
            {
                label: 'Payment Rate',
                value: `${summary.paymentRate}%`,
                comparison: `${summary.paidDocuments}/${summary.totalDocuments} paid`,
                trend: summary.paymentRate >= 80 ? ('up' as const) : summary.paymentRate >= 50 ? ('neutral' as const) : ('down' as const),
                route: '/invoices',
            },
            {
                label: 'Payment Links',
                value: String(summary.paymentLinksCount),
                comparison: 'Total created',
                trend: 'neutral' as const,
                route: '/payment-links',
            },
            {
                label: 'Projects',
                value: String(summary.activeProjects),
                comparison: 'In progress',
                trend: summary.activeProjects > 0 ? ('up' as const) : ('neutral' as const),
                route: '/projects',
            },
        ];
    }, [summary, earningsDeltaPct, earningsTrend]);

    const isEmpty = !loading && !error && (!summary || (summary.totalDocuments === 0 && summary.transactionsCount === 0 && summary.clientsCount === 0));

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
            <View style={[styles.header, { backgroundColor: themeColors.background }]}>
                <View style={styles.headerTop}>
                    <IOSGlassIconButton
                        onPress={() => router.back()}
                        systemImage="chevron.left"
                        containerStyle={styles.backButton}
                        circleStyle={[styles.backButtonCircle, { backgroundColor: themeColors.surface }]}
                        icon={<CaretLeft size={24} color={themeColors.textPrimary} strokeWidth={3} />}
                    />
                    <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]}>Insights</Text>
                    <View style={styles.headerRightPlaceholder} />
                </View>
            </View>

            <ScrollView
                style={styles.content}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={refetch} tintColor={Colors.primary} />
                }
            >
                <View style={styles.filtersRow}>
                    {(['7d', '30d', '90d', '1y'] as InsightsRange[]).map((key) => {
                        const selected = range === key;
                        return (
                            <TouchableOpacity
                                key={key}
                                style={[
                                    styles.filterChip,
                                    {
                                        backgroundColor: selected ? Colors.primary : themeColors.surface,
                                    },
                                ]}
                                onPress={() => setRange(key)}
                            >
                                <Text style={[styles.filterChipText, { color: selected ? '#fff' : themeColors.textSecondary }]}>
                                    {rangeLabels[key]}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                <View style={styles.metaRow}>
                    <Text style={[styles.metaText, { color: themeColors.textSecondary }]}>
                        {formatTimeAgo(lastUpdatedAt)}
                    </Text>
                </View>

                {error ? (
                    <View style={[styles.emptyState, { backgroundColor: themeColors.surface }]}>
                        <Text style={[styles.emptyTitle, { color: themeColors.textPrimary }]}>Could not load insights</Text>
                        <Text style={[styles.emptySubtitle, { color: themeColors.textSecondary }]}>{error}</Text>
                        <TouchableOpacity style={styles.retryButton} onPress={refetch}>
                            <Text style={styles.retryText}>Try again</Text>
                        </TouchableOpacity>
                    </View>
                ) : null}

                {!error ? (
                    <View style={[styles.ringSection, { backgroundColor: themeColors.surface }]}>
                        <View style={styles.ringSectionHeader}>
                            <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>Monthly Progress</Text>
                            <Sparkline values={sparkValues} color={Colors.primary} />
                        </View>

                        <View style={styles.ringContainer}>
                            <View style={styles.ringStats}>
                                <Text style={[styles.ringStatValue, { color: hasExceededTarget ? Colors.success : themeColors.textSecondary }]}>
                                    {hasExceededTarget ? `+$${(monthlyEarnings - monthlyTarget).toLocaleString()}` : `$${remainingAmount.toLocaleString()}`}
                                </Text>
                                <Text style={[styles.ringStatLabel, { color: themeColors.textTertiary }]}>
                                    {hasExceededTarget ? 'Exceeded' : 'Remaining'}
                                </Text>
                            </View>

                            <View style={styles.ringCenter}>
                                <RingChart value={monthlyEarnings} total={monthlyTarget} size={140} color={Colors.primary} />
                                <View style={styles.ringCenterText}>
                                    <Text style={[styles.ringMainValue, { color: themeColors.textPrimary }]}>${monthlyEarnings.toLocaleString()}</Text>
                                    <Text style={[styles.ringMainLabel, { color: themeColors.textSecondary }]}>Earned</Text>
                                </View>
                            </View>

                            <View style={styles.ringStats}>
                                <Text style={[styles.ringStatValue, { color: themeColors.textSecondary }]}>${monthlyTarget.toLocaleString()}</Text>
                                <Text style={[styles.ringStatLabel, { color: themeColors.textTertiary }]}>Target</Text>
                            </View>
                        </View>

                        <TouchableOpacity
                            onPress={() => targetGoalSheetRef.current?.present()}
                            style={[
                                styles.trendBadge,
                                { backgroundColor: (earningsTrend === 'up' ? Colors.success : earningsTrend === 'down' ? Colors.error : themeColors.textSecondary) + '14' },
                            ]}
                        >
                            {earningsTrend === 'up' ? <TrendUp size={14} color={Colors.success} strokeWidth={3} /> : null}
                            {earningsTrend === 'down' ? <TrendDown size={14} color={Colors.error} strokeWidth={3} /> : null}
                            <Text
                                style={[
                                    styles.trendBadgeText,
                                    {
                                        color: earningsTrend === 'up'
                                            ? Colors.success
                                            : earningsTrend === 'down'
                                                ? Colors.error
                                                : themeColors.textSecondary,
                                    },
                                ]}
                            >
                                {`${earningsDeltaPct >= 0 ? '+' : ''}${earningsDeltaPct.toFixed(0)}% vs previous period`}
                            </Text>
                        </TouchableOpacity>
                    </View>
                ) : null}

                <View style={styles.sectionHeader}>
                    <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>Overview</Text>
                </View>

                <View style={styles.statsGrid}>
                    {loading
                        ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={`skeleton-${i}`} />)
                        : stats.map((stat, index) => (
                            <StatCard
                                key={index}
                                label={stat.label}
                                value={stat.value}
                                comparison={stat.comparison}
                                trend={stat.trend}
                                onPress={() => stat.route && router.push(stat.route as any)}
                            />
                        ))}
                </View>

                <View style={styles.sectionHeader}>
                    <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>AI Insights</Text>
                </View>

                {isEmpty ? (
                    <View style={[styles.emptyState, { backgroundColor: themeColors.surface }]}>
                        <Text style={[styles.emptyTitle, { color: themeColors.textPrimary }]}>No activity yet</Text>
                        <Text style={[styles.emptySubtitle, { color: themeColors.textSecondary }]}>
                            Create an invoice, payment link, or project to start receiving tailored insights.
                        </Text>
                    </View>
                ) : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.insightsScroll}>
                        {insights.map((insight: Insight) => (
                            <TouchableOpacity
                                key={insight.id}
                                style={[styles.insightCard, { backgroundColor: themeColors.surface }]}
                                onPress={() => insight.actionRoute && router.push(insight.actionRoute as any)}
                                activeOpacity={0.85}
                            >
                                <Text style={[styles.insightTitle, { color: themeColors.textPrimary }]}>{insight.title}</Text>
                                <Text style={[styles.insightSubtitle, { color: themeColors.textSecondary }]} numberOfLines={3}>
                                    {insight.description}
                                </Text>
                                {insight.actionLabel ? (
                                    <View style={styles.insightAction}>
                                        <Text style={[styles.insightActionText, { color: Colors.primary }]}>
                                            {insight.actionLabel}
                                        </Text>
                                        <ArrowRight size={12} color={Colors.primary} strokeWidth={3} />
                                    </View>
                                ) : null}
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                )}
            </ScrollView>

            <TargetGoalModal
                ref={targetGoalSheetRef}
                currentTarget={monthlyTarget}
                onClose={() => {}}
                onSave={(newTarget) => setMonthlyTarget(newTarget)}
                user={user}
                getAccessToken={getAccessToken}
            />

        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    headerTop: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: isAndroid ? 10 : 12,
        height: isAndroid ? 56 : 60,
    },
    header: { backgroundColor: Colors.background },
    backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center', zIndex: 10 },
    backButtonCircle: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
    headerRightPlaceholder: { width: 40 },
    headerTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: isAndroid ? 19 : 21,
        textAlign: 'center',
        color: Colors.textPrimary,
        flex: 1,
    },
    content: { flex: 1 },
    scrollContent: { paddingHorizontal: 20, paddingBottom: isAndroid ? 34 : 40 },
    filtersRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
    filterChip: {
        borderRadius: 20,
        paddingHorizontal: 20,
        paddingVertical: 8,
    },
    filterChipText: { fontSize: 14, fontFamily: 'GoogleSansFlex_600SemiBold' },
    metaRow: { marginBottom: 12 },
    metaText: { fontSize: isAndroid ? 11 : 12, fontFamily: 'GoogleSansFlex_400Regular' },
    ringSection: {
        borderRadius: 16,
        padding: isAndroid ? 16 : 20,
        marginBottom: 18,
    },
    ringSectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: isAndroid ? 14 : 18,
    },
    ringContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: isAndroid ? 12 : 16,
    },
    ringStats: { alignItems: 'center', flex: 1 },
    ringStatValue: { fontSize: isAndroid ? 16 : 18, fontFamily: 'GoogleSansFlex_600SemiBold' },
    ringStatLabel: { fontSize: isAndroid ? 11 : 12, fontFamily: 'GoogleSansFlex_400Regular', marginTop: 3 },
    ringCenter: { alignItems: 'center', justifyContent: 'center' },
    ringCenterText: { position: 'absolute', alignItems: 'center' },
    ringMainValue: { fontSize: isAndroid ? 18 : 20, fontFamily: 'GoogleSansFlex_600SemiBold' },
    ringMainLabel: { fontSize: isAndroid ? 11 : 12, fontFamily: 'GoogleSansFlex_400Regular' },
    trendBadge: {
        marginTop: 0,
        alignSelf: 'center',
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: isAndroid ? 7 : 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    trendBadgeText: { fontSize: isAndroid ? 11 : 12, fontFamily: 'GoogleSansFlex_600SemiBold' },
    sectionHeader: { marginBottom: 9 },
    sectionTitle: { fontSize: isAndroid ? 17 : 18, fontFamily: 'GoogleSansFlex_600SemiBold' },
    statsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 11,
        marginBottom: 22,
    },
    statCard: {
        width: CARD_WIDTH,
        borderRadius: 14,
        padding: isAndroid ? 12 : 14,
        minHeight: isAndroid ? 108 : 118,
        justifyContent: 'space-between',
    },
    statLabel: { fontSize: isAndroid ? 11 : 12, fontFamily: 'GoogleSansFlex_500Medium' },
    statValue: { fontSize: isAndroid ? 19 : 21, fontFamily: 'GoogleSansFlex_600SemiBold', marginTop: 2 },
    trendRow: {
        marginTop: 6,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    trendText: {
        fontSize: isAndroid ? 11 : 12,
        fontFamily: 'GoogleSansFlex_500Medium',
        flexShrink: 1,
    },
    skeletonLine: { height: 10, borderRadius: 6 },
    insightsScroll: { gap: 10, paddingBottom: 6 },
    insightCard: {
        width: width - (isAndroid ? 78 : 72),
        borderRadius: 14,
        padding: isAndroid ? 14 : 16,
        minHeight: isAndroid ? 126 : 134,
        justifyContent: 'space-between',
    },
    insightTitle: { fontSize: isAndroid ? 15 : 16, fontFamily: 'GoogleSansFlex_600SemiBold', marginBottom: 6 },
    insightSubtitle: { fontSize: isAndroid ? 13 : 14, fontFamily: 'GoogleSansFlex_400Regular', lineHeight: isAndroid ? 18 : 20 },
    insightAction: {
        marginTop: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    insightActionText: {
        fontSize: isAndroid ? 12 : 13,
        fontFamily: 'GoogleSansFlex_600SemiBold',
    },
    emptyState: {
        borderRadius: 14,
        paddingHorizontal: 16,
        paddingVertical: isAndroid ? 18 : 20,
        marginBottom: 18,
    },
    emptyTitle: {
        fontSize: isAndroid ? 16 : 17,
        fontFamily: 'GoogleSansFlex_600SemiBold',
        marginBottom: 8,
    },
    emptySubtitle: {
        fontSize: isAndroid ? 13 : 14,
        lineHeight: isAndroid ? 19 : 20,
        fontFamily: 'GoogleSansFlex_400Regular',
    },
    retryButton: {
        marginTop: 12,
        backgroundColor: Colors.primary,
        paddingVertical: isAndroid ? 9 : 10,
        borderRadius: 999,
        alignItems: 'center',
    },
    retryText: {
        color: '#fff',
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: isAndroid ? 13 : 14,
    },
});
