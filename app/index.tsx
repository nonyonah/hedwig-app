import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, FlatList, KeyboardAvoidingView, Platform, Modal, Animated, Dimensions, ActivityIndicator, Alert, SafeAreaView, Keyboard, TouchableWithoutFeedback, LayoutAnimation, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';


import { useAuth } from '../hooks/useAuth';
import { useWallet } from '../hooks/useWallet';
import { usePrivy } from '@privy-io/expo';
import { useOnboarding } from '../hooks/useOnboarding';
import { useUserActions, Suggestion } from '../hooks/useUserActions';
import { List, UserCircle, SquaresFour, ArrowUp, Link, Receipt, Pen, Scroll, X, Copy, ThumbsUp, ThumbsDown, ArrowsClockwise, Gear, Swap, ClockCounterClockwise, House, SignOut, Chat, Wallet, CaretRight, CaretLeft, CreditCard, CurrencyNgn, ShareNetwork, Square, Paperclip, Image as ImageIcon, File, Bell, Plus, Microphone, Stop } from 'phosphor-react-native';
import {
    NetworkBase, NetworkSolana, NetworkCelo, NetworkLisk, NetworkOptimism, NetworkPolygon, NetworkArbitrumOne,
    TokenETH, TokenUSDC, TokenUSDT, TokenMATIC, TokenSOL, TokenCELO, TokenCUSD, TokenCNGN
} from '../components/CryptoIcons';
import { Colors, useThemeColors, useKeyboardAppearance } from '../theme/colors';
import { Metrics } from '../theme/metrics';
import { Typography } from '../styles/typography';
import { Sidebar } from '../components/Sidebar';
import { ProfileModal } from '../components/ProfileModal';
import { TransactionConfirmationModal } from '../components/TransactionConfirmationModal';
import { OfframpConfirmationModal } from '../components/OfframpConfirmationModal';
import { SolanaBridgeModal } from '../components/SolanaBridgeModal';
import { LinkPreviewCard } from '../components/LinkPreviewCard';
import { OnboardingTooltip } from '../components/OnboardingTooltip';
import { SuggestionChips } from '../components/SuggestionChips';
import { getUserGradient } from '../utils/gradientUtils';
import { usePushNotifications } from '../hooks/usePushNotifications';
import Analytics, { initializeAnalytics, trackScreen } from '../services/analytics';
import { useAnalyticsScreen } from '../hooks/useAnalyticsScreen';

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
    // Track screen view
    useAnalyticsScreen('Home');

    const router = useRouter();
    const params = useLocalSearchParams<{ conversationId?: string }>();
    const { isReady, user, logout, getAccessToken } = useAuth();
    const { wallets: evmWallets } = useWallet();
    const themeColors = useThemeColors();
    const keyboardAppearance = useKeyboardAppearance();
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
    const [isOfframpReviewVisible, setIsOfframpReviewVisible] = useState(false);
    const [offrampData, setOfframpData] = useState<any>(null);
    const [isSolanaBridgeVisible, setIsSolanaBridgeVisible] = useState(false);
    const [solanaBridgeData, setSolanaBridgeData] = useState<{
        token: 'SOL' | 'USDC';
        amount: number;
        fiatCurrency?: string;
        bankName?: string;
        accountNumber?: string;
        accountName?: string;
    } | null>(null);
    const [attachedFiles, setAttachedFiles] = useState<{ uri: string; name: string; mimeType: string }[]>([]);
    const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
    const shouldAutoScrollRef = useRef(true);
    const [isAttachmentExpanded, setIsAttachmentExpanded] = useState(false);
    const attachmentRotation = useRef(new Animated.Value(0)).current;
    const attachmentMenuAnim = useRef(new Animated.Value(0)).current;

    // Push notifications hook
    const { registerForPushNotifications, registerWithBackend, isRegistered } = usePushNotifications();

    // Onboarding and user actions hooks
    const { shouldShowTip, markTipAsSeen } = useOnboarding();
    const { getTopSuggestions, recordAction } = useUserActions();
    const [showChatTip, setShowChatTip] = useState(false);
    const suggestions = getTopSuggestions(4);

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
    const [isLoadingConversation, setIsLoadingConversation] = useState(!!params.conversationId);
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

    // Fetch unread notification count
    useEffect(() => {
        const fetchUnreadCount = async () => {
            try {
                const token = await getAccessToken();
                if (!token) return;

                const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
                const response = await fetch(`${apiUrl}/api/notifications/unread-count`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                // Check response before parsing to avoid JSON parse errors
                if (!response.ok) return;

                const data = await response.json();
                if (data.success) {
                    setUnreadNotificationCount(data.data.unreadCount || 0);
                }
            } catch (error) {
                // Silently fail - notifications are non-critical
            }
        };

        fetchUnreadCount();
        // Refresh every 30 seconds
        const interval = setInterval(fetchUnreadCount, 30000);
        return () => clearInterval(interval);
    }, [getAccessToken]);

    const loadConversation = async (id: string) => {
        setIsLoadingConversation(true);
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
        } finally {
            setIsLoadingConversation(false);
        }
    };

    // Initial fetch of conversations and analytics init
    useEffect(() => {
        if (isReady && user) {
            fetchConversations();

            // Initialize analytics with user ID (not email)
            initializeAnalytics(user.id).then(() => {
                // Track app opened
                Analytics.appOpened();
            });
        }
    }, [isReady, user]);

    // Load conversation from URL params (when navigating from Chats screen)
    useEffect(() => {
        if (params.conversationId && isReady && user) {
            console.log('[Home] Loading conversation from params:', params.conversationId);
            loadConversation(params.conversationId);
        }
    }, [params.conversationId, isReady, user]);

    // Fetch user profile data with retry logic for wallet addresses
    const fetchUserProfile = async (retryCount = 0) => {
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

            if (!token) {
                console.log('No access token available, skipping fetch');
                return;
            }

            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
            console.log('🔗 API URL being used:', apiUrl);

            // Fetch user profile
            const profileResponse = await fetch(`${apiUrl}/api/users/profile`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });

            // Check response before parsing to avoid JSON parse errors
            if (!profileResponse.ok) {
                console.log('Profile fetch failed with status:', profileResponse.status);
                if (retryCount < 3) {
                    setTimeout(() => fetchUserProfile(retryCount + 1), 1000);
                }
                return;
            }

            const profileData = await profileResponse.json();

            if (profileData.success && profileData.data) {
                // Check if user data is nested in 'user' property or directly in data
                const userData = profileData.data.user || profileData.data;

                setUserName({
                    firstName: userData.firstName || '',
                    lastName: userData.lastName || ''
                });
                // Set profile icon if available from avatar field
                if (userData.avatar) {
                    console.log('[Profile] Avatar data received:', userData.avatar.substring(0, 100) + '...');
                    try {
                        if (typeof userData.avatar === 'string' && userData.avatar.trim().startsWith('{')) {
                            const parsed = JSON.parse(userData.avatar);
                            console.log('[Profile] Parsed avatar as JSON:', parsed);
                            setProfileIcon(parsed);
                        } else if (typeof userData.avatar === 'string' && userData.avatar.startsWith('data:')) {
                            console.log('[Profile] Avatar is base64 image');
                            setProfileIcon({ imageUri: userData.avatar });
                        } else {
                            console.log('[Profile] Avatar is URL or other format');
                            setProfileIcon({ imageUri: userData.avatar });
                        }
                    } catch (e) {
                        console.log('[Profile] Avatar parse error, treating as URL:', e);
                        setProfileIcon({ imageUri: userData.avatar });
                    }
                } else if (userData.profileEmoji) {
                    setProfileIcon({ emoji: userData.profileEmoji });
                } else if (userData.profileColorIndex !== undefined) {
                    setProfileIcon({ colorIndex: userData.profileColorIndex });
                }

                const evmAddr = userData.ethereumWalletAddress || userData.baseWalletAddress || userData.celoWalletAddress;
                const solAddr = userData.solanaWalletAddress;

                setWalletAddresses({
                    evm: evmAddr,
                    solana: solAddr
                });

                // If wallet addresses are still empty and we haven't retried too many times, retry
                if (!evmAddr && !solAddr && retryCount < 3) {
                    console.log(`[Profile] Wallet addresses empty, retrying (${retryCount + 1}/3)...`);
                    setTimeout(() => fetchUserProfile(retryCount + 1), 1000);
                }
            } else {
                console.log('Profile fetch failed or no data:', profileData);
                // Retry on failure (user might not be created yet)
                if (retryCount < 3) {
                    console.log(`[Profile] Retrying profile fetch (${retryCount + 1}/3)...`);
                    setTimeout(() => fetchUserProfile(retryCount + 1), 1000);
                }
            }
        } catch (error) {
            console.error('Failed to fetch user data:', error);
            // Retry on error
            if (retryCount < 3) {
                setTimeout(() => fetchUserProfile(retryCount + 1), 1000);
            }
        }
    };

    useEffect(() => {
        fetchUserProfile();
    }, [user, isReady]);

    // Refresh profile data when screen regains focus (e.g., returning from profile edit)
    useFocusEffect(
        useCallback(() => {
            if (user && isReady) {
                fetchUserProfile();
            }
        }, [user, isReady])
    );

    // Register push notifications when user is authenticated
    useEffect(() => {
        async function setupPushNotifications() {
            if (!user || !isReady || isRegistered) return;

            try {
                // Get push notification token from Expo
                const token = await registerForPushNotifications();

                if (token) {
                    // Get auth token and register with backend
                    const authToken = await getAccessToken();
                    if (authToken) {
                        await registerWithBackend(authToken);
                        console.log('[Push] Device registered for notifications');
                    }
                }
            } catch (error) {
                console.error('[Push] Failed to setup push notifications:', error);
            }
        }

        setupPushNotifications();
    }, [user, isReady, isRegistered]);

    // Keyboard listeners - instant adjustment (no animation)
    useEffect(() => {
        const showSubscription = Keyboard.addListener(
            Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
            (e) => {
                setKeyboardHeight(e.endCoordinates.height);
            }
        );

        const hideSubscription = Keyboard.addListener(
            Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
            () => {
                setKeyboardHeight(0);
            }
        );

        return () => {
            showSubscription.remove();
            hideSubscription.remove();
        };
    }, []);

    // Scroll to bottom when new messages are added
    useEffect(() => {
        if (messages.length > 0 && shouldAutoScrollRef.current) {
            const timeoutId = setTimeout(() => {
                flatListRef.current?.scrollToEnd({ animated: false });
            }, 100);
            return () => clearTimeout(timeoutId);
        }
    }, [messages.length]);

    // Show chat onboarding tip on first visit
    // Show chat onboarding tip on first visit (Disabled to prevent overlay conflict)
    /*
    useEffect(() => {
        if (shouldShowTip('hasSeenChatTip') && messages.length === 0) {
            const timer = setTimeout(() => {
                setShowChatTip(true);
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [shouldShowTip, messages.length]);
    */

    // Toggle attachment expansion with animation
    const toggleAttachmentExpand = useCallback(() => {
        if (isAttachmentExpanded) {
            // Closing: animate out first, then hide
            Animated.parallel([
                Animated.timing(attachmentRotation, {
                    toValue: 0,
                    duration: 200,
                    useNativeDriver: true,
                }),
                Animated.timing(attachmentMenuAnim, {
                    toValue: 0,
                    duration: 200,
                    useNativeDriver: true,
                }),
            ]).start(() => {
                setIsAttachmentExpanded(false);
            });
        } else {
            // Opening: show first, then animate in
            setIsAttachmentExpanded(true);
            Animated.parallel([
                Animated.spring(attachmentRotation, {
                    toValue: 1,
                    tension: 100,
                    friction: 10,
                    useNativeDriver: true,
                }),
                Animated.spring(attachmentMenuAnim, {
                    toValue: 1,
                    tension: 100,
                    friction: 10,
                    useNativeDriver: true,
                }),
            ]).start();
        }
    }, [isAttachmentExpanded, attachmentRotation, attachmentMenuAnim]);

    // Handle suggestion chip press
    const handleSuggestionPress = useCallback((suggestion: Suggestion) => {
        setInputText(suggestion.text);
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

    // Stop AI generation
    const stopGeneration = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        setIsGenerating(false);
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
        shouldAutoScrollRef.current = true; // Scroll to bottom when sending message

        // Track AI message sent
        Analytics.aiMessageSent();

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
                    formData.append('files', {
                        uri: file.uri,
                        name: file.name,
                        type: file.mimeType || 'application/octet-stream',
                    } as any);
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

                // Track successful AI response
                Analytics.aiResponseSuccess();

                // Handle Agentic Action Intents
                if (data.data.intent === 'CONFIRM_TRANSACTION' && data.data.parameters) {
                    Analytics.aiFunctionTriggered('CONFIRM_TRANSACTION');
                    setTransactionData(data.data.parameters);
                    setIsTransactionReviewVisible(true);
                }

                // Handle Offramp Intent
                if (data.data.intent === 'CONFIRM_OFFRAMP' && data.data.parameters) {
                    Analytics.aiFunctionTriggered('CONFIRM_OFFRAMP');
                    setOfframpData(data.data.parameters);
                    setIsOfframpReviewVisible(true);
                }

                // Handle Solana Bridge + Offramp Intent
                if (data.data.intent === 'CONFIRM_SOLANA_BRIDGE' && data.data.parameters) {
                    Analytics.aiFunctionTriggered('CONFIRM_SOLANA_BRIDGE');
                    const bridgeParams = data.data.parameters;
                    setSolanaBridgeData({
                        token: bridgeParams.token || 'SOL',
                        amount: parseFloat(bridgeParams.amount || '0'),
                        // Store bank details for use after bridging
                        fiatCurrency: bridgeParams.fiatCurrency || 'NGN',
                        bankName: bridgeParams.bankName,
                        accountNumber: bridgeParams.accountNumber,
                        accountName: bridgeParams.accountName,
                    });
                    setIsSolanaBridgeVisible(true);
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

    // Function to render message content with preview cards for links
    const renderMessageContent = (content: string) => {
        // Match both Markdown links and bare paths
        // Markdown: [text](http://domain.com/invoice/doc_xxx) or [text](/invoice/doc_xxx)
        // Bare: /invoice/doc_xxx or http://domain.com/invoice/doc_xxx
        const markdownLinkRegex = /\[([^\]]*)\]\(((?:https?:\/\/[^\/]+)?\/(?:invoice|payment-link|contract|proposal)\/([a-zA-Z0-9_-]+))\)/g;
        const bareLinkRegex = /((?:https?:\/\/[^\/\s]+)?\/(?:invoice|payment-link|contract|proposal)\/([a-zA-Z0-9_-]+))/g;

        const parts: Array<{ type: 'text' | 'link'; value: string; path?: string; docType?: string; docId?: string }> = [];

        // First, find all markdown links
        const markdownMatches: Array<{ index: number; length: number; path: string; docType: string; docId: string }> = [];
        let match;

        while ((match = markdownLinkRegex.exec(content)) !== null) {
            const fullUrl = match[2];
            const docId = match[3];
            // Extract docType from path
            const docTypeMatch = fullUrl.match(/\/(invoice|payment-link|contract|proposal)\//);
            const docType = docTypeMatch ? docTypeMatch[1] : 'document';

            markdownMatches.push({
                index: match.index,
                length: match[0].length,
                path: '/' + docType + '/' + docId,
                docType,
                docId,
            });
        }

        // If we found markdown links, use those
        if (markdownMatches.length > 0) {
            let lastIndex = 0;

            for (const m of markdownMatches) {
                // Add text before the link
                if (m.index > lastIndex) {
                    const textBefore = content.substring(lastIndex, m.index).trim();
                    if (textBefore) {
                        parts.push({ type: 'text', value: textBefore });
                    }
                }

                // Add the link as a preview card
                parts.push({
                    type: 'link',
                    value: m.path,
                    path: m.path,
                    docType: m.docType,
                    docId: m.docId,
                });

                lastIndex = m.index + m.length;
            }

            // Add remaining text
            if (lastIndex < content.length) {
                const remaining = content.substring(lastIndex).trim();
                if (remaining) {
                    parts.push({ type: 'text', value: remaining });
                }
            }
        } else {
            // Fall back to bare link detection
            let lastIndex = 0;
            while ((match = bareLinkRegex.exec(content)) !== null) {
                if (match.index > lastIndex) {
                    parts.push({
                        type: 'text',
                        value: content.substring(lastIndex, match.index),
                    });
                }

                const fullUrl = match[1];
                const docId = match[2];
                const docTypeMatch = fullUrl.match(/\/(invoice|payment-link|contract|proposal)\//);
                const docType = docTypeMatch ? docTypeMatch[1] : 'document';

                parts.push({
                    type: 'link',
                    value: fullUrl,
                    path: '/' + docType + '/' + docId,
                    docType,
                    docId,
                });

                lastIndex = match.index + match[0].length;
            }

            if (lastIndex < content.length) {
                parts.push({
                    type: 'text',
                    value: content.substring(lastIndex),
                });
            }
        }

        // If no links found, just return plain text
        if (parts.length === 0) {
            return (
                <View style={styles.aiBubble}>
                    <Text style={[styles.aiMessageText, { color: themeColors.textPrimary }]} selectable>{content}</Text>
                </View>
            );
        }

        return (
            <>
                {parts.map((part, index) => part.type === 'text' ? (
                    <View key={index} style={styles.aiBubble}>
                        <Text style={[styles.aiMessageText, { color: themeColors.textPrimary }]} selectable>{part.value}</Text>
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
                    <View style={[styles.userBubble, { backgroundColor: themeColors.surface }]}>
                        <Text style={[styles.userMessageText, { color: themeColors.textPrimary }]} selectable>{item.content}</Text>
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
                                <Copy size={16} color={themeColors.textSecondary} />
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.actionIcon}
                                onPress={() => {
                                    Alert.alert('Thanks!', 'Glad you found this helpful!');
                                }}
                            >
                                <ThumbsUp size={16} color={themeColors.textSecondary} />
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.actionIcon}
                                onPress={() => {
                                    Alert.alert('Feedback', 'Thanks for your feedback. We\'ll work on improving!');
                                }}
                            >
                                <ThumbsDown size={16} color={themeColors.textSecondary} />
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
            <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
                {/* Header */}
                <View style={[styles.header, { backgroundColor: themeColors.background }]}>
                    <TouchableOpacity
                        onPress={() => { Keyboard.dismiss(); setIsSidebarOpen(true); }}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                        <List size={24} color={themeColors.textPrimary} weight="bold" />
                    </TouchableOpacity>
                    <View style={styles.headerRight}>
                        {/* Notifications Bell */}
                        <TouchableOpacity
                            onPress={() => router.push('/notifications')}
                            style={styles.notificationButton}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                            <Bell size={24} color={themeColors.textPrimary} weight="bold" />
                            {unreadNotificationCount > 0 && (
                                <View style={styles.notificationBadge}>
                                    <Text style={styles.notificationBadgeText}>
                                        {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                                    </Text>
                                </View>
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={() => setIsProfileModalVisible(true)}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
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
                <View style={styles.chatArea}>
                    {
                        isLoadingConversation ? (
                            <View style={styles.emptyState}>
                                <ActivityIndicator size="large" color={Colors.primary} />
                                <Text style={[styles.emptySubtext, { marginTop: 16, color: themeColors.textSecondary }]}>Loading conversation...</Text>
                            </View>
                        ) : messages.length === 0 ? (
                            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                                <View style={styles.emptyState}>
                                    <Text style={[styles.emptyStateText, { color: themeColors.textPrimary }]}>
                                        {displayedGreeting || getGreeting()}
                                        {isTypingGreeting && <Text style={styles.cursor}>|</Text>}
                                    </Text>
                                    <Text style={[styles.emptySubtext, { color: themeColors.textSecondary }]}>How can I help you today?</Text>
                                </View>
                            </TouchableWithoutFeedback>
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
                                removeClippedSubviews={false}
                                maxToRenderPerBatch={5}
                                initialNumToRender={10}
                                windowSize={21}
                                decelerationRate="normal"
                                bounces={true}
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
                </View>

                {/* Input Area */}
                <View style={[styles.inputContainer, { marginBottom: keyboardHeight > 0 ? keyboardHeight - 20 : 8 }, { backgroundColor: themeColors.background, borderTopColor: themeColors.border }]}>
                    {/* Dynamic Suggestion Chips - show only when no messages */}
                    {messages.length === 0 && (
                        <SuggestionChips
                            suggestions={suggestions}
                            onSuggestionPress={handleSuggestionPress}
                        />
                    )}

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

                    <View style={[styles.inputContainer, { backgroundColor: themeColors.background, borderTopColor: themeColors.border }]}>
                        <View style={styles.inputRow}>
                            {/* Plus Button - outside the input box */}
                            <TouchableOpacity
                                style={[styles.plusButton, { backgroundColor: themeColors.inputBackground }]}
                                onPress={toggleAttachmentExpand}
                            >
                                <Animated.View style={{
                                    transform: [{
                                        rotate: attachmentRotation.interpolate({
                                            inputRange: [0, 1],
                                            outputRange: ['0deg', '45deg'],
                                        }),
                                    }],
                                }}>
                                    <Plus size={24} color={themeColors.textPrimary} weight="bold" />
                                </Animated.View>
                            </TouchableOpacity>

                            {/* Expanded Attachment Buttons - slide out horizontally */}
                            {isAttachmentExpanded && (
                                <Animated.View style={[
                                    styles.inlineAttachmentButtons,
                                    {
                                        opacity: attachmentMenuAnim,
                                        transform: [
                                            {
                                                translateX: attachmentMenuAnim.interpolate({
                                                    inputRange: [0, 1],
                                                    outputRange: [-20, 0]
                                                })
                                            }
                                        ],
                                    }
                                ]}>
                                    <TouchableOpacity
                                        style={[styles.inlineAttachButton, { backgroundColor: themeColors.inputBackground }]}
                                        onPress={pickDocument}
                                    >
                                        <File size={22} color={themeColors.textPrimary} />
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        style={[styles.inlineAttachButton, { backgroundColor: themeColors.inputBackground, opacity: 0.5 }]}
                                        onPress={() => { }} // TODO: Implement camera/image picker
                                        disabled
                                    >
                                        <ImageIcon size={22} color={themeColors.textSecondary} />
                                    </TouchableOpacity>
                                </Animated.View>
                            )}

                            {/* Input Box */}
                            <View style={[styles.inputBox, { backgroundColor: themeColors.inputBackground, flex: isAttachmentExpanded ? 1 : 1 }]}>
                                <TextInput
                                    style={[styles.inputField, { color: themeColors.textPrimary }]}
                                    value={inputText}
                                    onChangeText={setInputText}
                                    placeholder="Ask anything"
                                    placeholderTextColor={Colors.textPlaceholder}
                                    multiline
                                    maxLength={1000}
                                    onFocus={() => setIsAttachmentExpanded(false)}
                                    keyboardAppearance={keyboardAppearance}
                                />
                            </View>

                            {/* Send Button - only show when there's content */}
                            {(inputText.trim() || attachedFiles.length > 0 || isGenerating) && (
                                <TouchableOpacity
                                    style={styles.sendButton}
                                    onPress={isGenerating ? stopGeneration : sendMessage}
                                >
                                    {isGenerating ? (
                                        <Stop size={22} color="#FFFFFF" weight="fill" />
                                    ) : (
                                        <ArrowUp size={22} color="#FFFFFF" weight="bold" />
                                    )}
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>

                </View>

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
            {/* Offramp Confirmation Modal */}
            <OfframpConfirmationModal
                visible={isOfframpReviewVisible}
                onClose={() => setIsOfframpReviewVisible(false)}
                data={offrampData}
                onSuccess={(orderId) => {
                    // Add success message to chat
                    const successMsg: Message = {
                        id: Date.now().toString() + '_offramp_success',
                        role: 'assistant',
                        content: `Offramp order created successfully! Order ID: ${orderId}`,
                        createdAt: new Date().toISOString()
                    };
                    setMessages(prev => [...prev, successMsg]);
                }}
            />
            {/* Solana Bridge Modal */}
            <SolanaBridgeModal
                visible={isSolanaBridgeVisible}
                onClose={() => setIsSolanaBridgeVisible(false)}
                token={solanaBridgeData?.token || 'SOL'}
                amount={solanaBridgeData?.amount || 0}
                solanaAddress={walletAddresses.solana || ''}
                baseAddress={walletAddresses.evm || ''}
                getAccessToken={getAccessToken}
                onBridgeComplete={(baseAddress, token, amount) => {
                    // After bridge completes, open offramp modal with saved bank details
                    setOfframpData({
                        amount: amount.toString(),
                        token: 'USDC',
                        network: 'base',
                        fiatCurrency: solanaBridgeData?.fiatCurrency || 'NGN',
                        bankName: solanaBridgeData?.bankName || '',
                        accountNumber: solanaBridgeData?.accountNumber || '',
                        accountName: solanaBridgeData?.accountName || '',
                    });
                    setIsOfframpReviewVisible(true);
                    // Add success message to chat
                    const successMsg: Message = {
                        id: Date.now().toString() + '_bridge_success',
                        role: 'assistant',
                        content: `Successfully bridged ${amount} ${token} to Base! You can now offramp to your bank account.`,
                        createdAt: new Date().toISOString()
                    };
                    setMessages(prev => [...prev, successMsg]);
                }}
            />
            {/* Chat Onboarding Tooltip */}
            <OnboardingTooltip
                visible={showChatTip}
                title="Welcome to Hedwig! 👋"
                description="I'm your AI assistant for freelancing. Try asking me to create an invoice, track a project, or send a payment link to a client."
                onDismiss={() => {
                    setShowChatTip(false);
                    markTipAsSeen('hasSeenChatTip');
                }}
                position="center"
            />
        </View >
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        // backgroundColor: '#FFFFFF', // Overridden
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        paddingHorizontal: 20,
        paddingVertical: 12,
        // backgroundColor: '#FFFFFF', // Overridden
        // Removed border bottom
        height: 60,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 10,
    },
    headerTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 22, // Increased from 18
        // color: Colors.textPrimary, // Overridden
    },
    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
    },
    notificationButton: {
        position: 'relative',
    },
    notificationBadge: {
        position: 'absolute',
        top: -5,
        right: -5,
        backgroundColor: '#EF4444',
        borderRadius: 10,
        minWidth: 18,
        height: 18,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 4,
    },
    notificationBadgeText: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 10,
        color: '#FFFFFF',
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
        marginTop: -20, // Adjusted for insights
        paddingBottom: 40,
    },
    insightsWrapper: {
        width: '100%',
        marginBottom: 32,
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
        paddingVertical: 16,
        paddingHorizontal: 8,
        // backgroundColor: '#FFFFFF', // Overridden
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
        // backgroundColor: '#f5f5f5', // Overridden
        borderRadius: 24,
        padding: 8,
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'flex-end', // Changed from center to align bottom
        gap: 8,
    },
    plusButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        // backgroundColor: '#f5f5f5', // Overridden
        justifyContent: 'center',
        alignItems: 'center',
    },
    inlineAttachmentButtons: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    inlineAttachButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
    },
    inputBox: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f5f5f5',
        borderRadius: 24,
        paddingHorizontal: 16,
        paddingVertical: 10,
        minHeight: 44,
    },
    inputField: {
        flex: 1,
        ...Typography.body,
        maxHeight: 120,
        paddingVertical: 0,
        textAlignVertical: 'center',
        marginRight: 8,
    },
    micButton: {
        padding: 4,
        justifyContent: 'center',
        alignItems: 'center',
    },
    expandedAttachmentMenu: {
        flexDirection: 'row',
        gap: 16,
        marginBottom: 12,
        paddingHorizontal: 4,
    },
    attachMenuOption: {
        alignItems: 'center',
        gap: 6,
    },
    attachMenuIconBg: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: Colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
    },
    attachMenuIconDisabled: {
        backgroundColor: '#E5E7EB',
    },
    attachMenuText: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 12,
        color: Colors.textPrimary,
    },
    attachMenuTextDisabled: {
        color: '#9CA3AF',
    },
    attachMenuDisabled: {
        opacity: 0.6,
    },
    attachButton: {
        padding: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    attachmentSection: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    attachOption: {
        padding: 8,
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 4,
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
        paddingTop: 12,
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
        // color: Colors.textPrimary, // Overridden
        marginBottom: Metrics.spacing.sm,
    },
    emptySubtext: {
        ...Typography.body,
        fontSize: 16,
        // color: Colors.textSecondary, // Overridden
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
        // backgroundColor: '#f5f5f5', // Overridden
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
        // color: Colors.textPrimary, // Overridden
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
    sendButton: {
        backgroundColor: Colors.primary,
        width: 44,
        height: 44,
        borderRadius: 22,
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
    attachmentMenu: {
        position: 'absolute',
        bottom: 80, // Moved up to clear input
        left: 20,
        // backgroundColor: '#FFFFFF', // Overridden
        borderRadius: 16,
        padding: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 8,
        borderWidth: 1,
        // borderColor: '#E5E7EB', // Overridden
        minWidth: 180,
    },
    attachmentMenuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 12,
        // backgroundColor: 'transparent', // Overridden
    },
    attachmentMenuText: {
        marginLeft: 12,
        fontSize: 15,
        fontWeight: '500',
        // color: Colors.textPrimary, // Overridden
    },
    attachmentPreview: {
        marginBottom: 12,
        // backgroundColor: '#F9FAFB', // Overridden
        borderRadius: 12,
        padding: 12,
        borderWidth: 1,
        // borderColor: '#E5E7EB', // Overridden
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
