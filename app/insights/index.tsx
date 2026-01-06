import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, Platform, Dimensions, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { usePrivy } from '@privy-io/expo';
import { List, Gear, TrendUp, TrendDown, ArrowRight, Sparkle } from 'phosphor-react-native';
import Svg, { Circle } from 'react-native-svg';
import { Colors, useThemeColors } from '../../theme/colors';
import { Typography } from '../../styles/typography';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useInsights } from '../../hooks/useInsights';
import { Sidebar } from '../../components/Sidebar';
import { ProfileModal } from '../../components/ProfileModal';
import { LinearGradient } from 'expo-linear-gradient';

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

    // Extract data from insights
    const earningsInsight = insights.find(i => i.type === 'earnings');
    const invoiceInsight = insights.find(i => i.type === 'invoice');
    const clientInsight = insights.find(i => i.type === 'client');

    // Calculate earnings values from insight data
    const monthlyEarnings = earningsInsight?.value ? parseInt(earningsInsight.value.replace(/[$,]/g, '')) : 0;
    const monthlyTarget = 10000; // TODO: Make this user-configurable via settings
    const earningsChange = earningsInsight?.trend === 'up' ? '+23%' : '-5%';

    // Profile and Sidebar state
    const { getAccessToken, user } = usePrivy();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isProfileModalVisible, setIsProfileModalVisible] = useState(false);
    const [conversations, setConversations] = useState<any[]>([]);
    const [userName, setUserName] = useState({ firstName: '', lastName: '' });
    const [profileIcon, setProfileIcon] = useState<{ type: 'emoji' | 'image'; emoji?: string; imageUri?: string; colorIndex?: number }>({
        type: 'emoji',
        colorIndex: 0
    });
    const [walletAddresses, setWalletAddresses] = useState<{ evm?: string; solana?: string }>({});

    // Profile color gradient options
    const PROFILE_COLOR_OPTIONS: readonly [string, string, string][] = [
        ['#60A5FA', '#3B82F6', '#2563EB'],
        ['#34D399', '#10B981', '#059669'],
        ['#F472B6', '#EC4899', '#DB2777'],
        ['#FBBF24', '#F59E0B', '#D97706'],
        ['#A78BFA', '#8B5CF6', '#7C3AED'],
    ];

    useEffect(() => {
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
                    setUserName({
                        firstName: userData.firstName || '',
                        lastName: userData.lastName || ''
                    });

                    if (userData.avatar) {
                        try {
                            if (userData.avatar.trim().startsWith('{')) {
                                const parsed = JSON.parse(userData.avatar);
                                setProfileIcon(parsed);
                            } else {
                                setProfileIcon({ type: 'image', imageUri: userData.avatar });
                            }
                        } catch (e) {
                            setProfileIcon({ type: 'image', imageUri: userData.avatar });
                        }
                    }

                    setWalletAddresses({
                        evm: userData.ethereumWalletAddress,
                        solana: userData.solanaWalletAddress
                    });
                }

                const conversationsResponse = await fetch(`${apiUrl}/api/chat/conversations`, {
                    headers: { 'Authorization': `Bearer ${token}` },
                });
                if (conversationsResponse.ok) {
                    const conversationsData = await conversationsResponse.json();
                    if (conversationsData.success && conversationsData.data) {
                        setConversations(conversationsData.data.slice(0, 10));
                    }
                }
            } catch (error) {
                console.error('Failed to fetch user data:', error);
            }
        };
        fetchUserData();
    }, [user]);

    // Build stats from real insight data
    const stats = [
        {
            label: 'Monthly Earnings',
            value: earningsInsight?.value || '$0',
            comparison: 'vs last month',
            trend: earningsInsight?.trend || 'neutral' as const
        },
        {
            label: 'Pending Invoices',
            value: invoiceInsight ? invoiceInsight.description.match(/\d+/)?.[0] || '0' : '0',
            comparison: invoiceInsight?.value || '$0 total',
            trend: 'neutral' as const
        },
        {
            label: 'Active Clients',
            value: '3',
            comparison: clientInsight ? `Top: ${clientInsight.description.split(' ')[0]}` : '',
            trend: 'up' as const
        },
        {
            label: 'Payment Rate',
            value: '94%',
            comparison: '+12%',
            trend: 'up' as const
        },
    ];

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
            {/* Header */}
            <View style={[styles.header, { paddingTop: Platform.OS === 'android' ? insets.top : 0 }]}>
                <TouchableOpacity
                    onPress={() => setIsSidebarOpen(true)}
                    style={styles.menuButton}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                    <List size={24} color={themeColors.textPrimary} weight="bold" />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]}>Insights</Text>
                <TouchableOpacity onPress={() => setIsProfileModalVisible(true)}>
                    {profileIcon.imageUri ? (
                        <Image source={{ uri: profileIcon.imageUri }} style={styles.profileIcon} />
                    ) : profileIcon.emoji ? (
                        <View style={[styles.profileIcon, { backgroundColor: PROFILE_COLOR_OPTIONS[profileIcon.colorIndex || 0][1], justifyContent: 'center', alignItems: 'center' }]}>
                            <Text style={{ fontSize: 16 }}>{profileIcon.emoji}</Text>
                        </View>
                    ) : (
                        <LinearGradient
                            colors={PROFILE_COLOR_OPTIONS[profileIcon.colorIndex || 0]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.profileIcon}
                        />
                    )}
                </TouchableOpacity>
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
                            onPress={() => router.push('/settings')}
                        >
                            <Gear size={18} color={themeColors.textSecondary} />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.ringContainer}>
                        <View style={styles.ringStats}>
                            <Text style={[styles.ringStatValue, { color: themeColors.textSecondary }]}>${(monthlyTarget - monthlyEarnings).toLocaleString()}</Text>
                            <Text style={[styles.ringStatLabel, { color: themeColors.textTertiary }]}>Remaining</Text>
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

                    <View style={[styles.trendBadge, { backgroundColor: Colors.success + '15' }]}>
                        <TrendUp size={14} color={Colors.success} weight="bold" />
                        <Text style={[styles.trendBadgeText, { color: Colors.success }]}>{earningsChange} from last month</Text>
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
            <Sidebar
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
                userName={userName}
                conversations={conversations}
                onHomeClick={() => router.push('/')}
                onLoadConversation={(id) => router.push(`/?conversationId=${id}`)}
            />

            {/* Profile Modal */}
            <ProfileModal
                visible={isProfileModalVisible}
                onClose={() => setIsProfileModalVisible(false)}
                userName={userName}
                walletAddresses={walletAddresses}
                profileIcon={profileIcon}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 12,
    },
    menuButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'flex-start',
    },
    profileIcon: {
        width: 32,
        height: 32,
        borderRadius: 16,
        overflow: 'hidden',
    },
    headerTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 22,
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
