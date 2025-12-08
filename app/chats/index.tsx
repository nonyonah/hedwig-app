import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePrivy } from '@privy-io/expo';
import { List, Chat, MagnifyingGlass, Plus } from 'phosphor-react-native';
import { Colors } from '../../theme/colors';
import { Typography } from '../../styles/typography';
import { Sidebar } from '../../components/Sidebar';
import { ProfileModal } from '../../components/ProfileModal';
import { getUserGradient } from '../../utils/gradientUtils';

export default function ChatsScreen() {
    const router = useRouter();
    const { user, getAccessToken } = usePrivy();
    const [conversations, setConversations] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [userName, setUserName] = useState({ firstName: '', lastName: '' });
    const [walletAddresses, setWalletAddresses] = useState<{ evm?: string; solana?: string }>({});

    useEffect(() => {
        fetchConversations();
        fetchUserProfile();
    }, [user]);

    const fetchUserProfile = async () => {
        try {
            const token = await getAccessToken();
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

            const response = await fetch(`${apiUrl}/api/users/profile`, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
            });

            const data = await response.json();
            if (data.success && data.data) {
                const userData = data.data.user || data.data;
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
            console.error('Error fetching user profile:', error);
        }
    };

    const fetchConversations = async () => {
        try {
            setIsLoading(true);
            const token = await getAccessToken();
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

            console.log('[Chats] Fetching conversations from:', `${apiUrl}/api/chat/conversations`);

            const response = await fetch(`${apiUrl}/api/chat/conversations`, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
            });

            console.log('[Chats] Response status:', response.status);

            const data = await response.json();
            console.log('[Chats] Response data:', JSON.stringify(data, null, 2));

            if (data.success && data.data) {
                const conversationsData = data.data.conversations || data.data;
                console.log('[Chats] Setting conversations:', Array.isArray(conversationsData) ? conversationsData.length : 0, 'items');
                setConversations(Array.isArray(conversationsData) ? conversationsData : []);
            } else {
                console.log('[Chats] No data or unsuccessful response');
            }
        } catch (error) {
            console.error('[Chats] Error fetching conversations:', error);
        } finally {
            setIsLoading(false);
            setRefreshing(false);
        }
    };

    const onRefresh = () => {
        setRefreshing(true);
        fetchConversations();
    };

    const deleteConversation = async (conversationId: string) => {
        try {
            const token = await getAccessToken();
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

            const response = await fetch(`${apiUrl}/api/chat/conversations/${conversationId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });

            const data = await response.json();
            if (data.success) {
                // Remove from local state
                setConversations(prev => prev.filter(c => c.id !== conversationId));
            } else {
                Alert.alert('Error', 'Failed to delete conversation');
            }
        } catch (error) {
            console.error('Error deleting conversation:', error);
            Alert.alert('Error', 'Failed to delete conversation');
        }
    };

    const confirmDelete = (conversationId: string, title: string) => {
        Alert.alert(
            'Delete Chat',
            `Are you sure you want to delete "${title || 'this conversation'}"?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => deleteConversation(conversationId)
                }
            ]
        );
    };

    const handleChatPress = (conversationId: string) => {
        // Navigate to homepage with conversation ID
        router.push({ pathname: '/', params: { conversationId } });
    };

    const renderConversationItem = ({ item }: { item: any }) => {
        const lastMessage = item.messages?.[item.messages.length - 1];
        const timeAgo = getTimeAgo(new Date(item.updated_at));

        return (
            <TouchableOpacity
                style={styles.chatItem}
                onPress={() => handleChatPress(item.id)}
                onLongPress={() => confirmDelete(item.id, item.title)}
                activeOpacity={0.6}
                delayLongPress={500}
            >
                <View style={styles.chatContent}>
                    <Text style={styles.chatTitle} numberOfLines={1}>
                        {item.title || 'New Conversation'}
                    </Text>
                    {lastMessage && (
                        <Text style={styles.chatPreview} numberOfLines={2}>
                            {lastMessage.role === 'user' ? 'You: ' : ''}{lastMessage.content}
                        </Text>
                    )}
                </View>
                <Text style={styles.chatTime}>{timeAgo}</Text>
            </TouchableOpacity>
        );
    };

    const getTimeAgo = (date: Date) => {
        const now = new Date();
        const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

        if (seconds < 60) return 'Just now';

        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m`;

        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h`;

        const days = Math.floor(hours / 24);
        if (days < 7) return `${days}d`;

        const weeks = Math.floor(days / 7);
        if (weeks < 4) return `${weeks}w`;

        // For older dates, show the actual date
        const isThisYear = now.getFullYear() === date.getFullYear();
        if (isThisYear) {
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    return (
        <View style={{ flex: 1 }}>
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => setIsSidebarOpen(true)}>
                        <List size={24} color={Colors.textPrimary} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Chats</Text>
                    <View style={{ width: 24 }} />
                </View>

                <View style={styles.searchContainer}>
                    <View style={styles.searchBar}>
                        <MagnifyingGlass size={20} color={Colors.textSecondary} />
                        <Text style={styles.searchPlaceholder}>Search chats...</Text>
                    </View>
                </View>

                {isLoading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color={Colors.primary} />
                    </View>
                ) : (
                    <FlatList
                        data={conversations}
                        renderItem={renderConversationItem}
                        keyExtractor={(item) => item.id}
                        contentContainerStyle={styles.listContent}
                        refreshControl={
                            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                        }
                        ListEmptyComponent={
                            <View style={styles.emptyState}>
                                <Chat size={48} color={Colors.textSecondary} weight="duotone" />
                                <Text style={styles.emptyStateText}>No conversations yet</Text>
                                <TouchableOpacity
                                    style={styles.newChatButton}
                                    onPress={() => router.push('/')}
                                >
                                    <Text style={styles.newChatButtonText}>Start a new chat</Text>
                                </TouchableOpacity>
                            </View>
                        }
                    />
                )}

                <ProfileModal
                    visible={showProfileModal}
                    onClose={() => setShowProfileModal(false)}
                    userName={userName}
                    walletAddresses={walletAddresses}
                />
            </SafeAreaView>

            <Sidebar
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
                userName={userName}
                conversations={conversations}
                onHomeClick={() => router.push('/')}
            />
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
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
        backgroundColor: '#FFFFFF',
    },
    headerTitle: {
        ...Typography.h4,
        fontSize: 18,
    },
    searchContainer: {
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.background,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 12,
        gap: 8,
    },
    searchPlaceholder: {
        ...Typography.body,
        color: Colors.textPlaceholder,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    listContent: {
        padding: 16,
    },
    conversationItem: {
        flexDirection: 'row',
        padding: 16,
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    conversationIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: Colors.background,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    conversationContent: {
        flex: 1,
        justifyContent: 'center',
    },
    conversationHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    conversationTitle: {
        ...Typography.body,
        fontWeight: '600',
        color: Colors.textPrimary,
        flex: 1,
        marginRight: 8,
    },
    conversationTime: {
        ...Typography.caption,
        color: Colors.textSecondary,
    },
    lastMessage: {
        ...Typography.caption,
        color: Colors.textSecondary,
        fontSize: 13,
    },
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 100,
        gap: 16,
    },
    emptyStateText: {
        ...Typography.body,
        color: Colors.textSecondary,
        textAlign: 'center',
    },
    newChatButton: {
        backgroundColor: Colors.primary,
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 24,
        marginTop: 16,
    },
    newChatButtonText: {
        ...Typography.body,
        color: '#FFFFFF',
        fontWeight: '600',
    },
    chatItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        padding: 16,
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: Colors.border,
        marginBottom: 8,
    },
    chatContent: {
        flex: 1,
        marginRight: 12,
    },
    chatTitle: {
        ...Typography.body,
        fontWeight: '600',
        color: Colors.textPrimary,
        marginBottom: 4,
    },
    chatPreview: {
        ...Typography.caption,
        color: Colors.textSecondary,
        lineHeight: 18,
    },
    chatTime: {
        ...Typography.caption,
        color: Colors.textTertiary,
        fontSize: 12,
    },
});
