
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, RefreshControl, Platform, UIManager, DeviceEventEmitter } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColors, Colors } from '../../../theme/colors';
import { useAuth } from '../../../hooks/useAuth';
import { useRouter, useFocusEffect } from 'expo-router';
import { AnimatedListItem } from '../../../components/AnimatedListItem';
import { useNavigation } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { getUserGradient } from '../../../utils/gradientUtils';
import { joinApiUrl } from '../../../utils/apiBaseUrl';
import { openRootDrawer } from '../../../utils/openRootDrawer';
import { HugeiconsIcon } from '@hugeicons/react-native';
import * as HugeiconsCore from '@hugeicons/core-free-icons';
import UniversalCreationBox from '../../../components/UniversalCreationBox';

const Plus = (props: any) => <HugeiconsIcon icon={(HugeiconsCore as any).Add01Icon} {...props} />;
const Inbox = (props: any) => <HugeiconsIcon icon={(HugeiconsCore as any).InboxIcon} {...props} />;


// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Helper type for document metadata used in activity badges
type SearchResultItem = {
    id: string;
    type: 'INVOICE' | 'CONTRACT' | 'LINK' | 'PROJECT';
    isRecurring?: boolean;
    title: string;
    subtitle?: string;
    date?: string;
    status?: string;
    data: any;
};

const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
};

