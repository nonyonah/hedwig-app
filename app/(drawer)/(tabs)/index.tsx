
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, RefreshControl, Platform, UIManager, TextInput, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColors, Colors } from '../../../theme/colors';
import { Bell, Search as MagnifyingGlass, Plus, FileText, ScrollText as Scroll, Link as LinkIcon, Briefcase, ChevronRight as CaretRight, CircleX as XCircle, Inbox } from 'lucide-react-native';
import { useAuth } from '../../../hooks/useAuth';
import { useRouter, useFocusEffect } from 'expo-router';
import { UniversalCreationBox } from '../../../components/UniversalCreationBox';
import { AnimatedListItem } from '../../../components/AnimatedListItem';
import { TransactionConfirmationModal } from '../../../components/TransactionConfirmationModal';
import { TutorialCard } from '../../../components/TutorialCard';
import { useTutorial } from '../../../hooks/useTutorial';
import { useNavigation } from 'expo-router';
import { DrawerActions } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { getUserGradient } from '../../../utils/gradientUtils';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Helper types for search
type SearchResultItem = {
    id: string;
    type: 'INVOICE' | 'CONTRACT' | 'LINK' | 'PROJECT';
    title: string;
    subtitle?: string;
    date?: string;
    status?: string;
    data: any;
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
        inProgress: { projects: 0, milestones: 0 },
        dueSoon: { invoices: 0, milestones: 0, projects: 0, links: 0 }
    });

    // Search State
    const [allDocuments, setAllDocuments] = useState<SearchResultItem[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [filteredResults, setFilteredResults] = useState<SearchResultItem[]>([]);

    const [isLoadingData, setIsLoadingData] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [showCreationBox, setShowCreationBox] = useState(false);

    // Transaction Modal State
    const [showTransactionModal, setShowTransactionModal] = useState(false);
    const [transactionData, setTransactionData] = useState<any>(null);
    const transactionModalRef = React.useRef<any>(null);
    const { isLoaded: tutorialLoaded, isCompleted: tutorialCompleted, shouldShowOnScreen, nextStep, prevStep, skipTutorial, startTutorial, activeStep, activeStepIndex, totalSteps } = useTutorial();

    useEffect(() => {
        if (isReady && user) {
            fetchUserData();
            fetchDashboardData();
        }
    }, [isReady, user]);

    // Auto-start tutorial for new users once data has loaded
    useEffect(() => {
        if (tutorialLoaded && !tutorialCompleted && isReady && user && !isLoadingData) {
            startTutorial();
        }
    }, [tutorialLoaded, tutorialCompleted, isReady, user, isLoadingData]);

    // Refetch profile data when screen comes into focus
    useFocusEffect(
        React.useCallback(() => {
            if (isReady && user) {
                fetchUserData();
            }
        }, [isReady, user])
    );

    // Handle Search Filter
    useEffect(() => {
        if (!searchQuery.trim()) {
            setFilteredResults([]);
            return;
        }
        const query = searchQuery.toLowerCase();
        const results = allDocuments.filter(item =>
            (item.title ? item.title.toLowerCase().includes(query) : false) ||
            (item.subtitle && item.subtitle.toLowerCase().includes(query)) ||
            (item.status && item.status.toLowerCase().includes(query))
        );
        setFilteredResults(results);
    }, [searchQuery, allDocuments]);

    const fetchUserData = async () => {
        if (!user) return;
        try {
            const t = await getAccessToken();
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
            const profileResponse = await fetch(`${apiUrl}/api/users/profile`, { headers: { 'Authorization': `Bearer ${t}` } });
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

    const fetchDashboardData = async () => {
        setIsLoadingData(true);
        try {
            const t = await getAccessToken();
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
            const headers = { 'Authorization': `Bearer ${t}` };

            const [invoicesRes, contractsRes, linksRes, projectsRes] = await Promise.all([
                fetch(`${apiUrl}/api/documents?type=INVOICE`, { headers }).then(r => r.json()).catch(() => ({})),
                fetch(`${apiUrl}/api/documents?type=CONTRACT`, { headers }).then(r => r.json()).catch(() => ({})),
                fetch(`${apiUrl}/api/documents?type=PAYMENT_LINK`, { headers }).then(r => r.json()).catch(() => ({})),
                fetch(`${apiUrl}/api/projects`, { headers }).then(r => r.json()).catch(() => ({})),
            ]);

            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const nextWeek = new Date(today);
            nextWeek.setDate(today.getDate() + 7);

            const newCounts = {
                reminders: { invoices: 0, contracts: 0, links: 0 },
                inProgress: { projects: 0, milestones: 0 },
                dueSoon: { invoices: 0, milestones: 0, projects: 0, links: 0 }
            };

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
                        if (proj.deadline) {
                            const deadline = new Date(proj.deadline);
                            if (deadline <= nextWeek && deadline >= today) newCounts.dueSoon.projects++;
                        }
                    }
                    if (proj.milestones) {
                        proj.milestones.forEach((m: any) => {
                            if (['pending', 'in_progress'].includes(m.status)) {
                                newCounts.inProgress.milestones++;
                                if (m.dueDate) {
                                    const due = new Date(m.dueDate);
                                    if (due <= nextWeek && due >= today) newCounts.dueSoon.milestones++;
                                }
                            }
                        });
                    }
                });
            }

            setCounts(newCounts);
            setAllDocuments(allDocs);

        } catch (error) {
            console.error('Failed to fetch data', error);
        } finally {
            setIsLoadingData(false);
            setRefreshing(false);
        }
    };

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

        uncompleted.forEach(doc => {
            if (doc.data.content?.due_date) {
                const due = new Date(doc.data.content.due_date);
                due.setHours(0, 0, 0, 0);
                if (due.getTime() < today.getTime()) overdue++;
                else if (due.getTime() === today.getTime()) todayCount++;
                else if (due.getTime() <= nextWeek.getTime()) {
                    if (!nextDue || due.getTime() < nextDue.getTime()) nextDue = due;
                }
            }
        });

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
                            <View style={[styles.badge, { backgroundColor: '#F1F5F9' }]}>
                                <Text style={styles.badgeText}>{badgeText}</Text>
                            </View>
                        )}
                        <View style={[styles.countBadge, { backgroundColor: '#F1F5F9' }]}>
                            <Text style={styles.countText}>{count}</Text>
                        </View>
                    </View>
                </View>
            </AnimatedListItem>
        );
    };

    const handleTransfer = (data: any) => {
        console.log('[Home] Initiating transfer:', data);
        setTransactionData({
            amount: data.amount?.toString() || '0',
            token: data.token || 'USDC',
            recipient: data.recipient || '',
            network: data.network || 'base'
        });
        setShowTransactionModal(true);
        setTimeout(() => { transactionModalRef.current?.present(); }, 100);
    };

    const getIconForType = (type: string) => {
        switch (type) {
            case 'INVOICE': return <FileText size={24} color={Colors.primary} />;
            case 'CONTRACT': return <Scroll size={24} color="#8B5CF6" />;
            case 'LINK': return <LinkIcon size={24} color="#10B981" />;
            case 'PROJECT': return <Briefcase size={24} color="#F59E0B" />;
            default: return <FileText size={24} color={themeColors.textSecondary} />;
        }
    };

    const navigateToItem = (item: SearchResultItem) => {
        let path = '';
        switch (item.type) {
            case 'INVOICE': path = `/(tabs)/invoices/${item.id}`; break;
            case 'CONTRACT': path = `/(tabs)/contracts/${item.id}`; break;
            case 'LINK': path = `/(tabs)/links/${item.id}`; break;
            case 'PROJECT': path = `/(tabs)/projects/${item.id}`; break;
        }
        if (path) router.push(path);
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
            <View style={[styles.header, { backgroundColor: themeColors.background }]}>
                <View style={styles.headerLeft}>
                    <TouchableOpacity onPress={() => navigation.dispatch(DrawerActions.openDrawer())}>
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
                    <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]}>Home</Text>
                </View>
                <View style={styles.headerRight}>
                    <TouchableOpacity style={styles.iconButton} onPress={() => router.push('/notifications')}><Bell size={24} color={themeColors.textPrimary} /></TouchableOpacity>
                </View>
            </View>

            <View style={[styles.searchContainer, { backgroundColor: themeColors.surface }]}>
                <MagnifyingGlass size={20} color={themeColors.textSecondary} />
                <TextInput
                    style={[styles.searchInput, { color: themeColors.textPrimary }]}
                    placeholder="Search documents, projects..."
                    placeholderTextColor={themeColors.textSecondary}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                />
                {searchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setSearchQuery('')}>
                        <XCircle size={20} color={themeColors.textSecondary} fill={themeColors.textSecondary} strokeWidth={3} />
                    </TouchableOpacity>
                )}
            </View>

            {searchQuery.length > 0 ? (
                <FlatList
                    data={filteredResults}
                    keyExtractor={(item) => `${item.type}-${item.id}`}
                    contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
                    renderItem={({ item }) => (
                        <TouchableOpacity style={[styles.searchItem, { backgroundColor: themeColors.surface }]} onPress={() => navigateToItem(item)}>
                            <View style={styles.searchItemLeft}>
                                <View style={[styles.searchIconContainer, { backgroundColor: themeColors.background }]}>
                                    {getIconForType(item.type)}
                                </View>
                                <View>
                                    <Text style={[styles.searchItemTitle, { color: themeColors.textPrimary }]}>{item.title}</Text>
                                    <Text style={[styles.searchItemSubtitle, { color: themeColors.textSecondary }]}>{item.subtitle} • {item.status}</Text>
                                </View>
                            </View>
                            <CaretRight size={20} color={themeColors.textSecondary} />
                        </TouchableOpacity>
                    )}
                    ListEmptyComponent={
                        <View style={styles.emptySearch}>
                            <Text style={{ color: themeColors.textSecondary, fontFamily: 'GoogleSansFlex_400Regular' }}>No results found</Text>
                        </View>
                    }
                />
            ) : (
                <ScrollView
                    style={styles.scrollView}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchDashboardData(); }} />
                    }
                    contentContainerStyle={{ paddingBottom: 100 }}
                >
                    <Text style={[styles.mainHeading, { color: themeColors.textPrimary }]}>Your Activity</Text>

                    {/* Check if there is any activity at all */}
                    {(counts.reminders.invoices + counts.reminders.contracts + counts.reminders.links +
                        counts.inProgress.projects + counts.inProgress.milestones +
                        counts.dueSoon.invoices + counts.dueSoon.projects + counts.dueSoon.links + counts.dueSoon.milestones) === 0 && !isLoadingData ? (
                        <View style={styles.emptyStateContainer}>
                            <Inbox size={64} color={themeColors.textSecondary} strokeWidth={1} />
                            <Text style={[styles.emptyStateTitle, { color: themeColors.textPrimary }]}>
                                All clear
                            </Text>
                            <Text style={[styles.emptyStateText, { color: themeColors.textSecondary }]}>
                                Tap the + button to create invoices, payment{"\n"}links, contracts, or send tokens.
                            </Text>
                        </View>
                    ) : (
                        <>
                            {/* Reminders Section */}
                            <View style={styles.sectionContainer}>
                                <Text style={[styles.sectionHeader, { color: themeColors.textPrimary }]}>Reminders</Text>
                                <View style={styles.cardContainer}>
                                    {renderSummaryRow('Invoices', counts.reminders.invoices, getBadgeText('INVOICE', 'reminders'), () => router.push('/(tabs)/invoices'))}
                                    {renderSummaryRow('Awaiting contract signatures', counts.reminders.contracts, null, () => router.push('/(tabs)/contracts?filter=sent'))}
                                    {renderSummaryRow('Payment links', counts.reminders.links, getBadgeText('LINK', 'reminders'), () => router.push('/(tabs)/links'))}
                                </View>
                            </View>

                            {/* In Progress Section */}
                            <View style={styles.sectionContainer}>
                                <Text style={[styles.sectionHeader, { color: themeColors.textPrimary }]}>In Progress</Text>
                                <View style={styles.cardContainer}>
                                    {renderSummaryRow('Active Projects', counts.inProgress.projects, null, () => { })}
                                    {renderSummaryRow('Milestones in progress', counts.inProgress.milestones, null, () => { })}
                                </View>
                            </View>

                            {/* Due Soon Section */}
                            <View style={styles.sectionContainer}>
                                <Text style={[styles.sectionHeader, { color: themeColors.textPrimary }]}>Due Soon</Text>
                                <View style={styles.cardContainer}>
                                    {renderSummaryRow('Invoices due soon', counts.dueSoon.invoices, getBadgeText('INVOICE', 'dueSoon'), () => router.push('/(tabs)/invoices?filter=due_soon'))}
                                    {renderSummaryRow('Projects due soon', counts.dueSoon.projects, null, () => router.push('/(tabs)/projects?filter=due_soon'))}
                                    {renderSummaryRow('Payment links due soon', counts.dueSoon.links, getBadgeText('LINK', 'dueSoon'), () => router.push('/(tabs)/links?filter=due_soon'))}
                                    {renderSummaryRow('Milestones due soon', counts.dueSoon.milestones, null, () => { })}
                                </View>
                            </View>
                        </>
                    )}
                </ScrollView>
            )}

            <TouchableOpacity style={[styles.fab, { backgroundColor: '#2563EB' }]} onPress={() => setShowCreationBox(true)}><Plus size={32} color="#FFFFFF" strokeWidth={3} /></TouchableOpacity>

            <UniversalCreationBox
                visible={showCreationBox}
                onClose={() => setShowCreationBox(false)}
                onTransfer={handleTransfer}
            />
            <TransactionConfirmationModal
                ref={transactionModalRef}
                visible={showTransactionModal}
                onClose={() => setShowTransactionModal(false)}
                data={transactionData}
                onSuccess={(hash) => {
                    console.log('Transaction successful:', hash);
                }}
            />

            {/* Tutorial cards for home screen steps */}
            {shouldShowOnScreen('home') && activeStep && (
                <TutorialCard
                    step={activeStepIndex + 1}
                    totalSteps={totalSteps}
                    title={activeStep.title}
                    body={activeStep.body}
                    anchorPosition={activeStep.anchorPosition}
                    onNext={nextStep}
                    onBack={prevStep}
                    onSkip={skipTutorial}
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12, paddingTop: 8 },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    headerTitle: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 24 },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    iconButton: { padding: 4 },
    avatar: { width: 40, height: 40, borderRadius: 20 },
    scrollView: { flex: 1, paddingHorizontal: 20 },
    searchContainer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 48, borderRadius: 12, marginBottom: 12, marginHorizontal: 20 },
    searchInput: { flex: 1, marginLeft: 12, fontFamily: 'GoogleSansFlex_400Regular', fontSize: 16, height: '100%' },
    mainHeading: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 24, marginBottom: 16, marginTop: 12 },
    sectionContainer: { marginBottom: 24 },
    sectionHeader: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 18, marginBottom: 12 },
    cardContainer: { borderRadius: 16, overflow: 'hidden' },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 18, paddingHorizontal: 20, marginBottom: 1 },
    rowLabel: { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 16 },
    rowRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
    badgeText: { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 12, color: '#475569' },
    countBadge: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
    countText: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 14, color: '#475569' },
    fab: { position: 'absolute', bottom: 110, right: 24, width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 5 },
    searchItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderRadius: 16, marginBottom: 12 },
    searchItemLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    searchIconContainer: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
    searchItemTitle: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 16 },
    searchItemSubtitle: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 14 },
    emptySearch: { alignItems: 'center', marginTop: 40 },
    emptyStateContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 80, paddingHorizontal: 40 },
    emptyStateTitle: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 20, marginTop: 20, marginBottom: 8 },
    emptyStateText: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 15, textAlign: 'center', lineHeight: 22 },
});
