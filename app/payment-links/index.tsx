import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Modal, Image, Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePrivy } from '@privy-io/expo';
import { List, CheckCircle, ShareNetwork, X, Wallet, UserCircle } from 'phosphor-react-native';
import { Colors } from '../../theme/colors';
import { Typography } from '../../styles/typography';
import { Sidebar } from '../../components/Sidebar';
import { ProfileModal } from '../../components/ProfileModal';

// Mock icons for now - replace with actual assets
const ICONS = {
    base: require('../../assets/icons/networks/base.png'),
    usdc: require('../../assets/icons/tokens/usdc.png'),
};

export default function PaymentLinksScreen() {
    const router = useRouter();
    const { getAccessToken, user } = usePrivy();
    const [links, setLinks] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedLink, setSelectedLink] = useState<any>(null);
    const [showModal, setShowModal] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [userName, setUserName] = useState({ firstName: '', lastName: '' });
    const [walletAddresses, setWalletAddresses] = useState<{ evm?: string; solana?: string }>({});

    useEffect(() => {
        fetchLinks();
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
                        evm: userData.baseWalletAddress || userData.celoWalletAddress,
                        solana: userData.solanaWalletAddress
                    });
                }
            } catch (error) {
                console.error('Failed to fetch user data:', error);
            }
        };
        fetchUserData();
    }, [user]);

    const fetchLinks = async () => {
        try {
            const token = await getAccessToken();
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

            console.log('Fetching payment links...');
            const response = await fetch(`${apiUrl}/api/documents?type=PAYMENT_LINK`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            console.log('Payment links response:', data);

            if (data.success) {
                setLinks(data.data.documents);
            } else {
                console.error('Failed to fetch links:', data.error);
            }
        } catch (error) {
            console.error('Error fetching links:', error);
            Alert.alert('Error', 'Failed to load payment links');
        } finally {
            setIsLoading(false);
        }
    };

    const handleLinkPress = (link: any) => {
        setSelectedLink(link);
        setShowModal(true);
    };

    const copyToClipboard = async (text: string) => {
        await Clipboard.setStringAsync(text);
        Alert.alert('Copied', 'Transaction ID copied to clipboard');
    };

    const renderItem = ({ item }: { item: any }) => (
        <TouchableOpacity style={styles.card} onPress={() => handleLinkPress(item)}>
            <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <View style={styles.amountBadge}>
                    <Image source={ICONS.usdc} style={styles.badgeIcon} />
                    <View style={styles.badgeIconOverlay}>
                        <View style={styles.badgeIconMinus} />
                    </View>
                </View>
            </View>

            <Text style={styles.amount}>${item.amount}</Text>

            <View style={styles.cardFooter}>
                <Text style={styles.dateText}>Created on {new Date(item.created_at).toLocaleDateString()}</Text>
                <View style={[styles.statusBadge, item.status === 'PAID' ? styles.statusPaid : styles.statusPending]}>
                    <Text style={[styles.statusText, item.status === 'PAID' ? styles.statusTextPaid : styles.statusTextPending]}>
                        {item.status === 'PAID' ? 'Paid' : 'Pending'}
                    </Text>
                </View>
            </View>
        </TouchableOpacity>
    );

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => setIsSidebarOpen(true)} style={styles.iconButton}>
                    <List size={24} color={Colors.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Payment Links</Text>
                <TouchableOpacity style={styles.iconButton} onPress={() => setShowProfileModal(true)}>
                    <UserCircle size={28} color={Colors.textPrimary} weight="fill" />
                </TouchableOpacity>
            </View>

            {/* Content */}
            {isLoading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={Colors.primary} />
                </View>
            ) : (
                <FlatList
                    data={links}
                    renderItem={renderItem}
                    keyExtractor={item => item.id}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyStateText}>No payment links found</Text>
                        </View>
                    }
                />
            )}

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
                                {selectedLink?.status === 'PAID' ? (
                                    <CheckCircle size={24} color={Colors.success} weight="fill" />
                                ) : (
                                    <View style={styles.pendingIcon}>
                                        <Text style={styles.pendingIconText}>!</Text>
                                    </View>
                                )}
                                <View>
                                    <Text style={styles.modalTitle}>
                                        {selectedLink?.status === 'PAID' ? `Paid by ${selectedLink.payer_name || 'Client'}` : 'Pending'}
                                    </Text>
                                    <Text style={styles.modalSubtitle}>
                                        {selectedLink?.created_at ? new Date(selectedLink.created_at).toLocaleString() : ''}
                                    </Text>
                                </View>
                            </View>
                            <View style={styles.modalHeaderRight}>
                                <TouchableOpacity style={styles.modalIconButton}>
                                    <Text>•••</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.modalIconButton} onPress={() => setShowModal(false)}>
                                    <X size={20} color={Colors.textPrimary} />
                                </TouchableOpacity>
                            </View>
                        </View>

                        <View style={styles.amountCard}>
                            <Text style={styles.amountCardValue}>
                                ₦{selectedLink ? (selectedLink.amount * 1500).toFixed(2) : '0.00'}
                            </Text>
                            <View style={styles.amountCardSub}>
                                <Image source={ICONS.usdc} style={styles.smallIcon} />
                                <Text style={styles.amountCardSubText}>{selectedLink?.amount} USDC</Text>
                            </View>
                        </View>

                        <View style={styles.detailsList}>
                            <View style={styles.detailRow}>
                                <View style={styles.detailLabelRow}>
                                    <Wallet size={20} color={Colors.textSecondary} />
                                    <Text style={styles.detailLabel}>Transaction ID</Text>
                                </View>
                                <TouchableOpacity onPress={() => copyToClipboard('0x811b48bd7b...')}>
                                    <Text style={styles.detailValue}>0x811b48bd7b...</Text>
                                </TouchableOpacity>
                            </View>

                            <View style={styles.detailRow}>
                                <View style={styles.detailLabelRow}>
                                    <List size={20} color={Colors.textSecondary} />
                                    <Text style={styles.detailLabel}>Description</Text>
                                </View>
                                <Text style={styles.detailValue}>{selectedLink?.title}</Text>
                            </View>

                            <View style={styles.detailRow}>
                                <View style={styles.detailLabelRow}>
                                    <ShareNetwork size={20} color={Colors.textSecondary} />
                                    <Text style={styles.detailLabel}>Platform Fee</Text>
                                </View>
                                <Text style={styles.detailValue}>1%</Text>
                            </View>

                            <View style={styles.detailRow}>
                                <View style={styles.detailLabelRow}>
                                    <ShareNetwork size={20} color={Colors.textSecondary} />
                                    <Text style={styles.detailLabel}>Chain</Text>
                                </View>
                                <View style={styles.chainValue}>
                                    <Image source={ICONS.base} style={styles.smallIcon} />
                                    <Text style={styles.detailValue}>Base</Text>
                                </View>
                            </View>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F3F4F6',
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
        backgroundColor: '#E5E7EB',
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
        backgroundColor: '#FFFFFF',
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
        width: 32,
        height: 32,
        borderRadius: 16,
    },
    badgeIconOverlay: {
        position: 'absolute',
        bottom: -2,
        right: -2,
        backgroundColor: Colors.primary,
        borderRadius: 8,
        width: 16,
        height: 16,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#FFFFFF',
    },
    badgeIconMinus: {
        width: 8,
        height: 2,
        backgroundColor: '#FFFFFF',
    },
    amount: {
        ...Typography.h3,
        fontSize: 40,
        color: Colors.textPrimary,
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
        borderRadius: 16,
    },
    statusPending: {
        backgroundColor: '#FEF3C7',
    },
    statusPaid: {
        backgroundColor: '#D1FAE5',
    },
    statusText: {
        ...Typography.caption,
        fontWeight: '600',
    },
    statusTextPending: {
        color: '#D97706',
    },
    statusTextPaid: {
        color: '#059669',
    },
    // Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingBottom: 17,
        paddingHorizontal: 11,
    },
    modalContent: {
        width: '100%',
        maxWidth: 418,
        height: 477,
        backgroundColor: '#f5f5f5',
        borderRadius: 50,
        borderWidth: 1,
        borderColor: '#fafafa',
        padding: 24,
        paddingBottom: 32,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 32,
    },
    modalHeaderLeft: {
        flexDirection: 'row',
        gap: 12,
        alignItems: 'center',
    },
    modalHeaderRight: {
        flexDirection: 'row',
        gap: 8,
    },
    modalIconButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#FFFFFF',
        justifyContent: 'center',
        alignItems: 'center',
    },
    pendingIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#3B82F6',
        justifyContent: 'center',
        alignItems: 'center',
    },
    pendingIconText: {
        color: '#FFFFFF',
        fontSize: 20,
        fontWeight: 'bold',
    },
    modalTitle: {
        ...Typography.h4,
        fontSize: 16,
        color: Colors.textPrimary,
    },
    modalSubtitle: {
        ...Typography.caption,
        color: Colors.textSecondary,
    },
    amountCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: 32,
        alignItems: 'center',
        marginBottom: 32,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    amountCardValue: {
        ...Typography.h3,
        fontSize: 32,
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
        fontSize: 14,
        fontWeight: '600',
        color: Colors.textPrimary,
    },
    detailsList: {
        gap: 24,
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
        fontSize: 14,
        color: Colors.textSecondary,
        fontWeight: '500',
    },
    detailValue: {
        ...Typography.body,
        fontSize: 14,
        color: Colors.textSecondary,
        fontWeight: '500',
    },
    chainValue: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
});
