import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
    Dimensions,
    SafeAreaView,
    ActivityIndicator,
    SectionList,
    Image,
    Animated,
    ScrollView
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { List, X, Copy, Bank, ArrowDown, CheckCircle, Clock, Warning, ArrowsCounterClockwise } from 'phosphor-react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { format, isToday, isYesterday } from 'date-fns';

import { Colors, useThemeColors } from '../../theme/colors';
import { Sidebar } from '../../components/Sidebar';
import { ProfileModal } from '../../components/ProfileModal';
import { LinearGradient } from 'expo-linear-gradient';
import { ModalBackdrop, modalHaptic } from '../../components/ui/ModalStyles';
import { useSettings } from '../../context/SettingsContext';
import { useAnalyticsScreen } from '../../hooks/useAnalyticsScreen';

const { width } = Dimensions.get('window');

// Icons
const ICONS = {
    usdc: require('../../assets/icons/tokens/usdc.png'),
    usdt: require('../../assets/icons/tokens/usdt.png'),
    base: require('../../assets/icons/networks/base.png'),
    solana: require('../../assets/icons/networks/solana.png'),
};

const CHAINS: Record<string, { name: string; icon: any }> = {
    'BASE': { name: 'Base', icon: ICONS.base },
    'SOLANA': { name: 'Solana', icon: ICONS.solana },
};

const TOKENS: Record<string, any> = {
    'USDC': ICONS.usdc,
    'USDT': ICONS.usdt,
};

// Status configurations with colors and icons
const STATUS_CONFIG: Record<string, { color: string; bgColor: string; label: string; icon: any }> = {
    'PENDING': { color: '#F59E0B', bgColor: '#FEF3C7', label: 'Pending', icon: Clock },
    'PROCESSING': { color: '#3B82F6', bgColor: '#DBEAFE', label: 'Processing', icon: ArrowsCounterClockwise },
    'COMPLETED': { color: '#10B981', bgColor: '#D1FAE5', label: 'Completed', icon: CheckCircle },
    'FAILED': { color: '#EF4444', bgColor: '#FEE2E2', label: 'Failed', icon: Warning },
    'CANCELLED': { color: '#6B7280', bgColor: '#F3F4F6', label: 'Cancelled', icon: X },
};

// Profile color gradient options
const PROFILE_COLOR_OPTIONS: readonly [string, string, string][] = [
    ['#60A5FA', '#3B82F6', '#2563EB'],
    ['#34D399', '#10B981', '#059669'],
    ['#F472B6', '#EC4899', '#DB2777'],
    ['#FBBF24', '#F59E0B', '#D97706'],
    ['#A78BFA', '#8B5CF6', '#7C3AED'],
    ['#F87171', '#EF4444', '#DC2626'],
    ['#2DD4BF', '#14B8A6', '#0D9488'], // Teal
    ['#FB923C', '#F97316', '#EA580C'], // Orange
    ['#64748B', '#475569', '#334155'], // Slate
    ['#1F2937', '#111827', '#030712'], // Dark
];

interface OfframpOrder {
    id: string;
    paycrestOrderId: string;
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
    chain: string;
    token: string;
    cryptoAmount: number;
    fiatCurrency: string;
    fiatAmount: number;
    exchangeRate: number;
    serviceFee: number;
    bankName: string;
    accountNumber: string;
    accountName: string;
    createdAt: string;
    completedAt?: string;
}

interface UserData {
    firstName: string;
    lastName: string;
    email: string;
    ethereumWalletAddress?: string;
    solanaWalletAddress?: string;
}

