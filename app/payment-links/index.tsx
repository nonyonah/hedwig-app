import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Modal, Image, Alert, Animated } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePrivy } from '@privy-io/expo';
import { List, CheckCircle, ShareNetwork, X, Wallet, UserCircle, Trash, DotsThree } from 'phosphor-react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { Colors } from '../../theme/colors';
import { Typography } from '../../styles/typography';
import { Sidebar } from '../../components/Sidebar';
import { ProfileModal } from '../../components/ProfileModal';

// Icons for tokens, networks, and status
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

    const handleDelete = async (linkId: string) => {
        console.log('handleDelete called for:', linkId);
        Alert.alert(
            'Delete Payment Link',
            'Are you sure you want to delete this payment link? This action cannot be undone.',
            [
                {
                    text: 'Cancel',
                    style: 'cancel',
                    onPress: () => console.log('Delete cancelled')
                },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        console.log('Delete confirmed for:', linkId);
                        try {
                            const token = await getAccessToken();
                            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

                            const response = await fetch(`${apiUrl}/api/documents/${linkId}`, {
                                method: 'DELETE',
                                headers: { 'Authorization': `Bearer ${token}` },
                            });

                            const data = await response.json();

                            if (data.success) {
                                setLinks(prev => prev.filter(link => link.id !== linkId));
                                Alert.alert('Success', 'Payment link deleted successfully');
                            } else {
                                Alert.alert('Error', data.error?.message || 'Failed to delete payment link');
                            }
                        } catch (error) {
                            console.error('Failed to delete payment link:', error);
                            Alert.alert('Error', 'Failed to delete payment link');
                        }
                    }
                },
            ]
        );
    };

    const handleLinkPress = (link: any) => {
        setSelectedLink(link);
        setShowModal(true);
    };

    const copyToClipboard = async (text: string) => {
        await Clipboard.setStringAsync(text);
        Alert.alert('Copied', 'Transaction ID copied to clipboard');
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
        const chainIcon = chainId === 'celo' ? ICONS.celo : ICONS.base;

        return (
            <Swipeable
                renderRightActions={(progress, dragX) => renderRightActions(progress, dragX, item)}
                overshootRight={false}
            >
                <TouchableOpacity style={styles.card} onPress={() => handleLinkPress(item)}>
                    <View style={styles.cardHeader}>
                        <Text style={styles.cardTitle}>{item.title}</Text>
                        <View style={styles.amountBadge}>
                            <Image source={ICONS.usdc} style={styles.badgeIcon} />
                            <View style={styles.chainBadgeSmall}>
                                <Image source={chainIcon} style={styles.chainBadgeIconSmall} />
                            </View>
                        </View>
                    </View>

                    <Text style={styles.amount}>${item.amount}</Text>

                    <View style={styles.cardFooter}>
                        <Text style={styles.dateText}>Created on {new Date(item.created_at).toLocaleDateString('en-GB').replace(/\//g, '-')}</Text>
                        <View style={[styles.statusBadge, item.status === 'PAID' ? styles.statusPaid : styles.statusPending]}>
                            <Text style={[styles.statusText, item.status === 'PAID' ? styles.statusTextPaid : styles.statusTextPending]}>
                                {item.status === 'PAID' ? 'Paid' : 'Pending'}
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
                <Text style={styles.headerTitle}>Payment Links</Text>
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
                                    source={selectedLink?.status === 'PAID' ? ICONS.statusSuccess : ICONS.statusPending}
                                    style={styles.statusIcon}
                                />
                                <View>
                                    <Text style={styles.modalTitle}>
                                        {selectedLink?.status === 'PAID' ? 'Paid' : 'Pending'}
                                    </Text>
                                    <Text style={styles.modalSubtitle}>
                                        {selectedLink?.created_at ? `${new Date(selectedLink.created_at).toLocaleDateString('en-GB').replace(/\//g, '-')} ${new Date(selectedLink.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : ''}
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
                                <Text style={styles.detailValue}>0x811b48bd7b...</Text>
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
                                    <Text style={styles.detailLabel}>Chain</Text>
                                </View>
                                <View style={styles.chainValue}>
                                    <Image
                                        source={selectedLink?.chain?.toLowerCase() === 'celo' ? ICONS.celo : ICONS.base}
                                        style={styles.smallIcon}
                                    />
                                    <Text style={styles.detailValue}>{selectedLink?.chain || 'Base'}</Text>
                                </View>
                            </View>
                        </View>

                        <TouchableOpacity
                            style={styles.viewButton}
                            onPress={async () => {
                                try {
                                    setShowModal(false);
                                    const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
                                    const url = `${apiUrl}/payment-link/${selectedLink.id}`;
                                    console.log('Opening payment link in system browser:', url);

                                    const canOpen = await Linking.canOpenURL(url);
                                    if (canOpen) {
                                        await Linking.openURL(url);
                                    } else {
                                        Alert.alert('Error', 'Cannot open this URL');
                                    }
                                } catch (error: any) {
                                    console.error('Failed to open browser:', error);
                                    Alert.alert('Error', `Failed to open payment link: ${error?.message || 'Unknown error'}`);
                                }
                            }}
                        >
                            <Text style={styles.viewButtonText}>View Payment Link</Text>
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
    shareButton: {
        flex: 1,
        backgroundColor: Colors.primary,
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderRadius: 12,
        alignItems: 'center',
    },
    shareButtonText: {
        ...Typography.body,
        color: '#FFFFFF',
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
});
