
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, RefreshControl, Platform, UIManager, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColors } from '../../theme/colors';
import { Bell, Gear, MagnifyingGlass, Plus, UserCircle } from 'phosphor-react-native';
import { useAuth } from '../../hooks/useAuth';
import { useRouter } from 'expo-router';
import { ProfileModal } from '../../components/ProfileModal';
import { UniversalCreationBox } from '../../components/UniversalCreationBox';
import { AnimatedListItem } from '../../components/AnimatedListItem';
import { TransactionConfirmationModal } from '../../components/TransactionConfirmationModal';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function HomeDashboard() {
    const themeColors = useThemeColors();
    const router = useRouter();
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

    const [isLoadingData, setIsLoadingData] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [showCreationBox, setShowCreationBox] = useState(false);

    // Transaction Modal State
    const [showTransactionModal, setShowTransactionModal] = useState(false);
    const [transactionData, setTransactionData] = useState<any>(null);
    const transactionModalRef = React.useRef<any>(null);

    useEffect(() => {
        if (isReady && user) {
            fetchUserData();
            fetchDashboardData();
        }
    }, [isReady, user]);

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
                    try { const parsed = JSON.parse(userData.avatar); setProfileIcon(parsed); } catch { setProfileIcon({ imageUri: userData.avatar }); }
                } else if (userData.profileEmoji) { setProfileIcon({ emoji: userData.profileEmoji }); }
                else if (userData.profileColorIndex !== undefined) { setProfileIcon({ colorIndex: userData.profileColorIndex }); }
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
            today.setHours(0, 0, 0, 0); // Normalize today
            const nextWeek = new Date(today);
            nextWeek.setDate(today.getDate() + 7);

            const newCounts = {
                reminders: { invoices: 0, contracts: 0, links: 0 },
                inProgress: { projects: 0, milestones: 0 },
                dueSoon: { invoices: 0, milestones: 0, projects: 0, links: 0 }
            };

            // Process Invoices
            if (invoicesRes.success && invoicesRes.data.documents) {
                invoicesRes.data.documents.forEach((inv: any) => {
                    if (inv.status === 'PAID') return;

                    if (inv.content?.due_date) {
                        const due = new Date(inv.content.due_date);
                        if (due < today) {
                            newCounts.reminders.invoices++; // Overdue
                        } else if (due <= nextWeek) {
                            newCounts.dueSoon.invoices++;
                        }
                    } else {
                        // No date = Reminders (Immediate Attention)
                        newCounts.reminders.invoices++;
                    }
                });
            }

            // Process Contracts
            if (contractsRes.success && contractsRes.data.documents) {
                contractsRes.data.documents.forEach((con: any) => {
                    if (['SENT', 'VIEWED', 'ACTIVE'].includes(con.status)) {
                        newCounts.reminders.contracts++;
                    }
                });
            }

            // Process Links
            if (linksRes.success && linksRes.data.documents) {
                linksRes.data.documents.forEach((link: any) => {
                    if (link.status === 'PAID') return;
                    if (link.content?.due_date) {
                        const due = new Date(link.content.due_date);
                        if (due <= nextWeek && due >= today) {
                            newCounts.dueSoon.links++;
                        } else if (due < today) {
                            newCounts.reminders.links++;
                        }
                    }
                });
            }

            // Process Projects & Milestones
            if (projectsRes.success && projectsRes.data.projects) {
                projectsRes.data.projects.forEach((proj: any) => {
                    // Active Projects
                    if (['ongoing', 'active'].includes(proj.status?.toLowerCase())) {
                        newCounts.inProgress.projects++;

                        // Check Project Deadline
                        if (proj.deadline) {
                            const deadline = new Date(proj.deadline);
                            if (deadline <= nextWeek && deadline >= today) {
                                newCounts.dueSoon.projects++;
                            }
                        }
                    }

                    // Milestones
                    if (proj.milestones) {
                        proj.milestones.forEach((m: any) => {
                            if (['pending', 'in_progress'].includes(m.status)) {
                                newCounts.inProgress.milestones++;

                                if (m.dueDate) {
                                    const due = new Date(m.dueDate);
                                    if (due <= nextWeek && due >= today) {
                                        newCounts.dueSoon.milestones++;
                                    }
                                }
                            }
                        });
                    }
                });
            }

            setCounts(newCounts);

        } catch (error) {
            console.error('Failed to fetch data', error);
        } finally {
            setIsLoadingData(false);
            setRefreshing(false);
        }
    };

    const renderSummaryRow = (label: string, count: number, badgeText: string | null, onPress: () => void) => {
        if (count === 0 && !badgeText) return null;

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
        // Small delay to allow modal to mount before presenting if it uses imperative present
        setTimeout(() => {
            transactionModalRef.current?.present();
        }, 100);
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
            <View style={[styles.header, { backgroundColor: themeColors.background }]}>
                <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]}>Home</Text>
                <View style={styles.headerRight}>
                    <TouchableOpacity style={styles.iconButton} onPress={() => router.push('/settings')}><Gear size={24} color={themeColors.textPrimary} /></TouchableOpacity>
                    <TouchableOpacity style={styles.iconButton} onPress={() => router.push('/notifications')}><Bell size={24} color={themeColors.textPrimary} /></TouchableOpacity>
                    <TouchableOpacity onPress={() => setShowProfileModal(true)}>
                        {profileIcon?.imageUri ? <Image source={{ uri: profileIcon.imageUri }} style={styles.avatar} /> :
                            <View style={[styles.avatar, { backgroundColor: themeColors.surface, justifyContent: 'center', alignItems: 'center' }]}>
                                <Text style={{ fontSize: 16 }}>{profileIcon.emoji || userName.firstName?.[0] || 'U'}</Text>
                            </View>}
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView
                style={styles.scrollView}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={() => { setRefreshing(true); fetchDashboardData(); }}
                    />
                }
                contentContainerStyle={{ paddingBottom: 100 }}
            >
                <View style={[styles.searchContainer, { backgroundColor: themeColors.surface }]}>
                    <MagnifyingGlass size={20} color={themeColors.textSecondary} />
                    <TextInput
                        style={[styles.searchInput, { color: themeColors.textPrimary }]}
                        placeholder="Search"
                        placeholderTextColor={themeColors.textSecondary}
                    />
                </View>

                <Text style={[styles.mainHeading, { color: themeColors.textPrimary }]}>Your Activity</Text>


                {/* Reminders Section */}
                <View style={styles.sectionContainer}>
                    <Text style={[styles.sectionHeader, { color: themeColors.textPrimary }]}>Reminders</Text>
                    <View style={styles.cardContainer}>
                        {renderSummaryRow('Invoices', counts.reminders.invoices, 'Due today', () => router.push('/(tabs)/invoices?filter=due_today'))}
                        {renderSummaryRow('Awaiting contract signatures', counts.reminders.contracts, null, () => router.push('/(tabs)/contracts?filter=sent'))}
                        {renderSummaryRow('Payment links expiring today', counts.reminders.links, null, () => router.push('/(tabs)/links'))}
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
                        {renderSummaryRow('Invoices due this week', counts.dueSoon.invoices, null, () => router.push('/(tabs)/invoices?filter=due_soon'))}
                        {renderSummaryRow('Projects due soon', counts.dueSoon.projects, null, () => router.push('/(tabs)/projects?filter=due_soon'))}
                        {renderSummaryRow('Payment links due soon', counts.dueSoon.links, null, () => router.push('/(tabs)/links?filter=due_soon'))}
                        {renderSummaryRow('Milestones due soon', counts.dueSoon.milestones, null, () => { })}
                    </View>
                </View>

            </ScrollView>

            <TouchableOpacity style={[styles.fab, { backgroundColor: '#2563EB' }]} onPress={() => setShowCreationBox(true)}><Plus size={32} color="#FFFFFF" weight="bold" /></TouchableOpacity>

            <ProfileModal visible={showProfileModal} onClose={() => setShowProfileModal(false)} userName={userName} walletAddresses={walletAddresses} profileIcon={profileIcon} />
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
                    // Optionally refresh data or show success toast
                }}
            />
        </SafeAreaView>
    );
}



const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingBottom: 12,
        paddingTop: 8,
    },
    headerTitle: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 28 },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    iconButton: { padding: 4 },
    avatar: { width: 36, height: 36, borderRadius: 18 },
    scrollView: { flex: 1, paddingHorizontal: 20 },
    searchContainer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 48, borderRadius: 12, marginBottom: 24 },
    searchInput: { flex: 1, marginLeft: 12, fontFamily: 'GoogleSansFlex_400Regular', fontSize: 16, height: '100%' },
    mainHeading: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 24, marginBottom: 16, marginTop: 12 },
    sectionContainer: { marginBottom: 24 },
    sectionHeader: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 18, marginBottom: 12 },
    cardContainer: { borderRadius: 16, overflow: 'hidden' },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 18, paddingHorizontal: 20, marginBottom: 1 }, // mb 1 for separator effect or use border
    rowLabel: { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 16 },
    rowRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
    badgeText: { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 12, color: '#475569' },
    countBadge: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
    countText: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 14, color: '#475569' },
    fab: { position: 'absolute', bottom: 110, right: 24, width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 5 },
});