export default function OfframpHistoryScreen() {
    const router = useRouter();
    const { getAccessToken } = useAuth();
    const { hapticsEnabled } = useSettings();
    const themeColors = useThemeColors();

    // Track page view
    useAnalyticsScreen('Offramp History');

    const [orders, setOrders] = useState<OfframpOrder[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [conversations, setConversations] = useState<any[]>([]);
    const [userData, setUserData] = useState<UserData | null>(null);
    const [isProfileModalVisible, setIsProfileModalVisible] = useState(false);
    const [profileIcon, setProfileIcon] = useState<{ type: 'emoji' | 'image'; emoji?: string; imageUri?: string; colorIndex?: number }>({
        type: 'emoji',
        colorIndex: 0
    });

    // Detail Modal
    const [selectedOrder, setSelectedOrder] = useState<OfframpOrder | null>(null);
    const [isDetailModalVisible, setIsDetailModalVisible] = useState(false);
    const slideAnim = useRef(new Animated.Value(0)).current;
    const modalOpacity = useRef(new Animated.Value(0)).current;

    // Filter state
    const [statusFilter, setStatusFilter] = useState<'all' | 'processing' | 'completed' | 'failed'>('all');

    // Filter orders based on status
    const filteredOrders = useMemo(() => {
        if (statusFilter === 'all') return orders;
        if (statusFilter === 'processing') return orders.filter(o => o.status === 'PENDING' || o.status === 'PROCESSING');
        if (statusFilter === 'completed') return orders.filter(o => o.status === 'COMPLETED');
        return orders.filter(o => o.status === 'FAILED' || o.status === 'CANCELLED');
    }, [orders, statusFilter]);

    useEffect(() => {
        fetchOrders();
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

                if (user?.avatar) {
                    try {
                        if (typeof user.avatar === 'string' && user.avatar.trim().startsWith('{')) {
                            const avatarData = JSON.parse(user.avatar);
                            if (avatarData.imageUri) {
                                setProfileIcon({ type: 'image', imageUri: avatarData.imageUri, colorIndex: avatarData.colorIndex || 0 });
                            } else if (avatarData.emoji) {
                                setProfileIcon({ type: 'emoji', emoji: avatarData.emoji, colorIndex: avatarData.colorIndex || 0 });
                            } else if (avatarData.colorIndex !== undefined) {
                                setProfileIcon({ type: 'emoji', colorIndex: avatarData.colorIndex });
                            }
                        } else if (typeof user.avatar === 'string' && user.avatar.startsWith('data:')) {
                            setProfileIcon({ type: 'image', imageUri: user.avatar, colorIndex: 0 });
                        }
                    } catch (parseError) {
                        console.error('Error parsing avatar:', parseError);
                        // Fallback: treat as direct image URI
                        if (typeof user.avatar === 'string') {
                            setProfileIcon({ type: 'image', imageUri: user.avatar, colorIndex: 0 });
                        }
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

    const fetchOrders = async () => {
        try {
            setIsLoading(true);
            const token = await getAccessToken();
            if (!token) return;

            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
            const response = await fetch(`${apiUrl}/api/offramp/orders`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                setOrders(data.data?.orders || []);
            }
        } catch (error) {
            console.error('Error fetching offramp orders:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const openModal = (order: OfframpOrder) => {
        setSelectedOrder(order);
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

    // Grouping logic for SectionList
    const groupedOrders = filteredOrders.reduce((acc: any, order) => {
        const date = new Date(order.createdAt);
        let title = format(date, 'MMM d');
        if (isToday(date)) title = 'Today';
        if (isYesterday(date)) title = 'Yesterday';

        const existingSection = acc.find((s: any) => s.title === title);
        if (existingSection) {
            existingSection.data.push(order);
        } else {
            acc.push({ title, data: [order] });
        }
        return acc;
    }, []);

    const renderOrderItem = ({ item }: { item: OfframpOrder }) => {
        const statusConfig = STATUS_CONFIG[item.status] || STATUS_CONFIG.PENDING;
        const tokenIcon = TOKENS[item.token] || ICONS.usdc;
        const chainInfo = CHAINS[item.chain] || CHAINS.BASE;
        const StatusIcon = statusConfig.icon;

        return (
            <TouchableOpacity style={[styles.orderItem, { borderBottomColor: themeColors.border }]} onPress={() => openModal(item)}>
                {/* Token Icon with Chain Badge */}
                <View style={styles.iconContainer}>
                    <Image source={tokenIcon} style={styles.tokenIcon} />
                    <View style={[styles.chainBadge, { backgroundColor: themeColors.background, borderColor: themeColors.background }]}>
                        <Image source={chainInfo.icon} style={styles.chainBadgeIcon} />
                    </View>
                </View>

                <View style={styles.orderContent}>
                    <Text style={[styles.orderTitle, { color: themeColors.textPrimary }]}>Withdrawal to {item.bankName}</Text>
                    <Text style={[styles.orderSubtitle, { color: themeColors.textSecondary }]}>{item.accountName} • ****{item.accountNumber.slice(-4)}</Text>
                </View>

                <View style={styles.orderRight}>
                    <Text style={[styles.orderAmount, { color: themeColors.textPrimary }]}>
                        {item.fiatCurrency} {item.fiatAmount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </Text>
                    <View style={[styles.statusBadge, { backgroundColor: statusConfig.color + '20' }]}>
                        <StatusIcon size={12} color={statusConfig.color} weight="bold" />
                        <Text style={[styles.statusText, { color: statusConfig.color }]}>{statusConfig.label}</Text>
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    // Progress Steps Component (DoorDash/Uber-like)
    const ProgressSteps = ({ status }: { status: string }) => {
        const steps = [
            { key: 'PENDING', label: 'Initiated' },
            { key: 'PROCESSING', label: 'Processing' },
            { key: 'COMPLETED', label: 'Completed' },
        ];

        const currentIndex = steps.findIndex(s => s.key === status);
        const isFailed = status === 'FAILED' || status === 'CANCELLED';

        return (
            <View style={styles.progressContainer}>
                {steps.map((step, index) => {
                    const isActive = index <= currentIndex && !isFailed;
                    const isCompleted = index < currentIndex && !isFailed;
                    const isCurrent = index === currentIndex && !isFailed;

                    return (
                        <View key={step.key} style={styles.progressStep}>
                            {/* Connector Line */}
                            {index > 0 && (
                                <View style={[
                                    styles.progressLine,
                                    isActive && styles.progressLineActive
                                ]} />
                            )}

                            {/* Step Circle */}
                            <View style={[
                                styles.progressCircle,
                                isActive && styles.progressCircleActive,
                                isCurrent && styles.progressCircleCurrent,
                                isFailed && index === currentIndex && styles.progressCircleFailed
                            ]}>
                                {isCompleted ? (
                                    <CheckCircle size={16} color="#FFFFFF" weight="bold" />
                                ) : isFailed && index === currentIndex ? (
                                    <X size={16} color="#FFFFFF" weight="bold" />
                                ) : (
                                    <Text style={[
                                        styles.progressNumber,
                                        isActive && styles.progressNumberActive
                                    ]}>{index + 1}</Text>
                                )}
                            </View>

                            {/* Step Label */}
                            <Text style={[
                                styles.progressLabel,
                                isActive && [styles.progressLabelActive, { color: themeColors.textPrimary }]
                            ]}>{step.label}</Text>
                        </View>
                    );
                })}
            </View>
        );
    };

    return (
        <View style={{ flex: 1, backgroundColor: themeColors.background }}>
            <SafeAreaView style={[styles.safeArea, { backgroundColor: themeColors.background }]}>
                <View style={[styles.header, { backgroundColor: themeColors.background }]}>
                    <View style={styles.headerTop}>
                        <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]}>Withdrawals</Text>
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

                    {/* Filter Chips inside Header */}
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.filterContent}
                        style={styles.filterScrollView}
                    >
                        {(['all', 'processing', 'completed', 'failed'] as const).map(filter => (
                            <TouchableOpacity
                                key={filter}
                                style={[
                                    styles.filterChip,
                                    { backgroundColor: themeColors.surface },
                                    statusFilter === filter && { backgroundColor: Colors.primary }
                                ]}
                                onPress={() => { Haptics.selectionAsync(); setStatusFilter(filter); }}
                            >
                                <Text style={[
                                    styles.filterText,
                                    { color: themeColors.textSecondary },
                                    statusFilter === filter && styles.filterTextActive
                                ]}>
                                    {filter.charAt(0).toUpperCase() + filter.slice(1)}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>

                {isLoading ? (
                    <View style={styles.centered}>
                        <ActivityIndicator size="large" color={Colors.primary} />
                    </View>
                ) : orders.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Bank size={48} color={themeColors.textTertiary} weight="thin" />
                        <Text style={[styles.emptyTitle, { color: themeColors.textPrimary }]}>No withdrawals yet</Text>
                        <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>Your withdrawal history will appear here.</Text>
                    </View>
                ) : (
                    <SectionList
                        sections={groupedOrders}
                        keyExtractor={(item) => item.id}
                        renderItem={renderOrderItem}
                        renderSectionHeader={({ section: { title } }) => (
                            <View style={[styles.sectionHeaderContainer, { backgroundColor: themeColors.background }]}>
                                <Text style={[styles.sectionHeader, { color: themeColors.textPrimary }]}>{title}</Text>
                            </View>
                        )}
                        contentContainerStyle={styles.listContent}
                        showsVerticalScrollIndicator={false}
                        stickySectionHeadersEnabled={true}
                    />
                )}
            </SafeAreaView>



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

            {/* Order Detail Modal */}
            <Modal
                visible={isDetailModalVisible}
                transparent
                animationType="fade"
                onRequestClose={closeModal}
            >
                <View style={styles.modalOverlay}>
                    <ModalBackdrop opacity={modalOpacity} />
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
                        {/* Header */}
                        <View style={styles.modalHeader}>
                            <View style={styles.modalHeaderLeft}>
                                <View style={styles.iconContainer}>
                                    <Image source={selectedOrder ? (TOKENS[selectedOrder.token] || ICONS.usdc) : ICONS.usdc} style={styles.tokenIcon} />
                                </View>
                                <View>
                                    <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>
                                        {selectedOrder?.status ? (selectedOrder.status.charAt(0).toUpperCase() + selectedOrder.status.slice(1).toLowerCase()) : ''}
                                    </Text>
                                    <Text style={[styles.modalSubtitle, { color: themeColors.textSecondary }]}>
                                        {selectedOrder?.createdAt ? format(new Date(selectedOrder.createdAt), 'MMM d, h:mm a') : ''}
                                    </Text>
                                </View>
                            </View>
                            <TouchableOpacity onPress={closeModal} style={[styles.closeButton, { backgroundColor: themeColors.surface }]}>
                                <X size={20} color={themeColors.textSecondary} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false}>
                            {selectedOrder && (
                                <>
                                    {/* Progress Steps */}
                                    <View style={[styles.progressSection, { backgroundColor: themeColors.surface }]}>
                                        <ProgressSteps status={selectedOrder.status} />
                                    </View>

                                    {/* Amount Card */}
                                    <View style={[styles.amountCard, { backgroundColor: themeColors.surface }]}>
                                        <Text style={[styles.amountLabel, { color: themeColors.textSecondary }]}>Amount Sent</Text>
                                        <Text style={[styles.amountValue, { color: themeColors.textPrimary }]}>
                                            {selectedOrder.fiatCurrency} {selectedOrder.fiatAmount?.toLocaleString()}
                                        </Text>
                                        <Text style={[styles.amountCrypto, { color: themeColors.textSecondary }]}>
                                            {selectedOrder.cryptoAmount} {selectedOrder.token}
                                        </Text>
                                    </View>

                                    {/* Details Card */}
                                    <View style={[styles.detailsCard, { backgroundColor: themeColors.surface }]}>
                                        <View style={styles.detailRow}>
                                            <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Status</Text>
                                            <View style={[styles.statusBadge, { backgroundColor: STATUS_CONFIG[selectedOrder.status].color + '20' }]}>
                                                <Text style={[styles.statusText, { color: STATUS_CONFIG[selectedOrder.status].color }]}>
                                                    {STATUS_CONFIG[selectedOrder.status].label}
                                                </Text>
                                            </View>
                                        </View>
                                        <View style={[styles.detailDivider, { backgroundColor: themeColors.border }]} />

                                        <View style={styles.detailRow}>
                                            <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Bank</Text>
                                            <View style={{ alignItems: 'flex-end' }}>
                                                <Text style={[styles.detailValue, { color: themeColors.textPrimary }]}>{selectedOrder.bankName}</Text>
                                                <Text style={[styles.detailSubValue, { color: themeColors.textSecondary, fontSize: 12 }]}>{selectedOrder.accountNumber}</Text>
                                            </View>
                                        </View>
                                        <View style={[styles.detailDivider, { backgroundColor: themeColors.border }]} />

                                        <View style={styles.detailRow}>
                                            <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Chain</Text>
                                            <View style={styles.chainValue}>
                                                <Image
                                                    source={CHAINS[selectedOrder.chain]?.icon || ICONS.base}
                                                    style={styles.smallIcon}
                                                />
                                                <Text style={[styles.detailValue, { color: themeColors.textPrimary }]}>
                                                    {CHAINS[selectedOrder.chain]?.name || 'Base'}
                                                </Text>
                                            </View>
                                        </View>
                                        <View style={[styles.detailDivider, { backgroundColor: themeColors.border }]} />

                                        <View style={styles.detailRow}>
                                            <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Platform Fee</Text>
                                            <Text style={[styles.detailValue, { color: themeColors.textPrimary }]}>1% ({(selectedOrder.cryptoAmount * 0.01).toFixed(2)} {selectedOrder.token})</Text>
                                        </View>
                                    </View>
                                </>
                            )}
                        </ScrollView>
                    </Animated.View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        // backgroundColor: '#FFFFFF', // Overridden
    },
    header: {
        backgroundColor: Colors.background,
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
        color: Colors.textPrimary,
    },
    profileIcon: {
        width: 32,
        height: 32,
        borderRadius: 16,
        overflow: 'hidden',
    },
    filterScrollView: {
        marginTop: 4,
    },
    filterContent: {
        paddingHorizontal: 16,
        gap: 8,
    },
    filterChip: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        // backgroundColor: '#F3F4F6', // Overridden
    },
    filterChipActive: {
        backgroundColor: Colors.primary,
    },
    filterText: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 14,
        color: Colors.textSecondary,
    },
    filterTextActive: {
        color: '#FFFFFF',
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
        // backgroundColor: '#FFFFFF', // Overridden
        marginHorizontal: -20,
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 8,
    },
    sectionHeader: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 16,
        // color: Colors.textPrimary, // Overridden
    },
    orderItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    iconContainer: {
        position: 'relative',
        marginRight: 16,
    },
    tokenIcon: {
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
    orderContent: {
        flex: 1,
    },
    orderTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 16,
        color: Colors.textPrimary,
        marginBottom: 2,
    },
    orderSubtitle: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 13,
        color: Colors.textSecondary,
    },
    orderRight: {
        alignItems: 'flex-end',
    },
    orderAmount: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 15,
        color: Colors.textPrimary,
        marginBottom: 4,
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        gap: 4,
    },
    statusText: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 11,
    },
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    emptyTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 18,
        color: Colors.textPrimary,
        marginTop: 16,
        marginBottom: 8,
    },
    emptyText: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 15,
        color: Colors.textSecondary,
        textAlign: 'center',
    },
    // Progress Steps
    progressSection: {
        paddingVertical: 24,
        paddingHorizontal: 16,
        backgroundColor: '#F9FAFB',
        borderRadius: 16,
        marginBottom: 20,
    },
    progressContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    progressStep: {
        flex: 1,
        alignItems: 'center',
        position: 'relative',
    },
    progressLine: {
        position: 'absolute',
        top: 14,
        left: -50,
        right: 50,
        height: 2,
        backgroundColor: '#E5E7EB',
        zIndex: -1,
    },
    progressLineActive: {
        backgroundColor: Colors.primary,
    },
    progressCircle: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: '#E5E7EB',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
    },
    progressCircleActive: {
        backgroundColor: Colors.primary,
    },
    progressCircleCurrent: {
        backgroundColor: Colors.primary,
        borderWidth: 3,
        borderColor: '#DBEAFE',
    },
    progressCircleFailed: {
        backgroundColor: '#EF4444',
    },
    progressNumber: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 12,
        color: '#9CA3AF',
    },
    progressNumberActive: {
        color: '#FFFFFF',
    },
    progressLabel: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 12,
        color: '#9CA3AF',
        textAlign: 'center',
    },
    progressLabelActive: {
        color: Colors.textPrimary,
    },
    // Modal
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#FFFFFF', // To be overridden
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 24,
        paddingTop: 24,
        paddingBottom: 40,
        maxHeight: '80%',
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
        gap: 8,
    },
    modalTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 18,
        color: Colors.textPrimary,
    },
    modalSubtitle: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 13,
        color: Colors.textSecondary,
        marginTop: 2,
    },
    closeButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        // backgroundColor: '#F3F4F6', // Overridden
        justifyContent: 'center',
        alignItems: 'center',
    },
    amountCard: {
        // backgroundColor: '#F9FAFB', // Overridden
        borderRadius: 16,
        padding: 24,
        alignItems: 'center',
        marginBottom: 20,
    },
    amountLabel: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 14,
        color: Colors.textSecondary,
        marginBottom: 8,
    },
    amountValue: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 36,
        color: Colors.textPrimary,
        marginBottom: 4,
    },
    amountCrypto: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 14,
        color: Colors.textSecondary,
    },
    detailsCard: {
        // backgroundColor: '#F9FAFB', // Overridden
        borderRadius: 16,
        padding: 16,
    },
    detailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
    },
    detailDivider: {
        height: 1,
        // backgroundColor: '#F3F4F6', // Overridden
    },
    detailLabel: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 15,
        color: Colors.textSecondary,
    },
    detailValue: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 15,
        color: Colors.textPrimary,
    },
    detailSubValue: { // Added for bank details
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 12,
        color: Colors.textSecondary,
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
    smallIcon: {
        width: 20,
        height: 20,
        borderRadius: 10,
    },
});
