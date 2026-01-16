import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Alert, TextInput, Platform, LayoutAnimation } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../hooks/useAuth';
import { List, Chat, MagnifyingGlass, Plus, Trash, CheckCircle, X } from 'phosphor-react-native';
import { Colors, useThemeColors } from '../../theme/colors';
import { Typography } from '../../styles/typography';
import { Sidebar } from '../../components/Sidebar';
import { ProfileModal } from '../../components/ProfileModal';
import * as Haptics from 'expo-haptics';
import Fuse from 'fuse.js';
import { useAnalyticsScreen } from '../../hooks/useAnalyticsScreen';

export default function ChatsScreen() {
    // Track screen view
    useAnalyticsScreen('Chats');

    const router = useRouter();
    const { user, getAccessToken } = useAuth();
    const themeColors = useThemeColors();
    const [conversations, setConversations] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [userName, setUserName] = useState({ firstName: '', lastName: '' });
    const [walletAddresses, setWalletAddresses] = useState<{ evm?: string; solana?: string }>({});
    const [profileIcon, setProfileIcon] = useState<{ emoji?: string; colorIndex?: number; imageUri?: string }>({});

    // Search State
    const [searchQuery, setSearchQuery] = useState('');

    // Selection Mode State
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedChats, setSelectedChats] = useState<Set<string>>(new Set());

    useFocusEffect(
        useCallback(() => {
            fetchConversations();
            fetchUserProfile();
            // Reset selection on focus? Optional.
            setIsSelectionMode(false);
            setSelectedChats(new Set());
        }, [user])
    );

    // Fuzzy Search Logic
    const filteredConversations = useMemo(() => {
        if (!searchQuery.trim()) return conversations;

        const fuse = new Fuse(conversations, {
            keys: ['title', 'messages.content'],
            threshold: 0.4,
        });

        return fuse.search(searchQuery).map(result => result.item);
    }, [conversations, searchQuery]);

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

                // Set profile icon
                if (userData.avatar) {
                    try {
                        if (typeof userData.avatar === 'string' && userData.avatar.trim().startsWith('{')) {
                            setProfileIcon(JSON.parse(userData.avatar));
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
            }
        } catch (error) {
            console.error('Error fetching user profile:', error);
        }
    };

    const fetchConversations = async () => {
        try {
            if (!refreshing) setIsLoading(true);
            const token = await getAccessToken();
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

            const response = await fetch(`${apiUrl}/api/chat/conversations`, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
            });

            if (!response.ok) return;

            const data = await response.json();
            if (data.success && data.data) {
                const conversationsData = data.data.conversations || data.data;
                setConversations(Array.isArray(conversationsData) ? conversationsData : []);
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

    // --- Selection Logic ---

    const toggleSelection = (id: string) => {
        const newSelected = new Set(selectedChats);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedChats(newSelected);
        Haptics.selectionAsync();

        if (newSelected.size === 0 && isSelectionMode) {
            // Optional: Exit mode if empty
            // setIsSelectionMode(false);
        }
    };

    const enterSelectionMode = (initialId: string) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setIsSelectionMode(true);
        setSelectedChats(new Set([initialId]));
    };

    const cancelSelection = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setIsSelectionMode(false);
        setSelectedChats(new Set());
    };

    const confirmDeleteSelected = () => {
        Alert.alert(
            'Delete Chats',
            `Are you sure you want to delete ${selectedChats.size} conversation${selectedChats.size > 1 ? 's' : ''}?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: deleteSelectedChats
                }
            ]
        );
    };

    const deleteSelectedChats = async () => {
        try {
            const token = await getAccessToken();
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

            // Optimistic Update
            const idsToDelete = Array.from(selectedChats);
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setConversations(prev => prev.filter(c => !selectedChats.has(c.id)));
            setIsSelectionMode(false);
            setSelectedChats(new Set());

            // API Calls (Parallel)
            await Promise.all(idsToDelete.map(id =>
                fetch(`${apiUrl}/api/chat/conversations/${id}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` },
                })
            ));

        } catch (error) {
            console.error('Error deleting conversations:', error);
            Alert.alert('Error', 'Failed to delete some conversations');
            // Re-fetch to sync state if error
            fetchConversations();
        }
    };

    // --- Render Items ---

    const handleChatPress = (conversationId: string) => {
        if (isSelectionMode) {
            toggleSelection(conversationId);
        } else {
            router.replace({ pathname: '/', params: { conversationId } });
        }
    };

    const renderConversationItem = ({ item }: { item: any }) => {
        const lastMessage = item.messages?.[item.messages.length - 1];
        const timeAgo = getTimeAgo(new Date(item.updated_at));
        const isSelected = selectedChats.has(item.id);

        return (
            <TouchableOpacity
                style={[
                    styles.chatItem,
                    { backgroundColor: themeColors.surface, borderColor: themeColors.border },
                    isSelectionMode && isSelected && styles.chatItemSelected
                ]}
                onPress={() => handleChatPress(item.id)}
                onLongPress={() => {
                    if (!isSelectionMode) {
                        enterSelectionMode(item.id);
                    } else {
                        toggleSelection(item.id);
                    }
                }}
                activeOpacity={0.7}
                delayLongPress={300}
            >
                {isSelectionMode ? (
                    <View style={styles.selectionIndicator}>
                        {isSelected ? (
                            <CheckCircle size={24} color={Colors.primary} weight="fill" />
                        ) : (
                            <View style={{
                                width: 24,
                                height: 24,
                                borderRadius: 12,
                                borderWidth: 2,
                                borderColor: themeColors.textSecondary
                            }} />
                        )}
                    </View>
                ) : (
                    <View style={[styles.chatIcon, { backgroundColor: themeColors.background }]}>
                        <Chat size={24} color={themeColors.textPrimary} weight="duotone" />
                    </View>
                )}

                <View style={styles.chatContent}>
                    <View style={styles.chatHeader}>
                        <Text style={[styles.chatTitle, { color: themeColors.textPrimary }]} numberOfLines={1}>
                            {item.title || 'New Conversation'}
                        </Text>
                        <Text style={[styles.chatTime, { color: themeColors.textSecondary }]}>{timeAgo}</Text>
                    </View>
                    {lastMessage && (
                        <Text style={[styles.chatPreview, { color: themeColors.textSecondary }]} numberOfLines={2}>
                            {lastMessage.role === 'user' ? 'You: ' : ''}{lastMessage.content}
                        </Text>
                    )}
                </View>
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
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    return (
        <View style={{ flex: 1, backgroundColor: themeColors.background }}>
            <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top', 'left', 'right']}>
                {/* Header */}
                <View style={[styles.header, { backgroundColor: themeColors.background }]}>
                    {isSelectionMode ? (
                        <View style={styles.selectionHeaderContent}>
                            <TouchableOpacity onPress={cancelSelection} hitSlop={10}>
                                <Text style={styles.cancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <Text style={[styles.selectionTitle, { color: themeColors.textPrimary }]}>{selectedChats.size} selected</Text>
                            <TouchableOpacity
                                onPress={confirmDeleteSelected}
                                disabled={selectedChats.size === 0}
                                hitSlop={10}
                            >
                                <Trash
                                    size={24}
                                    color={selectedChats.size > 0 ? '#EF4444' : themeColors.textTertiary}
                                    weight={selectedChats.size > 0 ? 'fill' : 'regular'}
                                />
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <View style={styles.defaultHeaderContent}>
                            <TouchableOpacity onPress={() => setIsSidebarOpen(true)}>
                                <List size={24} color={themeColors.textPrimary} weight="bold" />
                            </TouchableOpacity>
                            <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]}>Chats</Text>
                            <TouchableOpacity onPress={() => router.replace('/')}>
                                <Plus size={24} color={themeColors.textPrimary} />
                            </TouchableOpacity>
                        </View>
                    )}
                </View>

                {/* Search Bar */}
                {!isSelectionMode && (
                    <View style={styles.searchContainer}>
                        <View style={[styles.searchBar, { backgroundColor: themeColors.surface }]}>
                            <MagnifyingGlass size={20} color={themeColors.textSecondary} />
                            <TextInput
                                style={[styles.searchInput, { color: themeColors.textPrimary }]}
                                placeholder="Search chats..."
                                placeholderTextColor={themeColors.textTertiary}
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                                autoCapitalize="none"
                            />
                            {searchQuery.length > 0 && (
                                <TouchableOpacity onPress={() => setSearchQuery('')}>
                                    <X size={16} color={themeColors.textSecondary} />
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                )}

                {/* List */}
                {isLoading && !refreshing ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color={Colors.primary} />
                    </View>
                ) : (
                    <FlatList
                        data={filteredConversations}
                        renderItem={renderConversationItem}
                        keyExtractor={(item) => item.id}
                        contentContainerStyle={styles.listContent}
                        refreshControl={
                            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                        }
                        ListEmptyComponent={
                            <View style={styles.emptyState}>
                                <Chat size={48} color={themeColors.textSecondary} weight="bold" />
                                <Text style={[styles.emptyStateText, { color: themeColors.textSecondary }]}>
                                    {searchQuery ? 'No chats found' : 'No conversations yet'}
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

            <Sidebar
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
                userName={userName}
                conversations={conversations}
                onHomeClick={() => router.replace('/')}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        // backgroundColor: '#FFFFFF', // Overridden
    },
    header: {
        paddingHorizontal: 20,
        paddingVertical: 12,
        // backgroundColor: '#FFFFFF', // Overridden
        // Removed border bottom as requested
        height: 60,
        justifyContent: 'center',
    },
    defaultHeaderContent: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    selectionHeaderContent: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    headerTitle: {
        ...Typography.h4,
        fontSize: 22,
    },
    selectionTitle: {
        ...Typography.h4,
        fontSize: 22,
    },
    cancelText: {
        ...Typography.body,
        color: Colors.primary,
        fontWeight: '600',
    },
    searchContainer: {
        padding: 16,
        paddingTop: 8,
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        // backgroundColor: '#F3F4F6', // Overridden
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 12,
        gap: 8,
        height: 48,
    },
    searchInput: {
        flex: 1,
        ...Typography.body,
        // color: Colors.textPrimary, // Overridden
        height: '100%',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    listContent: {
        padding: 16,
        paddingBottom: 100, // Space for FAB
    },
    chatItem: {
        flexDirection: 'row',
        alignItems: 'center', // Center vertically for icon alignment
        padding: 16,
        // backgroundColor: '#FFFFFF', // Overridden
        borderRadius: 16,
        borderWidth: 1,
        // borderColor: '#F3F4F6', // Overridden
        marginBottom: 8,
    },
    chatItemSelected: {
        backgroundColor: '#EFF6FF',
        borderColor: Colors.primary,
    },
    chatIcon: {
        width: 44,
        height: 44,
        borderRadius: 14,
        backgroundColor: '#F3F4F6',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    selectionIndicator: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    chatContent: {
        flex: 1,
    },
    chatHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    chatTitle: {
        ...Typography.body,
        fontWeight: '600',
        color: Colors.textPrimary,
        flex: 1,
        marginRight: 8,
    },
    chatTime: {
        ...Typography.caption,
        color: Colors.textTertiary,
        fontSize: 12,
    },
    chatPreview: {
        ...Typography.caption,
        color: Colors.textSecondary,
        lineHeight: 18,
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
    fab: {
        position: 'absolute',
        bottom: 32,
        right: 24,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: Colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 4,
        },
        shadowOpacity: 0.30,
        shadowRadius: 4.65,
        elevation: 8,
    },
});
