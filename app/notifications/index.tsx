import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SectionList, ActivityIndicator, RefreshControl, Image, Platform, ScrollView, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { CaretLeft, Bell, CheckCircle, CurrencyDollar, ArrowsDownUp, Megaphone, Receipt, Link, Bank, Trash, FileText } from 'phosphor-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, useThemeColors } from '../../theme/colors';
import { usePrivy } from '@privy-io/expo';
import { format, isToday } from 'date-fns';
import { Swipeable, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useAnalyticsScreen } from '../../hooks/useAnalyticsScreen';

interface Notification {
    id: string;
    type: 'payment_received' | 'crypto_received' | 'offramp_success' | 'announcement';
    title: string;
    message: string;
    metadata: any;
    is_read: boolean;
    created_at: string;
}

const NOTIFICATION_FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'transactions', label: 'Transactions' },
    { id: 'payment_links', label: 'Payment Links' },
    { id: 'invoices', label: 'Invoices' },
    { id: 'withdrawals', label: 'Withdrawals' },
];

const ICONS = {
    usdc: require('../../assets/icons/tokens/usdc.png'),
    base: require('../../assets/icons/networks/base.png'),
    celo: require('../../assets/icons/networks/celo.png'),
    solana: require('../../assets/icons/networks/solana.png'),
    arbitrum: require('../../assets/icons/networks/arbitrum.png'),
    optimism: require('../../assets/icons/networks/optimism.png'),
};

const getChainIcon = (chain?: string) => {
    const c = chain?.toLowerCase() || 'base';
    if (c.includes('solana')) return ICONS.solana;
    if (c.includes('celo')) return ICONS.celo;
    if (c.includes('arbitrum')) return ICONS.arbitrum;
    if (c.includes('optimism')) return ICONS.optimism;
    return ICONS.base;
};

const formatAddress = (address: string) => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

