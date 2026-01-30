import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Modal, Image, Alert, Animated, ActionSheetIOS, Platform, LayoutAnimation, UIManager, ScrollView, Linking } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../hooks/useAuth';
import { List, CheckCircle, FileText, X, UserCircle, Trash, DotsThree, PaperPlaneTilt, Clock, Eye } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import { Colors, useThemeColors } from '../../theme/colors';
import { Typography } from '../../styles/typography';

import { ProfileModal } from '../../components/ProfileModal';
import { ContractIcon } from '../../components/ui/ContractIcon';
import { getUserGradient } from '../../utils/gradientUtils';
import { useSettings } from '../../context/SettingsContext';
import { formatCurrency } from '../../utils/currencyUtils';
import { useAnalyticsScreen } from '../../hooks/useAnalyticsScreen';

// Profile color gradient options (consistent with ProfileModal)
const PROFILE_COLOR_OPTIONS = [
    ['#60A5FA', '#3B82F6', '#2563EB'], // Blue
    ['#34D399', '#10B981', '#059669'], // Green
    ['#F472B6', '#EC4899', '#DB2777'], // Pink
    ['#FBBF24', '#F59E0B', '#D97706'], // Amber
    ['#A78BFA', '#8B5CF6', '#7C3AED'], // Purple
    ['#F87171', '#EF4444', '#DC2626'], // Red
    ['#2DD4BF', '#14B8A6', '#0D9488'], // Teal
    ['#FB923C', '#F97316', '#EA580C'], // Orange
    ['#64748B', '#475569', '#334155'], // Slate
    ['#1F2937', '#111827', '#030712'], // Dark
] as const;

