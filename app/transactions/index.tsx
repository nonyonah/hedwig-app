
import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
    Dimensions,
    Alert,
    SafeAreaView,
    ActivityIndicator,
    SectionList,
    Platform,
    Image,
    LayoutAnimation,
    Animated
} from 'react-native';
import { useRouter } from 'expo-router';
import { usePrivy } from '@privy-io/expo';
import { List, X, Copy, CheckCircle, ArrowUpRight, ArrowDownLeft, Wallet, Receipt, Link as LinkIcon, ArrowsLeftRight } from 'phosphor-react-native';
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import * as Haptics from 'expo-haptics';
import { format, isToday, isYesterday } from 'date-fns';

import { Colors } from '../../theme/colors';
import { Typography } from '../../styles/typography';
import { Sidebar } from '../../components/Sidebar';
import { ProfileModal } from '../../components/ProfileModal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useSettings } from '../../context/SettingsContext';
import { formatCurrency } from '../../utils/currencyUtils';
import { ModalBackdrop, modalHaptic } from '../../components/ui/ModalStyles';

const { width } = Dimensions.get('window');

// Icons for tokens, networks, and status (matching invoices/payment-links screens)
const ICONS = {
    eth: require('../../assets/icons/tokens/eth.png'),
    usdc: require('../../assets/icons/tokens/usdc.png'),
    usdt: require('../../assets/icons/tokens/usdt.png'),
    base: require('../../assets/icons/networks/base.png'),
    solana: require('../../assets/icons/networks/solana.png'),
    statusSuccess: require('../../assets/icons/status/success.png'),
    statusPending: require('../../assets/icons/status/pending.png'),
    statusFailed: require('../../assets/icons/status/failed.png'),
    send: require('../../assets/icons/status/send.png'),
    receive: require('../../assets/icons/status/receive.png'),
};

const CHAINS: Record<string, { name: string; icon: any }> = {
    'base': { name: 'Base', icon: ICONS.base },
    'solana': { name: 'Solana', icon: ICONS.solana },
};

// Map token symbols to available icons (fallback to eth for native tokens, usdc for stablecoins)
const TOKENS: Record<string, any> = {
    'ETH': ICONS.eth,
    'USDC': ICONS.usdc,
    'USDT': ICONS.usdt,
    'SOL': ICONS.eth, // Fallback to eth icon for SOL (no sol.png available)
};

// Profile color gradient options (same as in home screen)
const PROFILE_COLOR_OPTIONS: readonly [string, string, string][] = [
    ['#60A5FA', '#3B82F6', '#2563EB'], // Blue
    ['#34D399', '#10B981', '#059669'], // Green
    ['#F472B6', '#EC4899', '#DB2777'], // Pink
    ['#FBBF24', '#F59E0B', '#D97706'], // Amber
    ['#A78BFA', '#8B5CF6', '#7C3AED'], // Purple
    ['#F87171', '#EF4444', '#DC2626'], // Red
    ['#38BDF8', '#0EA5E9', '#0284C7'], // Sky
    ['#4ADE80', '#22C55E', '#16A34A'], // Emerald
];

interface Transaction {
    id: string;
    type: 'IN' | 'OUT';
    description: string;
    amount: string;
    token: string;
    date: string;
    hash: string;
    network: 'base' | 'solana';
    status: 'completed' | 'pending' | 'failed';
    from: string;
    to: string;
}

interface UserData {
    firstName: string;
    lastName: string;
    email: string;
    ethereumWalletAddress?: string;
    solanaWalletAddress?: string;
    avatar?: string;
}

