import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Modal, Image, Alert, RefreshControl, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePrivy } from '@privy-io/expo';
import { List, Receipt, Clock, CheckCircle, WarningCircle, X, UserCircle, ShareNetwork, Wallet, Trash } from 'phosphor-react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { Colors } from '../../theme/colors';
import { Typography } from '../../styles/typography';
import { Sidebar } from '../../components/Sidebar';
import { ProfileModal } from '../../components/ProfileModal';
import * as Clipboard from 'expo-clipboard';
import { Linking } from 'react-native';

// Icons for tokens and chains
const ICONS = {
    usdc: require('../../assets/icons/tokens/usdc.png'),
    base: require('../../assets/icons/networks/base.png'),
    celo: require('../../assets/icons/networks/celo.png'),
    arbitrum: require('../../assets/icons/networks/arbitrum.png'),
    optimism: require('../../assets/icons/networks/optimism.png'),
    statusPending: require('../../assets/icons/status/pending.png'),
    statusSuccess: require('../../assets/icons/status/success.png'),
    statusFailed: require('../../assets/icons/status/failed.png'),
};

const CHAINS: Record<string, any> = {
    'base': { name: 'Base', icon: ICONS.base },
    'celo': { name: 'Celo', icon: ICONS.celo },
    'arbitrum': { name: 'Arbitrum', icon: ICONS.arbitrum },
    'optimism': { name: 'Optimism', icon: ICONS.optimism },
};

