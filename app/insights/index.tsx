import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, Platform, Dimensions, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { List, Gear, TrendUp, TrendDown, ArrowRight, Sparkle, CaretLeft } from 'phosphor-react-native';
import Svg, { Circle } from 'react-native-svg';
import { Colors, useThemeColors } from '../../theme/colors';
import { Typography } from '../../styles/typography';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useInsights } from '../../hooks/useInsights';
import { Sidebar } from '../../components/Sidebar';
import { ProfileModal } from '../../components/ProfileModal';
import { TargetGoalModal } from '../../components/TargetGoalModal';
import { LinearGradient } from 'expo-linear-gradient';
import { useAnalyticsScreen } from '../../hooks/useAnalyticsScreen';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 52) / 2; // 2 columns with gaps

// Ring Chart Component
interface RingChartProps {
    value: number;
    total: number;
    size?: number;
    strokeWidth?: number;
    color?: string;
}

const RingChart: React.FC<RingChartProps> = ({
    value,
    total,
    size = 140,
    strokeWidth = 12,
    color = Colors.primary
}) => {
    const themeColors = useThemeColors();
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const progress = Math.min(value / total, 1);
    const strokeDashoffset = circumference * (1 - progress);

    return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
                {/* Background circle */}
                <Circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke={themeColors.border}
                    strokeWidth={strokeWidth}
                    fill="none"
                />
                {/* Progress circle */}
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

// Stat Card Component (no borders, modal-style)
interface StatCardProps {
    label: string;
    value: string;
    comparison?: string;
    trend?: 'up' | 'down' | 'neutral';
}

const StatCard: React.FC<StatCardProps> = ({ label, value, comparison, trend }) => {
    const themeColors = useThemeColors();

    const getTrendColor = () => {
        if (trend === 'up') return Colors.success;
        if (trend === 'down') return Colors.error;
        return themeColors.textSecondary;
    };

    const getTrendIcon = () => {
        if (!trend || trend === 'neutral') return null;
        const color = getTrendColor();
        return trend === 'up'
            ? <TrendUp size={14} color={color} weight="bold" />
            : <TrendDown size={14} color={color} weight="bold" />;
    };

    return (
        <View style={[styles.statCard, { backgroundColor: themeColors.surface }]}>
            <Text style={[styles.statLabel, { color: themeColors.textSecondary }]}>{label}</Text>
            <Text style={[styles.statValue, { color: themeColors.textPrimary }]}>{value}</Text>
            {comparison && (
                <View style={styles.trendRow}>
                    {getTrendIcon()}
                    <Text style={[styles.trendText, { color: getTrendColor() }]}>
                        {comparison}
                    </Text>
                </View>
            )}
        </View>
    );
};

export default function InsightsScreen() {
    const router = useRouter();
    const themeColors = useThemeColors();
    const insets = useSafeAreaInsets();
    const { insights, loading } = useInsights();

    // Track page view
    useAnalyticsScreen('Insights');

    // Extract data from insights
    const earningsInsight = insights.find(i => i.type === 'earnings');
    const invoiceInsight = insights.find(i => i.type === 'invoice');
    const clientInsight = insights.find(i => i.type === 'client');

    // Calculate earnings values from insight data
    const monthlyEarnings = earningsInsight?.value ? parseInt(earningsInsight.value.replace(/[$,]/g, '')) : 0;
    const [monthlyTarget, setMonthlyTarget] = useState(10000);

    // Calculate the remaining amount (don't go negative)
    const remainingAmount = Math.max(0, monthlyTarget - monthlyEarnings);
    const hasExceededTarget = monthlyEarnings > monthlyTarget;

    // Get trend info from the earnings insight
    const earningsTrend = earningsInsight?.trend || 'neutral';

    // Target goal modal state
    const [isTargetModalVisible, setIsTargetModalVisible] = useState(false);

    // Profile and Sidebar state
    const { getAccessToken, user } = useAuth();
    // Profile state removed

    // Stats data from backend
    const [statsData, setStatsData] = useState({
        clientsCount: 0,
        projectsCount: 0,
        paymentLinksCount: 0,
        topClient: null as { name: string, totalEarnings: number } | null,
        pendingInvoicesCount: 0,
        pendingInvoicesTotal: 0,
        paymentRate: 0,
        totalDocuments: 0,
        paidDocuments: 0,
    });

    useEffect(() => {
        // Fetch user data removed as profile modal is removed
        const fetchUserData = async () => {
            if (!user) return;
            try {
                const token = await getAccessToken();
                const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

                const profileResponse = await fetch(`${apiUrl}/api/users/profile`, {
                    headers: { 'Authorization': `Bearer ${token}` },
                });
                const profileData = await profileResponse.json();

                if (profileData.success && profileData.data) {
                    const userData = profileData.data.user || profileData.data;
                    // setUserName({ // Removed as profile modal is removed
                    //     firstName: userData.firstName || '',
                    //     lastName: userData.lastName || ''
                    // });

                    // if (userData.avatar) { // Removed as profile modal is removed
                    //     try {
                    //         if (userData.avatar.trim().startsWith('{')) {
                    //             const parsed = JSON.parse(userData.avatar);
                    //             setProfileIcon(parsed);
                    //         } else {
                    //             setProfileIcon({ type: 'image', imageUri: userData.avatar });
                    //         }
                    //     } catch (e) {
                    //         setProfileIcon({ type: 'image', imageUri: userData.avatar });
                    //     }
                    // }

                    // setWalletAddresses({ // Removed as profile modal is removed
                    //     evm: userData.ethereumWalletAddress,
                    //     solana: userData.solanaWalletAddress
                    // });

                    // Load monthly target from backend
                    if (userData.monthlyTarget) {
                        setMonthlyTarget(userData.monthlyTarget);
                    }
                }

                const conversationsResponse = await fetch(`${apiUrl}/api/chat/conversations`, {
                    headers: { 'Authorization': `Bearer ${token}` },
                });
                if (conversationsResponse.ok) {
                    const conversationsData = await conversationsResponse.json();
                    if (conversationsData.success && conversationsData.data) {
                        // setConversations(conversationsData.data.slice(0, 10)); // Removed as sidebar state is removed
                    }
                }

                // Fetch clients for stats
                const clientsResponse = await fetch(`${apiUrl}/api/clients`, {
                    headers: { 'Authorization': `Bearer ${token}` },
                });
                let clientsCount = 0;
                let topClient = null;
                if (clientsResponse.ok) {
                    const clientsData = await clientsResponse.json();
                    if (clientsData.success && clientsData.data?.clients) {
                        const clients = clientsData.data.clients;
                        clientsCount = clients.length;
                        // Find top client by totalEarnings
                        if (clients.length > 0) {
                            const sorted = [...clients].sort((a: any, b: any) => (b.totalEarnings || 0) - (a.totalEarnings || 0));
                            if (sorted[0]?.totalEarnings > 0) {
                                topClient = { name: sorted[0].name, totalEarnings: sorted[0].totalEarnings };
                            }
                        }
                    }
                }

                // Fetch projects for stats
                const projectsResponse = await fetch(`${apiUrl}/api/projects`, {
                    headers: { 'Authorization': `Bearer ${token}` },
                });
                let projectsCount = 0;
                if (projectsResponse.ok) {
                    const projectsData = await projectsResponse.json();
                    if (projectsData.success && projectsData.data?.projects) {
                        // Only count active/ongoing projects, not completed ones
                        const activeProjects = projectsData.data.projects.filter((p: any) =>
                            p.status === 'ongoing' || p.status === 'active' || p.status === 'on_hold'
                        );
                        projectsCount = activeProjects.length;
                    }
                }

                // Fetch documents for payment links count and payment rate
                const [invoicesRes, linksRes] = await Promise.all([
                    fetch(`${apiUrl}/api/documents?type=INVOICE`, {
                        headers: { 'Authorization': `Bearer ${token}` },
                    }),
                    fetch(`${apiUrl}/api/documents?type=PAYMENT_LINK`, {
                        headers: { 'Authorization': `Bearer ${token}` },
                    }),
                ]);

                let paymentLinksCount = 0;
                let pendingInvoicesCount = 0;
                let pendingInvoicesTotal = 0;
                let paidDocuments = 0;
                let totalDocuments = 0;

                if (linksRes.ok) {
                    const linksData = await linksRes.json();
                    if (linksData.success && linksData.data?.documents) {
                        paymentLinksCount = linksData.data.documents.length;
                        totalDocuments += linksData.data.documents.length;
                        paidDocuments += linksData.data.documents.filter((d: any) => d.status === 'PAID').length;
                    }
                }

                if (invoicesRes.ok) {
                    const invoicesData = await invoicesRes.json();
                    if (invoicesData.success && invoicesData.data?.documents) {
                        const invoices = invoicesData.data.documents;
                        totalDocuments += invoices.length;
                        paidDocuments += invoices.filter((d: any) => d.status === 'PAID').length;

                        // Calculate pending invoices
                        const pending = invoices.filter((d: any) =>
                            d.status === 'SENT' || d.status === 'VIEWED' || d.status === 'PENDING' || d.status === 'DRAFT'
                        );
                        pendingInvoicesCount = pending.length;
                        pendingInvoicesTotal = pending.reduce((sum: number, doc: any) => {
                            const amount = typeof doc.amount === 'number' ? doc.amount : parseFloat(String(doc.amount).replace(/[^0-9.]/g, '')) || 0;
                            return sum + amount;
                        }, 0);
                    }
                }

                const paymentRate = totalDocuments > 0 ? Math.round((paidDocuments / totalDocuments) * 100) : 0;

                setStatsData({
                    clientsCount,
                    projectsCount,
                    paymentLinksCount,
                    topClient,
                    pendingInvoicesCount,
                    pendingInvoicesTotal,
                    paymentRate,
                    totalDocuments,
                    paidDocuments,
                });

            } catch (error) {
                console.error('Failed to fetch user data:', error);
            }
        };
        fetchUserData();
    }, [user]);

    // Build stats from real backend data
    const stats = [
        {
            label: 'Monthly Earnings',
            value: earningsInsight?.value || '$0',
            comparison: 'vs last month',
            trend: earningsInsight?.trend || 'neutral' as const
        },
        {
            label: 'Pending Invoices',
            value: String(statsData.pendingInvoicesCount),
            comparison: statsData.pendingInvoicesTotal > 0 ? `$${statsData.pendingInvoicesTotal.toLocaleString()} total` : '$0 total',
            trend: statsData.pendingInvoicesCount > 0 ? 'down' as const : 'neutral' as const
        },
        {
            label: 'Active Clients',
            value: String(statsData.clientsCount),
            comparison: statsData.topClient ? `Top: ${statsData.topClient.name}` : '',
            trend: statsData.clientsCount > 0 ? 'up' as const : 'neutral' as const
        },
        {
            label: 'Payment Rate',
            value: `${statsData.paymentRate}%`,
            comparison: `${statsData.paidDocuments}/${statsData.totalDocuments} paid`,
            trend: statsData.paymentRate >= 80 ? 'up' as const : statsData.paymentRate >= 50 ? 'neutral' as const : 'down' as const
        },
        {
            label: 'Payment Links',
            value: String(statsData.paymentLinksCount),
            comparison: 'total created',
            trend: 'neutral' as const
        },
        {
            label: 'Projects',
            value: String(statsData.projectsCount),
            comparison: 'in progress',
            trend: statsData.projectsCount > 0 ? 'up' as const : 'neutral' as const
        },
    ];

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
            {/* Header */}
            {/* Header */}
            <View style={[styles.header, { backgroundColor: themeColors.background }]}>
                <View style={styles.headerTop}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                        <CaretLeft size={24} color={themeColors.textPrimary} />
                    </TouchableOpacity>
                    <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]}>Insights</Text>
                    <View style={styles.headerRightPlaceholder} />
                </View>
            </View>

            <ScrollView
                style={styles.content}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* AI Disclaimer */}
                <View style={[styles.disclaimer, { backgroundColor: themeColors.surface }]}>
                    <Sparkle size={16} color={Colors.primary} weight="fill" />
                    <Text style={[styles.disclaimerText, { color: themeColors.textSecondary }]}>
                        Insights are AI-generated based on your activity
                    </Text>
                </View>

                {/* Ring Chart Section */}
                <View style={[styles.ringSection, { backgroundColor: themeColors.surface }]}>
                    <View style={styles.ringSectionHeader}>
                        <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>Monthly Progress</Text>
                        <TouchableOpacity
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            onPress={() => setIsTargetModalVisible(true)}
                        >
                            <Gear size={18} color={themeColors.textSecondary} />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.ringContainer}>
                        <View style={styles.ringStats}>
                            <Text style={[styles.ringStatValue, { color: hasExceededTarget ? Colors.success : themeColors.textSecondary }]}>
                                {hasExceededTarget ? '+$' + (monthlyEarnings - monthlyTarget).toLocaleString() : '$' + remainingAmount.toLocaleString()}
                            </Text>
                            <Text style={[styles.ringStatLabel, { color: themeColors.textTertiary }]}>
                                {hasExceededTarget ? 'Exceeded' : 'Remaining'}
                            </Text>
                        </View>

                        <View style={styles.ringCenter}>
                            <RingChart
                                value={monthlyEarnings}
                                total={monthlyTarget}
                                size={140}
                                color={Colors.primary}
                            />
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

                    <View style={[styles.trendBadge, { backgroundColor: (earningsTrend === 'up' ? Colors.success : earningsTrend === 'down' ? Colors.error : themeColors.textSecondary) + '15' }]}>
                        {earningsTrend === 'up' ? (
                            <TrendUp size={14} color={Colors.success} weight="bold" />
                        ) : earningsTrend === 'down' ? (
                            <TrendDown size={14} color={Colors.error} weight="bold" />
                        ) : null}
                        <Text style={[styles.trendBadgeText, { color: earningsTrend === 'up' ? Colors.success : earningsTrend === 'down' ? Colors.error : themeColors.textSecondary }]}>
                            {earningsTrend === 'up' ? 'Up from last month' : earningsTrend === 'down' ? 'Down from last month' : 'Same as last month'}
                        </Text>
                    </View>
                </View>

                {/* Stats Grid */}
                <View style={styles.sectionHeader}>
                    <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>Overview</Text>
                </View>

                <View style={styles.statsGrid}>
                    {stats.map((stat, index) => (
                        <StatCard
                            key={index}
                            label={stat.label}
                            value={stat.value}
                            comparison={stat.comparison}
                            trend={stat.trend}
                        />
                    ))}
                </View>

                {/* Insights Scroll */}
                <View style={styles.sectionHeader}>
                    <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>AI Insights</Text>
                </View>

                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.insightsScroll}
                >
                    {insights.map((insight) => (
                        <TouchableOpacity
                            key={insight.id}
                            style={[styles.insightCard, { backgroundColor: themeColors.surface }]}
                            onPress={() => insight.actionRoute && router.push(insight.actionRoute as any)}
                            activeOpacity={0.7}
                        >
                            <Text style={[styles.insightTitle, { color: themeColors.textPrimary }]}>{insight.title}</Text>
                            <Text style={[styles.insightSubtitle, { color: themeColors.textSecondary }]} numberOfLines={2}>
                                {insight.description}
                            </Text>
                            {insight.actionLabel && (
                                <View style={styles.insightAction}>
                                    <Text style={[styles.insightActionText, { color: insight.color || Colors.primary }]}>
                                        {insight.actionLabel}
                                    </Text>
                                    <ArrowRight size={12} color={insight.color || Colors.primary} weight="bold" />
                                </View>
                            )}
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </ScrollView>

            {/* Sidebar */}


            {/* Profile Modal */}


            <TargetGoalModal
                visible={isTargetModalVisible}
                currentTarget={monthlyTarget}
                onClose={() => setIsTargetModalVisible(false)}
                onSave={(newTarget) => setMonthlyTarget(newTarget)}
                user={user}
                getAccessToken={getAccessToken}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        backgroundColor: Colors.background,
    },
    headerTop: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        height: 60,
    },
    backButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'flex-start',
        zIndex: 10,
    },
    headerRightPlaceholder: {
        width: 40,
    },
    // menuButton removed
    // profileIcon removed
    headerTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 22,
        textAlign: 'center',
        color: Colors.textPrimary,
        flex: 1,
    },
    content: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingBottom: 40,
    },
    disclaimer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 10,
        marginBottom: 24,
    },
    disclaimerText: {
        fontSize: 13,
        fontFamily: 'GoogleSansFlex_400Regular',
    },
    // Ring Section
    ringSection: {
        borderRadius: 16,
        padding: 20,
        marginBottom: 24,
    },
    ringSectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20,
    },
    ringContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    ringStats: {
        alignItems: 'center',
        flex: 1,
    },
    ringStatValue: {
        fontSize: 18,
        fontFamily: 'GoogleSansFlex_600SemiBold',
    },
    ringStatLabel: {
        fontSize: 12,
        fontFamily: 'GoogleSansFlex_400Regular',
        marginTop: 4,
    },
    ringCenter: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    ringCenterText: {
        position: 'absolute',
        alignItems: 'center',
    },
    ringMainValue: {
        fontSize: 22,
        fontFamily: 'GoogleSansFlex_600SemiBold',
    },
    ringMainLabel: {
        fontSize: 12,
        fontFamily: 'GoogleSansFlex_400Regular',
    },
    trendBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 20,
        alignSelf: 'center',
    },
    trendBadgeText: {
        fontSize: 13,
        fontFamily: 'GoogleSansFlex_500Medium',
    },
    // Section Header
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 17,
        fontFamily: 'GoogleSansFlex_600SemiBold',
    },
    seeAllButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    seeAllText: {
        fontSize: 14,
        fontFamily: 'GoogleSansFlex_500Medium',
    },
    // Stats Grid (no borders)
    statsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        marginBottom: 32,
    },
    statCard: {
        width: CARD_WIDTH,
        borderRadius: 12,
        padding: 16,
    },
    statLabel: {
        fontSize: 13,
        fontFamily: 'GoogleSansFlex_400Regular',
        marginBottom: 8,
    },
    statValue: {
        fontSize: 24,
        fontFamily: 'GoogleSansFlex_600SemiBold',
        marginBottom: 4,
    },
    trendRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 4,
    },
    trendText: {
        fontSize: 12,
        fontFamily: 'GoogleSansFlex_400Regular',
    },
    // Insights Scroll (no borders)
    insightsScroll: {
        gap: 12,
        paddingRight: 20,
    },
    insightCard: {
        width: 180,
        borderRadius: 12,
        padding: 16,
    },
    insightTitle: {
        fontSize: 15,
        fontFamily: 'GoogleSansFlex_600SemiBold',
        marginBottom: 6,
    },
    insightSubtitle: {
        fontSize: 13,
        fontFamily: 'GoogleSansFlex_400Regular',
        lineHeight: 18,
        marginBottom: 12,
    },
    insightAction: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    insightActionText: {
        fontSize: 13,
        fontFamily: 'GoogleSansFlex_500Medium',
    },
});