export default function TransactionsScreen() {
    const router = useRouter();
    const { getAccessToken, user } = usePrivy();
    const insets = useSafeAreaInsets();
    const settings = useSettings();
    const currency = settings?.currency || 'USD';
    const hapticsEnabled = settings?.hapticsEnabled ?? true;

    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [conversations, setConversations] = useState<any[]>([]);

    // Profile Modal
    const [isProfileModalVisible, setIsProfileModalVisible] = useState(false);
    const [userData, setUserData] = useState<UserData | null>(null);
    const [profileIcon, setProfileIcon] = useState<{ type: 'emoji' | 'image'; emoji?: string; imageUri?: string; colorIndex?: number }>({
        type: 'emoji',
        colorIndex: 0 // Start with gradient, no emoji (loading state)
    });

    // Detail Modal with slide animation
    const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
    const [isDetailModalVisible, setIsDetailModalVisible] = useState(false);
    const slideAnim = useRef(new Animated.Value(0)).current;
    const modalOpacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        fetchTransactions();
        fetchUserData();
        fetchConversations();
    }, []);

    const fetchUserData = async () => {
        try {
            const token = await getAccessToken();
            if (!token) return;
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
            const response = await fetch(`${apiUrl}/api/users/profile`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const responseData = await response.json();
                const user = responseData.data?.user || responseData.user;
                setUserData(user);

                // Parse avatar from API response (stored as JSON string in database or as data URI)
                if (user?.avatar) {
                    try {
                        // Check if it's a JSON string (starts with {) or direct image URI
                        if (typeof user.avatar === 'string' && user.avatar.trim().startsWith('{')) {
                            const avatarData = JSON.parse(user.avatar);
                            if (avatarData.imageUri) {
                                setProfileIcon({
                                    type: 'image',
                                    imageUri: avatarData.imageUri,
                                    colorIndex: avatarData.colorIndex || 0
                                });
                            } else if (avatarData.emoji) {
                                setProfileIcon({
                                    type: 'emoji',
                                    emoji: avatarData.emoji,
                                    colorIndex: avatarData.colorIndex || 0
                                });
                            }
                        } else if (typeof user.avatar === 'string' && user.avatar.startsWith('data:')) {
                            // Direct data URI
                            setProfileIcon({
                                type: 'image',
                                imageUri: user.avatar,
                                colorIndex: 0
                            });
                        }
                    } catch (parseError) {
                        console.error('Error parsing avatar:', parseError);
                    }
                }
            }
        } catch (error) {
            console.error('Error fetching user:', error);
        }
    };

    const fetchConversations = async () => {
        try {
            const token = await getAccessToken();
            if (!token) return;

            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
            const response = await fetch(`${apiUrl}/api/chat/conversations`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                setConversations(data.data || []);
            }
        } catch (error) {
            console.error('Error fetching conversations:', error);
        }
    };

    const fetchTransactions = async () => {
        try {
            setIsLoading(true);
            const token = await getAccessToken();
            if (!token) return;

            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
            const response = await fetch(`${apiUrl}/api/transactions`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                setTransactions(data.data || []);
            } else {
                console.error('Failed to fetch transactions');
            }
        } catch (error) {
            console.error('Error fetching transactions:', error);
        } finally {
            setIsLoading(false);
        }
    };

    // Modal open/close with spring animation (matching payment-links/invoices)
    const openModal = (tx: Transaction) => {
        setSelectedTransaction(tx);
        setIsDetailModalVisible(true);
        modalHaptic('open', hapticsEnabled);
        Animated.parallel([
            Animated.spring(slideAnim, {
                toValue: 1,
                useNativeDriver: true,
                damping: 25,
                stiffness: 300,
            }),
            Animated.timing(modalOpacity, {
                toValue: 1,
                duration: 200,
                useNativeDriver: true,
            }),
        ]).start();
    };

    const closeModal = () => {
        modalHaptic('close', hapticsEnabled);
        Animated.parallel([
            Animated.timing(slideAnim, {
                toValue: 0,
                duration: 150,
                useNativeDriver: true,
            }),
            Animated.timing(modalOpacity, {
                toValue: 0,
                duration: 150,
                useNativeDriver: true,
            }),
        ]).start(() => setIsDetailModalVisible(false));
    };

    const copyToClipboard = async (text: string) => {
        await Clipboard.setStringAsync(text);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    };

    const openExplorer = async (tx: Transaction) => {
        console.log('[Transactions] Opening explorer for:', tx.network, 'hash:', tx.hash);

        if (!tx.hash) {
            Alert.alert('Error', 'Transaction hash not available');
            return;
        }

        let url = '';
        if (tx.network === 'base') {
            url = `https://basescan.org/tx/${tx.hash}`;
        } else if (tx.network === 'solana') {
            url = `https://explorer.solana.com/tx/${tx.hash}`;
        }

        console.log('[Transactions] Explorer URL:', url);

        if (url) {
            try {
                await WebBrowser.openBrowserAsync(url, {
                    presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
                    controlsColor: Colors.primary
                });
            } catch (error) {
                console.error('[Transactions] Failed to open explorer:', error);
                Alert.alert('Error', 'Failed to open block explorer');
            }
        } else {
            Alert.alert('Error', 'Explorer not available for this network');
        }
    };

    // Grouping logic for SectionList
    const groupedTransactions = transactions.reduce((acc: any, tx) => {
        const date = new Date(tx.date);
        let title = format(date, 'MMM d');
        if (isToday(date)) title = 'Today';
        if (isYesterday(date)) title = 'Yesterday';

        const existingSection = acc.find((s: any) => s.title === title);
        if (existingSection) {
            existingSection.data.push(tx);
        } else {
            acc.push({ title, data: [tx] });
        }
        return acc;
    }, []);

    const renderTransactionItem = ({ item }: { item: Transaction }) => {
        const isReceived = item.type === 'IN';
        const tokenIcon = TOKENS[item.token.toUpperCase()] || ICONS.usdc;
        const chainInfo = CHAINS[item.network] || CHAINS.base;

        return (
            <TouchableOpacity
                style={styles.txItem}
                onPress={() => openModal(item)}
            >
                {/* Token Icon with Chain Badge (like invoice/payment-links cards) */}
                <View style={styles.txIconContainer}>
                    <Image source={tokenIcon} style={styles.txTokenIcon} />
                    <View style={styles.chainBadge}>
                        <Image source={chainInfo.icon} style={styles.chainBadgeIcon} />
                    </View>
                </View>

                <View style={styles.txContent}>
                    <Text style={styles.txTitle}>{isReceived ? 'Received' : 'Sent'}</Text>
                    <Text style={styles.txSubtitle} numberOfLines={1} ellipsizeMode="middle">
                        {isReceived ? `From ${item.from.slice(0, 6)}...${item.from.slice(-4)}` : `To ${item.to.slice(0, 6)}...${item.to.slice(-4)}`}
                    </Text>
                </View>

                <View style={styles.txAmountContainer}>
                    <Text style={[styles.txAmount, { color: isReceived ? Colors.success : Colors.textPrimary }]}>
                        {isReceived ? '+' : '-'}{item.amount} {item.token}
                    </Text>
                    <Text style={styles.txFiatAmount}>
                        ≈ {formatCurrency(item.amount || '0', currency)}
                    </Text>
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
            <SafeAreaView style={styles.safeArea}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => setIsSidebarOpen(true)}>
                        <List size={24} color={Colors.textPrimary} weight="bold" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Transactions</Text>
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

                {isLoading ? (
                    <View style={styles.centered}>
                        <ActivityIndicator size="large" color={Colors.primary} />
                    </View>
                ) : transactions.length === 0 ? (
                    <View style={styles.emptyState}>
                        <ArrowsLeftRight size={48} color={Colors.textTertiary} weight="thin" />
                        <Text style={styles.emptyTitle}>No transactions yet</Text>
                        <Text style={styles.emptyText}>Your transaction history will appear here.</Text>
                    </View>
                ) : (
                    <SectionList
                        sections={groupedTransactions}
                        keyExtractor={(item) => item.id}
                        renderItem={renderTransactionItem}
                        renderSectionHeader={({ section: { title } }) => (
                            <View style={styles.sectionHeaderContainer}>
                                <Text style={styles.sectionHeader}>{title}</Text>
                            </View>
                        )}
                        contentContainerStyle={styles.listContent}
                        showsVerticalScrollIndicator={false}
                        stickySectionHeadersEnabled={true}
                    />
                )}
            </SafeAreaView>

            <Sidebar
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
                userName={userData ? { firstName: userData.firstName, lastName: userData.lastName } : undefined}
                conversations={conversations}
                onHomeClick={() => router.push('/')}
                onLoadConversation={(id) => router.push(`/?conversationId=${id}`)}
            />

            {/* Profile Modal */}
            <ProfileModal
                visible={isProfileModalVisible}
                onClose={() => setIsProfileModalVisible(false)}
                userName={userData ? { firstName: userData.firstName, lastName: userData.lastName } : undefined}
                walletAddresses={{
                    evm: userData?.ethereumWalletAddress,
                    solana: userData?.solanaWalletAddress
                }}
                profileIcon={profileIcon}
                onProfileUpdate={fetchUserData}
            />

            {/* Transaction Detail Modal */}
            <Modal
                visible={isDetailModalVisible}
                transparent
                animationType="none"
                onRequestClose={closeModal}
            >
                <View style={styles.modalOverlay}>
                    <ModalBackdrop opacity={modalOpacity} />
                    <TouchableOpacity style={StyleSheet.absoluteFill} onPress={closeModal} />
                    <Animated.View
                        style={[
                            styles.modalContent,
                            {
                                transform: [{
                                    translateY: slideAnim.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: [600, 0]
                                    })
                                }]
                            }
                        ]}
                    >
                        <View style={styles.modalHeader}>
                            <View style={styles.modalHeaderLeft}>
                                {/* Token icon with send/receive badge */}
                                <View style={styles.modalIconContainer}>
                                    <Image
                                        source={TOKENS[selectedTransaction?.token?.toUpperCase() || 'USDC'] || ICONS.usdc}
                                        style={styles.modalTokenIcon}
                                    />
                                    <Image
                                        source={selectedTransaction?.type === 'IN' ? ICONS.receive : ICONS.send}
                                        style={styles.modalStatusBadge}
                                    />
                                </View>
                                <View>
                                    <Text style={styles.modalTitle}>
                                        {selectedTransaction?.type === 'IN' ? 'Received' : 'Sent'}
                                    </Text>
                                    <Text style={styles.modalSubtitle}>
                                        {selectedTransaction?.date ? format(new Date(selectedTransaction.date), 'MMM d, yyyy • h:mm a') : ''}
                                    </Text>
                                </View>
                            </View>
                            <TouchableOpacity onPress={closeModal} style={styles.closeButton}>
                                <X size={20} color={Colors.textSecondary} />
                            </TouchableOpacity>
                        </View>

                        {selectedTransaction && (
                            <>
                                {/* Amount Card */}
                                <View style={styles.amountCard}>
                                    <Text style={styles.amountCardValue}>
                                        {selectedTransaction.type === 'IN' ? '+' : '-'}${selectedTransaction.amount}
                                    </Text>
                                    <View style={styles.amountCardSub}>
                                        <Image source={TOKENS[selectedTransaction.token.toUpperCase()] || ICONS.usdc} style={styles.smallIcon} />
                                        <Text style={styles.amountCardSubText}>{selectedTransaction.amount} {selectedTransaction.token}</Text>
                                    </View>
                                </View>

                                {/* Details Card */}
                                <View style={styles.detailsCard}>
                                    <View style={styles.detailRow}>
                                        <Text style={styles.detailLabel}>Transaction ID</Text>
                                        <TouchableOpacity onPress={() => copyToClipboard(selectedTransaction.hash)} style={styles.detailValueRow}>
                                            <Text style={styles.detailValue} numberOfLines={1} ellipsizeMode="middle">
                                                {selectedTransaction.hash.slice(0, 10)}...{selectedTransaction.hash.slice(-8)}
                                            </Text>
                                            <Copy size={14} color={Colors.textTertiary} style={{ marginLeft: 6 }} />
                                        </TouchableOpacity>
                                    </View>
                                    <View style={styles.detailDivider} />
                                    <View style={styles.detailRow}>
                                        <Text style={styles.detailLabel}>{selectedTransaction.type === 'IN' ? 'From' : 'To'}</Text>
                                        <Text style={styles.detailValue}>
                                            {selectedTransaction.type === 'IN'
                                                ? `${selectedTransaction.from.slice(0, 6)}...${selectedTransaction.from.slice(-4)}`
                                                : `${selectedTransaction.to.slice(0, 6)}...${selectedTransaction.to.slice(-4)}`
                                            }
                                        </Text>
                                    </View>
                                    <View style={styles.detailDivider} />
                                    <View style={styles.detailRow}>
                                        <Text style={styles.detailLabel}>Chain</Text>
                                        <View style={styles.chainValue}>
                                            <Image
                                                source={CHAINS[selectedTransaction.network]?.icon || ICONS.base}
                                                style={styles.smallIcon}
                                            />
                                            <Text style={styles.detailValue}>
                                                {CHAINS[selectedTransaction.network]?.name || 'Base'}
                                            </Text>
                                        </View>
                                    </View>
                                </View>

                                <TouchableOpacity
                                    style={styles.viewButton}
                                    onPress={() => openExplorer(selectedTransaction)}
                                >
                                    <Text style={styles.viewButtonText}>View on Explorer</Text>
                                </TouchableOpacity>
                            </>
                        )}
                    </Animated.View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#FFFFFF',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 16,
        justifyContent: 'space-between',
    },
    headerTitle: {
        fontFamily: 'RethinkSans_700Bold',
        fontSize: 22,
        color: Colors.textPrimary,
    },
    profileIcon: {
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
    },
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    listContent: {
        paddingHorizontal: 20,
        paddingBottom: 40,
    },
    sectionHeaderContainer: {
        backgroundColor: '#FFFFFF',
        marginHorizontal: -20,
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 8,
    },
    sectionHeader: {
        fontFamily: 'RethinkSans_600SemiBold',
        fontSize: 16,
        color: Colors.textPrimary,
    },
    // Transaction Item Styles (matching invoice/payment-links cards)
    txItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    txIconContainer: {
        position: 'relative',
        marginRight: 16,
    },
    txTokenIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
    },
    chainBadge: {
        position: 'absolute',
        bottom: -2,
        right: -2,
        backgroundColor: '#FFFFFF',
        width: 20,
        height: 20,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#FFFFFF',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    chainBadgeIcon: {
        width: 16,
        height: 16,
        borderRadius: 8,
    },
    txContent: {
        flex: 1,
    },
    txTitle: {
        fontFamily: 'RethinkSans_600SemiBold',
        fontSize: 16,
        color: Colors.textPrimary,
        marginBottom: 2,
    },
    txSubtitle: {
        fontFamily: 'RethinkSans_500Medium',
        fontSize: 13,
        color: Colors.textSecondary,
    },
    txAmountContainer: {
        alignItems: 'flex-end',
    },
    txAmount: {
        fontFamily: 'RethinkSans_600SemiBold',
        fontSize: 15,
    },
    txFiatAmount: {
        fontFamily: 'RethinkSans_500Medium',
        fontSize: 13,
        color: Colors.textSecondary,
        marginTop: 2,
    },
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    emptyTitle: {
        fontFamily: 'RethinkSans_700Bold',
        fontSize: 18,
        color: Colors.textPrimary,
        marginTop: 16,
        marginBottom: 8,
    },
    emptyText: {
        fontFamily: 'RethinkSans_400Regular',
        fontSize: 15,
        color: Colors.textSecondary,
        textAlign: 'center',
    },
    // Modal Styles (matching invoice screen)
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 20,
        paddingBottom: 40,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 16,
    },
    modalHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    modalIconContainer: {
        position: 'relative',
        marginRight: 12,
    },
    modalTokenIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
    },
    modalStatusBadge: {
        position: 'absolute',
        bottom: -2,
        right: -2,
        width: 18,
        height: 18,
        borderRadius: 9,
    },
    modalTitle: {
        fontFamily: 'RethinkSans_700Bold',
        fontSize: 18,
        color: Colors.textPrimary,
    },
    modalSubtitle: {
        fontFamily: 'RethinkSans_500Medium',
        fontSize: 13,
        color: Colors.textSecondary,
        marginTop: 2,
    },
    closeButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#F3F4F6',
        justifyContent: 'center',
        alignItems: 'center',
    },
    // Amount Card
    amountCard: {
        backgroundColor: '#F9FAFB',
        borderRadius: 16,
        padding: 24,
        alignItems: 'center',
        marginBottom: 20,
        borderWidth: 1,
        borderColor: '#F3F4F6',
    },
    amountCardValue: {
        fontFamily: 'RethinkSans_700Bold',
        fontSize: 36,
        color: Colors.textPrimary,
        marginBottom: 8,
    },
    amountCardSub: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    amountCardSubText: {
        fontFamily: 'RethinkSans_500Medium',
        fontSize: 15,
        color: Colors.textSecondary,
        marginLeft: 6,
    },
    smallIcon: {
        width: 20,
        height: 20,
        borderRadius: 10,
    },
    // Details Card
    detailsCard: {
        backgroundColor: '#F9FAFB',
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: '#F3F4F6',
        marginBottom: 20,
    },
    detailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
    },
    detailDivider: {
        height: 1,
        backgroundColor: '#F3F4F6',
    },
    detailLabel: {
        fontFamily: 'RethinkSans_500Medium',
        fontSize: 15,
        color: Colors.textSecondary,
    },
    detailValue: {
        fontFamily: 'RethinkSans_500Medium',
        fontSize: 15,
        color: Colors.textPrimary,
    },
    detailValueRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    chainValue: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    viewButton: {
        backgroundColor: Colors.primary,
        borderRadius: 30,
        paddingVertical: 16,
        alignItems: 'center',
    },
    viewButtonText: {
        fontFamily: 'RethinkSans_600SemiBold',
        fontSize: 16,
        color: '#FFFFFF',
    },
});

