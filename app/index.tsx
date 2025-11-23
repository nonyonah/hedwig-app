
import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, FlatList, KeyboardAvoidingView, Platform, Modal, Animated, Dimensions, ActivityIndicator, Alert, SafeAreaView, Keyboard, TouchableWithoutFeedback } from 'react-native';
import { useRouter } from 'expo-router';
import { usePrivy } from '@privy-io/expo';
import { List, Bell, SquaresFour, ArrowUp, Link, Receipt, Pen, Scroll, X, Copy, ThumbsUp, ThumbsDown, ArrowsClockwise, Gear, Swap, ClockCounterClockwise, House, SignOut, Chat } from 'phosphor-react-native';
import { Colors } from '../theme/colors';
import { Metrics } from '../theme/metrics';
import { Typography } from '../styles/typography';

const { width, height } = Dimensions.get('window');

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    createdAt: string;
}

export default function HomeScreen() {
    const router = useRouter();
    const { isReady, user, logout, getAccessToken } = usePrivy();
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputText, setInputText] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isQuickActionsOpen, setIsQuickActionsOpen] = useState(false);
    const [conversationId, setConversationId] = useState<string | null>(null);
    const [userName, setUserName] = useState({ firstName: '', lastName: '' });
    const [displayedGreeting, setDisplayedGreeting] = useState('');
    const [isTypingGreeting, setIsTypingGreeting] = useState(false);
    const [conversations, setConversations] = useState<any[]>([]);
    const flatListRef = useRef<FlatList>(null);
    const sidebarAnim = useRef(new Animated.Value(-width * 0.8)).current;
    const messageAnimations = useRef<{ [key: string]: Animated.Value }>({}).current;

    // Sidebar animation
    useEffect(() => {
        Animated.timing(sidebarAnim, {
            toValue: isSidebarOpen ? 0 : -width * 0.8,
            duration: 300,
            useNativeDriver: true,
        }).start();
    }, [isSidebarOpen]);

    // Fetch user name and conversation history from backend
    useEffect(() => {
        const fetchUserData = async () => {
            try {
                const token = await getAccessToken();
                const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

                // Fetch user profile
                const profileResponse = await fetch(`${apiUrl}/api/user/profile`, {
                    headers: { 'Authorization': `Bearer ${token}` },
                });
                const profileData = await profileResponse.json();
                if (profileData.success && profileData.data.user) {
                    setUserName({
                        firstName: profileData.data.user.firstName || '',
                        lastName: profileData.data.user.lastName || ''
                    });
                }

                // Fetch conversation history (most recent 5)
                const conversationsResponse = await fetch(`${apiUrl}/api/chat/conversations?limit=5`, {
                    headers: { 'Authorization': `Bearer ${token}` },
                });
                const conversationsData = await conversationsResponse.json();
                if (conversationsData.success) {
                    setConversations(conversationsData.data.conversations || []);
                }
            } catch (error) {
                console.error('Failed to fetch user data:', error);
            }
        };
        if (user) fetchUserData();
    }, [user]);

    const getGreeting = () => {
        const hour = new Date().getHours();
        let timeGreeting = '';
        if (hour < 12) timeGreeting = 'Good morning';
        else if (hour < 18) timeGreeting = 'Good afternoon';
        else timeGreeting = 'Good evening';

        const firstName = userName.firstName || (user as any)?.email?.address?.split('@')[0] || 'there';
        return `${timeGreeting}, ${firstName}!`;
    };

    // Typing animation for greeting
    useEffect(() => {
        if (messages.length === 0 && userName.firstName) {
            const fullGreeting = getGreeting();
            setDisplayedGreeting('');
            setIsTypingGreeting(true);
            let currentIndex = 0;

            const typingInterval = setInterval(() => {
                if (currentIndex < fullGreeting.length) {
                    setDisplayedGreeting(fullGreeting.substring(0, currentIndex + 1));
                    currentIndex++;
                } else {
                    setIsTypingGreeting(false);
                    clearInterval(typingInterval);
                }
            }, 50); // 50ms per character

            return () => clearInterval(typingInterval);
        }
    }, [userName, messages.length]);

    const handleLogout = async () => {
        try {
            await logout();
            router.replace('/auth/welcome');
        } catch (error) {
            console.error('Logout failed:', error);
        }
    };

    const handleHomeClick = () => {
        setIsSidebarOpen(false);
        // Clear conversation and start fresh
        setMessages([]);
        setConversationId(null);
    };

    const sendMessage = async () => {
        if (!inputText.trim() || isLoading) return;

        const userMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: inputText.trim(),
            createdAt: new Date().toISOString(),
        };

        setMessages(prev => [...prev, userMessage]);
        setInputText('');
        setIsLoading(true);

        try {
            const token = await getAccessToken();
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

            const response = await fetch(`${apiUrl}/api/chat/message`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    message: userMessage.content,
                    conversationId: conversationId,
                }),
            });

            const data = await response.json();

            if (data.success) {
                const aiMessage: Message = {
                    id: Date.now().toString() + '_ai',
                    role: 'assistant',
                    content: data.data.message,
                    createdAt: new Date().toISOString(),
                };
                setMessages(prev => [...prev, aiMessage]);
                setConversationId(data.data.conversationId);
            } else {
                Alert.alert('Error', data.error?.message || 'Failed to get response');
            }
        } catch (error) {
            console.error('Chat error:', error);
            Alert.alert('Error', 'Failed to connect to server');
        } finally {
            setIsLoading(false);
        }
    };

    const renderMessage = ({ item, index }: { item: Message; index: number }) => {
        const isUser = item.role === 'user';

        // Initialize animation if not exists
        if (!messageAnimations[item.id]) {
            messageAnimations[item.id] = new Animated.Value(0);

            // Start animation
            Animated.timing(messageAnimations[item.id], {
                toValue: 1,
                duration: 400,
                delay: index * 50, // Stagger animation
                useNativeDriver: true,
            }).start();
        }

        const animatedStyle = {
            opacity: messageAnimations[item.id],
            transform: [
                {
                    translateY: messageAnimations[item.id].interpolate({
                        inputRange: [0, 1],
                        outputRange: [20, 0],
                    }),
                },
            ],
        };

        return (
            <Animated.View style={[styles.messageContainer, isUser ? styles.userMessageContainer : styles.aiMessageContainer, animatedStyle]}>
                {isUser ? (
                    <View style={styles.userBubble}>
                        <Text style={styles.userMessageText}>{item.content}</Text>
                    </View>
                ) : (
                    <View style={styles.aiContainer}>
                        <Text style={styles.aiMessageText}>{item.content}</Text>
                        <View style={styles.aiActions}>
                            <TouchableOpacity
                                style={styles.actionIcon}
                                onPress={() => {
                                    // Copy to clipboard
                                    if (Platform.OS === 'web') {
                                        navigator.clipboard.writeText(item.content);
                                    } else {
                                        // For native, you'd need @react-native-clipboard/clipboard
                                        Alert.alert('Copied', 'Message copied to clipboard');
                                    }
                                }}
                            >
                                <Copy size={16} color={Colors.textSecondary} />
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.actionIcon}
                                onPress={() => {
                                    Alert.alert('Thanks!', 'Glad you found this helpful!');
                                }}
                            >
                                <ThumbsUp size={16} color={Colors.textSecondary} />
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.actionIcon}
                                onPress={() => {
                                    Alert.alert('Feedback', 'Thanks for your feedback. We\'ll work on improving!');
                                }}
                            >
                                <ThumbsDown size={16} color={Colors.textSecondary} />
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.actionIcon}
                                onPress={async () => {
                                    // Find the user message before this AI message
                                    const messageIndex = messages.findIndex(m => m.id === item.id);
                                    if (messageIndex > 0) {
                                        const userMsg = messages[messageIndex - 1];
                                        if (userMsg.role === 'user') {
                                            // Resend the user message to get a new response
                                            setIsLoading(true);
                                            try {
                                                const token = await getAccessToken();
                                                const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

                                                const response = await fetch(`${apiUrl}/api/chat/message`, {
                                                    method: 'POST',
                                                    headers: {
                                                        'Content-Type': 'application/json',
                                                        'Authorization': `Bearer ${token}`,
                                                    },
                                                    body: JSON.stringify({
                                                        message: userMsg.content,
                                                        conversationId: conversationId,
                                                    }),
                                                });

                                                const data = await response.json();
                                                if (data.success && data.data.response) {
                                                    // Replace the old AI message with new one
                                                    setMessages(prev => prev.map(m =>
                                                        m.id === item.id
                                                            ? { ...m, content: data.data.response }
                                                            : m
                                                    ));
                                                } else {
                                                    Alert.alert('Error', 'Received empty response');
                                                }
                                            } catch (error) {
                                                console.error('Refresh error:', error);
                                                Alert.alert('Error', 'Failed to refresh response');
                                            } finally {
                                                setIsLoading(false);
                                            }
                                        }
                                    }
                                }}
                            >
                                <ArrowsClockwise size={16} color={Colors.textSecondary} />
                            </TouchableOpacity>
                        </View>
                    </View>
                )}
            </Animated.View>
        );
    };

    if (!isReady) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={Colors.primary} />
            </View>
        );
    }

    return (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
            <SafeAreaView style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => setIsSidebarOpen(true)} style={styles.iconButton}>
                        <List size={24} color={Colors.textPrimary} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.iconButton}>
                        <Bell size={24} color={Colors.textPrimary} />
                    </TouchableOpacity>
                </View>

                {/* Chat Area */}
                <View style={styles.chatArea}>
                    {messages.length === 0 ? (
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyStateText}>
                                {displayedGreeting || getGreeting()}
                                {isTypingGreeting && <Text style={styles.cursor}>|</Text>}
                            </Text>
                            <Text style={styles.emptySubtext}>How can I help you today?</Text>
                        </View>
                    ) : (
                        <FlatList
                            ref={flatListRef}
                            data={messages}
                            renderItem={({ item, index }) => renderMessage({ item, index })}
                            keyExtractor={item => item.id}
                            contentContainerStyle={styles.messageList}
                            showsVerticalScrollIndicator={true}
                            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
                        />
                    )}
                    {isLoading && (
                        <View style={styles.thinkingContainer}>
                            <Text style={styles.thinkingText}>Thinking...</Text>
                        </View>
                    )}
                </View>

                {/* Input Area */}
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
                >
                    <View style={styles.inputContainer}>
                        <TouchableOpacity onPress={() => setIsQuickActionsOpen(true)} style={styles.gridButton}>
                            <SquaresFour size={24} color={Colors.textPrimary} />
                        </TouchableOpacity>
                        <TextInput
                            style={styles.input}
                            placeholder="Ask anything"
                            placeholderTextColor={Colors.textPlaceholder}
                            value={inputText}
                            onChangeText={setInputText}
                            multiline
                        />
                        <TouchableOpacity
                            onPress={sendMessage}
                            style={[styles.sendButton, (!inputText.trim() || isLoading) && styles.sendButtonDisabled]}
                            disabled={!inputText.trim() || isLoading}
                        >
                            <ArrowUp size={20} color={Colors.white} weight="bold" />
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>

                {/* Sidebar Overlay */}
                <Animated.View
                    style={[
                        styles.sidebarOverlay,
                        {
                            opacity: sidebarAnim.interpolate({
                                inputRange: [-width * 0.8, 0],
                                outputRange: [0, 1],
                            }),
                        }
                    ]}
                    pointerEvents={isSidebarOpen ? 'auto' : 'none'}
                >
                    <TouchableOpacity
                        style={styles.sidebarOverlayTouchable}
                        activeOpacity={1}
                        onPress={() => setIsSidebarOpen(false)}
                    >
                        <Animated.View
                            style={[
                                styles.sidebar,
                                { transform: [{ translateX: sidebarAnim }] }
                            ]}
                        >
                            <View style={styles.sidebarContent}>
                                <TouchableOpacity style={styles.sidebarItem} onPress={handleHomeClick}>
                                    <House size={24} color={Colors.textPrimary} />
                                    <Text style={styles.sidebarItemText}>Home</Text>
                                </TouchableOpacity>

                                {/* Recent Conversations Section */}
                                {conversations.length > 0 && (
                                    <View style={styles.historySection}>
                                        <Text style={styles.historySectionTitle}>Recent Chats</Text>
                                        {conversations.map((conv: any) => (
                                            <TouchableOpacity
                                                key={conv.id}
                                                style={[
                                                    styles.historyItem,
                                                    conv.id === conversationId && styles.historyItemActive
                                                ]}
                                                onPress={() => {
                                                    // Load this conversation
                                                    setConversationId(conv.id);
                                                    // You would fetch messages for this conversation here
                                                    setIsSidebarOpen(false);
                                                }}
                                            >
                                                <Chat size={20} color={conv.id === conversationId ? Colors.primary : Colors.textSecondary} />
                                                <View style={styles.historyItemText}>
                                                    <Text style={styles.historyItemTitle} numberOfLines={1}>
                                                        {conv.title || 'New conversation'}
                                                    </Text>
                                                    <Text style={styles.historyItemSubtitle}>
                                                        {new Date(conv.updated_at).toLocaleDateString()}
                                                    </Text>
                                                </View>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                )}

                                <View style={styles.sidebarDivider} />

                                <TouchableOpacity style={styles.sidebarItem}>
                                    <ClockCounterClockwise size={24} color={Colors.textPrimary} />
                                    <Text style={styles.sidebarItemText}>Transactions</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.sidebarItem}>
                                    <Swap size={24} color={Colors.textPrimary} />
                                    <Text style={styles.sidebarItemText}>Swap</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.sidebarItem}>
                                    <Gear size={24} color={Colors.textPrimary} />
                                    <Text style={styles.sidebarItemText}>Settings</Text>
                                </TouchableOpacity>
                            </View>

                            <View style={styles.sidebarFooter}>
                                <View style={styles.userProfile}>
                                    <View style={styles.avatarPlaceholder} />
                                    <Text style={styles.userName}>
                                        {userName.firstName && userName.lastName
                                            ? `${userName.firstName} ${userName.lastName}`
                                            : (user as any)?.email?.address?.split('@')[0] || 'User'}
                                    </Text>
                                </View>
                                <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
                                    <SignOut size={24} color={Colors.error} />
                                </TouchableOpacity>
                            </View>
                        </Animated.View>
                    </TouchableOpacity>
                </Animated.View>

                {/* Quick Actions Modal */}
                <Modal
                    visible={isQuickActionsOpen}
                    transparent
                    animationType="slide"
                    onRequestClose={() => setIsQuickActionsOpen(false)}
                >
                    <TouchableOpacity
                        style={styles.modalOverlay}
                        activeOpacity={1}
                        onPress={() => setIsQuickActionsOpen(false)}
                    >
                        <View style={styles.quickActionsSheet}>
                            <View style={styles.sheetHeader}>
                                <Text style={styles.sheetTitle}>Menu</Text>
                                <TouchableOpacity onPress={() => setIsQuickActionsOpen(false)} style={styles.closeButton}>
                                    <X size={20} color={Colors.textPrimary} />
                                </TouchableOpacity>
                            </View>

                            <TouchableOpacity style={styles.actionItem}>
                                <Link size={24} color={Colors.textPrimary} />
                                <Text style={styles.actionText}>Payment link</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.actionItem}>
                                <Receipt size={24} color={Colors.textPrimary} />
                                <Text style={styles.actionText}>Invoice</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.actionItem}>
                                <Pen size={24} color={Colors.textPrimary} />
                                <Text style={styles.actionText}>Proposal</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.actionItem}>
                                <Scroll size={24} color={Colors.textPrimary} />
                                <Text style={styles.actionText}>Contract</Text>
                            </TouchableOpacity>
                        </View>
                    </TouchableOpacity>
                </Modal>
            </SafeAreaView>
        </TouchableWithoutFeedback>
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
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: Metrics.spacing.lg,
        paddingVertical: Metrics.spacing.md,
    },
    iconButton: {
        padding: Metrics.spacing.xs,
        backgroundColor: Colors.surface,
        borderRadius: 20,
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    chatArea: {
        flex: 1,
        minHeight: 100,
    },
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyStateText: {
        ...Typography.title,
        fontSize: 32,
        textAlign: 'center',
        color: Colors.textPrimary,
        marginBottom: Metrics.spacing.sm,
    },
    emptySubtext: {
        ...Typography.body,
        fontSize: 18,
        textAlign: 'center',
        color: Colors.textSecondary,
    },
    cursor: {
        opacity: 0.8,
        fontWeight: '300',
    },
    messageList: {
        paddingHorizontal: Metrics.spacing.lg,
        paddingVertical: Metrics.spacing.md,
        flexGrow: 1,
    },
    messageContainer: {
        marginBottom: Metrics.spacing.lg,
    },
    userMessageContainer: {
        alignItems: 'flex-end',
    },
    aiMessageContainer: {
        alignItems: 'flex-start',
    },
    userBubble: {
        backgroundColor: Colors.surface,
        padding: Metrics.spacing.md,
        borderRadius: Metrics.borderRadius.lg,
        borderBottomRightRadius: 4,
        maxWidth: '80%',
    },
    userMessageText: {
        ...Typography.body,
        fontSize: 16,
    },
    aiContainer: {
        maxWidth: '100%',
    },
    aiMessageText: {
        ...Typography.body,
        fontSize: 16,
        lineHeight: 24,
    },
    aiActions: {
        flexDirection: 'row',
        marginTop: Metrics.spacing.sm,
        gap: Metrics.spacing.md,
    },
    actionIcon: {
        padding: 4,
    },
    thinkingContainer: {
        paddingHorizontal: Metrics.spacing.lg,
        paddingBottom: Metrics.spacing.md,
    },
    thinkingText: {
        ...Typography.body,
        color: Colors.textSecondary,
        fontStyle: 'italic',
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: Metrics.spacing.md,
        paddingBottom: Platform.OS === 'ios' ? Metrics.spacing.md : Metrics.spacing.lg,
        backgroundColor: Colors.surface,
        margin: Metrics.spacing.md,
        borderRadius: Metrics.borderRadius.xl,
    },
    gridButton: {
        padding: Metrics.spacing.xs,
        marginRight: Metrics.spacing.sm,
    },
    input: {
        flex: 1,
        ...Typography.input,
        maxHeight: 100,
        paddingVertical: 8,
    },
    sendButton: {
        backgroundColor: Colors.primary,
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: Metrics.spacing.sm,
    },
    sendButtonDisabled: {
        backgroundColor: Colors.border,
    },
    // Sidebar Styles
    sidebarOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        zIndex: 1000,
    },
    sidebarOverlayTouchable: {
        flex: 1,
    },
    sidebar: {
        position: 'absolute',
        top: 0,
        left: 0,
        bottom: 0,
        width: '80%',
        backgroundColor: Colors.white,
        paddingTop: 60,
        paddingHorizontal: Metrics.spacing.xl,
    },
    sidebarContent: {
        flex: 1,
        gap: Metrics.spacing.xl,
    },
    sidebarItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Metrics.spacing.md,
    },
    sidebarItemText: {
        ...Typography.body,
        marginLeft: Metrics.spacing.md,
    },
    sidebarDivider: {
        height: 1,
        backgroundColor: Colors.border,
        marginVertical: Metrics.spacing.md,
    },
    historySection: {
        marginVertical: Metrics.spacing.md,
    },
    historySectionTitle: {
        ...Typography.body,
        fontSize: 12,
        color: Colors.textSecondary,
        marginBottom: Metrics.spacing.sm,
        paddingHorizontal: Metrics.spacing.lg,
    },
    historyItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: Metrics.spacing.md,
        backgroundColor: Colors.surface,
        borderRadius: Metrics.borderRadius.md,
        marginHorizontal: Metrics.spacing.lg,
        marginBottom: Metrics.spacing.sm,
        gap: Metrics.spacing.md,
    },
    historyItemActive: {
        backgroundColor: Colors.primary + '20', // 20% opacity
        borderWidth: 1,
        borderColor: Colors.primary,
    },
    historyItemText: {
        flex: 1,
    },
    historyItemTitle: {
        ...Typography.body,
        fontWeight: '600',
        marginBottom: 2,
    },
    historyItemSubtitle: {
        ...Typography.body,
        fontSize: 12,
        color: Colors.textSecondary,
    },
    sidebarFooter: {
        paddingBottom: 40,
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    userProfile: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Metrics.spacing.md,
    },
    avatarPlaceholder: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: Colors.border,
    },
    userName: {
        ...Typography.body,
        fontWeight: '600',
    },
    logoutButton: {
        padding: Metrics.spacing.sm,
    },
    // Quick Actions Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    quickActionsSheet: {
        backgroundColor: Colors.white,
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
        padding: Metrics.spacing.xl,
        paddingBottom: 50,
    },
    sheetHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Metrics.spacing.xl,
    },
    sheetTitle: {
        ...Typography.title,
        fontSize: 20,
    },
    closeButton: {
        padding: 4,
        backgroundColor: Colors.surface,
        borderRadius: 12,
    },
    actionItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Metrics.spacing.md,
        paddingVertical: Metrics.spacing.md,
    },
    actionText: {
        ...Typography.body,
        fontSize: 16,
        fontWeight: '500',
    },
});