export default function ContractsScreen() {
    const router = useRouter();
    const { getAccessToken, user } = useAuth();
    const settings = useSettings();
    const currency = settings?.currency || 'USD';
    const themeColors = useThemeColors();
    const [contracts, setContracts] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedContract, setSelectedContract] = useState<any>(null);
    const [showModal, setShowModal] = useState(false);
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [userName, setUserName] = useState({ firstName: '', lastName: '' });
    const [profileIcon, setProfileIcon] = useState<{ emoji?: string; colorIndex?: number; imageUri?: string }>({});
    const [walletAddresses, setWalletAddresses] = useState<{ evm?: string; solana?: string }>({});
    const [showActionMenu, setShowActionMenu] = useState(false);

    const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'sent' | 'approved'>('all');

    // Track page view
    useAnalyticsScreen('Contracts');

    // Filter contracts based on status
    const filteredContracts = useMemo(() => {
        if (statusFilter === 'all') return contracts;
        if (statusFilter === 'draft') return contracts.filter(c => c.status === 'DRAFT');
        if (statusFilter === 'sent') return contracts.filter(c => c.status === 'SENT' || c.status === 'ACTIVE' || c.status === 'VIEWED');
        if (statusFilter === 'approved') return contracts.filter(c => c.status === 'APPROVED' || c.status === 'SIGNED' || c.status === 'PAID' || c.status === 'COMPLETED');
        return contracts;
    }, [contracts, statusFilter]);

    // Animation value for modal
    const slideAnim = React.useRef(new Animated.Value(0)).current;

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

                    // Set profile icon
                    if (userData.avatar) {
                        try {
                            if (userData.avatar.trim().startsWith('{')) {
                                const parsed = JSON.parse(userData.avatar);
                                setProfileIcon(parsed);
                            } else {
                                setProfileIcon({ imageUri: userData.avatar });
                            }
                        } catch (e) {
                            setProfileIcon({ imageUri: userData.avatar });
                        }
                    } else if (userData.profileEmoji) {
                        setProfileIcon({ emoji: userData.profileEmoji });
                    } else if (userData.profileColorIndex !== undefined) {
                        setProfileIcon({ colorIndex: userData.profileColorIndex });
                    }
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

            const response = await fetch(`${apiUrl}/api/documents?type=CONTRACT`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();

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
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

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

    const handleSendContract = async (contractId: string) => {
        Alert.alert(
            'Send Contract',
            'Send this contract to your client for approval?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Send',
                    style: 'default',
                    onPress: async () => {
                        try {
                            const token = await getAccessToken();
                            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

                            const response = await fetch(`${apiUrl}/api/documents/${contractId}/send`, {
                                method: 'POST',
                                headers: {
                                    'Authorization': `Bearer ${token}`,
                                    'Content-Type': 'application/json'
                                },
                            });

                            const data = await response.json();

                            if (data.success) {
                                await fetchContracts();
                                setShowModal(false);
                                Alert.alert('Success', `Contract sent to ${data.data.clientEmail}!`);
                            } else {
                                Alert.alert('Error', data.error?.message || 'Failed to send contract');
                            }
                        } catch (error) {
                            console.error('Failed to send contract:', error);
                            Alert.alert('Error', 'Failed to send contract');
                        }
                    }
                },
            ]
        );
    };

    const openModal = (contract: any) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setSelectedContract(contract);
        setShowModal(true);
        Animated.spring(slideAnim, {
            toValue: 1,
            useNativeDriver: true,
            damping: 25,
            stiffness: 300,
        }).start();
    };

    const closeModal = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        Animated.timing(slideAnim, {
            toValue: 0,
            duration: 250,
            useNativeDriver: true,
        }).start(() => setShowModal(false));
    };

    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'COMPLETED':
            case 'PAID':
                return { bg: '#DCFCE7', text: '#16A34A', label: 'Completed' };
            case 'APPROVED':
            case 'SIGNED':
                return { bg: '#D1FAE5', text: '#059669', label: 'Approved' };
            case 'SENT':
            case 'ACTIVE':
            case 'VIEWED':
                return { bg: '#E0E7FF', text: '#4F46E5', label: 'Sent' };
            case 'CANCELLED':
            case 'REJECTED':
                return { bg: '#FEE2E2', text: '#DC2626', label: 'Rejected' };
            case 'DRAFT':
            default:
                return { bg: '#FEF3C7', text: '#D97706', label: 'Draft' };
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'COMPLETED':
            case 'PAID':
            case 'APPROVED':
            case 'SIGNED':
                return <CheckCircle size={16} color="#16A34A" weight="fill" />;
            case 'SENT':
            case 'ACTIVE':
            case 'VIEWED':
                return <PaperPlaneTilt size={16} color="#4F46E5" weight="fill" />;
            default:
                return <Clock size={16} color="#D97706" weight="fill" />;
        }
    };

    const renderItem = ({ item }: { item: any }) => {
        const statusStyle = getStatusStyle(item.status);
        const clientName = item.content?.client_name || 'Client';
        const amount = item.content?.payment_amount || item.amount;

        return (
            <TouchableOpacity
                style={[styles.card, { backgroundColor: themeColors.surface }]}
                onPress={() => openModal(item)}
                onLongPress={() => handleDelete(item.id)}
                delayLongPress={500}
            >
                <View style={styles.cardHeader}>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.linkId, { color: themeColors.textSecondary }]}>CONTRACT-{item.id.substring(0, 8).toUpperCase()}</Text>
                        <Text style={[styles.cardTitle, { color: themeColors.textPrimary }]} numberOfLines={1}>{item.title}</Text>
                    </View>
                    <View style={[styles.iconContainer, { backgroundColor: themeColors.background }]}>
                        <Image
                            source={require('../../assets/icons/colored/contract.png')}
                            style={{ width: 40, height: 40, resizeMode: 'contain' }}
                        />
                    </View>
                </View>

                {amount && (
                    <Text style={[styles.amount, { color: themeColors.textPrimary }]}>
                        {formatCurrency(amount.toString().replace(/[^0-9.]/g, ''), currency)}
                    </Text>
                )}

                <View style={styles.cardFooter}>
                    <Text style={[styles.clientText, { color: themeColors.textSecondary }]}>{clientName}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                        <Text style={[styles.statusText, { color: statusStyle.text }]}>{statusStyle.label}</Text>
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    const isDark = settings.currentTheme === 'dark';

    // ... (existing code)

    return (
        <View style={{ flex: 1 }}>
            <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
                <View style={[styles.header, { backgroundColor: themeColors.background }]}>
                    <View style={styles.headerTop}>
                        <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]}>Contracts</Text>
                        <TouchableOpacity onPress={() => setShowProfileModal(true)}>
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

                    {/* Filter Chips inside Header */}
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.filterContent}
                        style={styles.filterScrollView}
                    >
                        {(['all', 'draft', 'sent', 'approved'] as const).map(filter => (
                            <TouchableOpacity
                                key={filter}
                                style={[
                                    styles.filterChip,
                                    { backgroundColor: statusFilter === filter ? Colors.primary : themeColors.surfaceHighlight }
                                ]}
                                onPress={() => setStatusFilter(filter)}
                            >
                                <Text style={[
                                    styles.filterText,
                                    { color: statusFilter === filter ? '#FFFFFF' : themeColors.textSecondary },
                                ]}>
                                    {filter.charAt(0).toUpperCase() + filter.slice(1)}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>

                {isLoading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color={Colors.primary} />
                    </View>
                ) : (
                    <FlatList
                        data={filteredContracts}
                        renderItem={renderItem}
                        keyExtractor={(item) => item.id}
                        contentContainerStyle={styles.listContent}
                        ListEmptyComponent={
                            <View style={styles.emptyState}>
                                <FileText size={64} color={themeColors.textSecondary} weight="duotone" />
                                <Text style={[styles.emptyStateTitle, { color: themeColors.textPrimary }]}>No Contracts</Text>
                                <Text style={[styles.emptyStateText, { color: themeColors.textSecondary }]}>
                                    Create a contract with AI to get started
                                </Text>
                            </View>
                        }
                    />
                )}
            </SafeAreaView>

            <ProfileModal
                visible={showProfileModal}
                onClose={() => setShowProfileModal(false)}
                userName={userName}
                walletAddresses={walletAddresses}
                profileIcon={profileIcon}
            />



            {/* Details Modal */}
            <Modal
                visible={showModal}
                transparent={true}
                animationType="fade"
                onRequestClose={closeModal}
            >
                <View style={styles.modalOverlay}>
                    {Platform.OS === 'ios' ? (
                        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
                    ) : (
                        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.32)' }]} />
                    )}
                    <TouchableOpacity style={StyleSheet.absoluteFill} onPress={closeModal} />
                    <Animated.View
                        style={[
                            styles.modalContent,
                            { backgroundColor: themeColors.background },
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
                                <View style={[styles.modalIconContainer, { backgroundColor: themeColors.surface }]}>
                                    <FileText size={28} color={Colors.primary} weight="duotone" />
                                </View>
                                <View>
                                    <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>
                                        {getStatusStyle(selectedContract?.status).label}
                                    </Text>
                                    <Text style={[styles.modalSubtitle, { color: themeColors.textSecondary }]}>
                                        {selectedContract?.created_at ? new Date(selectedContract.created_at).toLocaleDateString('en-GB') : ''}
                                    </Text>
                                </View>
                            </View>
                            <View style={styles.modalHeaderRight}>
                                {selectedContract?.status === 'DRAFT' && (
                                    <TouchableOpacity
                                        onPress={() => {
                                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                            setShowActionMenu(!showActionMenu);
                                        }}
                                        style={styles.menuButton}
                                    >
                                        <DotsThree size={24} color={themeColors.textSecondary} weight="bold" />
                                    </TouchableOpacity>
                                )}
                                <TouchableOpacity style={[styles.closeButton, { backgroundColor: themeColors.surface }]} onPress={closeModal}>
                                    <X size={20} color={themeColors.textSecondary} weight="bold" />
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Action Menu */}
                        {showActionMenu && selectedContract?.status === 'DRAFT' && (
                            <>
                                <TouchableOpacity
                                    style={styles.menuBackdrop}
                                    activeOpacity={1}
                                    onPress={() => {
                                        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                        setShowActionMenu(false);
                                    }}
                                />
                                <Animated.View style={[styles.pullDownMenu, { backgroundColor: themeColors.surface }]}>
                                    <TouchableOpacity
                                        style={styles.pullDownMenuItem}
                                        onPress={() => {
                                            setShowActionMenu(false);
                                            handleDelete(selectedContract.id);
                                            closeModal();
                                        }}
                                    >
                                        <Trash size={18} color="#EF4444" weight="fill" />
                                        <Text style={[styles.pullDownMenuText, { color: '#EF4444' }]}>Delete</Text>
                                    </TouchableOpacity>
                                </Animated.View>
                            </>
                        )}

                        {/* Amount Card */}
                        {(selectedContract?.content?.payment_amount || selectedContract?.amount) && (
                            <View style={[styles.amountCard, { backgroundColor: themeColors.surface }]}>
                                <Text style={[styles.amountCardValue, { color: themeColors.textPrimary }]}>
                                    {formatCurrency((selectedContract?.content?.payment_amount || selectedContract?.amount || 0).toString().replace(/[^0-9.]/g, ''), currency)}
                                </Text>
                            </View>
                        )}

                        {/* Details Card */}
                        <View style={[styles.detailsCard, { backgroundColor: themeColors.surface }]}>
                            <View style={styles.detailRow}>
                                <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Contract ID</Text>
                                <Text style={[styles.detailValue, { color: themeColors.textPrimary }]}>CONTRACT-{selectedContract?.id?.substring(0, 8).toUpperCase()}</Text>
                            </View>
                            <View style={[styles.detailDivider, { backgroundColor: themeColors.border }]} />
                            <View style={styles.detailRow}>
                                <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Title</Text>
                                <Text style={[styles.detailValue, { color: themeColors.textPrimary }]} numberOfLines={1}>{selectedContract?.title}</Text>
                            </View>
                            <View style={[styles.detailDivider, { backgroundColor: themeColors.border }]} />
                            <View style={styles.detailRow}>
                                <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Client</Text>
                                <Text style={[styles.detailValue, { color: themeColors.textPrimary }]}>{selectedContract?.content?.client_name || 'N/A'}</Text>
                            </View>
                            <View style={[styles.detailDivider, { backgroundColor: themeColors.border }]} />
                            <View style={styles.detailRow}>
                                <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Client Email</Text>
                                <Text style={[styles.detailValue, { color: themeColors.textPrimary }]}>{selectedContract?.content?.client_email || 'N/A'}</Text>
                            </View>
                            {selectedContract?.content?.milestones?.length > 0 && (
                                <>
                                    <View style={[styles.detailDivider, { backgroundColor: themeColors.border }]} />
                                    <View style={styles.detailRow}>
                                        <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Milestones</Text>
                                        <Text style={[styles.detailValue, { color: themeColors.textPrimary }]}>{selectedContract.content.milestones.length}</Text>
                                    </View>
                                </>
                            )}
                        </View>

                        {/* Send to Client Button (for DRAFT) */}
                        {selectedContract?.status === 'DRAFT' && (
                            <TouchableOpacity
                                style={[styles.viewButton, { backgroundColor: '#059669' }]}
                                onPress={() => handleSendContract(selectedContract.id)}
                            >
                                <PaperPlaneTilt size={20} color="#FFFFFF" weight="fill" style={{ marginRight: 8 }} />
                                <Text style={styles.viewButtonText}>Send to Client</Text>
                            </TouchableOpacity>
                        )}

                        {/* View Contract Button */}
                        <TouchableOpacity
                            style={[styles.viewButton, selectedContract?.status === 'DRAFT' && { marginTop: 12 }]}
                            onPress={async () => {
                                try {
                                    const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
                                    const url = `${apiUrl}/contract/${selectedContract.id}`;
                                    await WebBrowser.openBrowserAsync(url, {
                                        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
                                        controlsColor: Colors.primary,
                                    });
                                } catch (error: any) {
                                    Alert.alert('Error', `Failed to open: ${error?.message}`);
                                }
                            }}
                        >
                            <Eye size={20} color="#FFFFFF" weight="fill" style={{ marginRight: 8 }} />
                            <Text style={styles.viewButtonText}>View Contract</Text>
                        </TouchableOpacity>
                    </Animated.View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        paddingBottom: 12,
    },
    headerTop: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        height: 60,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    headerTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 28,
    },
    profileIcon: {
        width: 32,
        height: 32,
        borderRadius: 16,
    },
    filterScrollView: {
        marginTop: 4,
    },
    filterContent: {
        paddingHorizontal: 16,
        gap: 8,
    },
    filterChip: {
        paddingHorizontal: 20, // Increased from 16 to match card padding (20) for text alignment
        paddingVertical: 8,
        borderRadius: 20,
    },
    filterText: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 14,
    },
    filterTextActive: {
        color: '#FFFFFF',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    listContent: {
        padding: 16,
        paddingBottom: 120,
    },
    card: {
        borderRadius: 24,
        padding: 20,
        marginBottom: 16,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 16,
    },
    linkId: {
        ...Typography.caption,
        marginBottom: 4,
    },
    cardTitle: {
        ...Typography.body,
        fontSize: 16,
        fontWeight: '600',
    },
    iconContainer: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
    },
    amount: {
        ...Typography.h2,
        fontSize: 32,
        fontWeight: '700',
        marginBottom: 16,
    },
    cardFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    clientText: {
        ...Typography.body,
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
        marginTop: 48,
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
        textAlign: 'center',
    },
    modalOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    modalContent: {
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 40,
        maxHeight: '85%',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    modalHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    modalIconContainer: {
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 18,
    },
    modalSubtitle: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 13,
        marginTop: 4,
    },
    modalHeaderRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    closeButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
    },
    menuButton: {
        padding: 8,
    },
    menuBackdrop: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 1,
    },
    pullDownMenu: {
        position: 'absolute',
        top: 50,
        right: 24,
        borderRadius: 14,
        paddingVertical: 6,
        minWidth: 200,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 20,
        elevation: 10,
        zIndex: 1000,
    },
    pullDownMenuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        gap: 10,
    },
    pullDownMenuText: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 16,
    },
    amountCard: {
        borderRadius: 20,
        padding: 24,
        alignItems: 'center',
        marginBottom: 24,
    },
    amountCardValue: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 36,
        marginBottom: 8,
    },
    detailsCard: {
        borderRadius: 16,
        padding: 20,
        marginBottom: 24,
    },
    detailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
    },
    detailLabel: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 14,
    },
    detailValue: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 14,
        maxWidth: 180,
    },
    detailDivider: {
        height: 1,
    },
    viewButton: {
        backgroundColor: Colors.primary,
        borderRadius: 30,
        paddingVertical: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    viewButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
    },
});