export default function HomeDashboard() {
    const themeColors = useThemeColors();
    const router = useRouter();
    const navigation = useNavigation();
    const { user, getAccessToken, isReady } = useAuth();

    // User Data
    const [userName, setUserName] = useState({ firstName: '', lastName: '' });
    const [profileIcon, setProfileIcon] = useState<{ emoji?: string; colorIndex?: number; imageUri?: string }>({});
    const [walletAddresses, setWalletAddresses] = useState<{ evm?: string; solana?: string }>({});

    // Dashboard Data
    const [counts, setCounts] = useState({
        reminders: { invoices: 0, contracts: 0, links: 0 },
        inProgress: { projects: 0, milestones: 0, recurringInvoices: 0 },
        dueSoon: { invoices: 0, milestones: 0, projects: 0, links: 0 }
    });
    const [activityTargets, setActivityTargets] = useState<{
        activeProjectId?: string;
        activeMilestoneProjectId?: string;
        activeMilestoneId?: string;
        dueSoonProjectId?: string;
        dueSoonMilestoneProjectId?: string;
        dueSoonMilestoneId?: string;
    }>({});

    // Documents snapshot for badges/activity metadata
    const [allDocuments, setAllDocuments] = useState<SearchResultItem[]>([]);

    const [isLoadingData, setIsLoadingData] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [isCreationBoxVisible, setIsCreationBoxVisible] = useState(false);

    const emitTabBarScrollOffset = useCallback((offsetY: number) => {
        if (Platform.OS !== 'android') return;
        DeviceEventEmitter.emit('hedwig:tabbar-scroll', offsetY);
    }, []);

    const handleTabBarAwareScroll = useCallback((event: any) => {
        emitTabBarScrollOffset(event?.nativeEvent?.contentOffset?.y ?? 0);
    }, [emitTabBarScrollOffset]);

    useEffect(() => {
        return () => {
            emitTabBarScrollOffset(0);
        };
    }, [emitTabBarScrollOffset]);

    useEffect(() => {
        if (isReady && user) {
            fetchUserData();
            fetchDashboardData();
        }
    }, [isReady, user]);

    // Refetch profile data when screen comes into focus
    useFocusEffect(
        React.useCallback(() => {
            if (isReady && user) {
                fetchUserData();
            }
        }, [isReady, user])
    );

    const fetchUserData = async () => {
        if (!user) return;
        try {
            const t = await getAccessToken();
            const profileResponse = await fetch(joinApiUrl('/api/users/profile'), { headers: { 'Authorization': `Bearer ${t}` } });
            const profileData = await profileResponse.json();
            if (profileData.success && profileData.data) {
                const userData = profileData.data.user || profileData.data;
                setUserName({ firstName: userData.firstName || '', lastName: userData.lastName || '' });
                if (userData.avatar) {
                    if (userData.avatar.startsWith('data:') || userData.avatar.startsWith('http')) {
                        setProfileIcon({ imageUri: userData.avatar });
                    } else {
                        try {
                            const parsed = JSON.parse(userData.avatar);
                            if (parsed.imageUri) setProfileIcon({ imageUri: parsed.imageUri });
                        } catch { setProfileIcon({ imageUri: userData.avatar }); }
                    }
                }
                setWalletAddresses({ evm: userData.ethereumWalletAddress || userData.baseWalletAddress, solana: userData.solanaWalletAddress });
            }
        } catch (e) { console.error(e); }
    };

    const fetchDashboardData = useCallback(async (isRefresh = false) => {
        if (!isRefresh) setIsLoadingData(true);
        try {
            const t = await getAccessToken();
            const headers = { 'Authorization': `Bearer ${t}` };

            const [invoicesRes, contractsRes, linksRes, projectsRes, recurringRes] = await Promise.all([
                fetch(joinApiUrl('/api/documents?type=INVOICE'), { headers }).then(r => r.json()).catch(() => ({})),
                fetch(joinApiUrl('/api/documents?type=CONTRACT'), { headers }).then(r => r.json()).catch(() => ({})),
                fetch(joinApiUrl('/api/documents?type=PAYMENT_LINK'), { headers }).then(r => r.json()).catch(() => ({})),
                fetch(joinApiUrl('/api/projects'), { headers }).then(r => r.json()).catch(() => ({})),
                fetch(joinApiUrl('/api/recurring-invoices'), { headers }).then(r => r.json()).catch(() => ({})),
            ]);

            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const nextWeek = new Date(today);
            nextWeek.setDate(today.getDate() + 7);

            const newCounts = {
                reminders: { invoices: 0, contracts: 0, links: 0 },
                inProgress: { projects: 0, milestones: 0, recurringInvoices: 0 },
                dueSoon: { invoices: 0, milestones: 0, projects: 0, links: 0 }
            };
            const nextTargets: {
                activeProjectId?: string;
                activeMilestoneProjectId?: string;
                activeMilestoneId?: string;
                dueSoonProjectId?: string;
                dueSoonMilestoneProjectId?: string;
                dueSoonMilestoneId?: string;
            } = {};

            const allDocs: SearchResultItem[] = [];

            // Process Invoices
            if (invoicesRes.success && invoicesRes.data.documents) {
                invoicesRes.data.documents.forEach((inv: any) => {
                    allDocs.push({
                        id: inv.id,
                        type: 'INVOICE',
                        title: `Invoice #${inv.content?.invoice_number || inv.id.slice(0, 8)}`,
                        subtitle: inv.content?.client_name || 'Unknown Client',
                        status: inv.status,
                        data: inv
                    });

                    if (inv.status === 'PAID') return;
                    if (inv.content?.due_date) {
                        const due = new Date(inv.content.due_date);
                        due.setHours(0, 0, 0, 0);
                        if (due.getTime() <= today.getTime()) newCounts.reminders.invoices++;
                        else if (due.getTime() <= nextWeek.getTime()) newCounts.dueSoon.invoices++;
                    } else {
                        newCounts.reminders.invoices++;
                    }
                });
            }

            // Process Contracts
            if (contractsRes.success && contractsRes.data.documents) {
                contractsRes.data.documents.forEach((con: any) => {
                    allDocs.push({
                        id: con.id,
                        type: 'CONTRACT',
                        title: con.title || 'Untitled Contract',
                        subtitle: con.content?.client_name || 'Unknown Client',
                        status: con.status,
                        data: con
                    });

                    if (['SENT', 'VIEWED', 'ACTIVE'].includes(con.status)) {
                        newCounts.reminders.contracts++;
                    }
                });
            }

            // Process Links
            if (linksRes.success && linksRes.data.documents) {
                linksRes.data.documents.forEach((link: any) => {
                    allDocs.push({
                        id: link.id,
                        type: 'LINK',
                        title: link.title || 'Payment Link',
                        subtitle: link.content?.amount ? `$${link.content.amount}` : 'No Amount',
                        status: link.status,
                        data: link
                    });

                    if (link.status === 'PAID') return;
                    if (link.content?.due_date) {
                        const due = new Date(link.content.due_date);
                        due.setHours(0, 0, 0, 0);
                        if (due.getTime() <= today.getTime()) newCounts.reminders.links++;
                        else if (due.getTime() <= nextWeek.getTime()) newCounts.dueSoon.links++;
                    }
                });
            }

            // Process Projects
            if (projectsRes.success && projectsRes.data.projects) {
                projectsRes.data.projects.forEach((proj: any) => {
                    allDocs.push({
                        id: proj.id,
                        type: 'PROJECT',
                        title: proj.name || 'Untitled Project',
                        subtitle: proj.client?.name || 'No Client',
                        status: proj.status,
                        data: proj
                    });

                    if (['ongoing', 'active'].includes(proj.status?.toLowerCase())) {
                        newCounts.inProgress.projects++;
                        if (!nextTargets.activeProjectId) {
                            nextTargets.activeProjectId = proj.id;
                        }
                        if (proj.deadline) {
                            const deadline = new Date(proj.deadline);
                            if (deadline <= nextWeek && deadline >= today) {
                                newCounts.dueSoon.projects++;
                                if (!nextTargets.dueSoonProjectId) {
                                    nextTargets.dueSoonProjectId = proj.id;
                                }
                            }
                        }
                    }
                    if (proj.milestones) {
                        proj.milestones.forEach((m: any) => {
                            if (['pending', 'in_progress'].includes(m.status)) {
                                newCounts.inProgress.milestones++;
                                if (!nextTargets.activeMilestoneId) {
                                    nextTargets.activeMilestoneId = m.id;
                                    nextTargets.activeMilestoneProjectId = proj.id;
                                }
                                if (m.dueDate) {
                                    const due = new Date(m.dueDate);
                                    if (due <= nextWeek && due >= today) {
                                        newCounts.dueSoon.milestones++;
                                        if (!nextTargets.dueSoonMilestoneId) {
                                            nextTargets.dueSoonMilestoneId = m.id;
                                            nextTargets.dueSoonMilestoneProjectId = proj.id;
                                        }
                                    }
                                }
                            }
                        });
                    }
                });
            }

            // Process Recurring Invoices
            if (recurringRes.success && recurringRes.data?.recurringInvoices) {
                recurringRes.data.recurringInvoices.forEach((ri: any) => {
                    allDocs.push({
                        id: ri.id,
                        type: 'INVOICE',
                        isRecurring: true,
                        title: ri.title || 'Recurring Invoice',
                        subtitle: `${ri.clientName || ri.clientEmail || 'No client'} • ${ri.frequency || 'monthly'}`,
                        status: ri.status || 'active',
                        data: ri,
                    });

                    if (ri.status === 'active' || ri.status === 'paused') {
                        newCounts.inProgress.recurringInvoices++;
                    }
                });
            }

            setCounts(newCounts);
            setAllDocuments(allDocs);
            setActivityTargets(nextTargets);

        } catch (error) {
            console.error('Failed to fetch data', error);
        } finally {
            if (!isRefresh) setIsLoadingData(false);
            setRefreshing(false);
        }
    }, [getAccessToken]);

    const onRefresh = useCallback(async () => {
        if (refreshing) return;
        setRefreshing(true);
        await fetchDashboardData(true);
    }, [refreshing, fetchDashboardData]);

    const getBadgeText = (type: 'INVOICE' | 'LINK', category: 'reminders' | 'dueSoon') => {
        const uncompleted = allDocuments.filter(d => d.type === type && d.status !== 'PAID');
        if (uncompleted.length === 0) return null;

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const nextWeek = new Date(today);
        nextWeek.setDate(today.getDate() + 7);

        let overdue = 0;
        let todayCount = 0;
        let nextDue: Date | null = null;

        for (const doc of uncompleted) {
            if (doc.data.content?.due_date) {
                const due = new Date(doc.data.content.due_date);
                due.setHours(0, 0, 0, 0);
                if (due.getTime() < today.getTime()) overdue++;
                else if (due.getTime() === today.getTime()) todayCount++;
                else if (due.getTime() <= nextWeek.getTime()) {
                    if (!nextDue || due.getTime() < nextDue.getTime()) nextDue = due;
                }
            }
        }

        if (category === 'reminders') {
            if (overdue > 0 && todayCount > 0) return `${overdue} Overdue, ${todayCount} Due today`;
            if (overdue > 0) return `${overdue} Overdue`;
            if (todayCount > 0) return `${todayCount} Due today`;
            return null;
        } else if (category === 'dueSoon') {
            if (nextDue) {
                const diffTime = Math.abs(nextDue.getTime() - today.getTime());
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                if (diffDays === 1) return 'Due tomorrow';
                return `Due in ${diffDays} days`;
            }
            return null;
        }
        return null;
    };

    const renderSummaryRow = (label: string, count: number, badgeText: string | null, onPress: () => void) => {
        if (count === 0) return null;
        return (
            <AnimatedListItem onPress={onPress}>
                <View style={[styles.row, { backgroundColor: themeColors.surface }]}>
                    <Text style={[styles.rowLabel, { color: themeColors.textPrimary }]}>{label}</Text>
                    <View style={styles.rowRight}>
                        {badgeText && (
                            <View style={[styles.badge, { backgroundColor: themeColors.surfaceHighlight }]}>
                                <Text style={[styles.badgeText, { color: themeColors.textSecondary }]}>{badgeText}</Text>
                            </View>
                        )}
                        <View style={[styles.countBadge, { backgroundColor: themeColors.surfaceHighlight }]}>
                            <Text style={[styles.countText, { color: themeColors.textSecondary }]}>{count}</Text>
                        </View>
                    </View>
                </View>
            </AnimatedListItem>
        );
    };

    const renderSkeletonRow = (idx: number) => (
        <View key={`skeleton-${idx}`} style={[styles.row, { backgroundColor: themeColors.surface }]}>
            <View style={[styles.skeletonBar, { width: '48%', backgroundColor: themeColors.border }]} />
            <View style={[styles.skeletonCircle, { backgroundColor: themeColors.border }]} />
        </View>
    );

    const openProjectActivity = (projectId?: string, milestoneId?: string, fallbackFilter?: string) => {
        router.push({
            pathname: '/projects',
            params: {
                ...(projectId ? { projectId } : {}),
                ...(milestoneId ? { milestoneId } : {}),
                ...(fallbackFilter ? { filter: fallbackFilter } : {})
            }
        } as any);
    };

    const sectionConfigs = [
        {
            key: 'reminders',
            title: 'Reminders',
            viewAllRoute: '/(tabs)/invoices',
            rows: [
                { label: 'Invoices', count: counts.reminders.invoices, badge: getBadgeText('INVOICE', 'reminders'), onPress: () => router.push('/(tabs)/invoices') },
                { label: 'Awaiting contract signatures', count: counts.reminders.contracts, badge: null, onPress: () => router.push('/contracts?filter=sent') },
                { label: 'Payment links', count: counts.reminders.links, badge: getBadgeText('LINK', 'reminders'), onPress: () => router.push('/(tabs)/links') },
            ]
        },
        {
            key: 'in-progress',
            title: 'In Progress',
            viewAllRoute: '/(tabs)/projects',
            rows: [
                {
                    label: 'Active Projects',
                    count: counts.inProgress.projects,
                    badge: null,
                    onPress: () => openProjectActivity(activityTargets.activeProjectId, undefined, 'ongoing')
                },
                {
                    label: 'Milestones in progress',
                    count: counts.inProgress.milestones,
                    badge: null,
                    onPress: () => openProjectActivity(activityTargets.activeMilestoneProjectId, activityTargets.activeMilestoneId, 'ongoing')
                },
                {
                    label: 'Recurring invoices',
                    count: counts.inProgress.recurringInvoices,
                    badge: null,
                    onPress: () => router.push('/(tabs)/invoices' as any)
                },
            ]
        },
        {
            key: 'due-soon',
            title: 'Due Soon',
            viewAllRoute: '/(tabs)/calendar',
            rows: [
                { label: 'Invoices due soon', count: counts.dueSoon.invoices, badge: getBadgeText('INVOICE', 'dueSoon'), onPress: () => router.push('/(tabs)/invoices?filter=due_soon') },
                {
                    label: 'Projects due soon',
                    count: counts.dueSoon.projects,
                    badge: null,
                    onPress: () => openProjectActivity(activityTargets.dueSoonProjectId, undefined, 'due_soon')
                },
                { label: 'Payment links due soon', count: counts.dueSoon.links, badge: getBadgeText('LINK', 'dueSoon'), onPress: () => router.push('/(tabs)/links?filter=due_soon') },
                {
                    label: 'Milestones due soon',
                    count: counts.dueSoon.milestones,
                    badge: null,
                    onPress: () => openProjectActivity(activityTargets.dueSoonMilestoneProjectId, activityTargets.dueSoonMilestoneId, 'due_soon')
                },
            ]
        }
    ];

    return (
        <SafeAreaView collapsable={false} edges={['top']} style={[styles.container, { backgroundColor: themeColors.background }]}>
            <View style={[styles.header, { backgroundColor: themeColors.background }]}>
                <View style={styles.headerLeft}>
                    <TouchableOpacity onPress={() => openRootDrawer(navigation as any)}>
                        {profileIcon?.imageUri ? (
                            <Image source={{ uri: profileIcon.imageUri }} style={styles.avatar} />
                        ) : (
                            <LinearGradient
                                colors={getUserGradient(user?.id)}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.avatar}
                            >
                                <Text style={{ color: 'white', fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 16 }}>
                                    {userName.firstName?.[0] || 'U'}
                                </Text>
                            </LinearGradient>
                        )}
                    </TouchableOpacity>
                    <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]}>
                        {getGreeting()}{userName.firstName ? `, ${userName.firstName}` : ''}
                    </Text>
                </View>
                <View style={styles.headerRight}>
                    <TouchableOpacity style={styles.iconButton} onPress={() => router.push('/notifications')}>
                        <Inbox size={24} color={themeColors.textPrimary} strokeWidth={2.2} />
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView
                style={styles.scrollView}
                showsVerticalScrollIndicator={false}
                bounces={true}
                overScrollMode="always"
                contentInsetAdjustmentBehavior="automatic"
                onScroll={handleTabBarAwareScroll}
                scrollEventThrottle={16}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
                }
                contentContainerStyle={{ paddingBottom: 100, flexGrow: 1 }}
            >
                <Text style={[styles.mainHeading, { color: themeColors.textPrimary }]}>Your Activity</Text>

                {/* Check if there is any activity at all */}
                {(counts.reminders.invoices + counts.reminders.contracts + counts.reminders.links +
                    counts.inProgress.projects + counts.inProgress.milestones + counts.inProgress.recurringInvoices +
                    counts.dueSoon.invoices + counts.dueSoon.projects + counts.dueSoon.links + counts.dueSoon.milestones) === 0 && !isLoadingData ? (
                    <View style={styles.emptyStateContainer}>
                        <Inbox size={64} color={themeColors.textSecondary} strokeWidth={1} />
                        <Text style={[styles.emptyStateTitle, { color: themeColors.textPrimary }]}>
                            All clear
                        </Text>
                        <Text style={[styles.emptyStateText, { color: themeColors.textSecondary }]}>
                            Tap the + button to create invoices, payment{"\n"}links, contracts, or send USDC.
                        </Text>
                    </View>
                ) : (
                    <>
                        {sectionConfigs.map((section) => (
                            <View style={styles.sectionContainer} key={section.key}>
                                <Text style={[styles.sectionHeader, { color: themeColors.textPrimary }]}>{section.title}</Text>
                                <View style={[styles.cardContainer, { backgroundColor: themeColors.surface }]}>
                                    {isLoadingData
                                        ? [0, 1, 2].map(renderSkeletonRow)
                                        : section.rows.map((row, idx) => (
                                            <React.Fragment key={`${section.key}-${idx}`}>
                                                {renderSummaryRow(row.label, row.count, row.badge, row.onPress)}
                                            </React.Fragment>
                                        ))}
                                </View>
                            </View>
                        ))}
                    </>
                )}
            </ScrollView>

            <TouchableOpacity
                style={[styles.fab, { backgroundColor: '#2563EB' }]}
                onPress={() => setIsCreationBoxVisible(true)}
            >
                <Plus size={32} color="#FFFFFF" strokeWidth={3} />
            </TouchableOpacity>

            <UniversalCreationBox
                visible={isCreationBoxVisible}
                onClose={() => setIsCreationBoxVisible(false)}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12, paddingTop: 8 },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    headerTitle: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: Platform.OS === 'android' ? 20 : 22 },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    iconButton: { padding: 4 },
    avatar: { width: 40, height: 40, borderRadius: 20 },
    scrollView: { flex: 1, paddingHorizontal: 20 },
    mainHeading: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: Platform.OS === 'android' ? 20 : 22, marginBottom: 16, marginTop: 12 },
    sectionContainer: { marginBottom: 24 },
    sectionHeader: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: Platform.OS === 'android' ? 20 : 22, marginBottom: 12 },
    cardContainer: { borderRadius: 16, overflow: 'hidden' },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 18, paddingHorizontal: 20, marginBottom: 1 },
    rowLabel: { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 16 },
    rowRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
    badgeText: { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 12 },
    countBadge: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
    countText: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 14 },
    fab: {
        position: 'absolute',
        bottom: Platform.OS === 'android' ? 88 : 110,
        right: 24,
        width: 56,
        height: 56,
        borderRadius: 28,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 5,
    },
    skeletonBar: { height: 12, borderRadius: 6 },
    skeletonCircle: { width: 26, height: 26, borderRadius: 13 },
    emptyStateContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 80, paddingHorizontal: 40 },
    emptyStateTitle: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 20, marginTop: 20, marginBottom: 8 },
    emptyStateText: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 15, textAlign: 'center', lineHeight: 22 },
});