export default function InvoicesScreen() {
    const router = useRouter();
    const { getAccessToken, user } = usePrivy();
    const [invoices, setInvoices] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
    const [showModal, setShowModal] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [userName, setUserName] = useState({ firstName: '', lastName: '' });
    const [walletAddresses, setWalletAddresses] = useState<{ evm?: string; solana?: string }>({});

    useEffect(() => {
        fetchInvoices();
    }, [user]);

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
                    setWalletAddresses({
                        evm: userData.ethereumWalletAddress || userData.baseWalletAddress || userData.celoWalletAddress,
                        solana: userData.solanaWalletAddress
                    });
                }
            } catch (error) {
                console.error('Failed to fetch user data:', error);
            }
        };
        fetchUserData();
    }, [user]);

    const fetchInvoices = async () => {
        try {
            const token = await getAccessToken();
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

            console.log('Fetching invoices...');
            const response = await fetch(`${apiUrl}/api/documents?type=INVOICE`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            console.log('Invoices response:', data);

            if (data.success) {
                setInvoices(data.data.documents);
            } else {
                console.error('Failed to fetch invoices:', data.error);
            }
        } catch (error) {
            console.error('Error fetching invoices:', error);
            Alert.alert('Error', 'Failed to load invoices');
        } finally {
            setIsLoading(false);
            setRefreshing(false);
        }
    };

    const onRefresh = () => {
        setRefreshing(true);
        fetchInvoices();
    };

    const handleDelete = async (invoiceId: string) => {
        Alert.alert(
            'Delete Invoice',
            'Are you sure you want to delete this invoice? This action cannot be undone.',
            [
                {
                    text: 'Cancel',
                    style: 'cancel',
                },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const token = await getAccessToken();
                            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

                            const response = await fetch(`${apiUrl}/api/documents/${invoiceId}`, {
                                method: 'DELETE',
                                headers: { 'Authorization': `Bearer ${token}` },
                            });

                            const data = await response.json();

                            if (data.success) {
                                setInvoices(prev => prev.filter(inv => inv.id !== invoiceId));
                                Alert.alert('Success', 'Invoice deleted successfully');
                            } else {
                                Alert.alert('Error', data.error?.message || 'Failed to delete invoice');
                            }
                        } catch (error) {
                            console.error('Failed to delete invoice:', error);
                            Alert.alert('Error', 'Failed to delete invoice');
                        }
                    }
                },
            ]
        );
    };

    const handleInvoicePress = (invoice: any) => {
        setSelectedInvoice(invoice);
        setShowModal(true);
    };

    const copyToClipboard = async (text: string) => {
        await Clipboard.setStringAsync(text);
        Alert.alert('Copied', 'Copied to clipboard');
    };

    const renderRightActions = (progress: any, dragX: any, item: any) => {
        const trans = dragX.interpolate({
            inputRange: [-100, 0],
            outputRange: [0, 100],
            extrapolate: 'clamp',
        });

        return (
            <Animated.View style={{ transform: [{ translateX: trans }] }}>
                <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => handleDelete(item.id)}
                >
                    <Trash size={24} color="#FFFFFF" weight="fill" />
                </TouchableOpacity>
            </Animated.View>
        );
    };

    const renderItem = ({ item }: { item: any }) => {
        const chainId = item.chain?.toLowerCase() || 'base';
        const chain = CHAINS[chainId] || CHAINS['base'];

        return (
            <Swipeable
                renderRightActions={(progress, dragX) => renderRightActions(progress, dragX, item)}
                overshootRight={false}
            >
                <TouchableOpacity style={styles.card} onPress={() => handleInvoicePress(item)}>
                    <View style={styles.cardHeader}>
                        <Text style={styles.cardTitle}>{item.title || 'Invoice'}</Text>
                        <View style={styles.amountBadge}>
                            <Image source={ICONS.usdc} style={styles.badgeIcon} />
                            <View style={styles.chainBadgeSmall}>
                                <Image source={chain.icon} style={styles.chainBadgeIconSmall} />
                            </View>
                        </View>
                    </View>

                    <Text style={styles.amount}>${item.amount}</Text>

                    <View style={styles.cardFooter}>
                        <Text style={styles.dateText}>Created on {new Date(item.created_at).toLocaleDateString('en-GB').replace(/\//g, '-')}</Text>
                        <View style={[styles.statusBadge, item.status === 'PAID' ? styles.statusPaid : styles.statusPending]}>
                            <Text style={[styles.statusText, item.status === 'PAID' ? styles.statusTextPaid : styles.statusTextPending]}>
                                {item.status || 'Pending'}
                            </Text>
                        </View>
                    </View>
                </TouchableOpacity>
            </Swipeable>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => setIsSidebarOpen(true)} style={styles.menuButton}>
                    <List size={24} color={Colors.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Invoices</Text>
                <TouchableOpacity style={styles.iconButton} onPress={() => setShowProfileModal(true)}>
                    <UserCircle size={28} color={Colors.textPrimary} weight="fill" />
                </TouchableOpacity>
            </View>

            {isLoading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={Colors.primary} />
                </View>
            ) : (
                <FlatList
                    data={invoices}
                    renderItem={renderItem}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
                    }
                    ListEmptyComponent={
                        <View style={styles.emptyState}>
                            <Receipt size={48} color={Colors.textSecondary} />
                            <Text style={styles.emptyStateText}>No invoices found</Text>
                        </View>
                    }
                />
            )}

            {/* Sidebar */}
            <Sidebar
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
                userName={userName}
            />

            {/* Profile Modal */}
            <ProfileModal
                visible={showProfileModal}
                onClose={() => setShowProfileModal(false)}
                userName={userName}
                walletAddresses={walletAddresses}
            />

            {/* Details Modal */}
            <Modal
                visible={showModal}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setShowModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <View style={styles.modalHeaderLeft}>
                                <Image
                                    source={selectedInvoice?.status === 'PAID' ? ICONS.statusSuccess : ICONS.statusPending}
                                    style={styles.statusIcon}
                                />
                                <View>
                                    <Text style={styles.modalTitle}>
                                        {selectedInvoice?.status === 'PAID' ? `Paid` : 'Pending'}
                                    </Text>
                                    <Text style={styles.modalSubtitle}>
                                        {selectedInvoice?.created_at ? `${new Date(selectedInvoice.created_at).toLocaleDateString('en-GB').replace(/\//g, '-')} ${new Date(selectedInvoice.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : ''}
                                    </Text>
                                </View>
                            </View>
                            <View style={styles.modalHeaderRight}>
                                <TouchableOpacity style={styles.modalIconButton} onPress={() => setShowModal(false)}>
                                    <X size={20} color={Colors.textPrimary} />
                                </TouchableOpacity>
                            </View>
                        </View>

                        <View style={styles.amountCard}>
                            <Text style={styles.amountCardValue}>
                                ₦{selectedInvoice ? (selectedInvoice.amount * 1500).toFixed(2) : '0.00'}
                            </Text>
                            <View style={styles.amountCardSub}>
                                <Image source={ICONS.usdc} style={styles.smallIcon} />
                                <Text style={styles.amountCardSubText}>{selectedInvoice?.amount} USDC</Text>
                            </View>
                        </View>

                        <View style={styles.detailsList}>
                            <View style={styles.detailRow}>
                                <View style={styles.detailLabelRow}>
                                    <Wallet size={20} color={Colors.textSecondary} />
                                    <Text style={styles.detailLabel}>Invoice ID</Text>
                                </View>
                                <Text style={styles.detailValue}>INV-{selectedInvoice?.id.slice(0, 8).toUpperCase()}</Text>
                            </View>

                            <View style={styles.detailRow}>
                                <View style={styles.detailLabelRow}>
                                    <List size={20} color={Colors.textSecondary} />
                                    <Text style={styles.detailLabel}>Description</Text>
                                </View>
                                <Text style={styles.detailValue}>{selectedInvoice?.title}</Text>
                            </View>

                            <View style={styles.detailRow}>
                                <View style={styles.detailLabelRow}>
                                    <ShareNetwork size={20} color={Colors.textSecondary} />
                                    <Text style={styles.detailLabel}>Chain</Text>
                                </View>
                                <View style={styles.chainValue}>
                                    <Image
                                        source={CHAINS[selectedInvoice?.chain?.toLowerCase() || 'base'].icon}
                                        style={styles.smallIcon}
                                    />
                                    <Text style={styles.detailValue}>
                                        {CHAINS[selectedInvoice?.chain?.toLowerCase() || 'base'].name}
                                    </Text>
                                </View>
                            </View>
                        </View>

                        <TouchableOpacity
                            style={styles.viewButton}
                            onPress={async () => {
                                try {
                                    setShowModal(false);
                                    const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
                                    const url = `${apiUrl}/invoice/${selectedInvoice.id}`;
                                    console.log('Opening invoice in system browser:', url);

                                    const canOpen = await Linking.canOpenURL(url);
                                    if (canOpen) {
                                        await Linking.openURL(url);
                                    } else {
                                        Alert.alert('Error', 'Cannot open this URL');
                                    }
                                } catch (error: any) {
                                    console.error('Failed to open browser:', error);
                                    Alert.alert('Error', `Failed to open invoice: ${error?.message || 'Unknown error'}`);
                                }
                            }}
                        >
                            <Text style={styles.viewButtonText}>View Invoice</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FFFFFF',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 16,
    },
    menuButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#f5f5f5',
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        ...Typography.h4,
        color: Colors.textPrimary,
    },
    iconButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#f5f5f5',
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    listContent: {
        padding: 20,
        gap: 16,
        paddingBottom: 40,
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
    },
    emptyStateText: {
        ...Typography.body,
        color: Colors.textSecondary,
        marginTop: 16,
    },
    card: {
        backgroundColor: '#f5f5f5',
        borderRadius: 24,
        padding: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 8,
    },
    cardTitle: {
        ...Typography.body,
        fontWeight: '500',
        color: Colors.textPrimary,
        flex: 1,
        marginRight: 16,
    },
    amountBadge: {
        position: 'relative',
    },
    badgeIcon: {
        width: 20,
        height: 20,
        borderRadius: 10,
    },
    chainBadgeSmall: {
        position: 'absolute',
        bottom: -2,
        right: -2,
        width: 12,
        height: 12,
        backgroundColor: '#FFFFFF',
        borderRadius: 6,
        borderWidth: 1,
        borderColor: '#FFFFFF',
        justifyContent: 'center',
        alignItems: 'center',
    },
    chainBadgeIconSmall: {
        width: 10,
        height: 10,
        borderRadius: 5,
    },
    amount: {
        ...Typography.h3,
        fontSize: 32,
        fontWeight: '700',
        marginBottom: 16,
    },
    cardFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    dateText: {
        ...Typography.caption,
        color: Colors.textSecondary,
    },
    statusBadge: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
    },
    statusPaid: {
        backgroundColor: `${Colors.success}15`,
    },
    statusPending: {
        backgroundColor: `${Colors.warning}15`,
    },
    statusText: {
        ...Typography.caption,
        fontWeight: '600',
    },
    statusTextPaid: {
        color: Colors.success,
    },
    statusTextPending: {
        color: Colors.warning,
    },
    // Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#F5F5F5',
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
        paddingTop: 24,
        paddingBottom: 40,
        paddingHorizontal: 24,
        maxHeight: '80%',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 24,
    },
    modalHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        flex: 1,
    },
    modalHeaderRight: {
        flexDirection: 'row',
        gap: 12,
    },
    modalIconButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#FFFFFF',
        justifyContent: 'center',
        alignItems: 'center',
    },
    statusIcon: {
        width: 32,
        height: 32,
    },
    modalTitle: {
        ...Typography.h4,
        fontWeight: '600',
    },
    modalSubtitle: {
        ...Typography.caption,
        color: Colors.textSecondary,
        marginTop: 2,
    },
    amountCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        paddingVertical: 32,
        paddingHorizontal: 24,
        alignItems: 'center',
        marginBottom: 24,
    },
    amountCardValue: {
        fontSize: 40,
        fontWeight: '700',
        color: Colors.textPrimary,
        marginBottom: 8,
    },
    amountCardSub: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    smallIcon: {
        width: 16,
        height: 16,
        borderRadius: 8,
    },
    amountCardSubText: {
        ...Typography.body,
        color: Colors.textSecondary,
    },
    detailsList: {
        gap: 20,
        marginBottom: 24,
    },
    detailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    detailLabelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    detailLabel: {
        ...Typography.body,
        color: Colors.textSecondary,
    },
    detailValue: {
        ...Typography.body,
        fontWeight: '500',
        color: Colors.textPrimary,
    },
    chainValue: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    viewButton: {
        backgroundColor: Colors.primary,
        paddingVertical: 16,
        borderRadius: 16,
        alignItems: 'center',
    },
    viewButtonText: {
        ...Typography.body,
        color: '#FFFFFF',
        fontWeight: '600',
    },
    deleteButton: {
        backgroundColor: '#FF3B30',
        justifyContent: 'center',
        alignItems: 'center',
        width: 80,
        height: '100%',
        borderRadius: 24,
        marginRight: 8,
    },
});
