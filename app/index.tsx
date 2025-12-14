import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, FlatList, KeyboardAvoidingView, Platform, Modal, Animated, Dimensions, ActivityIndicator, Alert, SafeAreaView, Keyboard, TouchableWithoutFeedback, LayoutAnimation, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';

import { useAuth } from '../hooks/useAuth';
import { useWallet } from '../hooks/useWallet';
import { usePrivy } from '@privy-io/expo';
import { List, UserCircle, SquaresFour, ArrowUp, Link, Receipt, Pen, Scroll, X, Copy, ThumbsUp, ThumbsDown, ArrowsClockwise, Gear, Swap, ClockCounterClockwise, House, SignOut, Chat, Wallet, CaretRight, CaretLeft, CreditCard, CurrencyNgn, ShareNetwork, Square, Paperclip, Image as ImageIcon, File } from 'phosphor-react-native';
import {
    NetworkBase, NetworkSolana, NetworkCelo, NetworkLisk, NetworkOptimism, NetworkPolygon, NetworkArbitrumOne,
    TokenETH, TokenUSDC, TokenUSDT, TokenMATIC, TokenSOL, TokenCELO, TokenCUSD, TokenCNGN
} from '../components/CryptoIcons';
import { Colors } from '../theme/colors';
import { Metrics } from '../theme/metrics';
import { Typography } from '../styles/typography';
import { Sidebar } from '../components/Sidebar';
import { ProfileModal } from '../components/ProfileModal';
import { TransactionConfirmationModal } from '../components/TransactionConfirmationModal';
import { LinkPreviewCard } from '../components/LinkPreviewCard';
import { getUserGradient } from '../utils/gradientUtils';

const { width, height } = Dimensions.get('window');

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    createdAt: string;
}

interface ChainInfo {
    name: string;
    icon: React.FC<any>;
    color: string;
    addressType: 'evm' | 'solana';
    tokens: { symbol: string; icon: React.FC<any> }[];
}

const SUPPORTED_CHAINS: ChainInfo[] = [
    {
        name: 'Base', // Base Sepolia
        icon: NetworkBase,
        color: '#0052FF',
        addressType: 'evm',
        tokens: [
            { symbol: 'ETH', icon: TokenETH },
            { symbol: 'USDC', icon: TokenUSDC }
        ]
    },
    {
        name: 'Solana',
        icon: NetworkSolana,
        color: '#9945FF',
        addressType: 'solana',
        tokens: [
            { symbol: 'SOL', icon: TokenSOL },
            { symbol: 'USDC', icon: TokenUSDC },
            { symbol: 'USDT', icon: TokenUSDT }
        ]
    },
    {
        name: 'Celo', // Celo Alfajores
        icon: NetworkCelo,
        color: '#35D07F',
        addressType: 'evm',
        tokens: [
            { symbol: 'CELO', icon: TokenCELO },
            { symbol: 'cUSD', icon: TokenCUSD }
        ]
    },
    {
        name: 'Lisk',
        icon: NetworkLisk,
        color: '#0D1D2D',
        addressType: 'evm',
        tokens: [
            { symbol: 'ETH', icon: TokenETH },
            { symbol: 'USDT', icon: TokenUSDT }
        ]
    },
    {
        name: 'Optimism',
        icon: NetworkOptimism,
        color: '#FF0420',
        addressType: 'evm',
        tokens: [
            { symbol: 'ETH', icon: TokenETH },
            { symbol: 'USDC', icon: TokenUSDC }
        ]
    },
    {
        name: 'Polygon',
        icon: NetworkPolygon,
        color: '#8247E5',
        addressType: 'evm',
        tokens: [
            { symbol: 'MATIC', icon: TokenMATIC },
            { symbol: 'USDC', icon: TokenUSDC }
        ]
    },
    {
        name: 'Arbitrum One', // Arbitrum One
        icon: NetworkArbitrumOne,
        color: '#2D374B',
        addressType: 'evm',
        tokens: [
            { symbol: 'ETH', icon: TokenETH },
            { symbol: 'USDC', icon: TokenUSDC }
        ]
    }
];

// Profile color gradient options (same as in ProfileModal)
const PROFILE_COLOR_OPTIONS: readonly [string, string, string][] = [
    ['#60A5FA', '#3B82F6', '#2563EB'], // Blue
    ['#34D399', '#10B981', '#059669'], // Green
    ['#F472B6', '#EC4899', '#DB2777'], // Pink
    ['#FBBF24', '#F59E0B', '#D97706'], // Amber
    ['#A78BFA', '#8B5CF6', '#7C3AED'], // Purple
    ['#F87171', '#EF4444', '#DC2626'], // Red
    ['#2DD4BF', '#14B8A6', '#0D9488'], // Teal
    ['#FB923C', '#F97316', '#EA580C'], // Orange
] as const;