export default function NotificationsScreen() {
    // Track screen view
    useAnalyticsScreen('Notifications');

    const router = useRouter();
    const insets = useSafeAreaInsets();
    const themeColors = useThemeColors();
    const { getAccessToken } = usePrivy();

    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [activeFilter, setActiveFilter] = useState('all');

    const fetchNotifications = useCallback(async () => {
        try {
            const token = await getAccessToken();
            if (!token) return;

            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
            const response = await fetch(`${apiUrl}/api/notifications`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const result = await response.json();
            if (result.success) {
                setNotifications(result.data.notifications || []);
            }
        } catch (error) {
            console.error('[Notifications] Error fetching:', error);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [getAccessToken]);

    useEffect(() => {
        fetchNotifications();
    }, [fetchNotifications]);

    const handleRefresh = () => {
        setIsRefreshing(true);
        fetchNotifications();
    };

    const markAsRead = async (notificationId: string) => {
        try {
            const token = await getAccessToken();
            if (!token) return;

            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
            await fetch(`${apiUrl}/api/notifications/${notificationId}/read`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            setNotifications(prev =>
                prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
            );
        } catch (error) {
            console.error('[Notifications] Error marking as read:', error);
        }
    };

    const deleteNotification = async (notificationId: string) => {
        try {
            // Optimistic update
            setNotifications(prev => prev.filter(n => n.id !== notificationId));

            // const token = await getAccessToken();
            // if (!token) return;

            // const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
            // await fetch(`${apiUrl}/api/notifications/${notificationId}`, {
            //     method: 'DELETE',
            //     headers: { 'Authorization': `Bearer ${token}` }
            // });
        } catch (error) {
            console.error('[Notifications] Error deleting:', error);
            fetchNotifications(); // Revert on error
        }
    };

    const markAllAsRead = async () => {
        try {
            const token = await getAccessToken();
            if (!token) return;

            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
            await fetch(`${apiUrl}/api/notifications/read-all`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
        } catch (error) {
            console.error('[Notifications] Error marking all as read:', error);
        }
    };

    const getNotificationIcon = (type: string, metadata: any) => {
        // Improved icon logic based on type and metadata
        if (type === 'payment_received') {
            if (metadata?.documentId && metadata?.documentId.startsWith('inv_')) {
                return (
                    <View style={[styles.iconContainer, { backgroundColor: '#10B981' }]}>
                        <Receipt size={20} color="#FFFFFF" weight="fill" />
                    </View>
                );
            }
            if (metadata?.documentId && !metadata?.documentId.startsWith('inv_')) {
                return (
                    <View style={[styles.iconContainer, { backgroundColor: '#3B82F6' }]}>
                        <Link size={20} color="#FFFFFF" weight="bold" />
                    </View>
                );
            }
            return (
                <View style={[styles.iconContainer, { backgroundColor: '#10B981' }]}>
                    <CurrencyDollar size={20} color="#FFFFFF" weight="fill" />
                </View>
            );
        }

        if (type === 'crypto_received' || type === 'offramp_success') {
            const isWithdrawal = type === 'offramp_success';
            // Use USDC icon as base for now, can be dynamic if metadata.token is available and mapped
            return (
                <View style={[styles.iconContainer, { backgroundColor: 'transparent', overflow: 'visible' }]}>
                    <View style={styles.badgeContainer}>
                        <Image source={ICONS.usdc} style={styles.tokenIcon} />
                        <Image
                            source={getChainIcon(metadata?.chain || metadata?.network)}
                            style={styles.chainIconBadge}
                        />
                    </View>
                </View>
            );
        }

        switch (type) {
            case 'announcement':
                return (
                    <View style={[styles.iconContainer, { backgroundColor: '#F59E0B' }]}>
                        <Megaphone size={20} color="#FFFFFF" weight="fill" />
                    </View>
                );
            case 'contract_approved':
                return (
                    <View style={[styles.iconContainer, { backgroundColor: '#8B5CF6' }]}>
                        <FileText size={20} color="#FFFFFF" weight="fill" />
                    </View>
                );
            case 'proposal_accepted':
                return (
                    <View style={[styles.iconContainer, { backgroundColor: '#10B981' }]}>
                        <CheckCircle size={20} color="#FFFFFF" weight="fill" />
                    </View>
                );
            case 'proposal_sent':
                return (
                    <View style={[styles.iconContainer, { backgroundColor: '#3B82F6' }]}>
                        <FileText size={20} color="#FFFFFF" weight="fill" />
                    </View>
                );
            default:
                return (
                    <View style={[styles.iconContainer, { backgroundColor: Colors.textSecondary }]}>
                        <Bell size={20} color="#FFFFFF" weight="fill" />
                    </View>
                );
        }
    };

    const filteredNotifications = useMemo(() => {
        if (activeFilter === 'all') return notifications;

        switch (activeFilter) {
            case 'transactions':
                // Transactions are raw crypto transfers only
                return notifications.filter(n => n.type === 'crypto_received');
            case 'payment_links':
                // Payment links are payment_received but NOT invoices (check title for distinction)
                return notifications.filter(n => n.type === 'payment_received' && !n.title.toLowerCase().includes('invoice'));
            case 'invoices':
                // Invoices are payment_received where title contains "Invoice"
                return notifications.filter(n => n.type === 'payment_received' && n.title.toLowerCase().includes('invoice'));
            case 'withdrawals':
                return notifications.filter(n => n.type === 'offramp_success');
            default:
                return notifications;
        }
    }, [notifications, activeFilter]);

    const sections = useMemo(() => {
        const today: Notification[] = [];
        const earlier: Notification[] = [];

        filteredNotifications.forEach(n => {
            if (isToday(new Date(n.created_at))) {
                today.push(n);
            } else {
                earlier.push(n);
            }
        });

        const result = [];
        if (today.length > 0) result.push({ title: 'Today', data: today });
        if (earlier.length > 0) result.push({ title: 'Earlier', data: earlier });
        return result;
    }, [filteredNotifications]);

    const renderRightActions = (progress: any, dragX: any, id: string) => {
        const scale = dragX.interpolate({
            inputRange: [-100, 0],
            outputRange: [1, 0],
            extrapolate: 'clamp',
        });

        return (
            <TouchableOpacity onPress={() => deleteNotification(id)}>
                <View style={styles.deleteButton}>
                    <Animated.View style={{ transform: [{ scale }] }}>
                        <Trash size={24} color="#FFFFFF" weight="bold" />
                    </Animated.View>
                </View>
            </TouchableOpacity>
        );
    };

    const renderNotification = ({ item }: { item: Notification }) => {
        const date = new Date(item.created_at);
        const isItemToday = isToday(date);

        return (
            <Swipeable renderRightActions={(progress, dragX) => renderRightActions(progress, dragX, item.id)}>
                <TouchableOpacity
                    style={[styles.notificationItem, { backgroundColor: themeColors.background }]}
                    onPress={() => markAsRead(item.id)}
                    activeOpacity={0.7}
                >
                    {getNotificationIcon(item.type, item.metadata)}
                    <View style={styles.contentContainer}>
                        <View style={styles.topRow}>
                            <Text style={[styles.notificationTitle, { color: themeColors.textPrimary }]}>{item.title}</Text>
                            <View style={styles.timeContainer}>
                                {!isItemToday && (
                                    <Text style={[styles.dateText, { color: themeColors.textSecondary }]}>{format(date, 'MMM d, yyyy')}</Text>
                                )}
                                {isItemToday && (
                                    <Text style={[styles.timeText, { color: themeColors.textSecondary }]}>{format(date, 'h:mm a')}</Text>
                                )}
                                {!item.is_read && <View style={styles.unreadDot} />}
                            </View>
                        </View>
                        <Text style={[styles.notificationMessage, { color: themeColors.textSecondary }]} numberOfLines={2}>
                            {item.type === 'crypto_received' && item.metadata?.amount
                                ? `You received ${item.metadata.amount} ${item.metadata.token || 'USDC'} from ${formatAddress(item.metadata.from)}`
                                : item.type === 'offramp_success' && item.metadata?.amount
                                    ? `You withdrew ${item.metadata.amount} ${item.metadata.token || 'USDC'} to ${item.metadata.destination || 'your bank'}`
                                    : item.message}
                        </Text>
                    </View>
                </TouchableOpacity>
            </Swipeable>
        );
    };

    const renderHeader = () => (
        <View style={styles.filterContainer}>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterScroll}
            >
                {NOTIFICATION_FILTERS.map(filter => (
                    <TouchableOpacity
                        key={filter.id}
                        style={[
                            styles.filterChip,
                            { backgroundColor: themeColors.surface },
                            activeFilter === filter.id && styles.filterChipActive
                        ]}
                        onPress={() => setActiveFilter(filter.id)}
                    >
                        <Text style={[
                            styles.filterText,
                            { color: themeColors.textSecondary },
                            activeFilter === filter.id && styles.filterTextActive
                        ]}>
                            {filter.label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>
        </View>
    );

    const currentDate = new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        day: 'numeric',
        month: 'long'
    }).toUpperCase();

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: themeColors.background }]}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => router.back()}
                >
                    <CaretLeft size={24} color={themeColors.textPrimary} weight="bold" />
                </TouchableOpacity>
                <View style={{ width: 100, alignItems: 'flex-end' }}>
                    <TouchableOpacity onPress={markAllAsRead}>
                        <Text style={styles.markAsDoneText}>Mark as done</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Date & Title */}
            <View style={styles.titleContainer}>
                <Text style={[styles.dateText, { color: themeColors.textSecondary }]}>{currentDate}</Text>
                <Text style={[styles.pageTitle, { color: themeColors.textPrimary }]}>Notifications</Text>
            </View>

            {/* Content */}
            {isLoading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={Colors.primary} />
                </View>
            ) : notifications.length === 0 ? (
                <View style={styles.emptyState}>
                    <Bell size={64} color={themeColors.textSecondary} weight="light" />
                    <Text style={[styles.emptyTitle, { color: themeColors.textPrimary }]}>No notifications yet</Text>
                    <Text style={[styles.emptySubtitle, { color: themeColors.textSecondary }]}>
                        When someone pays your invoice or sends you crypto, I'll let you know here!
                    </Text>
                </View>
            ) : (
                <GestureHandlerRootView style={{ flex: 1 }}>
                    <SectionList
                        sections={sections}
                        keyExtractor={(item) => item.id}
                        renderItem={renderNotification}
                        renderSectionHeader={({ section: { title } }) => (
                            <Text style={[styles.sectionHeader, { color: themeColors.textPrimary }]}>{title}</Text>
                        )}
                        ListHeaderComponent={renderHeader}
                        contentContainerStyle={styles.listContent}
                        stickySectionHeadersEnabled={false}
                        refreshControl={
                            <RefreshControl
                                refreshing={isRefreshing}
                                onRefresh={handleRefresh}
                                tintColor={Colors.primary}
                            />
                        }
                    />
                </GestureHandlerRootView>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FFFFFF',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 12,
        marginBottom: 8,
    },
    backButton: {
        width: 100,
        height: 44,
        justifyContent: 'center',
        alignItems: 'flex-start',
    },
    headerTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 22,
        color: Colors.textPrimary,
        textAlign: 'center',
        flex: 1,
    },
    titleContainer: {
        paddingHorizontal: 20,
        marginBottom: 16,
    },
    dateText: {
        fontSize: 12,
        fontFamily: 'GoogleSansFlex_500Medium',
        letterSpacing: 1,
        marginBottom: 4,
    },
    pageTitle: {
        fontSize: 28,
        fontFamily: 'GoogleSansFlex_600SemiBold',
    },
    markAsDoneText: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 14,
        color: Colors.primary,
    },
    filterContainer: {
        marginBottom: 24,
    },
    filterScroll: {
        paddingHorizontal: 20,
        gap: 8,
        paddingRight: 20, // Add padding at end of scroll
    },
    filterChip: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: '#F3F4F6',
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
    sectionHeader: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 18,
        color: Colors.textPrimary,
        marginTop: 8,
        marginBottom: 16,
        paddingHorizontal: 20,
    },
    listContent: {
        paddingBottom: 40,
    },
    notificationItem: {
        flexDirection: 'row',
        paddingHorizontal: 20,
        paddingVertical: 16, // Moved padding vertical to item for cleaner swipe
        backgroundColor: '#FFFFFF',
        // Removed margin bottom to allow swipe items to stack cleanly if needed, or keeping it but ensuring swipe layout works
        marginBottom: 0,
    },
    deleteButton: {
        backgroundColor: '#EF4444',
        justifyContent: 'center',
        alignItems: 'center',
        width: 80,
        height: '100%',
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    badgeContainer: {
        width: 40,
        height: 40,
        position: 'relative',
    },
    tokenIcon: {
        width: 32, // Slightly smaller than container to fit overlapping chain
        height: 32,
        borderRadius: 16,
        position: 'absolute',
        top: 0,
        left: 0,
    },
    chainIconBadge: {
        width: 16,
        height: 16,
        borderRadius: 8,
        position: 'absolute',
        bottom: 4, // Adjust to overlap correctly
        right: 4,
        borderWidth: 1.5,
        borderColor: '#FFFFFF', // Stroke for separation
    },
    contentContainer: {
        flex: 1,
        justifyContent: 'center',
    },
    topRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    notificationTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 15,
        color: Colors.textPrimary,
        flex: 1,
        marginRight: 8,
    },
    timeContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    dateText: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 13,
        color: Colors.textSecondary,
    },
    timeText: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 13,
        color: Colors.textSecondary,
    },
    unreadDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#EF4444',
        marginLeft: 8,
    },
    notificationMessage: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 14,
        color: Colors.textSecondary,
        lineHeight: 20,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 40,
        marginTop: 60,
    },
    emptyTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 20,
        color: Colors.textPrimary,
        marginTop: 16,
        marginBottom: 8,
    },
    emptySubtitle: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 15,
        color: Colors.textSecondary,
        textAlign: 'center',
        lineHeight: 22,
    },
});
