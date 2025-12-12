
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
    LayoutAnimation
} from 'react-native';
import { useRouter } from 'expo-router';
import { usePrivy } from '@privy-io/expo';
import { List, X, Copy, CheckCircle, ArrowUpRight, ArrowDownLeft, Wallet, Receipt, Link as LinkIcon, ArrowsLeftRight } from 'phosphor-react-native';
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import * as Haptics from 'expo-haptics';
import { format, isToday, isYesterday } from 'date-fns';

import { Colors } from '../../theme/colors';
import { Sidebar } from '../../components/Sidebar';
import { ProfileModal } from '../../components/ProfileModal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');
const API_URL = Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';

// Profile color options for gradient backgrounds
const PROFILE_COLOR_OPTIONS: [string, string][] = [
    ['#667eea', '#764ba2'],
    ['#f093fb', '#f5576c'],
    ['#4facfe', '#00f2fe'],
    ['#43e97b', '#38f9d7'],
    ['#fa709a', '#fee140'],
    ['#a8edea', '#fed6e3'],
    ['#ff9a9e', '#fecfef'],
    ['#ffecd2', '#fcb69f'],
];

interface Transaction {
    id: string;
    type: 'IN' | 'OUT';
    description: string;
    amount: string;
    token: string;
    date: string;
    hash: string;
    network: 'base' | 'celo' | 'solana';
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

    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    // Profile Modal
    const [isProfileModalVisible, setIsProfileModalVisible] = useState(false);
    const [userData, setUserData] = useState<UserData | null>(null);
    const [profileIcon, setProfileIcon] = useState<{ type: 'emoji' | 'image'; emoji?: string; imageUri?: string; colorIndex?: number }>({
        type: 'emoji',
        emoji: '👤',
        colorIndex: 0
    });

    // Detail Modal
    const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
    const [isDetailModalVisible, setIsDetailModalVisible] = useState(false);

    useEffect(() => {
        fetchTransactions();
        fetchUserData();
    }, []);

    const fetchUserData = async () => {
        try {
            const token = await getAccessToken();
            if (!token) return;

            const response = await fetch(`${API_URL}/api/users/profile`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const responseData = await response.json();
                const user = responseData.data?.user || responseData.user;
                setUserData(user);

                // Parse avatar from API response (stored as JSON string in database)
                if (user?.avatar) {
                    try {
                        const avatarData = typeof user.avatar === 'string'
                            ? JSON.parse(user.avatar)
                            : user.avatar;

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
                    } catch (parseError) {
                        console.error('Error parsing avatar:', parseError);
                    }
                }
            }
        } catch (error) {
            console.error('Error fetching user:', error);
        }
    };

