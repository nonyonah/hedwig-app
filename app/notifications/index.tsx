import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { CaretLeft, Bell, CheckCircle, CurrencyDollar, ArrowsDownUp, Megaphone } from 'phosphor-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../theme/colors';
import { usePrivy } from '@privy-io/expo';

interface Notification {
    id: string;
    type: 'payment_received' | 'crypto_received' | 'offramp_success' | 'announcement';
    title: string;
    message: string;
    metadata: any;
    is_read: boolean;
    created_at: string;
}

export default function NotificationsScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { getAccessToken } = usePrivy();

    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);

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

            // Update local state
            setNotifications(prev =>
                prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
            );
        } catch (error) {
            console.error('[Notifications] Error marking as read:', error);
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

            // Update local state
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
        } catch (error) {
            console.error('[Notifications] Error marking all as read:', error);
        }
    };

    const getNotificationIcon = (type: string) => {
        switch (type) {
            case 'payment_received':
                return <CurrencyDollar size={24} color="#10B981" weight="fill" />;
            case 'crypto_received':
                return <ArrowsDownUp size={24} color="#3B82F6" weight="fill" />;
            case 'offramp_success':
                return <CheckCircle size={24} color="#8B5CF6" weight="fill" />;
            case 'announcement':
                return <Megaphone size={24} color="#F59E0B" weight="fill" />;
            default:
                return <Bell size={24} color={Colors.textSecondary} weight="fill" />;
        }
    };

    const formatTimeAgo = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    };

    const renderNotification = ({ item }: { item: Notification }) => (
        <TouchableOpacity
            style={[styles.notificationItem, !item.is_read && styles.unreadNotification]}
            onPress={() => markAsRead(item.id)}
            activeOpacity={0.7}
        >
            <View style={styles.iconContainer}>
                {getNotificationIcon(item.type)}
            </View>
            <View style={styles.contentContainer}>
                <Text style={styles.notificationTitle}>{item.title}</Text>
                <Text style={styles.notificationMessage}>{item.message}</Text>
                <Text style={styles.notificationTime}>{formatTimeAgo(item.created_at)}</Text>
            </View>
            {!item.is_read && <View style={styles.unreadDot} />}
        </TouchableOpacity>
    );

    const hasUnread = notifications.some(n => !n.is_read);

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => router.back()}
                >
                    <CaretLeft size={24} color={Colors.textPrimary} weight="bold" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Notifications</Text>
                {hasUnread ? (
                    <TouchableOpacity onPress={markAllAsRead}>
                        <Text style={styles.markAllRead}>Mark all read</Text>
                    </TouchableOpacity>
                ) : (
                    <View style={{ width: 80 }} />
                )}
            </View>

            {isLoading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={Colors.primary} />
                </View>
            ) : notifications.length === 0 ? (
                <View style={styles.emptyState}>
                    <Bell size={64} color={Colors.textSecondary} weight="light" />
                    <Text style={styles.emptyTitle}>No notifications yet</Text>
                    <Text style={styles.emptySubtitle}>
                        When someone pays your invoice or sends you crypto, I'll let you know here!
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={notifications}
                    renderItem={renderNotification}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.listContent}
                    refreshControl={
                        <RefreshControl
                            refreshing={isRefreshing}
                            onRefresh={handleRefresh}
                            tintColor={Colors.primary}
                        />
                    }
                />
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
        paddingVertical: 16,
    },
    backButton: {
        padding: 4,
        width: 80,
    },
    headerTitle: {
        fontFamily: 'RethinkSans_700Bold',
        fontSize: 18,
        color: Colors.textPrimary,
        textAlign: 'center',
        flex: 1,
    },
    markAllRead: {
        fontFamily: 'RethinkSans_500Medium',
        fontSize: 14,
        color: Colors.primary,
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
    },
    emptyTitle: {
        fontFamily: 'RethinkSans_700Bold',
        fontSize: 20,
        color: Colors.textPrimary,
        marginTop: 16,
        marginBottom: 8,
    },
    emptySubtitle: {
        fontFamily: 'RethinkSans_400Regular',
        fontSize: 15,
        color: Colors.textSecondary,
        textAlign: 'center',
        lineHeight: 22,
    },
    listContent: {
        padding: 16,
    },
    notificationItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: '#FFFFFF',
        padding: 16,
        borderRadius: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#F3F4F6',
    },
    unreadNotification: {
        backgroundColor: '#F8FAFC',
        borderColor: '#E5E7EB',
    },
    iconContainer: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#F3F4F6',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    contentContainer: {
        flex: 1,
    },
    notificationTitle: {
        fontFamily: 'RethinkSans_600SemiBold',
        fontSize: 15,
        color: Colors.textPrimary,
        marginBottom: 4,
    },
    notificationMessage: {
        fontFamily: 'RethinkSans_400Regular',
        fontSize: 14,
        color: Colors.textSecondary,
        lineHeight: 20,
        marginBottom: 6,
    },
    notificationTime: {
        fontFamily: 'RethinkSans_400Regular',
        fontSize: 12,
        color: '#9CA3AF',
    },
    unreadDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: Colors.primary,
        marginLeft: 8,
        marginTop: 4,
    },
});
