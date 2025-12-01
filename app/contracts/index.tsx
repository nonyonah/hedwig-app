import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Modal, Image, Alert, Animated } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePrivy } from '@privy-io/expo';
import { List, CheckCircle, ShareNetwork, X, Wallet, UserCircle, Trash, DotsThree, FileText, Scroll, User } from 'phosphor-react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { Colors } from '../../theme/colors';
import { Typography } from '../../styles/typography';
import { Sidebar } from '../../components/Sidebar';
import { ProfileModal } from '../../components/ProfileModal';

// Icons
const ICONS = {
    usdc: require('../../assets/icons/tokens/usdc.png'),
    base: require('../../assets/icons/networks/base.png'),
    celo: require('../../assets/icons/networks/celo.png'),
    statusPending: require('../../assets/icons/status/pending.png'),
    statusSuccess: require('../../assets/icons/status/success.png'),
    statusFailed: require('../../assets/icons/status/failed.png'),
};

export default function ContractsScreen() {
    const router = useRouter();
    const { getAccessToken, user } = usePrivy();
    const [contracts, setContracts] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedContract, setSelectedContract] = useState<any>(null);
    const [showModal, setShowModal] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [userName, setUserName] = useState({ firstName: '', lastName: '' });
    const [walletAddresses, setWalletAddresses] = useState<{ evm?: string; solana?: string }>({});

    useEffect(() => {
        fetchContracts();
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

    const fetchContracts = async () => {
        try {
            const token = await getAccessToken();
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

            console.log('Fetching contracts...');
            const response = await fetch(`${apiUrl}/api/documents?type=CONTRACT`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            console.log('Contracts response:', data);

            if (data.success) {
                setContracts(data.data.documents);
            } else {
                console.error('Failed to fetch contracts:', data.error);
            }
        } catch (error) {
            console.error('Error fetching contracts:', error);
            Alert.alert('Error', 'Failed to load contracts');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async (contractId: string) => {
        Alert.alert(
            'Delete Contract',
            'Are you sure you want to delete this contract? This action cannot be undone.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const token = await getAccessToken();
                            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

                            const response = await fetch(`${apiUrl}/api/documents/${contractId}`, {
                                method: 'DELETE',
                                headers: { 'Authorization': `Bearer ${token}` },
                            });

                            const data = await response.json();

                            if (data.success) {
                                setContracts(prev => prev.filter(c => c.id !== contractId));
                                Alert.alert('Success', 'Contract deleted successfully');
                            } else {
                                Alert.alert('Error', data.error?.message || 'Failed to delete contract');
                            }
                        } catch (error) {
                            console.error('Failed to delete contract:', error);
                            Alert.alert('Error', 'Failed to delete contract');
                        }
                    }
                },
            ]
        );
    };

    const handleCompleteContract = async (contractId: string) => {
        Alert.alert(
            'Complete Contract',
            'Mark this contract as completed? An invoice will be automatically generated and sent to the client.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Complete',
                    style: 'default',
                    onPress: async () => {
                        try {
                            const token = await getAccessToken();
                            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

                            const response = await fetch(`${apiUrl}/api/documents/${contractId}/complete`, {
                                method: 'POST',
                                headers: {
                                    'Authorization': `Bearer ${token}`,
                                    'Content-Type': 'application/json'
                                },
                            });

                            const data = await response.json();

                            if (data.success) {
                                // Refresh contracts list
                                await fetchContracts();
                                Alert.alert('Success', 'Contract completed and invoice generated!');
                            } else {
                                Alert.alert('Error', data.error?.message || 'Failed to complete contract');
                            }
                        } catch (error) {
                            console.error('Failed to complete contract:', error);
                            Alert.alert('Error', 'Failed to complete contract');
                        }
                    }
                },
            ]
        );
    };

    const handleContractPress = (contract: any) => {
        setSelectedContract(contract);
        setShowModal(true);
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

    const renderLeftActions = (progress: any, dragX: any, item: any) => {
        const isActive = item.status === 'ACTIVE' || item.status === 'VIEWED';

        if (!isActive) return null;

        const trans = dragX.interpolate({
            inputRange: [0, 100],
            outputRange: [-100, 0],
            extrapolate: 'clamp',
        });

        return (
            <Animated.View style={{ transform: [{ translateX: trans }] }}>
                <TouchableOpacity
                    style={styles.completeButton}
                    onPress={() => handleCompleteContract(item.id)}
                >
                    <CheckCircle size={24} color="#FFFFFF" weight="fill" />
                </TouchableOpacity>
            </Animated.View>
        );
    };

    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'COMPLETED':
            case 'PAID':
            case 'SIGNED':
                return { badge: styles.statusPaid, text: styles.statusTextPaid, label: 'Completed' };
            case 'ACTIVE':
            case 'VIEWED':
                return { badge: styles.statusActive, text: styles.statusTextActive, label: 'Active' };
            case 'CANCELLED':
            case 'REJECTED':
                return { badge: styles.statusFailed, text: styles.statusTextFailed, label: 'Rejected' };
            default:
                return { badge: styles.statusPending, text: styles.statusTextPending, label: 'Pending' };
        }
    };

    const renderItem = ({ item }: { item: any }) => {
        const statusStyle = getStatusStyle(item.status);

        // Generate a display ID like CON-2024-001 from the UUID or use a placeholder
        const displayId = `CON-${new Date(item.created_at).getFullYear()}-${item.id.substring(4, 7).toUpperCase()}`;

        // robust client name retrieval
        const clientName = item.client_name || item.client?.name || item.content?.client_name || 'Client';

        return (
            <Swipeable
                renderRightActions={(progress, dragX) => renderRightActions(progress, dragX, item)}
                renderLeftActions={(progress, dragX) => renderLeftActions(progress, dragX, item)}
                overshootRight={false}
                overshootLeft={false}
            >
                <TouchableOpacity style={styles.card} onPress={() => handleContractPress(item)}>
                    <View style={styles.cardHeader}>
                        <View>
                            <Text style={styles.contractId}>{displayId}</Text>
                            <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
                        </View>
                        <View style={styles.iconContainer}>
                            <Scroll size={24} color={Colors.primary} weight="duotone" />
                            <View style={[styles.statusDot, { backgroundColor: statusStyle.text.color }]} />
                        </View>
                    </View>

                    <Text style={styles.amount}>${item.amount}</Text>

                    <View style={styles.cardFooter}>
                        <Text style={styles.clientText}>For {clientName}</Text>
                        <View style={[styles.statusBadge, statusStyle.badge]}>
                            <Text style={[styles.statusText, statusStyle.text]}>
                                {statusStyle.label}
                            </Text>
                        </View>
                    </View>
                </TouchableOpacity>
            </Swipeable>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => setIsSidebarOpen(true)} style={styles.iconButton}>
                    <List size={24} color={Colors.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Contracts</Text>
                <TouchableOpacity style={styles.iconButton} onPress={() => setShowProfileModal(true)}>
                    <UserCircle size={28} color={Colors.textPrimary} weight="fill" />
                </TouchableOpacity>
            </View>

            {/* Content */}
            {
                isLoading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color={Colors.primary} />
                    </View>
                ) : (
                    <FlatList
                        data={contracts}
                        renderItem={renderItem}
                        keyExtractor={item => item.id}
                        contentContainerStyle={styles.listContent}
                        showsVerticalScrollIndicator={false}
                        ListEmptyComponent={
                            <View style={styles.emptyState}>
                                <Text style={styles.emptyStateText}>No contracts found</Text>
                            </View>
                        }
                    />
                )
            }

            {/* Sidebar */}
            <Sidebar
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
                onHomeClick={() => router.push('/')}
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
                                    source={
                                        selectedContract?.status === 'ACTIVE' || selectedContract?.status === 'VIEWED' ? ICONS.statusSuccess :
                                            selectedContract?.status === 'COMPLETED' || selectedContract?.status === 'PAID' || selectedContract?.status === 'SIGNED' ? ICONS.statusSuccess :
                                                selectedContract?.status === 'CANCELLED' || selectedContract?.status === 'REJECTED' ? ICONS.statusFailed :
                                                    ICONS.statusPending
                                    }
                                    style={styles.statusIcon}
                                />
                                <View>
                                    <Text style={styles.modalTitle}>
                                        {getStatusStyle(selectedContract?.status).label}
                                    </Text>
                                    <Text style={styles.modalSubtitle}>
                                        {selectedContract?.created_at ? `${new Date(selectedContract.created_at).toLocaleDateString('en-GB', { month: 'short', day: 'numeric', year: 'numeric' })} • ${new Date(selectedContract.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true })}` : ''}
                                    </Text>
                                </View>
                            </View>
                            <View style={styles.modalHeaderRight}>
                                <TouchableOpacity style={styles.modalIconButton}>
                                    <DotsThree size={24} color={Colors.textPrimary} weight="bold" />
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.modalIconButton} onPress={() => setShowModal(false)}>
                                    <X size={20} color={Colors.textPrimary} />
                                </TouchableOpacity>
                            </View>
                        </View>

                        <View style={styles.amountCard}>
                            <Text style={styles.amountCardValue}>
                                ${selectedContract?.amount || '0.00'}
                            </Text>
                            <View style={styles.amountCardSub}>
                                <Image source={ICONS.usdc} style={styles.smallIcon} />
                                <Text style={styles.amountCardSubText}>{selectedContract?.amount} USDC</Text>
                            </View>
                        </View>

                        <View style={styles.detailsList}>
                            <View style={styles.detailRow}>
                                <View style={styles.detailLabelRow}>
                                    <Scroll size={20} color={Colors.textSecondary} />
                                    <Text style={styles.detailLabel}>Contract ID</Text>
                                </View>
                                <Text style={styles.detailValue}>
                                    {selectedContract ? `CON-${new Date(selectedContract.created_at).getFullYear()}-${selectedContract.id.substring(4, 7).toUpperCase()}` : ''}
                                </Text>
                            </View>

                            <View style={styles.detailRow}>
                                <View style={styles.detailLabelRow}>
                                    <User size={20} color={Colors.textSecondary} />
                                    <Text style={styles.detailLabel}>Client</Text>
                                </View>
                                <Text style={styles.detailValue}>
                                    {selectedContract ? (selectedContract.client_name || selectedContract.client?.name || selectedContract.content?.client_name || 'Client') : 'Client'}
                                </Text>
                            </View>

                            <View style={styles.detailRow}>
                                <View style={styles.detailLabelRow}>
                                    <FileText size={20} color={Colors.textSecondary} />
                                    <Text style={styles.detailLabel}>Description</Text>
                                </View>
                                <Text style={[styles.detailValue, { maxWidth: 150 }]} numberOfLines={1} ellipsizeMode="tail">{selectedContract?.title}</Text>
                            </View>

                            <View style={styles.detailRow}>
                                <View style={styles.detailLabelRow}>
                                    <Wallet size={20} color={Colors.textSecondary} />
                                    <Text style={styles.detailLabel}>Platform Fee</Text>
                                </View>
                                <Text style={styles.detailValue}>1%</Text>
                            </View>

                            <View style={styles.detailRow}>
                                <View style={styles.detailLabelRow}>
                                    <ShareNetwork size={20} color={Colors.textSecondary} />
                                    <Text style={styles.detailLabel}>Status</Text>
                                </View>
                                <View style={[styles.statusBadgeSmall, getStatusStyle(selectedContract?.status).badge]}>
                                    <Text style={[styles.statusTextSmall, getStatusStyle(selectedContract?.status).text]}>
                                        {getStatusStyle(selectedContract?.status).label}
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
                                    const url = `${apiUrl}/contract/${selectedContract.id}`;
                                    console.log('Opening contract in system browser:', url);

                                    const canOpen = await Linking.canOpenURL(url);
                                    if (canOpen) {
                                        await Linking.openURL(url);
                                    } else {
                                        Alert.alert('Error', 'Cannot open this URL');
                                    }
                                } catch (error: any) {
                                    console.error('Failed to open browser:', error);
                                    Alert.alert('Error', `Failed to open contract: ${error?.message || 'Unknown error'}`);
                                }
                            }}
                        >
                            <Text style={styles.viewButtonText}>View Contract</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </SafeAreaView >
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
    contractId: {
        ...Typography.caption,
        color: Colors.textPrimary,
        fontWeight: '600',
        marginBottom: 4,
    },
    cardTitle: {
        ...Typography.caption,
        color: Colors.textSecondary,
        maxWidth: 200,
    },
    iconContainer: {
        position: 'relative',
    },
    statusDot: {
        position: 'absolute',
        bottom: -2,
        right: -2,
        width: 10,
        height: 10,
        borderRadius: 5,
        borderWidth: 1.5,
        borderColor: '#f5f5f5',
    },
    amount: {
        ...Typography.h3,
        fontSize: 40,
        color: Colors.textPrimary,
        marginBottom: 16,
        marginTop: 8,
    },
    cardFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    clientText: {
        ...Typography.caption,
        color: Colors.textSecondary,
    },
    statusBadge: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
    },
    statusActive: {
        backgroundColor: '#D1FAE5',
    },
    statusPaid: {
        backgroundColor: '#DBEAFE',
    },
    statusPending: {
        backgroundColor: '#FEF3C7',
    },
    statusFailed: {
        backgroundColor: '#FEE2E2',
    },
    statusText: {
        ...Typography.caption,
        fontWeight: '600',
    },
    statusTextActive: {
        color: '#059669',
    },
    statusTextPaid: {
        color: '#2563EB',
    },
    statusTextPending: {
        color: '#D97706',
    },
    statusTextFailed: {
        color: '#DC2626',
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
    statusBadgeSmall: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
    },
    statusTextSmall: {
        fontSize: 12,
        fontWeight: '600',
    },
    viewButton: {
        backgroundColor: Colors.primary,
        paddingVertical: 16,
        borderRadius: 16,
        alignItems: 'center',
        marginTop: 24,
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
    completeButton: {
        backgroundColor: '#34C759',
        justifyContent: 'center',
        alignItems: 'center',
        width: 80,
        height: '100%',
        borderRadius: 24,
        marginLeft: 8,
    },
});