    const fetchTransactions = async () => {
        try {
            setIsLoading(true);
            const token = await getAccessToken();
            if (!token) return;

            const response = await fetch(`${API_URL}/api/transactions`, {
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

    const copyToClipboard = async (text: string) => {
        await Clipboard.setStringAsync(text);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    };

    const openExplorer = async (tx: Transaction) => {
        let url = '';
        if (tx.network === 'base') url = `https://sepolia.basescan.org/tx/${tx.hash}`;
        if (tx.network === 'celo') url = `https://alfajores.celoscan.io/tx/${tx.hash}`;
        if (tx.network === 'solana') url = `https://explorer.solana.com/tx/${tx.hash}?cluster=devnet`;

        if (url) {
            await WebBrowser.openBrowserAsync(url, {
                presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
                controlsColor: Colors.primary
            });
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

        return (
            <TouchableOpacity
                style={styles.txItem}
                onPress={() => {
                    setSelectedTransaction(item);
                    setIsDetailModalVisible(true);
                }}
            >
                <View style={styles.txIconContainer}>
                    <View style={[styles.txIconBase, { backgroundColor: isReceived ? '#EDF7ED' : '#F1F5F9' }]}>
                        {isReceived ? (
                            <ArrowDownLeft size={24} color={Colors.success} weight="bold" />
                        ) : (
                            <ArrowUpRight size={24} color={Colors.textSecondary} weight="bold" />
                        )}
                    </View>
                    {/* Small Network Badge */}
                    <View style={styles.networkBadge}>
                        {/* Simply using text for network letter for now to avoid svg complexity issues in this snippet */}
                        <Text style={styles.networkBadgeText}>
                            {item.network === 'base' ? 'B' : item.network === 'celo' ? 'C' : 'S'}
                        </Text>
                    </View>
                </View>

                <View style={styles.txContent}>
                    <Text style={styles.txTitle}>{isReceived ? 'Received' : 'Sent'}</Text>
                    <Text style={styles.txSubtitle} numberOfLines={1} ellipsizeMode="middle">
                        {isReceived ? `From ${item.from}` : `To ${item.to}`}
                    </Text>
                </View>

                <View style={styles.txAmountContainer}>
                    <Text style={[styles.txAmount, { color: isReceived ? Colors.success : Colors.error }]}>
                        {isReceived ? '+' : '-'}{item.amount} {item.token}
                    </Text>
                    {/* Placeholder fiat value (since we don't have real-time rates hooked up yet) */}
                    <Text style={styles.txFiatAmount}>
                        ≈ ${parseFloat(item.amount).toFixed(2)}
                    </Text>
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
            <SafeAreaView style={styles.safeArea}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => setIsSidebarOpen(true)} style={styles.headerButton}>
                        <List size={24} color={Colors.textPrimary} weight="bold" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Transactions</Text>
                    <TouchableOpacity onPress={() => setIsProfileModalVisible(true)} style={styles.headerButton}>
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
                            <Text style={styles.sectionHeader}>{title}</Text>
                        )}
                        contentContainerStyle={styles.listContent}
                        showsVerticalScrollIndicator={false}
                    />
                )}
            </SafeAreaView>

            <Sidebar
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
                userName={userData ? { firstName: userData.firstName, lastName: userData.lastName } : undefined}
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
                animationType="slide"
                onRequestClose={() => setIsDetailModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <TouchableOpacity onPress={() => setIsDetailModalVisible(false)} style={styles.closeButton}>
                                <X size={20} color={Colors.textPrimary} />
                            </TouchableOpacity>
                        </View>

                        {selectedTransaction && (
                            <View style={styles.detailBody}>
                                <View style={styles.detailIconContainer}>
                                    <View style={[styles.detailIconRing, { backgroundColor: selectedTransaction.type === 'IN' ? '#EDF7ED' : '#F1F5F9' }]}>
                                        {selectedTransaction.type === 'IN' ? (
                                            <ArrowDownLeft size={32} color={Colors.success} weight="bold" />
                                        ) : (
                                            <ArrowUpRight size={32} color={Colors.textSecondary} weight="bold" />
                                        )}
                                    </View>
                                    <Text style={styles.detailTitle}>
                                        {selectedTransaction.type === 'IN' ? 'Received from' : 'Sent to'} {selectedTransaction.type === 'IN' ? selectedTransaction.from.slice(0, 4) + '...' + selectedTransaction.from.slice(-4) : selectedTransaction.to.slice(0, 4) + '...' + selectedTransaction.to.slice(-4)}
                                    </Text>
                                    <Text style={styles.detailDate}>
                                        {format(new Date(selectedTransaction.date), 'MMM d, yyyy • h:mm a')}
                                    </Text>
                                </View>

                                <View style={styles.detailAmountCard}>
                                    <Text style={styles.detailAmountBig}>
                                        {selectedTransaction.amount} {selectedTransaction.token}
                                    </Text>
                                    <Text style={styles.detailFiatBig}>
                                        ≈ ${parseFloat(selectedTransaction.amount).toFixed(2)}
                                    </Text>
                                </View>

                                <View style={styles.detailRows}>
                                    <View style={styles.detailRow}>
                                        <View style={styles.detailRowLeft}>
                                            <Receipt size={18} color={Colors.textSecondary} />
                                            <Text style={styles.detailRowLabel}>Transaction ID</Text>
                                        </View>
                                        <TouchableOpacity
                                            style={styles.detailRowValueContainer}
                                            onPress={() => copyToClipboard(selectedTransaction.hash)}
                                        >
                                            <Text style={styles.detailRowValue} numberOfLines={1} ellipsizeMode="middle">
                                                {selectedTransaction.hash}
                                            </Text>
                                            <Copy size={14} color={Colors.textTertiary} />
                                        </TouchableOpacity>
                                    </View>

                                    <View style={styles.detailRow}>
                                        <View style={styles.detailRowLeft}>
                                            <Wallet size={18} color={Colors.textSecondary} />
                                            <Text style={styles.detailRowLabel}>Network</Text>
                                        </View>
                                        <View style={styles.detailRowValueContainer}>
                                            <Text style={[styles.detailRowValue, { textTransform: 'capitalize' }]}>
                                                {selectedTransaction.network}
                                            </Text>
                                        </View>
                                    </View>

                                    <TouchableOpacity
                                        style={styles.viewExplorerButton}
                                        onPress={() => openExplorer(selectedTransaction)}
                                    >
                                        <Text style={styles.viewExplorerText}>View on Explorer</Text>
                                        <ArrowUpRight size={16} color={Colors.primary} weight="bold" />
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}
                    </View>
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
    headerButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 20,
        backgroundColor: '#F3F4F6',
    },
    headerTitle: {
        fontFamily: 'RethinkSans_700Bold',
        fontSize: 18,
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
    sectionHeader: {
        fontFamily: 'RethinkSans_600SemiBold',
        fontSize: 16,
        color: Colors.textPrimary,
        marginTop: 24,
        marginBottom: 12,
        backgroundColor: '#FFFFFF',
    },
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
    txIconBase: {
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
    },
    networkBadge: {
        position: 'absolute',
        bottom: -2,
        right: -2,
        backgroundColor: Colors.textPrimary,
        width: 18,
        height: 18,
        borderRadius: 9,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#FFFFFF',
    },
    networkBadgeText: {
        color: '#FFFFFF',
        fontSize: 8,
        fontWeight: 'bold',
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
    // Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingBottom: 40,
        height: '60%',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        padding: 16,
    },
    closeButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#F3F4F6',
        justifyContent: 'center',
        alignItems: 'center',
    },
    detailBody: {
        alignItems: 'center',
        paddingHorizontal: 24,
    },
    detailIconContainer: {
        alignItems: 'center',
        marginBottom: 24,
    },
    detailIconRing: {
        marginBottom: 16,
        width: 64,
        height: 64,
        borderRadius: 32,
        justifyContent: 'center',
        alignItems: 'center',
    },
    detailTitle: {
        fontFamily: 'RethinkSans_700Bold',
        fontSize: 18,
        color: Colors.textPrimary,
        marginBottom: 6,
        textAlign: 'center',
    },
    detailDate: {
        fontFamily: 'RethinkSans_500Medium',
        fontSize: 14,
        color: Colors.textSecondary,
    },
    detailAmountCard: {
        backgroundColor: '#F9FAFB',
        borderRadius: 16,
        padding: 24,
        width: '100%',
        alignItems: 'center',
        marginBottom: 32,
        borderWidth: 1,
        borderColor: '#F3F4F6',
    },
    detailAmountBig: {
        fontFamily: 'RethinkSans_700Bold',
        fontSize: 32,
        color: Colors.textPrimary,
        marginBottom: 4,
    },
    detailFiatBig: {
        fontFamily: 'RethinkSans_500Medium',
        fontSize: 16,
        color: Colors.textSecondary,
    },
    detailRows: {
        width: '100%',
    },
    detailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    detailRowLeft: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    detailRowLabel: {
        fontFamily: 'RethinkSans_500Medium',
        fontSize: 15,
        color: Colors.textSecondary,
        marginLeft: 10,
    },
    detailRowValueContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        justifyContent: 'flex-end',
        marginLeft: 20,
    },
    detailRowValue: {
        fontFamily: 'RethinkSans_500Medium',
        fontSize: 15,
        color: Colors.textPrimary,
        marginRight: 6,
    },
    viewExplorerButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        marginTop: 8,
    },
    viewExplorerText: {
        fontFamily: 'RethinkSans_600SemiBold',
        fontSize: 15,
        color: Colors.primary,
        marginRight: 6,
    },
});
