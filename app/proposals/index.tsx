import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Modal, Image, Alert, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePrivy } from '@privy-io/expo';
import { List, ShareNetwork, X, Trash, Pen } from 'phosphor-react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../theme/colors';
import { Typography } from '../../styles/typography';
import { Sidebar } from '../../components/Sidebar';
import { ProfileModal } from '../../components/ProfileModal';
import { getUserGradient } from '../../utils/gradientUtils';

// Icons
const ICONS = {
    usdc: require('../../assets/icons/tokens/usdc.png'),
    statusPending: require('../../assets/icons/status/pending.png'),
    statusSuccess: require('../../assets/icons/status/success.png'),
    statusFailed: require('../../assets/icons/status/failed.png'),
};

export default function ProposalsScreen() {
    const router = useRouter();
    const { getAccessToken, user } = usePrivy();
    const [proposals, setProposals] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedProposal, setSelectedProposal] = useState<any>(null);
    const [showModal, setShowModal] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [userName, setUserName] = useState({ firstName: '', lastName: '' });
    const [walletAddresses, setWalletAddresses] = useState<{ evm?: string; solana?: string }>({});

    useEffect(() => {
        fetchProposals();
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

    const fetchProposals = async () => {
        try {
            const token = await getAccessToken();
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

            console.log('Fetching proposals...');
            const response = await fetch(`${apiUrl}/api/documents?type=PROPOSAL`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            console.log('Proposals response:', data);

            if (data.success) {
                setProposals(data.data.documents);
            } else {
                console.error('Failed to fetch proposals:', data.error);
            }
        } catch (error) {
            console.error('Error fetching proposals:', error);
            Alert.alert('Error', 'Failed to load proposals');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async (proposalId: string) => {
        Alert.alert(
            'Delete Proposal',
            'Are you sure you want to delete this proposal? This action cannot be undone.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const token = await getAccessToken();
                            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

                            const response = await fetch(`${apiUrl}/api/documents/${proposalId}`, {
                                method: 'DELETE',
                                headers: { 'Authorization': `Bearer ${token}` },
                            });

                            const data = await response.json();

                            if (data.success) {
                                setProposals(prev => prev.filter(p => p.id !== proposalId));
                                Alert.alert('Success', 'Proposal deleted successfully');
                            } else {
                                Alert.alert('Error', data.error?.message || 'Failed to delete proposal');
                            }
                        } catch (error) {
                            console.error('Failed to delete proposal:', error);
                            Alert.alert('Error', 'Failed to delete proposal');
                        }
                    }
                },
            ]
        );
    };

    const handleProposalPress = (proposal: any) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setSelectedProposal(proposal);
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

    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'APPROVED':
            case 'ACCEPTED':
                return {
                    label: 'Approved',
                    badge: { backgroundColor: '#DCFCE7' },
                    text: { color: '#16A34A' }
                };
            case 'REJECTED':
            case 'CANCELLED':
                return {
                    label: 'Rejected',
                    badge: { backgroundColor: '#FEE2E2' },
                    text: { color: '#DC2626' }
                };
            case 'PENDING':
            case 'DRAFT':
            default:
                return {
                    label: 'Pending',
                    badge: { backgroundColor: '#FEF3C7' },
                    text: { color: '#D97706' }
                };
        }
    };

    const renderItem = ({ item }: { item: any }) => {
        const statusStyle = getStatusStyle(item.status);

        const displayId = `PROP-${new Date(item.created_at).getFullYear()}-${item.id.substring(4, 7).toUpperCase()}`;

        const clientName = item.client_name || item.content?.client_name || 'Client';

        return (
            <Swipeable
                renderRightActions={(progress, dragX) => renderRightActions(progress, dragX, item)}
                overshootRight={false}
            >
                <TouchableOpacity style={styles.card} onPress={() => handleProposalPress(item)}>
                    <View style={styles.cardHeader}>
                        <View>
                            <Text style={styles.proposalId}>{displayId}</Text>
                            <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
                        </View>
                        <View style={styles.iconContainer}>
                            <Pen size={24} color={Colors.primary} weight="duotone" />
                            <View style={[styles.statusDot, { backgroundColor: statusStyle.text.color }]} />
                        </View>
                    </View>

                    <Text style={styles.amount}>${(item.content?.total_cost || '0').toString().replace(/[^0-9.]/g, '')}</Text>

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

    if (isLoading) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={Colors.primary} />
                    <Text style={styles.loadingText}>Loading proposals...</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => setIsSidebarOpen(true)}>
                        <List size={24} color={Colors.textPrimary} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Proposals</Text>
                    <TouchableOpacity onPress={() => setShowProfileModal(true)}>
                        <LinearGradient
                            colors={getUserGradient(user?.id || userName.firstName)}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.profileIcon}
                        />
                    </TouchableOpacity>
                </View>

                {isLoading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color={Colors.primary} />
                    </View>
                ) : (
                    proposals.length === 0 ? (
                        <View style={styles.emptyState}>
                            <Pen size={64} color={Colors.textSecondary} weight="duotone" />
                            <Text style={styles.emptyStateTitle}>No Proposals Yet</Text>
                            <Text style={styles.emptyStateText}>
                                Create your first proposal by asking Hedwig to help you draft one
                            </Text>
                        </View>
                    ) : (
                        <FlatList
                            data={proposals}
                            renderItem={renderItem}
                            keyExtractor={(item) => item.id}
                            contentContainerStyle={styles.listContent}
                        />
                    )
                )}
            </SafeAreaView>

            <ProfileModal
                visible={showProfileModal}
                onClose={() => setShowProfileModal(false)}
                userName={userName}
                walletAddresses={walletAddresses}
            />

            <Sidebar
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
                userName={userName}
                conversations={[]}
                onHomeClick={() => router.push('/')}
            />

            <Modal
                visible={showModal}
                transparent={true}
                animationType="none"
                onRequestClose={() => setShowModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <View style={styles.modalHeaderLeft}>
                                <Image
                                    source={
                                        selectedProposal?.status === 'APPROVED' || selectedProposal?.status === 'ACCEPTED' ? ICONS.statusSuccess :
                                            selectedProposal?.status === 'REJECTED' || selectedProposal?.status === 'CANCELLED' ? ICONS.statusFailed :
                                                ICONS.statusPending
                                    }
                                    style={styles.statusIcon}
                                />
                                <View>
                                    <Text style={styles.modalTitle}>
                                        {getStatusStyle(selectedProposal?.status).label}
                                    </Text>
                                    <Text style={styles.modalSubtitle}>
                                        {selectedProposal?.created_at ? `${new Date(selectedProposal.created_at).toLocaleDateString('en-GB', { month: 'short', day: 'numeric', year: 'numeric' })} • ${new Date(selectedProposal.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true })}` : ''}
                                    </Text>
                                </View>
                            </View>
                            <TouchableOpacity style={styles.closeButton} onPress={() => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                setShowModal(false);
                            }}>
                                <X size={20} color="#666666" weight="bold" />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.amountCard}>
                            <Text style={styles.amountCardValue}>
                                ${(selectedProposal?.content?.total_cost || '0.00').toString().replace(/[^0-9.]/g, '')}
                            </Text>
                            <View style={styles.amountCardSub}>
                                <Image source={ICONS.usdc} style={styles.smallIcon} />
                                <Text style={styles.amountCardSubText}>{selectedProposal?.content?.total_cost || '0'} USDC</Text>
                            </View>
                        </View>

                        <View style={styles.detailsCard}>
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Proposal ID</Text>
                                <Text style={styles.detailValue}>
                                    PROP-{selectedProposal ? new Date(selectedProposal.created_at).getFullYear() : '2024'}-{selectedProposal?.id.substring(4, 7).toUpperCase()}
                                </Text>
                            </View>
                            <View style={styles.detailDivider} />
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Client</Text>
                                <Text style={styles.detailValue}>
                                    {selectedProposal?.content?.client_name || selectedProposal?.client_name || 'Client'}
                                </Text>
                            </View>
                        </View>

                        <TouchableOpacity
                            style={styles.viewButton}
                            onPress={() => {
                                setShowModal(false);
                                const proposalUrl = `${process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000'}/proposal/${selectedProposal?.id}`;
                                console.log('Opening proposal:', proposalUrl);
                                // TODO: Open in-app browser
                            }}
                        >
                            <Text style={styles.viewButtonText}>View Proposal</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </GestureHandlerRootView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 16,
        ...Typography.body,
        color: Colors.textSecondary,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 16,
    },
    headerTitle: {
        ...Typography.h2,
        fontSize: 18,
        fontWeight: '600',
    },
    profileIcon: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: Colors.primary,
    },
    listContent: {
        padding: 16,
        paddingBottom: 32,
    },
    card: {
        backgroundColor: Colors.surface,
        borderRadius: 24,
        padding: 20,
        marginBottom: 16,
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
        marginBottom: 16,
    },
    proposalId: {
        ...Typography.caption,
        color: Colors.textSecondary,
        marginBottom: 4,
    },
    cardTitle: {
        ...Typography.body,
        fontSize: 16,
        fontWeight: '600',
        color: Colors.textPrimary,
    },
    iconContainer: {
        position: 'relative',
    },
    statusDot: {
        position: 'absolute',
        width: 8,
        height: 8,
        borderRadius: 4,
        top: 0,
        right: 0,
    },
    amount: {
        ...Typography.h2,
        fontSize: 32,
        fontWeight: '700',
        color: Colors.textPrimary,
        marginBottom: 16,
    },
    cardFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    clientText: {
        ...Typography.body,
        color: Colors.textSecondary,
    },
    statusBadge: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
    },
    statusText: {
        ...Typography.caption,
        fontWeight: '600',
    },
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 48,
    },
    emptyStateTitle: {
        ...Typography.h2,
        fontSize: 20,
        fontWeight: '600',
        marginTop: 24,
        marginBottom: 8,
    },
    emptyStateText: {
        ...Typography.body,
        color: Colors.textSecondary,
        textAlign: 'center',
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
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: Colors.background,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 24,
        paddingBottom: 40,
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
        alignItems: 'flex-start',
        gap: 12,
    },
    statusIcon: {
        width: 24,
        height: 24,
        borderRadius: 12,
        marginRight: 12,
    },
    closeButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#F3F4F6',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalTitle: {
        ...Typography.body,
        fontSize: 18,
        fontWeight: '600',
        color: Colors.textPrimary,
    },
    modalSubtitle: {
        ...Typography.caption,
        color: Colors.textSecondary,
        marginTop: 4,
    },
    amountCard: {
        backgroundColor: Colors.surface,
        borderRadius: 16,
        padding: 24,
        alignItems: 'center',
        marginBottom: 24,
    },
    amountCardValue: {
        ...Typography.h1,
        fontSize: 36,
        fontWeight: '700',
        color: Colors.textPrimary,
        marginBottom: 8,
    },
    amountCardSub: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    smallIcon: {
        width: 16,
        height: 16,
    },
    amountCardSubText: {
        ...Typography.body,
        color: Colors.textSecondary,
    },
    detailsCard: {
        backgroundColor: Colors.surface,
        borderRadius: 16,
        padding: 20,
        marginBottom: 24,
    },
    detailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    detailLabel: {
        ...Typography.body,
        color: Colors.textSecondary,
    },
    detailValue: {
        ...Typography.body,
        fontWeight: '600',
        color: Colors.textPrimary,
    },
    detailDivider: {
        height: 1,
        backgroundColor: Colors.border,
        marginVertical: 16,
    },
    viewButton: {
        backgroundColor: Colors.primary,
        borderRadius: 16,
        padding: 16,
        alignItems: 'center',
    },
    viewButtonText: {
        ...Typography.body,
        color: '#FFFFFF',
        fontWeight: '600',
    },
});