export default function HomeScreen() {
    const router = useRouter();
    const params = useLocalSearchParams<{ conversationId?: string }>();
    const { isReady, user, logout, getAccessToken } = useAuth();
    const { wallets: evmWallets } = useWallet();
    const ethereumWallet = evmWallets?.[0]; // Use first wallet from our hook
    const solanaWallet = null; // TODO: Add Solana support in useWallet if needed
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputText, setInputText] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const abortControllerRef = useRef<AbortController | null>(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isQuickActionsOpen, setIsQuickActionsOpen] = useState(false);
    const [isQuickActionsRendered, setIsQuickActionsRendered] = useState(false);
    const [isProfileModalVisible, setIsProfileModalVisible] = useState(false);
    const [isProfileModalRendered, setIsProfileModalRendered] = useState(false);
    const [selectedChain, setSelectedChain] = useState<ChainInfo>(SUPPORTED_CHAINS[0]);
    const [viewMode, setViewMode] = useState<'main' | 'assets' | 'chains'>('main');
    const [walletAddresses, setWalletAddresses] = useState<{ evm?: string; solana?: string }>({});
    const [isTransactionReviewVisible, setIsTransactionReviewVisible] = useState(false);
    const [transactionData, setTransactionData] = useState<any>(null);
    const [attachedFiles, setAttachedFiles] = useState<{ uri: string; name: string; mimeType: string }[]>([]);

    // Animate view mode changes
    useEffect(() => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }, [viewMode]);

    const [conversationId, setConversationId] = useState<string | null>(null);
    const [userName, setUserName] = useState({ firstName: '', lastName: '' });
    const [profileIcon, setProfileIcon] = useState<{ emoji?: string; colorIndex?: number; imageUri?: string }>({});
    const [displayedGreeting, setDisplayedGreeting] = useState('');
    const [isTypingGreeting, setIsTypingGreeting] = useState(false);
    const [conversations, setConversations] = useState<any[]>([]);
    const [keyboardHeight, setKeyboardHeight] = useState(0);
    const flatListRef = useRef<FlatList>(null);
    const sidebarAnim = useRef(new Animated.Value(-width * 0.8)).current;
    const messageAnimations = useRef<{ [key: string]: Animated.Value }>({}).current;
    const walletModalAnim = useRef(new Animated.Value(height)).current;
    const walletModalOpacity = useRef(new Animated.Value(0)).current;
    const quickActionsAnim = useRef(new Animated.Value(height)).current;
    const quickActionsOpacity = useRef(new Animated.Value(0)).current;

    // Helper to render chain icon
    const renderChainIcon = (Icon: React.FC<any>) => {
        return <Icon width={24} height={24} />;
    };

    // Helper to render token icon
    const renderTokenIcon = (Icon: React.FC<any>) => {
        return <Icon width={32} height={32} />;
    };

    // Sidebar animation
    useEffect(() => {
        Animated.timing(sidebarAnim, {
            toValue: isSidebarOpen ? 0 : -width * 0.8,
            duration: 250,
            useNativeDriver: true,
        }).start();
    }, [isSidebarOpen]);

    // Wallet modal animation
    useEffect(() => {
        if (isProfileModalVisible) {
            setIsProfileModalRendered(true);
            Animated.parallel([
                Animated.timing(walletModalOpacity, {
                    toValue: 1,
                    duration: 150,
                    useNativeDriver: true,
                }),
                Animated.spring(walletModalAnim, {
                    toValue: 0,
                    damping: 28,
                    stiffness: 280,
                    useNativeDriver: true,
                })
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(walletModalOpacity, {
                    toValue: 0,
                    duration: 100,
                    useNativeDriver: true,
                }),
                Animated.spring(walletModalAnim, {
                    toValue: height,
                    damping: 28,
                    stiffness: 280,
                    useNativeDriver: true,
                })
            ]).start(() => {
                setIsProfileModalRendered(false);
            });
        }
    }, [isProfileModalVisible]);

    // Quick actions modal animation
    useEffect(() => {
        if (isQuickActionsOpen) {
            setIsQuickActionsRendered(true);
            quickActionsOpacity.setValue(1); // Overlay appears instantly
            Animated.spring(quickActionsAnim, {
                toValue: 0,
                damping: 28,
                stiffness: 280,
                useNativeDriver: true,
            }).start();
        } else {
            Animated.parallel([
                Animated.timing(quickActionsOpacity, {
                    toValue: 0,
                    duration: 100,
                    useNativeDriver: true,
                }),
                Animated.spring(quickActionsAnim, {
                    toValue: height,
                    damping: 28,
                    stiffness: 280,
                    useNativeDriver: true,
                })
            ]).start(() => {
                setIsQuickActionsRendered(false);
            });
        }
    }, [isQuickActionsOpen]);

    // Fetch conversations on mount and when sidebar opens
    const fetchConversations = async () => {
        try {
            const token = await getAccessToken();
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

            const response = await fetch(`${apiUrl}/api/chat/conversations`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const data = await response.json();
            if (data.success) {
                // Handle both { data: [...] } and { data: { conversations: [...] } }
                const conversationsList = data.data.conversations || data.data;
                setConversations(Array.isArray(conversationsList) ? conversationsList : []);
            }
        } catch (error) {
            console.error('Failed to fetch conversations:', error);
        }
    };

    useEffect(() => {
        if (isSidebarOpen) {
            fetchConversations();
        }
    }, [isSidebarOpen]);

    const loadConversation = async (id: string) => {
        try {
            const token = await getAccessToken();
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

            const response = await fetch(`${apiUrl}/api/chat/conversations/${id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const data = await response.json();
            if (data.success) {
                const loadedMessages = data.data.conversation.messages.map((msg: any) => ({
                    id: msg.id,
                    role: msg.role.toLowerCase(),
                    content: msg.content,
                    createdAt: msg.createdAt
                }));
                setMessages(loadedMessages);
                setConversationId(id);
                setIsSidebarOpen(false);
            }
        } catch (error) {
            console.error('Failed to load conversation:', error);
            Alert.alert('Error', 'Failed to load conversation history');
        }
    };

    // Initial fetch of conversations
    useEffect(() => {
        if (isReady && user) {
            fetchConversations();
        }
    }, [isReady, user]);

    // Load conversation from URL params (when navigating from Chats screen)
    useEffect(() => {
        if (params.conversationId && isReady && user) {
            console.log('[Home] Loading conversation from params:', params.conversationId);
            loadConversation(params.conversationId);
        }
    }, [params.conversationId, isReady, user]);

    // Fetch user profile data
    const fetchUserProfile = async () => {
        if (!user) {
            console.log('User object is null, skipping fetch');
            return;
        }

        // Check if user is authenticated
        if (!user.id) {
            console.log('User not authenticated yet, skipping fetch');
            return;
        }

        console.log('Fetching user data for user:', user.id);
        try {
            const token = await getAccessToken();
            // console.log('Got access token:', token ? 'Yes' : 'No');

            if (!token) {
                console.log('No access token available, skipping fetch');
                return;
            }

            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
            console.log('🔗 API URL being used:', apiUrl);

            // Fetch user profile
            // console.log('Fetching profile from:', `${apiUrl}/api/users/profile`);
            const profileResponse = await fetch(`${apiUrl}/api/users/profile`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            // console.log('Profile response status:', profileResponse.status);

            const profileData = await profileResponse.json();
            // console.log('Profile data:', JSON.stringify(profileData, null, 2));

            if (profileData.success && profileData.data) {
                // Check if user data is nested in 'user' property or directly in data
                const userData = profileData.data.user || profileData.data;
                // console.log('[HomeScreen] Full userData:', userData);

                setUserName({
                    firstName: userData.firstName || '',
                    lastName: userData.lastName || ''
                });
                // Set profile icon if available from avatar field
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
                    // Legacy support?
                    setProfileIcon({ emoji: userData.profileEmoji });
                } else if (userData.profileColorIndex !== undefined) {
                    setProfileIcon({ colorIndex: userData.profileColorIndex });
                }
                setWalletAddresses({
                    evm: userData.ethereumWalletAddress || userData.baseWalletAddress || userData.celoWalletAddress,
                    solana: userData.solanaWalletAddress
                });
            } else {
                console.log('Profile fetch failed or no data:', profileData);
            }
        } catch (error) {
            console.error('Failed to fetch user data:', error);
        }
    };

    useEffect(() => {
        fetchUserProfile();
    }, [user, isReady]);

    // Keyboard listeners for instant adjustment
    useEffect(() => {
        const showSubscription = Keyboard.addListener(
            Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
            (e) => {
                LayoutAnimation.configureNext(LayoutAnimation.create(
                    e.duration || 250,
                    LayoutAnimation.Types.keyboard,
                    LayoutAnimation.Properties.opacity
                ));
                setKeyboardHeight(e.endCoordinates.height);
            }
        );

        const hideSubscription = Keyboard.addListener(
            Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
            (e) => {
                LayoutAnimation.configureNext(LayoutAnimation.create(
                    e.duration || 250,
                    LayoutAnimation.Types.keyboard,
                    LayoutAnimation.Properties.opacity
                ));
                setKeyboardHeight(0);
            }
        );

        return () => {
            showSubscription.remove();
            hideSubscription.remove();
        };
    }, []);

    const getGreeting = () => {
        const hour = new Date().getHours();
        let timeGreeting = '';
        if (hour < 12) timeGreeting = 'Good morning';
        else if (hour < 18) timeGreeting = 'Good afternoon';
        else timeGreeting = 'Good evening';

        const firstName = userName.firstName || (user as any)?.email?.address?.split('@')[0] || 'there';
        return `${timeGreeting}, ${firstName} !`;
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

    const handleDeleteConversation = async (id: string) => {
        try {
            const token = await getAccessToken();
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

            const response = await fetch(`${apiUrl}/api/chat/conversations/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const data = await response.json();

            if (data.success) {
                setConversations(prev => prev.filter(c => c.id !== id));
                // If deleting current conversation, go home
                if (conversationId === id) {
                    handleHomeClick();
                }
            } else {
                Alert.alert('Error', data.error?.message || 'Failed to delete conversation');
            }
        } catch (error) {
            console.error('Failed to delete conversation:', error);
            Alert.alert('Error', 'Failed to delete conversation');
        }
    };
    // File picker functions
    const pickDocument = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: ['application/pdf', 'image/*'],
                multiple: true,
            });

            if (!result.canceled && result.assets) {
                const newFiles = result.assets.map(asset => ({
                    uri: asset.uri,
                    name: asset.name,
                    mimeType: asset.mimeType || 'application/octet-stream',
                }));
                setAttachedFiles(prev => [...prev, ...newFiles].slice(0, 5)); // Max 5 files
            }
        } catch (error) {
            console.error('Error picking document:', error);
            Alert.alert('Error', 'Failed to pick document');
        }
    };

    const removeAttachment = (index: number) => {
        setAttachedFiles(prev => prev.filter((_, i) => i !== index));
    };

    const sendMessage = async () => {
        if ((!inputText.trim() && attachedFiles.length === 0) || isGenerating) return;

        const userMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: inputText.trim() || (attachedFiles.length > 0 ? `[Uploaded ${attachedFiles.length} file(s)]` : ''),
            createdAt: new Date().toISOString(),
        };

        setMessages(prev => [...prev, userMessage]);
        const currentFiles = [...attachedFiles]; // Save files before clearing
        setInputText('');
        setAttachedFiles([]);
        setIsGenerating(true);

        // Create new abort controller for this request
        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        try {
            const token = await getAccessToken();
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

            let response;

            if (currentFiles.length > 0) {
                // Use FormData for file uploads
                const formData = new FormData();
                formData.append('message', userMessage.content);
                if (conversationId) {
                    formData.append('conversationId', conversationId);
                }

                // Add files to FormData
                for (const file of currentFiles) {
                    const fileInfo = await FileSystem.getInfoAsync(file.uri);
                    if (fileInfo.exists) {
                        formData.append('files', {
                            uri: file.uri,
                            name: file.name,
                            type: file.mimeType,
                        } as any);
                    }
                }

                response = await fetch(`${apiUrl}/api/chat/message`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        // Don't set Content-Type for FormData - browser/fetch will set it with boundary
                    },
                    body: formData,
                    signal: abortController.signal,
                });
            } else {
                // Regular JSON request without files
                response = await fetch(`${apiUrl}/api/chat/message`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        message: userMessage.content,
                        conversationId: conversationId,
                    }),
                    signal: abortController.signal,
                });
            }

            // Check if request was aborted
            if (abortController.signal.aborted) {
                return;
            }

            const data = await response.json();

            if (data.success) {
                let aiContent = data.data.message;

                // Try to parse JSON response if it looks like JSON
                try {
                    if (typeof aiContent === 'string' && (aiContent.trim().startsWith('{') || aiContent.trim().startsWith('['))) {
                        const parsed = JSON.parse(aiContent);
                        if (parsed.naturalResponse) {
                            aiContent = parsed.naturalResponse;
                        }
                    } else if (typeof aiContent === 'object' && aiContent.naturalResponse) {
                        aiContent = aiContent.naturalResponse;
                    }
                } catch (e) {
                    console.log('Failed to parse AI response as JSON, using raw text');
                }

                const aiMessage: Message = {
                    id: Date.now().toString() + '_ai',
                    role: 'assistant',
                    content: aiContent,
                    createdAt: new Date().toISOString(),
                };
                setMessages(prev => [...prev, aiMessage]);
                setConversationId(data.data.conversationId);

                // Handle Agentic Action Intents
                if (data.data.intent === 'CONFIRM_TRANSACTION' && data.data.parameters) {
                    setTransactionData(data.data.parameters);
                    setIsTransactionReviewVisible(true);
                }
            } else {
                Alert.alert('Error', data.error?.message || 'Failed to get response');
            }
        } catch (error: any) {
            if (error.name === 'AbortError') {
                console.log('Request was cancelled');
                // Add a cancelled message
                const cancelMessage: Message = {
                    id: Date.now().toString() + '_cancelled',
                    role: 'assistant',
                    content: 'Response cancelled.',
                    createdAt: new Date().toISOString(),
                };
                setMessages(prev => [...prev, cancelMessage]);
            } else {
                console.error('Chat error:', error);
                Alert.alert('Error', 'Failed to connect to server');
            }
        } finally {
            setIsGenerating(false);
            abortControllerRef.current = null;
        }
    };

    const stopGeneration = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
    };

    // Function to render message content with preview cards for links
    const renderMessageContent = (content: string) => {
        const linkRegex = /\/(invoice|payment-link|contract|proposal)\/([a-zA-Z0-9_-]+)/g;
        const parts: Array<{ type: 'text' | 'link'; value: string; path?: string; docType?: string; docId?: string }> = [];
        let lastIndex = 0;
        let match;

        while ((match = linkRegex.exec(content)) !== null) {
            // Add text before the link
            if (match.index > lastIndex) {
                parts.push({
                    type: 'text',
                    value: content.substring(lastIndex, match.index),
                });
            }

            // Add the link as a special part
            parts.push({
                type: 'link',
                value: match[0],
                path: match[0],
                docType: match[1],
                docId: match[2],
            });

            lastIndex = match.index + match[0].length;
        }

        // Add any remaining text
        if (lastIndex < content.length) {
            parts.push({
                type: 'text',
                value: content.substring(lastIndex),
            });
        }

        // If no links found, just return plain text
        if (parts.length === 0) {
            return (
                <View style={styles.aiBubble}>
                    <Text style={styles.aiMessageText}>{content}</Text>
                </View>
            );
        }

        return (
            <>
                {parts.map((part, index) => part.type === 'text' ? (
                    <View key={index} style={styles.aiBubble}>
                        <Text style={styles.aiMessageText}>{part.value}</Text>
                    </View>
                ) : (
                    <LinkPreviewCard
                        key={index}
                        docType={part.docType as 'invoice' | 'payment-link' | 'contract' | 'proposal'}
                        docId={part.docId!}
                        path={part.path!}
                    />
                ))}
            </>
        );
    };

    const renderMessage = ({ item, index }: { item: Message; index: number }) => {
        const isUser = item.role === 'user';

        // Initialize animation if not exists
        if (!messageAnimations[item.id]) {
            messageAnimations[item.id] = new Animated.Value(0);

            // Start animation
            Animated.timing(messageAnimations[item.id], {
                toValue: 1,
                duration: 200,
                delay: index * 30, // Stagger animation
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
            <Animated.View style={[isUser ? styles.userMessageContainer : styles.aiMessageContainer, animatedStyle]}>
                {isUser ? (
                    <View style={styles.userBubble}>
                        <Text style={styles.userMessageText}>{item.content}</Text>
                    </View>
                ) : (
                    <View style={styles.aiContainer}>
                        {renderMessageContent(item.content)}
                        <View style={styles.aiActions}>
                            <TouchableOpacity
                                style={styles.actionIcon}
                                onPress={async () => {
                                    // Copy to clipboard
                                    await Clipboard.setStringAsync(item.content);
                                    Alert.alert('Copied', 'Message copied to clipboard');
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
                                            setIsGenerating(true);
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
                                                setIsGenerating(false);
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
        <View style={{ flex: 1 }}>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
                <SafeAreaView style={styles.container}>
                    {/* Header */}
                    <View style={styles.header}>
                        <TouchableOpacity onPress={() => setIsSidebarOpen(true)}>
                            <List size={24} color={Colors.textPrimary} weight="bold" />
                        </TouchableOpacity>
                        <View style={styles.headerRight}>

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
                    </View>

                    {/* Chat Area */}
                    < View style={styles.chatArea} >
                        {
                            messages.length === 0 ? (
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
                                    style={styles.messageListContainer}
                                    data={messages}
                                    renderItem={({ item, index }) => renderMessage({ item, index })}
                                    keyExtractor={item => item.id}
                                    contentContainerStyle={styles.messageList}
                                    showsVerticalScrollIndicator={false}
                                    scrollEnabled={true}
                                    keyboardShouldPersistTaps="handled"
                                    keyboardDismissMode="on-drag"
                                    onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
                                    removeClippedSubviews={false}
                                />
                            )
                        }
                        {
                            isGenerating && (
                                <View style={styles.thinkingContainer}>
                                    <Text style={styles.thinkingText}>Thinking...</Text>
                                </View>
                            )
                        }
                    </View >

                    {/* Input Area */}
                    < View style={[styles.inputContainer, { marginBottom: keyboardHeight > 0 ? keyboardHeight : 16 }]} >
                        {/* Attached Files Preview */}
                        {attachedFiles.length > 0 && (
                            <View style={styles.attachmentsPreview}>
                                {attachedFiles.map((file, index) => (
                                    <View key={index} style={styles.attachmentChip}>
                                        <File size={14} color={Colors.primary} />
                                        <Text style={styles.attachmentName} numberOfLines={1}>{file.name}</Text>
                                        <TouchableOpacity onPress={() => removeAttachment(index)}>
                                            <X size={14} color={Colors.textSecondary} />
                                        </TouchableOpacity>
                                    </View>
                                ))}
                            </View>
                        )}
                        <View style={styles.inputWrapper}>
                            <TouchableOpacity style={styles.attachButton} onPress={pickDocument}>
                                <Paperclip size={20} color={Colors.textSecondary} />
                            </TouchableOpacity>
                            <TextInput
                                style={styles.input}
                                value={inputText}
                                onChangeText={setInputText}
                                placeholder="Ask Hedwig to create an invoice..."
                                placeholderTextColor={Colors.textPlaceholder}
                                multiline
                                maxLength={1000}
                            />
                            <TouchableOpacity
                                style={[styles.sendButton, (!inputText.trim() && attachedFiles.length === 0) && styles.sendButtonDisabled]}
                                onPress={sendMessage}
                                disabled={(!inputText.trim() && attachedFiles.length === 0) || isGenerating}
                            >
                                {isGenerating ? (
                                    <ActivityIndicator color="#FFFFFF" size="small" />
                                ) : (
                                    <ArrowUp size={20} color="#FFFFFF" weight="bold" />
                                )}
                            </TouchableOpacity>
                        </View>
                    </View >

                    <ProfileModal
                        visible={isProfileModalVisible}
                        onClose={() => setIsProfileModalVisible(false)}
                        userName={userName}
                        walletAddresses={walletAddresses}
                        profileIcon={profileIcon}
                        onProfileUpdate={() => {
                            fetchUserProfile();
                        }}
                    />
                </SafeAreaView >
            </TouchableWithoutFeedback>

            <Sidebar
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
                userName={userName}
                conversations={conversations}
                currentConversationId={conversationId}
                onLoadConversation={loadConversation}
                onHomeClick={() => {
                    setConversationId(null);
                    setMessages([]);
                    setIsSidebarOpen(false);
                }}
                onDeleteConversation={handleDeleteConversation}
            />
            {/* Transaction Confirmation Modal */}
            <TransactionConfirmationModal
                visible={isTransactionReviewVisible}
                onClose={() => setIsTransactionReviewVisible(false)}
                data={transactionData}
                onSuccess={(hash) => {
                    // Add success message to chat
                    const successMsg: Message = {
                        id: Date.now().toString() + '_tx_success',
                        role: 'assistant',
                        content: `Transaction sent successfully! Hash: ${hash}`,
                        createdAt: new Date().toISOString()
                    };
                    setMessages(prev => [...prev, successMsg]);
                }}
            />
        </View >
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FFFFFF',
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
        paddingHorizontal: 20,
        paddingVertical: 12,
        backgroundColor: '#FFFFFF',
    },
    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
    },
    keyboardAvoidingView: {
        flex: 1,
    },
    content: {
        flex: 1,
    },
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20,
        marginTop: -60, // Visual balance
    },
    logoText: {
        fontFamily: 'Merriweather_700Bold',
        fontSize: 42,
        color: Colors.textPrimary,
        marginBottom: 12,
    },
    subtitle: {
        ...Typography.body,
        color: Colors.textSecondary,
        textAlign: 'center',
        marginBottom: 48,
    },
    suggestionsContainer: {
        width: '100%',
        gap: 12,
    },
    suggestionCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.background,
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    suggestionText: {
        ...Typography.body,
        marginLeft: 12,
        fontWeight: '500',
    },
    messagesList: {
        padding: 20,
        paddingBottom: 20,
    },
    messageContainer: {
        maxWidth: '85%',
        padding: 16,
        borderRadius: 20,
        marginBottom: 16,
    },
    userMessage: {
        alignSelf: 'flex-end',
        backgroundColor: Colors.background,
        borderBottomRightRadius: 4,
    },
    assistantMessage: {
        alignSelf: 'flex-start',
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: Colors.border,
        borderBottomLeftRadius: 4,
    },
    messageText: {
        ...Typography.body,
        lineHeight: 24,
    },
    inputContainer: {
        padding: 16,
        backgroundColor: '#FFFFFF',
    },
    quickActionsBar: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 12,
    },
    quickActionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.background,
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 100,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    quickActionText: {
        ...Typography.caption,
        marginLeft: 6,
        fontWeight: '600',
        color: Colors.textSecondary,
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        backgroundColor: Colors.background,
        borderRadius: 24,
        padding: 8,
        // borderWidth: 1,
        // borderColor: Colors.border,
    },
    attachButton: {
        padding: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    attachmentsPreview: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 8,
    },
    attachmentChip: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#E8F4FD',
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 16,
        gap: 6,
        maxWidth: 150,
    },
    attachmentName: {
        ...Typography.caption,
        color: Colors.primary,
        flex: 1,
    },
    input: {
        flex: 1,
        ...Typography.body,
        maxHeight: 100,
        paddingHorizontal: 12,
        paddingVertical: 8,
        paddingTop: 12, // Align with button
    },
    // Tool UI Styles
    toolContainer: {
        marginTop: 12,
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: '#FAFAFA',
    },
    toolHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 12,
        backgroundColor: '#F3F4F6',
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    toolTitle: {
        ...Typography.caption,
        fontWeight: '600',
        color: Colors.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    toolContent: {
        padding: 12,
    },
    toolField: {
        marginBottom: 8,
    },
    toolLabel: {
        ...Typography.caption,
        color: Colors.textSecondary,
        marginBottom: 4,
    },
    toolValue: {
        ...Typography.body,
        fontWeight: '500',
    },
    actionButton: {
        backgroundColor: Colors.primary,
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center',
        marginTop: 8,
    },
    actionButtonText: {
        ...Typography.button,
        color: '#FFFFFF',
    },
    // Old styles that might still be referenced or need cleanup
    profileIcon: {
        width: 32,
        height: 32,
        borderRadius: 16,
    },
    chatArea: {
        flex: 1,
        minHeight: 100,
    },
    contentWrapper: {
        flex: 1,
        paddingHorizontal: 0, // Will be handled by individual components
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
        fontSize: 16,
        color: Colors.textSecondary,
        textAlign: 'center',
    },
    modalTitle: {
        ...Typography.title,
        fontSize: 24,
        color: Colors.textPrimary,
    },
    profileModalContent: {
        backgroundColor: Colors.surface,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: Metrics.spacing.lg,
        height: 'auto',
        maxHeight: '90%',
        width: '100%',
        marginTop: 'auto',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 8,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: Metrics.spacing.xl,
    },
    userInfo: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    avatarContainer: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: Colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: Metrics.spacing.md,
    },
    avatarText: {
        ...Typography.h4,
        color: '#FFFFFF',
    },
    profileName: {
        ...Typography.h4,
        color: Colors.textPrimary,
        marginBottom: 4,
    },
    profileEmail: {
        ...Typography.caption,
        color: Colors.textSecondary,
        marginRight: 6,
    },
    addressCopy: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.background,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
    },
    menuList: {
        gap: Metrics.spacing.sm,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: Metrics.spacing.md,
        backgroundColor: Colors.background,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    menuItemLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Metrics.spacing.md,
    },
    menuItemTitle: {
        ...Typography.body,
        color: Colors.textPrimary,
        fontWeight: '600',
    },
    menuItemSubtitle: {
        ...Typography.caption,
        color: '#35D07F', // Green for balance
    },
    disconnectButton: {
        marginTop: Metrics.spacing.lg,
        backgroundColor: Colors.background,
        borderColor: Colors.border,
    },
    disconnectText: {
        ...Typography.body,
        color: '#FF6B6B',
        fontWeight: '600',
    },
    assetsView: {
        gap: Metrics.spacing.md,
    },
    chainsView: {
        gap: Metrics.spacing.md,
        height: 400,
    },
    backButton: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: Metrics.spacing.sm,
    },
    backButtonText: {
        ...Typography.body,
        color: Colors.textSecondary,
        marginLeft: 4,
    },
    viewTitle: {
        ...Typography.h4,
        color: Colors.textPrimary,
        marginBottom: Metrics.spacing.sm,
    },
    assetList: {
        gap: Metrics.spacing.sm,
    },
    assetItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: Metrics.spacing.md,
        backgroundColor: Colors.background,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    assetIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: Colors.surface,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: Metrics.spacing.md,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    assetInfo: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    assetName: {
        ...Typography.body,
        color: Colors.textPrimary,
        fontWeight: '600',
    },
    assetBalance: {
        ...Typography.body,
        color: Colors.textSecondary,
    },
    chainOption: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: Metrics.spacing.md,
        backgroundColor: Colors.background,
        borderRadius: 12,
        marginBottom: Metrics.spacing.sm,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    selectedChainOption: {
        borderColor: Colors.primary,
        backgroundColor: Colors.surface,
    },
    chainOptionLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Metrics.spacing.md,
    },
    chainOptionName: {
        ...Typography.body,
        color: Colors.textPrimary,
        fontWeight: '500',
    },
    selectedDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: Colors.primary,
    },
    cursor: {
        opacity: 0.8,
        fontWeight: '300',
    },
    messageListContainer: {
        flex: 1,
    },
    messageList: {
        paddingHorizontal: 0, // Remove padding here - let individual message containers handle it
        paddingVertical: Metrics.spacing.md,
        flexGrow: 1,
    },
    thinkingText: {
        ...Typography.body,
        color: Colors.textSecondary,
        fontStyle: 'italic',
    },
    // Restored Chat Styles
    userMessageContainer: {
        alignItems: 'flex-end',
        marginBottom: 16,
        paddingRight: 20,
        paddingLeft: 20,
        width: '100%', // Ensure full width container
    },
    aiMessageContainer: {
        alignItems: 'flex-start',
        marginBottom: 16,
        paddingLeft: 20,
        paddingRight: 20,
        width: '100%', // Ensure full width container
    },
    userBubble: {
        backgroundColor: '#f5f5f5',
        padding: Metrics.spacing.md,
        borderRadius: 30,
        // borderWidth: 1,
        // borderColor: '#fafafa',
        maxWidth: '85%', // Increased width for better right alignment
        alignSelf: 'flex-end', // Ensure bubble aligns to right edge
        marginRight: 0, // Remove any right margin to hug the edge
    },
    userMessageText: {
        ...Typography.body,
        fontSize: 16,
        color: Colors.textPrimary,
    },
    aiContainer: {
        maxWidth: '100%',
    },
    aiBubble: {
        // Removed bubble styling - AI responses are now plain text
        padding: 0,
        backgroundColor: 'transparent',
        borderWidth: 0,
        alignSelf: 'flex-start', // Still align to left
        maxWidth: '100%', // Allow full width since no bubble constraint
    },
    aiMessageText: {
        ...Typography.body,
        fontSize: 16,
        lineHeight: 24,
    },
    messageLink: {
        color: Colors.primary,
        textDecorationLine: 'underline',
    },
    linkPreviewCard: {
        marginTop: 12,
        backgroundColor: Colors.surface,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: Colors.border,
        overflow: 'hidden',
        alignSelf: 'flex-start', // Still align to left with AI responses
    },
    linkPreviewContent: {
        flexDirection: 'row',
        padding: 12,
        alignItems: 'center',
    },
    linkPreviewIconContainer: {
        width: 48,
        height: 48,
        borderRadius: 8,
        backgroundColor: `${Colors.primary}15`,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    linkPreviewIcon: {
        fontSize: 24,
    },
    linkPreviewInfo: {
        flex: 1,
    },
    linkPreviewTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: Colors.textPrimary,
        marginBottom: 2,
    },
    linkPreviewSubtitle: {
        fontSize: 12,
        color: Colors.textSecondary,
    },
    linkPreviewActions: {
        flexDirection: 'row',
        borderTopWidth: 1,
        borderTopColor: Colors.border,
    },
    linkActionButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        gap: 6,
    },
    linkActionText: {
        fontSize: 13,
        fontWeight: '500',
        color: Colors.primary,
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
        paddingHorizontal: 20,
        paddingBottom: Metrics.spacing.md,
    },
    // End Restored Chat Styles
    gridButton: {
        padding: Metrics.spacing.xs,
        marginRight: Metrics.spacing.sm,
    },
    inputBox: {
        flex: 1,
        backgroundColor: '#f5f5f5',
        borderRadius: 24,
        paddingHorizontal: 16,
        paddingVertical: 10,
        marginRight: 8,
        minHeight: 40,
        maxHeight: 100,
        ...Typography.input,
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
        paddingVertical: 16,
        gap: Metrics.spacing.md,
    },
    sidebarText: {
        ...Typography.body,
        fontWeight: '500',
        color: Colors.textPrimary,
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
    menuButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#f5f5f5',
        justifyContent: 'center',
        alignItems: 'center',
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
