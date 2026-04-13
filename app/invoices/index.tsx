import React, { useEffect, useState, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Image, Alert, RefreshControl, ActionSheetIOS, Platform, LayoutAnimation, UIManager, ScrollView, Animated, Share, useWindowDimensions, DeviceEventEmitter } from 'react-native';
import { TrueSheet } from '@hedwig/true-sheet';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useRouter, useLocalSearchParams, useNavigation, useFocusEffect } from 'expo-router';
import { DrawerActions } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
let Menu: any = null;
let ExpoButton: any = null;
let Host: any = null;
let labelStyleModifier: any = null;
if (Platform.OS === 'ios') {
    try {
        const SwiftUI = require('@expo/ui/swift-ui');
        Menu = SwiftUI.Menu;
        ExpoButton = SwiftUI.Button;
        Host = SwiftUI.Host;
        const mods = require('@expo/ui/swift-ui/modifiers');
        labelStyleModifier = mods.labelStyle;
    } catch (e) { }
}
import { useAuth } from '../../hooks/useAuth';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import * as Haptics from 'expo-haptics';
import { Colors, useThemeColors } from '../../theme/colors';
import { Typography } from '../../styles/typography';
import { Sidebar } from '../../components/Sidebar';
import { ProfileModal } from '../../components/ProfileModal';
import { getUserGradient } from '../../utils/gradientUtils';
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import AndroidDropdownMenu from '../../components/ui/AndroidDropdownMenu';
import { useSettings } from '../../context/SettingsContext';
import { formatCurrency, getCurrencySymbol } from '../../utils/currencyUtils';
import { useAnalyticsScreen } from '../../hooks/useAnalyticsScreen';
import Analytics from '../../services/analytics';
import { getPublicWebBaseUrl, normalizePublicWebUrl } from '../../utils/publicWebUrl';
import { joinApiUrl } from '../../utils/apiBaseUrl';
import IOSGlassIconButton from '../../components/ui/IOSGlassIconButton';
import {
    List as ListIcon,
    Receipt as ReceiptIcon,
    Clock as ClockIcon,
    CheckCircle as CheckCircleIcon,
    AlertCircle as AlertCircleIcon,
    X as XIcon,
    CircleUser as CircleUserIcon,
    Share2 as Share2Icon,
    Wallet as WalletIcon,
    Trash as TrashIcon,
    Bell as BellIcon,
    MoreHorizontal as MoreHorizontalIcon,
} from '../../components/ui/AppIcon';

const List = (props: any) => <ListIcon {...props} />;
const Receipt = (props: any) => <ReceiptIcon {...props} />;
const Clock = (props: any) => <ClockIcon {...props} />;
const CheckCircle = (props: any) => <CheckCircleIcon {...props} />;
const WarningCircle = (props: any) => <AlertCircleIcon {...props} />;
const X = (props: any) => <XIcon {...props} />;
const UserCircle = (props: any) => <CircleUserIcon {...props} />;
const ShareNetwork = (props: any) => <Share2Icon {...props} />;
const Wallet = (props: any) => <WalletIcon {...props} />;
const Trash = (props: any) => <TrashIcon {...props} />;
const Bell = (props: any) => <BellIcon {...props} />;
const DotsThree = (props: any) => <MoreHorizontalIcon {...props} />;


// Icons for tokens and chains
const ICONS = {
    usdc: require('../../assets/icons/tokens/usdc.png'),
    base: require('../../assets/icons/networks/base.png'),
    celo: require('../../assets/icons/networks/celo.png'),
    solana: require('../../assets/icons/networks/solana.png'),
    arbitrum: require('../../assets/icons/networks/arbitrum.png'),
    polygon: require('../../assets/icons/networks/polygon.png'),
    optimism: require('../../assets/icons/networks/optimism.png'),
    statusPending: require('../../assets/icons/status/pending.png'),
    statusSuccess: require('../../assets/icons/status/success.png'),
    statusFailed: require('../../assets/icons/status/failed.png'),
};

const CHAINS: Record<string, any> = {
    'base':     { name: 'Base',     icon: ICONS.base },
    'celo':     { name: 'Celo',     icon: ICONS.celo },
    'solana':   { name: 'Solana',   icon: ICONS.solana },
    'arbitrum': { name: 'Arbitrum', icon: ICONS.arbitrum },
    'polygon':  { name: 'Polygon',  icon: ICONS.polygon },
    'optimism': { name: 'Optimism', icon: ICONS.optimism },
};

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

const FREQ_DISPLAY: Record<string, string> = {
    weekly:    'per week',
    biweekly:  'every 2 weeks',
    monthly:   'per month',
    quarterly: 'per quarter',
    annual:    'per year',
};

const FREQ_COLORS: Record<string, { bg: string; text: string }> = {
    weekly:    { bg: '#CCFBF1', text: '#0F766E' },
    biweekly:  { bg: '#CFFAFE', text: '#0E7490' },
    monthly:   { bg: '#DBEAFE', text: '#1D4ED8' },
    quarterly: { bg: '#EDE9FE', text: '#6D28D9' },
    annual:    { bg: '#FEF3C7', text: '#B45309' },
};

export default function InvoicesScreen() {
    const navigation = useNavigation();
    // Track screen view
    useAnalyticsScreen('Invoices');

    const router = useRouter();
    const params = useLocalSearchParams();
    const { getAccessToken, user } = useAuth();
    const settings = useSettings();
    const currency = settings?.currency || 'USD';
    const isDarkTheme = settings?.currentTheme === 'dark';
    const themeColors = useThemeColors();
    const { height: screenHeight } = useWindowDimensions();
    const sheetMaxHeight = Math.round(screenHeight * (Platform.OS === 'ios' ? 0.62 : 0.7));
    const detailSheetTopPadding = Platform.OS === 'ios' ? 22 : 28;
    const recurringSheetMaxHeight = Math.round(screenHeight * (Platform.OS === 'ios' ? 0.64 : 0.7));
    const recurringDetailTopPadding = Platform.OS === 'ios' ? 18 : 28;
    const [invoices, setInvoices] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
    const bottomSheetRef = useRef<TrueSheet>(null);
    const handledSelectedInvoiceRef = useRef<string | null>(null);
    const [showProfileModal, setShowProfileModal] = useState(false);

    const [userName, setUserName] = useState({ firstName: '', lastName: '' });
    const [profileIcon, setProfileIcon] = useState<{ emoji?: string; colorIndex?: number; imageUri?: string }>({});
    const [walletAddresses, setWalletAddresses] = useState<{ evm?: string; solana?: string }>({});
    const [showActionMenu, setShowActionMenu] = useState(false);
    const [conversations, setConversations] = useState<any[]>([]);
    const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'pending' | 'due_soon' | 'recurring'>((useLocalSearchParams().filter as any) || 'all');

    // Recurring invoices state
    const [recurringItems, setRecurringItems] = useState<any[]>([]);
    const [recurringLoading, setRecurringLoading] = useState(false);
    const [selectedRecurring, setSelectedRecurring] = useState<any>(null);
    const recurringSheetRef = useRef<TrueSheet>(null);
    const handledSelectedRecurringRef = useRef<string | null>(null);

    const emitTabBarScrollOffset = React.useCallback((offsetY: number) => {
        if (Platform.OS !== 'android') return;
        DeviceEventEmitter.emit('hedwig:tabbar-scroll', offsetY);
    }, []);

    const handleTabBarAwareScroll = React.useCallback((event: any) => {
        emitTabBarScrollOffset(event?.nativeEvent?.contentOffset?.y ?? 0);
    }, [emitTabBarScrollOffset]);

    // Filter invoices based on status
    const filteredInvoices = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const nextWeek = new Date(today);
        nextWeek.setDate(today.getDate() + 7);

        if (statusFilter === 'all') return invoices;
        if (statusFilter === 'paid') return invoices.filter(inv => inv.status === 'PAID');
        if (statusFilter === 'due_soon') {
            return invoices.filter(inv => {
                if (inv.status === 'PAID') return false;
                if (!inv.content?.due_date) return false;
                const due = new Date(inv.content.due_date);
                return due >= today && due <= nextWeek;
            });
        }
        return invoices.filter(inv => inv.status !== 'PAID');
    }, [invoices, statusFilter]);

    useEffect(() => {
        const routeFilter = typeof params.filter === 'string' ? params.filter : null;
        if (!routeFilter) return;
        if (routeFilter === 'all' || routeFilter === 'paid' || routeFilter === 'pending' || routeFilter === 'due_soon' || routeFilter === 'recurring') {
            setStatusFilter(routeFilter);
        }
    }, [params.filter]);

    useEffect(() => {
        const selectedId = typeof params.selected === 'string' ? params.selected : null;
        if (!selectedId) {
            handledSelectedInvoiceRef.current = null;
            return;
        }
        if (isLoading || invoices.length === 0) return;
        if (handledSelectedInvoiceRef.current === selectedId) return;

        const targetInvoice = invoices.find((inv) => inv.id === selectedId);
        if (!targetInvoice) return;

        handledSelectedInvoiceRef.current = selectedId;
        setSelectedInvoice(targetInvoice);
        setTimeout(() => {
            bottomSheetRef.current?.present();
            router.setParams({ selected: undefined } as any);
        }, 120);
    }, [params.selected, isLoading, invoices]);

    useEffect(() => {
        const selectedRecurringId = typeof params.selectedRecurring === 'string' ? params.selectedRecurring : null;
        if (!selectedRecurringId) {
            handledSelectedRecurringRef.current = null;
            return;
        }
        if (recurringLoading || recurringItems.length === 0) return;
        if (handledSelectedRecurringRef.current === selectedRecurringId) return;

        const targetRecurring = recurringItems.find((r: any) => r.id === selectedRecurringId);
        if (!targetRecurring) return;

        handledSelectedRecurringRef.current = selectedRecurringId;
        setStatusFilter('recurring');
        setSelectedRecurring(targetRecurring);
        setTimeout(() => {
            recurringSheetRef.current?.present();
            router.setParams({ selectedRecurring: undefined } as any);
        }, 140);
    }, [params.selectedRecurring, recurringLoading, recurringItems]);

    useEffect(() => {
        return () => {
            emitTabBarScrollOffset(0);
        };
    }, [emitTabBarScrollOffset]);

    // Helper to get chain icon - handles various formats like 'solana_devnet'
    const getChainIcon = (chain?: string) => {
        const c = chain?.toLowerCase() || 'base';
        if (c.includes('solana'))   return ICONS.solana;
        if (c.includes('celo'))     return ICONS.celo;
        if (c.includes('arbitrum')) return ICONS.arbitrum;
        if (c.includes('polygon'))  return ICONS.polygon;
        if (c.includes('optimism')) return ICONS.optimism;
        return ICONS.base;
    };

    // Helper to get display chain name
    const getChainName = (chain?: string) => {
        const c = chain?.toLowerCase() || 'base';
        if (c.includes('solana')) return 'Solana';
        if (c.includes('celo')) return 'Celo';
        if (c.includes('arbitrum')) return 'Arbitrum';
        if (c.includes('optimism')) return 'Optimism';
        return 'Base';
    };

    useEffect(() => {
        fetchInvoices();
        fetchRecurring();
    }, [user]);

    const fetchUserData = async () => {
        if (!user) return;
        try {
            const token = await getAccessToken();

            const profileResponse = await fetch(joinApiUrl('/api/users/profile'), {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            const profileData = await profileResponse.json();

            if (profileData.success && profileData.data) {
                const userData = profileData.data.user || profileData.data;
                setUserName({
                    firstName: userData.firstName || '',
                    lastName: userData.lastName || ''
                });

                // Set profile icon - handle data URIs and regular URLs
                if (userData.avatar) {
                    if (userData.avatar.startsWith('data:') || userData.avatar.startsWith('http')) {
                        setProfileIcon({ imageUri: userData.avatar });
                    } else {
                        try {
                            const parsed = JSON.parse(userData.avatar);
                            if (parsed.imageUri) {
                                setProfileIcon({ imageUri: parsed.imageUri });
                            }
                        } catch (e) {
                            setProfileIcon({ imageUri: userData.avatar });
                        }
                    }
                }
                setWalletAddresses({
                    evm: userData.ethereumWalletAddress || userData.baseWalletAddress || userData.celoWalletAddress,
                    solana: userData.solanaWalletAddress
                });
            }

            // Fetch recent conversations for sidebar
            const conversationsResponse = await fetch(joinApiUrl('/api/chat/conversations'), {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            const conversationsData = await conversationsResponse.json();
            if (conversationsData.success && conversationsData.data) {
                setConversations(conversationsData.data.slice(0, 10)); // Get recent 10
            }
        } catch (error) {
            console.error('Failed to fetch user data:', error);
        }
    };

    useEffect(() => {
        fetchUserData();
    }, [user]);

    // Refetch profile data when screen comes into focus
    useFocusEffect(
        React.useCallback(() => {
            if (user) {
                fetchUserData();
            }
        }, [user])
    );

    const fetchInvoices = async () => {
        try {
            const token = await getAccessToken();

            console.log('Fetching invoices...');
            const response = await fetch(joinApiUrl('/api/documents?type=INVOICE'), {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            console.log('Invoices response:', data);

            if (data.success) {
                setInvoices(data.data.documents);
            } else {
                console.error('Failed to fetch invoices:', data.error);
            }
        } catch (error) {
            console.error('Error fetching invoices:', error);
            Alert.alert('Error', 'Failed to load invoices');
        } finally {
            setIsLoading(false);
            setRefreshing(false);
        }
    };

    const onRefresh = () => {
        setRefreshing(true);
        fetchInvoices();
        fetchRecurring();
    };

    const fetchRecurring = async () => {
        setRecurringLoading(true);
        try {
            const token = await getAccessToken();
            const res = await fetch(joinApiUrl('/api/recurring-invoices'), {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            if (data.success) setRecurringItems(data.data?.recurringInvoices || []);
        } catch (e) {
            console.error('Failed to fetch recurring invoices:', e);
        } finally {
            setRecurringLoading(false);
        }
    };

    const handleRecurringStatus = async (id: string, status: 'active' | 'paused' | 'cancelled') => {
        try {
            const token = await getAccessToken();
            const res = await fetch(joinApiUrl(`/api/recurring-invoices/${id}/status`), {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ status }),
            });
            const data = await res.json();
            if (data.success) {
                setRecurringItems((prev) => prev.map((r) => r.id === id ? { ...r, status } : r));
                if (selectedRecurring?.id === id) setSelectedRecurring((p: any) => p ? { ...p, status } : p);
            } else {
                Alert.alert('Error', data.error?.message || 'Failed to update status');
            }
        } catch {
            Alert.alert('Error', 'Failed to update status');
        }
    };

    const handleRecurringTrigger = async (id: string) => {
        try {
            const token = await getAccessToken();
            const res = await fetch(joinApiUrl(`/api/recurring-invoices/${id}/trigger`), {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            if (data.success) {
                Alert.alert('Success', 'Invoice generated successfully.');
                fetchInvoices();
            } else {
                Alert.alert('Error', data.error?.message || 'Failed to generate invoice');
            }
        } catch {
            Alert.alert('Error', 'Failed to generate invoice');
        }
    };

    const handleDelete = async (invoiceId: string) => {
        // Haptic feedback
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

        Alert.alert(
            'Delete Invoice',
            'Are you sure you want to delete this invoice? This action cannot be undone.',
            [
                {
                    text: 'Cancel',
                    style: 'cancel',
                },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const token = await getAccessToken();
                            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

                            const response = await fetch(`${apiUrl}/api/documents/${invoiceId}`, {
                                method: 'DELETE',
                                headers: { 'Authorization': `Bearer ${token}` },
                            });

                            const data = await response.json();

                            if (data.success) {
                                setInvoices(prev => prev.filter(inv => inv.id !== invoiceId));
                                Alert.alert('Success', 'Invoice deleted successfully');
                            } else {
                                Alert.alert('Error', data.error?.message || 'Failed to delete invoice');
                            }
                        } catch (error) {
                            console.error('Failed to delete invoice:', error);
                            Alert.alert('Error', 'Failed to delete invoice');
                        }
                    }
                },
            ]
        );
    };

    const handleSendReminder = async () => {
        if (!selectedInvoice) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        const sendReminder = async () => {
            try {
                const token = await getAccessToken();
                const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
                const response = await fetch(`${apiUrl}/api/documents/${selectedInvoice.id}/remind`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await response.json();
                if (data.success) {
                    Alert.alert('Success', 'Reminder sent successfully!');
                } else {
                    Alert.alert('Error', data.error?.message || 'Failed to send reminder');
                }
            } catch (error) {
                Alert.alert('Error', 'Failed to send reminder');
            }
        };

        if (!selectedInvoice.content?.recipient_email) {
            Alert.prompt(
                'Missing Email',
                'Please enter the recipient\'s email address to send the reminder.',
                [
                    { text: 'Cancel', style: 'cancel' },
                    {
                        text: 'Send',
                        onPress: async (email: any) => {
                            if (!email || !email.includes('@')) {
                                Alert.alert('Error', 'Please enter a valid email address');
                                return;
                            }
                            try {
                                const token = await getAccessToken();
                                const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
                                const updateRes = await fetch(`${apiUrl}/api/documents/${selectedInvoice.id}`, {
                                    method: 'PUT',
                                    headers: {
                                        'Authorization': `Bearer ${token}`,
                                        'Content-Type': 'application/json'
                                    },
                                    body: JSON.stringify({
                                        content: { recipient_email: email }
                                    })
                                });
                                if (updateRes.ok) {
                                    setSelectedInvoice({
                                        ...selectedInvoice,
                                        content: { ...selectedInvoice.content, recipient_email: email }
                                    });
                                    await sendReminder();
                                } else {
                                    Alert.alert('Error', 'Failed to update email');
                                }
                            } catch (err) {
                                Alert.alert('Error', 'Failed to save email');
                            }
                        }
                    }
                ],
                'plain-text',
                '',
                'email-address'
            );
        } else {
            sendReminder();
        }
    };

    const handleToggleReminders = async () => {
        if (!selectedInvoice) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        const remindersEnabled = selectedInvoice?.content?.reminders_enabled !== false;
        const newState = !remindersEnabled;
        try {
            const token = await getAccessToken();
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
            const response = await fetch(`${apiUrl}/api/documents/${selectedInvoice.id}/toggle-reminders`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ enabled: newState })
            });
            const data = await response.json();
            if (data.success) {
                Alert.alert('Success', `Automatic reminders ${newState ? 'enabled' : 'disabled'}`);
                setSelectedInvoice({
                    ...selectedInvoice,
                    content: { ...selectedInvoice.content, reminders_enabled: newState }
                });
            } else {
                Alert.alert('Error', data.error?.message || 'Failed to toggle reminders');
            }
        } catch (error) {
            Alert.alert('Error', 'Failed to toggle reminders');
        }
    };

    const handleDeleteInvoice = () => {
        if (!selectedInvoice) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        handleDelete(selectedInvoice.id);
        closeModal();
    };

    const handleMarkInvoicePaid = async () => {
        if (!selectedInvoice || selectedInvoice.status === 'PAID') return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        try {
            const token = await getAccessToken();
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
            const response = await fetch(`${apiUrl}/api/documents/${selectedInvoice.id}/status`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ status: 'PAID' })
            });
            const data = await response.json();
            if (!data.success) {
                Alert.alert('Error', data.error?.message || 'Failed to mark invoice as paid');
                return;
            }

            const paidAt = new Date().toISOString();
            setInvoices(prev => prev.map(inv => (
                inv.id === selectedInvoice.id
                    ? {
                        ...inv,
                        status: 'PAID',
                        content: {
                            ...(inv.content || {}),
                            paid_at: (inv.content as any)?.paid_at || paidAt,
                            manual_mark_paid: true,
                        }
                    }
                    : inv
            )));
            setSelectedInvoice((prev: any) => prev ? ({
                ...prev,
                status: 'PAID',
                content: {
                    ...(prev.content || {}),
                    paid_at: (prev.content as any)?.paid_at || paidAt,
                    manual_mark_paid: true,
                }
            }) : prev);
            Alert.alert('Success', 'Invoice marked as paid');
        } catch (error) {
            Alert.alert('Error', 'Failed to mark invoice as paid');
        }
    };

    const getInvoiceUrl = (invoice: any) => {
        const webUrl = getPublicWebBaseUrl(process.env.EXPO_PUBLIC_WEB_CLIENT_URL);
        return normalizePublicWebUrl(
            invoice?.payment_link_url ||
            invoice?.content?.blockradar_url ||
            `${webUrl}/invoice/${invoice?.id}`
        );
    };

    const handleShareInvoice = async () => {
        if (!selectedInvoice) return;
        try {
            const url = getInvoiceUrl(selectedInvoice);
            await Share.share({
                message: `Invoice ${selectedInvoice.title || `INV-${selectedInvoice.id?.slice(0, 8).toUpperCase()}`}: ${url}`,
                url,
            });
        } catch (error) {
            console.error('Failed to share invoice:', error);
            Alert.alert('Error', 'Failed to share invoice');
        }
    };

    const openModal = (invoice: any) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setSelectedInvoice(invoice);
        bottomSheetRef.current?.present();
    };

    const closeModal = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        void bottomSheetRef.current?.dismiss().catch(() => {});
    };

    const handleModalDismiss = () => {
        setSelectedInvoice(null);
        setShowActionMenu(false);
    };

    const handleInvoicePress = (invoice: any) => {
        openModal(invoice);
    };

    const copyToClipboard = async (text: string) => {
        await Clipboard.setStringAsync(text);
        Alert.alert('Copied', 'Copied to clipboard');
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
                    <Trash size={24} color="#FFFFFF" fill="#FFFFFF" />
                </TouchableOpacity>
            </Animated.View>
        );
    };

    const renderItem = ({ item }: { item: any }) => {
        return (
            <TouchableOpacity
                style={[
                    styles.card,
                    {
                        backgroundColor: themeColors.surface,
                        borderColor: themeColors.border,
                        borderWidth: Platform.OS === 'ios' || (Platform.OS === 'android' && isDarkTheme) ? 0 : 1,
                    },
                ]}
                onPress={() => handleInvoicePress(item)}
                onLongPress={() => handleDelete(item.id)}
                delayLongPress={500}
            >
                <View style={styles.cardHeader}>
                    <View>
                        <Text style={[styles.invoiceId, { color: themeColors.textSecondary }]}>INV-{item.id.substring(0, 8).toUpperCase()}</Text>
                        <Text style={[styles.cardTitle, { color: themeColors.textPrimary }]} numberOfLines={1}>{item.title || 'Invoice'}</Text>
                    </View>
                    <View style={styles.iconContainer}>
                        <Image source={ICONS.usdc} style={styles.cardTokenIcon} />
                        <View style={[styles.cardChainBadge, { width: 'auto', height: 'auto', flexDirection: 'row' }]}>
                            <Image source={ICONS.base}   style={{ width: 13, height: 13, borderRadius: 6.5, borderWidth: 1, borderColor: '#fff' }} />
                            <Image source={ICONS.solana} style={{ width: 13, height: 13, borderRadius: 6.5, borderWidth: 1, borderColor: '#fff', marginLeft: -4 }} />
                            <View style={{ width: 13, height: 13, borderRadius: 6.5, backgroundColor: '#e9eaeb', borderWidth: 1, borderColor: '#fff', marginLeft: -4, alignItems: 'center', justifyContent: 'center' }}>
                                <Text style={{ fontSize: 6, fontWeight: '700', color: '#717680' }}>+4</Text>
                            </View>
                        </View>
                    </View>
                </View>

                <Text style={[styles.amount, { color: themeColors.textPrimary }]}>{formatCurrency((item.amount || 0).toString().replace(/[^0-9.]/g, ''), currency)}</Text>

                <View style={styles.cardFooter}>
                    <Text style={styles.dateText}>
                        {item.content?.due_date
                            ? `Due: ${new Date(item.content.due_date).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })}`
                            : new Date(item.created_at).toLocaleDateString('en-GB', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </Text>
                    <View style={[styles.statusBadge, item.status === 'PAID' ? styles.statusPaid : styles.statusPending]}>
                        <Text style={[styles.statusText, item.status === 'PAID' ? styles.statusTextPaid : styles.statusTextPending]}>
                            {item.status === 'PAID' ? 'Paid' : 'Pending'}
                        </Text>
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <>
            <View style={{ flex: 1 }}>
                <SafeAreaView collapsable={false} edges={['top']} style={[styles.container, { backgroundColor: themeColors.background }]}>
                    <View style={[styles.header, { backgroundColor: themeColors.background }]}>
                        <View style={styles.headerTop}>
                            <View style={styles.headerLeft}>
                                <TouchableOpacity onPress={() => navigation.dispatch(DrawerActions.openDrawer())}>
                                    {profileIcon.imageUri ? (
                                        <Image source={{ uri: profileIcon.imageUri }} style={styles.profileIcon} />
                                    ) : (
                                        <LinearGradient
                                            colors={getUserGradient(user?.id)}
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 1, y: 1 }}
                                            style={styles.profileIcon}
                                        >
                                            <Text style={{ color: 'white', fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 16 }}>
                                                {userName.firstName?.[0] || 'U'}
                                            </Text>
                                        </LinearGradient>
                                    )}
                                </TouchableOpacity>
                                <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]}>Invoices</Text>
                            </View>
                        </View>

                        {/* Filter Chips inside Header */}
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.filterContent}
                            style={styles.filterScrollView}
                        >
                            {(['all', 'paid', 'pending', 'due_soon', 'recurring'] as const).map(filter => (
                                <TouchableOpacity
                                    key={filter}
                                    style={[styles.filterChip, { backgroundColor: themeColors.surface, borderColor: themeColors.border }, statusFilter === filter && { backgroundColor: Colors.primary, borderColor: Colors.primary }]}
                                    onPress={() => setStatusFilter(filter)}
                                >
                                    <Text style={[styles.filterText, { color: themeColors.textSecondary }, statusFilter === filter && styles.filterTextActive]}>
                                        {filter === 'due_soon' ? 'Due Soon' : filter.charAt(0).toUpperCase() + filter.slice(1)}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>

                    {statusFilter === 'recurring' ? (
                        recurringLoading ? (
                            <View style={styles.loadingContainer}>
                                <ActivityIndicator size="large" color={Colors.primary} />
                            </View>
                        ) : (
                            <FlatList
                                data={recurringItems}
                                keyExtractor={(item) => item.id}
                                contentContainerStyle={styles.listContent}
                                showsVerticalScrollIndicator={false}
                                contentInsetAdjustmentBehavior="automatic"
                                onScroll={handleTabBarAwareScroll}
                                scrollEventThrottle={16}
                                refreshControl={
                                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
                                }
                                ListEmptyComponent={
                                    <View style={styles.emptyState}>
                                        <Image source={require('../../assets/images/hedwig-logo.png')} style={{ width: 64, height: 64, opacity: 0.4 }} />
                                        <Text style={[styles.emptyStateTitle, { color: themeColors.textPrimary }]}>No Recurring Invoices</Text>
                                        <Text style={[styles.emptyStateText, { color: themeColors.textSecondary }]}>
                                            Set up a recurring invoice to auto-bill clients on a schedule
                                        </Text>
                                    </View>
                                }
                                renderItem={({ item: r }) => {
                                    const statusColors: Record<string, { bg: string; text: string }> = {
                                        active:    { bg: '#DCFCE7', text: '#16A34A' },
                                        paused:    { bg: '#FEF3C7', text: '#D97706' },
                                        cancelled: { bg: '#F3F4F6', text: '#6B7280' },
                                    };
                                    const freq = FREQ_COLORS[r.frequency] ?? { bg: '#F2F4F7', text: '#717680' };
                                    const stat = statusColors[r.status] ?? statusColors.cancelled;
                                    const nextDate = r.nextDueDate
                                        ? new Date(r.nextDueDate).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })
                                        : '—';
                                    return (
                                        <TouchableOpacity
                                            style={[
                                                styles.card,
                                                {
                                                    backgroundColor: themeColors.surface,
                                                    borderColor: themeColors.border,
                                                    borderWidth: Platform.OS === 'ios' || (Platform.OS === 'android' && isDarkTheme) ? 0 : 1,
                                                },
                                            ]}
                                            onPress={() => {
                                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                                setSelectedRecurring(r);
                                                recurringSheetRef.current?.present();
                                            }}
                                            activeOpacity={0.75}
                                        >
                                            {/* Card header: ID + title + recurring icon */}
                                            <View style={styles.cardHeader}>
                                                <View style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
                                                    <Text style={[styles.invoiceId, { color: themeColors.textSecondary }]}>
                                                        REC-{r.id?.substring(0, 8).toUpperCase()}
                                                    </Text>
                                                    <Text style={[styles.cardTitle, { color: themeColors.textPrimary }]} numberOfLines={1}>
                                                        {r.title || 'Recurring invoice'}
                                                    </Text>
                                                </View>
                                                <View style={styles.iconContainer}>
                                                    <View style={[styles.cardTokenIcon, { backgroundColor: freq.bg, alignItems: 'center', justifyContent: 'center' }]}>
                                                        <Image source={require('../../assets/images/hedwig-logo.png')} style={{ width: 22, height: 22, tintColor: freq.text }} />
                                                    </View>
                                                </View>
                                            </View>

                                            {/* Amount */}
                                            <Text style={[styles.amount, { color: themeColors.textPrimary }]}>
                                                ${(r.amountUsd || 0).toLocaleString()}
                                            </Text>

                                            {/* Footer: frequency + status + next date */}
                                            <View style={styles.cardFooter}>
                                                <Text style={[styles.dateText, { color: themeColors.textSecondary }]}>
                                                    {r.status === 'cancelled' ? 'Cancelled' : `Next: ${nextDate}`}
                                                </Text>
                                                <View style={styles.recurringFooterRight}>
                                                    <View style={[styles.statusBadge, { backgroundColor: freq.bg }]}>
                                                        <Text style={[styles.statusText, { color: freq.text }]}>
                                                            {FREQ_DISPLAY[r.frequency] ?? r.frequency ?? 'Monthly'}
                                                        </Text>
                                                    </View>
                                                    <View style={[styles.statusBadge, { backgroundColor: stat.bg }]}>
                                                        <Text style={[styles.statusText, { color: stat.text }]}>
                                                            {r.status ? r.status.charAt(0).toUpperCase() + r.status.slice(1) : 'Active'}
                                                        </Text>
                                                    </View>
                                                </View>
                                            </View>
                                        </TouchableOpacity>
                                    );
                                }}
                            />
                        )
                    ) : isLoading ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color={Colors.primary} />
                        </View>
                    ) : (
                        <FlatList
                            data={filteredInvoices}
                            renderItem={renderItem}
                            keyExtractor={(item) => item.id}
                            contentContainerStyle={styles.listContent}
                            showsVerticalScrollIndicator={false}
                            alwaysBounceVertical={true}
                            contentInsetAdjustmentBehavior="automatic"
                            onScroll={handleTabBarAwareScroll}
                            scrollEventThrottle={16}
                            refreshControl={
                                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
                            }
                            ListEmptyComponent={
                                <View style={styles.emptyState}>
                                    <Receipt size={64} color={themeColors.textSecondary} />
                                    <Text style={[styles.emptyStateTitle, { color: themeColors.textPrimary }]}>No Invoices Yet</Text>
                                    <Text style={[styles.emptyStateText, { color: themeColors.textSecondary }]}>
                                        Create your first invoice to get paid
                                    </Text>
                                </View>
                            }
                        />
                    )}
                </SafeAreaView >

                <ProfileModal
                    visible={showProfileModal}
                    onClose={() => setShowProfileModal(false)}
                    userName={userName}
                    walletAddresses={walletAddresses}
                    profileIcon={profileIcon}
                />


                <TrueSheet
                    ref={bottomSheetRef}
                    detents={['auto']}
                    cornerRadius={Platform.OS === 'ios' ? 50 : 24}
                    backgroundBlur="regular"
                    maxContentHeight={sheetMaxHeight}
                    grabber={true}
                    onDidDismiss={handleModalDismiss}
                >
                    <View style={{ paddingTop: detailSheetTopPadding, paddingBottom: 26, paddingHorizontal: 24 }}>
                        <View style={styles.modalHeader}>
                            <View style={styles.modalHeaderLeft}>
                                {/* Token icon with status badge */}
                                <View style={styles.modalIconContainer}>
                                    <Image
                                        source={ICONS.usdc}
                                        style={styles.modalTokenIcon}
                                    />
                                    <Image
                                        source={selectedInvoice?.status === 'PAID' ? ICONS.statusSuccess : ICONS.statusPending}
                                        style={styles.modalStatusBadge}
                                    />
                                </View>
                                <View>
                                    <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>
                                        {selectedInvoice?.status === 'PAID' ? `Paid` : 'Pending'}
                                    </Text>
                                    <Text style={[styles.modalSubtitle, { color: themeColors.textSecondary }]}>
                                        {selectedInvoice?.created_at ? `${new Date(selectedInvoice.created_at).toLocaleDateString('en-GB', { month: 'short', day: 'numeric', year: 'numeric' })} • ${new Date(selectedInvoice.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true })}` : ''}
                                    </Text>
                                </View>
                            </View>
                            <View style={styles.modalHeaderRight}>
                                <>
                                    {Platform.OS === 'ios' && Host && Menu && ExpoButton ? (
                                        <Host style={{ height: 36, tintColor: themeColors.textSecondary }} matchContents>
                                            <Menu
                                                label="More"
                                                systemImage="ellipsis"
                                                modifiers={labelStyleModifier ? [labelStyleModifier('iconOnly')] : undefined}
                                            >
                                                <ExpoButton
                                                    label="Share"
                                                    onPress={handleShareInvoice}
                                                    systemImage="square.and.arrow.up"
                                                />
                                                {selectedInvoice?.status !== 'PAID' && (
                                                    <ExpoButton
                                                        label="Mark as Paid"
                                                        onPress={handleMarkInvoicePaid}
                                                        systemImage="checkmark.circle.fill"
                                                    />
                                                )}
                                                {selectedInvoice?.status !== 'PAID' && (
                                                    <ExpoButton
                                                        label="Send Reminder"
                                                        onPress={handleSendReminder}
                                                        systemImage="bell.fill"
                                                    />
                                                )}
                                                {selectedInvoice?.status !== 'PAID' && (
                                                    <ExpoButton
                                                        label={selectedInvoice?.content?.reminders_enabled !== false ? 'Disable Auto-Reminders' : 'Enable Auto-Reminders'}
                                                        onPress={handleToggleReminders}
                                                        systemImage={selectedInvoice?.content?.reminders_enabled !== false ? 'bell.slash.fill' : 'bell.badge.fill'}
                                                    />
                                                )}
                                                {selectedInvoice?.status !== 'PAID' && (
                                                    <ExpoButton
                                                        label="Delete"
                                                        onPress={handleDeleteInvoice}
                                                        systemImage="trash.fill"
                                                    />
                                                )}
                                            </Menu>
                                        </Host>
                                    ) : (
                                        <AndroidDropdownMenu
                                            width={280}
                                            options={[
                                                {
                                                    label: 'Share',
                                                    onPress: handleShareInvoice,
                                                    icon: <ShareNetwork size={16} color={themeColors.textPrimary} strokeWidth={3} />,
                                                },
                                                ...(selectedInvoice?.status !== 'PAID'
                                                    ? [
                                                        {
                                                            label: 'Mark as Paid',
                                                            onPress: handleMarkInvoicePaid,
                                                            icon: <CheckCircle size={16} color={themeColors.textPrimary} strokeWidth={3} />,
                                                        },
                                                        {
                                                            label: 'Send Reminder',
                                                            onPress: handleSendReminder,
                                                            icon: <Bell size={16} color={themeColors.textPrimary} strokeWidth={3} />,
                                                        },
                                                        {
                                                            label: selectedInvoice?.content?.reminders_enabled !== false
                                                                ? 'Disable Auto-Reminders'
                                                                : 'Enable Auto-Reminders',
                                                            onPress: handleToggleReminders,
                                                            icon: <Clock size={16} color={themeColors.textPrimary} strokeWidth={3} />,
                                                        },
                                                        {
                                                            label: 'Delete',
                                                            onPress: handleDeleteInvoice,
                                                            destructive: true,
                                                            icon: <Trash size={16} color="#EF4444" strokeWidth={3} />,
                                                        },
                                                    ]
                                                    : []),
                                            ]}
                                            trigger={
                                                <View style={{ padding: 4, marginRight: 8 }}>
                                                    <DotsThree size={24} color={themeColors.textSecondary} />
                                                </View>
                                            }
                                        />
                                    )}
                                </>
                                <IOSGlassIconButton
                                    onPress={closeModal}
                                    systemImage="xmark"
                                    circleStyle={[styles.closeButton, { backgroundColor: themeColors.surface }]}
                                    icon={<X size={22} color={themeColors.textSecondary} strokeWidth={3.5} />}
                                />
                            </View>
                        </View>

                        <View style={[styles.amountCard, { backgroundColor: themeColors.surface }]}>
                            <Text style={[styles.amountCardValue, { color: themeColors.textPrimary }]}>
                                {formatCurrency((selectedInvoice?.amount || 0).toString().replace(/[^0-9.]/g, ''), currency)}
                            </Text>
                            <View style={styles.amountCardSub}>
                                <Image source={ICONS.usdc} style={styles.smallIcon} />
                                <Text style={[styles.amountCardSubText, { color: themeColors.textSecondary }]}>{selectedInvoice?.amount} USDC</Text>
                            </View>
                        </View>

                        <View style={[styles.detailsCard, { backgroundColor: themeColors.surface }]}>
                            <View style={styles.detailRow}>
                                <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Invoice ID</Text>
                                <Text style={[styles.detailValue, { color: themeColors.textPrimary }]}>INV-{selectedInvoice?.id.slice(0, 8).toUpperCase()}</Text>
                            </View>
                            <View style={[styles.detailDivider, { backgroundColor: themeColors.border }]} />
                            <View style={styles.detailRow}>
                                <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Description</Text>
                                <Text style={[styles.detailValue, { color: themeColors.textPrimary }]}>{selectedInvoice?.title}</Text>
                            </View>
                            <View style={[styles.detailDivider, { backgroundColor: themeColors.border }]} />
                            <View style={styles.detailRow}>
                                <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Client</Text>
                                <Text style={[styles.detailValue, { color: themeColors.textPrimary }]}>{selectedInvoice?.content?.clientName || selectedInvoice?.content?.client_name || 'N/A'}</Text>
                            </View>
                            <View style={[styles.detailDivider, { backgroundColor: themeColors.border }]} />
                            <View style={styles.detailRow}>
                                <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Chain</Text>
                                <View style={styles.chainValue}>
                                    <View style={{ flexDirection: 'row', marginRight: 6 }}>
                                        <Image source={ICONS.base}     style={{ width: 16, height: 16, borderRadius: 8 }} />
                                        <Image source={ICONS.arbitrum} style={{ width: 16, height: 16, borderRadius: 8, marginLeft: -5 }} />
                                        <Image source={ICONS.polygon}  style={{ width: 16, height: 16, borderRadius: 8, marginLeft: -5 }} />
                                        <Image source={ICONS.celo}     style={{ width: 16, height: 16, borderRadius: 8, marginLeft: -5 }} />
                                        <Image source={ICONS.solana}   style={{ width: 16, height: 16, borderRadius: 8, marginLeft: -5 }} />
                                    </View>
                                    <Text style={[styles.detailValue, { color: themeColors.textPrimary }]}>5 networks</Text>
                                </View>
                            </View>
                        </View>

                        <TouchableOpacity
                            style={styles.viewButton}
                            onPress={async () => {
                                try {
                                    const url = getInvoiceUrl(selectedInvoice);

                                    await WebBrowser.openBrowserAsync(url, {
                                        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
                                        controlsColor: Colors.primary,
                                    });
                                } catch (error: any) {
                                    Alert.alert('Error', `Failed to open: ${error?.message}`);
                                }
                            }}
                        >
                            <Text style={styles.viewButtonText}>View Invoice</Text>
                        </TouchableOpacity>
                    </View>
                </TrueSheet>
                {/* Recurring Detail Sheet */}
                <TrueSheet
                    ref={recurringSheetRef}
                    detents={['auto']}
                    cornerRadius={Platform.OS === 'ios' ? 50 : 24}
                    backgroundBlur="regular"
                    maxContentHeight={recurringSheetMaxHeight}
                    grabber={true}
                    onDidDismiss={() => setSelectedRecurring(null)}
                >
                    <View style={{ paddingTop: recurringDetailTopPadding, paddingBottom: 26, paddingHorizontal: 24 }}>
                        {selectedRecurring && (() => {
                            const r = selectedRecurring;
                            const statusColors: Record<string, { bg: string; text: string }> = {
                                active:    { bg: '#DCFCE7', text: '#16A34A' },
                                paused:    { bg: '#FEF3C7', text: '#D97706' },
                                cancelled: { bg: '#F3F4F6', text: '#6B7280' },
                            };
                            const freq = FREQ_COLORS[r.frequency] ?? { bg: '#F2F4F7', text: '#717680' };
                            const stat = statusColors[r.status] ?? statusColors.cancelled;

                            const recurringMenuActions = [
                                ...(r.status === 'active' ? [{
                                    label: 'Generate Now',
                                    onPress: () => { void recurringSheetRef.current?.dismiss().catch(() => {}); handleRecurringTrigger(r.id); },
                                    icon: <Image source={require('../../assets/images/hedwig-logo.png')} style={{ width: 16, height: 16, tintColor: themeColors.textPrimary }} />,
                                }] : []),
                                ...(r.status === 'active' ? [{
                                    label: 'Pause',
                                    onPress: () => { void recurringSheetRef.current?.dismiss().catch(() => {}); handleRecurringStatus(r.id, 'paused'); },
                                    icon: <Clock size={16} color={themeColors.textPrimary} strokeWidth={3} />,
                                }] : []),
                                ...(r.status === 'paused' ? [{
                                    label: 'Resume',
                                    onPress: () => { void recurringSheetRef.current?.dismiss().catch(() => {}); handleRecurringStatus(r.id, 'active'); },
                                    icon: <Image source={require('../../assets/images/hedwig-logo.png')} style={{ width: 16, height: 16, tintColor: themeColors.textPrimary }} />,
                                }] : []),
                                ...(r.status !== 'cancelled' ? [{
                                    label: 'Cancel Recurring',
                                    destructive: true,
                                    onPress: () => {
                                        Alert.alert('Cancel Recurring Invoice', 'This will stop future invoice generation.', [
                                            { text: 'Keep', style: 'cancel' },
                                            { text: 'Cancel Invoice', style: 'destructive', onPress: () => { void recurringSheetRef.current?.dismiss().catch(() => {}); handleRecurringStatus(r.id, 'cancelled'); } },
                                        ]);
                                    },
                                    icon: <Trash size={16} color="#EF4444" strokeWidth={3} />,
                                }] : []),
                            ];

                            return (
                                <>
                                    {/* Header — identical structure to invoice sheet */}
                                    <View style={styles.modalHeader}>
                                        <View style={styles.modalHeaderLeft}>
                                            <View style={styles.modalIconContainer}>
                                                <View style={[styles.modalTokenIcon, { backgroundColor: freq.bg, alignItems: 'center', justifyContent: 'center' }]}>
                                                    <Image source={require('../../assets/images/hedwig-logo.png')} style={{ width: 22, height: 22, tintColor: freq.text }} />
                                                </View>
                                                <View style={[styles.modalStatusBadge, { backgroundColor: stat.bg, borderColor: themeColors.background, alignItems: 'center', justifyContent: 'center' }]}>
                                                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: stat.text }} />
                                                </View>
                                            </View>
                                            <View>
                                                <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>
                                                    {r.status ? r.status.charAt(0).toUpperCase() + r.status.slice(1) : 'Active'}
                                                </Text>
                                                <Text style={[styles.modalSubtitle, { color: themeColors.textSecondary }]}>
                                                    {r.createdAt
                                                        ? `${new Date(r.createdAt).toLocaleDateString('en-GB', { month: 'short', day: 'numeric', year: 'numeric' })} • ${new Date(r.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true })}`
                                                        : 'Recurring invoice'}
                                                </Text>
                                            </View>
                                        </View>
                                        <View style={styles.modalHeaderRight}>
                                            <>
                                                {Platform.OS === 'ios' && Host && Menu && ExpoButton ? (
                                                    <Host style={{ height: 36, tintColor: themeColors.textSecondary }} matchContents>
                                                        <Menu
                                                            label="More"
                                                            systemImage="ellipsis"
                                                            modifiers={labelStyleModifier ? [labelStyleModifier('iconOnly')] : undefined}
                                                        >
                                                            {r.status === 'active' && (
                                                                <ExpoButton label="Generate Now" onPress={() => { void recurringSheetRef.current?.dismiss().catch(() => {}); handleRecurringTrigger(r.id); }} systemImage="arrow.clockwise" />
                                                            )}
                                                            {r.status === 'active' && (
                                                                <ExpoButton label="Pause" onPress={() => { void recurringSheetRef.current?.dismiss().catch(() => {}); handleRecurringStatus(r.id, 'paused'); }} systemImage="pause.fill" />
                                                            )}
                                                            {r.status === 'paused' && (
                                                                <ExpoButton label="Resume" onPress={() => { void recurringSheetRef.current?.dismiss().catch(() => {}); handleRecurringStatus(r.id, 'active'); }} systemImage="play.fill" />
                                                            )}
                                                            {r.status !== 'cancelled' && (
                                                                <ExpoButton
                                                                    onPress={() => {
                                                                        Alert.alert('Cancel Recurring Invoice', 'This will stop future invoice generation.', [
                                                                            { text: 'Keep', style: 'cancel' },
                                                                            { text: 'Cancel Invoice', style: 'destructive', onPress: () => { void recurringSheetRef.current?.dismiss().catch(() => {}); handleRecurringStatus(r.id, 'cancelled'); } },
                                                                        ]);
                                                                    }}
                                                                    label="Cancel Recurring"
                                                                    systemImage="trash.fill"
                                                                />
                                                            )}
                                                        </Menu>
                                                    </Host>
                                                ) : (
                                                    <AndroidDropdownMenu
                                                        width={240}
                                                        options={recurringMenuActions}
                                                        trigger={
                                                            <View style={{ padding: 4, marginRight: 8 }}>
                                                                <DotsThree size={24} color={themeColors.textSecondary} />
                                                            </View>
                                                        }
                                                    />
                                                )}
                                            </>
                                            <IOSGlassIconButton
                                                onPress={() => {
                                                    void recurringSheetRef.current?.dismiss().catch(() => {});
                                                }}
                                                systemImage="xmark"
                                                circleStyle={[styles.recurringCloseButton, { backgroundColor: themeColors.surface }]}
                                                icon={<X size={22} color={themeColors.textSecondary} strokeWidth={3.5} />}
                                            />
                                        </View>
                                    </View>

                                    {/* Amount card */}
                                    <View style={[styles.amountCard, { backgroundColor: themeColors.surface }]}>
                                        <Text style={[styles.amountCardValue, { color: themeColors.textPrimary }]}>
                                            ${(r.amountUsd || 0).toLocaleString()}
                                        </Text>
                                        <View style={styles.amountCardSub}>
                                            <Text style={[styles.amountCardSubText, { color: themeColors.textSecondary }]}>
                                                {FREQ_DISPLAY[r.frequency] ?? `per ${r.frequency}` ?? 'per month'}
                                            </Text>
                                        </View>
                                    </View>

                                    {/* Details card */}
                                    <View style={[styles.detailsCard, { backgroundColor: themeColors.surface }]}>
                                        <View style={styles.detailRow}>
                                            <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Template ID</Text>
                                            <Text style={[styles.detailValue, { color: themeColors.textPrimary }]}>REC-{r.id?.slice(0, 8).toUpperCase()}</Text>
                                        </View>
                                        <View style={[styles.detailDivider, { backgroundColor: themeColors.border }]} />
                                        <View style={styles.detailRow}>
                                            <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Description</Text>
                                            <Text style={[styles.detailValue, { color: themeColors.textPrimary }]} numberOfLines={1}>{r.title || '—'}</Text>
                                        </View>
                                        <View style={[styles.detailDivider, { backgroundColor: themeColors.border }]} />
                                        <View style={styles.detailRow}>
                                            <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Client</Text>
                                            <Text style={[styles.detailValue, { color: themeColors.textPrimary }]}>{r.clientName || r.clientEmail || 'N/A'}</Text>
                                        </View>
                                        <View style={[styles.detailDivider, { backgroundColor: themeColors.border }]} />
                                        <View style={styles.detailRow}>
                                            <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Next date</Text>
                                            <Text style={[styles.detailValue, { color: themeColors.textPrimary }]}>
                                                {r.status === 'cancelled' ? '—' : r.nextDueDate
                                                    ? new Date(r.nextDueDate).toLocaleDateString('en-GB', { month: 'short', day: 'numeric', year: 'numeric' })
                                                    : '—'}
                                            </Text>
                                        </View>
                                        <View style={[styles.detailDivider, { backgroundColor: themeColors.border }]} />
                                        <View style={styles.detailRow}>
                                            <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Generated</Text>
                                            <Text style={[styles.detailValue, { color: themeColors.textPrimary }]}>{r.generatedCount ?? 0} invoice{r.generatedCount !== 1 ? 's' : ''}</Text>
                                        </View>
                                    </View>

                                    {/* Primary action button */}
                                    {r.status === 'active' && (
                                        <TouchableOpacity
                                            style={styles.viewButton}
                                            onPress={() => { void recurringSheetRef.current?.dismiss().catch(() => {}); handleRecurringTrigger(r.id); }}
                                        >
                                            <Text style={styles.viewButtonText}>Generate Now</Text>
                                        </TouchableOpacity>
                                    )}
                                    {r.status === 'paused' && (
                                        <TouchableOpacity
                                            style={styles.viewButton}
                                            onPress={() => { void recurringSheetRef.current?.dismiss().catch(() => {}); handleRecurringStatus(r.id, 'active'); }}
                                        >
                                            <Text style={styles.viewButtonText}>Resume</Text>
                                        </TouchableOpacity>
                                    )}
                                </>
                            );
                        })()}
                    </View>
                </TrueSheet>

            </View >

            {/* Tutorial card for invoices step */}
        </>
    );
}


const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    header: {
        backgroundColor: '#FFFFFF',
        paddingBottom: 12, // Add padding bottom to container
        // Removed fixed height to fit content
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
        fontFamily: 'GoogleSansFlex_700Bold',
        fontSize: Platform.OS === 'android' ? 22 : 24,
        color: Colors.textPrimary,
    },
    profileIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: Colors.primary,
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
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    listContent: {
        padding: 16,
        paddingBottom: 120, // Increased for Tab Bar safe area
        flexGrow: 1, // Ensures empty state takes up available space on iOS
    },
    card: {
        backgroundColor: '#f5f5f5',
        borderRadius: 24,
        borderWidth: 1,
        padding: 20,
        marginBottom: 16,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 16,
    },
    invoiceId: {
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
        width: 40,
        height: 40,
    },
    cardTokenIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
    },
    cardChainBadge: {
        position: 'absolute',
        bottom: -2,
        right: -2,
        width: 18,
        height: 18,
        // No background or border
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
        ...Platform.select({
            android: { fontFamily: 'GoogleSansFlex_600SemiBold' },
            ios: { fontWeight: '700' },
        }),
        fontSize: 32,
        color: Colors.textPrimary,
        marginBottom: 16,
    },
    cardFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    dateText: {
        ...Typography.body,
        color: Colors.textSecondary,
    },
    statusBadge: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
    },
    statusPaid: {
        backgroundColor: '#DCFCE7',
    },
    statusPending: {
        backgroundColor: '#FEF3C7',
    },
    statusText: {
        ...Typography.caption,
        fontWeight: '600',
    },
    statusTextPaid: {
        color: '#16A34A',
    },
    statusTextPending: {
        color: '#D97706',
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
        color: Colors.textSecondary,
        textAlign: 'center',
    },
    emptyStateIcon: {
        width: 80,
        height: 80,
        resizeMode: 'contain',
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
        backgroundColor: '#FFFFFF',
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
        gap: 8,
    },
    modalHeaderRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    menuButton: {
        padding: 4,
    },
    closeButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#F3F4F6',
        justifyContent: 'center',
        alignItems: 'center',
    },
    recurringCloseButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 0,
    },
    actionMenu: {
        backgroundColor: Colors.surface,
        borderRadius: 12,
        padding: 8,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
    },
    actionMenuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        gap: 12,
    },
    actionMenuItemText: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 15,
        color: Colors.textPrimary,
    },
    actionMenuDivider: {
        height: 1,
        backgroundColor: '#E5E7EB',
        marginHorizontal: 8,
    },
    pullDownMenu: {
        position: 'absolute',
        top: 50,
        right: 24,
        backgroundColor: 'rgba(255, 255, 255, 0.98)',
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
        paddingVertical: 12,
        paddingHorizontal: 16,
        gap: 10,
    },
    pullDownMenuText: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 16,
        color: Colors.textPrimary,
    },
    pullDownMenuDivider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: 'rgba(0, 0, 0, 0.1)',
        marginHorizontal: 0,
    },
    menuBackdrop: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'transparent',
        zIndex: 999,
    },
    modalIconContainer: {
        position: 'relative',
        marginRight: 12,
    },
    modalTokenIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
    },
    modalStatusBadge: {
        position: 'absolute',
        bottom: -2,
        right: -2,
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: '#FFFFFF',
        borderWidth: 2,
        borderColor: '#FFFFFF',
    },
    modalTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 18,
        color: Colors.textPrimary,
    },
    modalSubtitle: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 13,
        color: Colors.textSecondary,
        marginTop: 4,
    },
    amountCard: {
        backgroundColor: '#F9FAFB',
        borderRadius: 20,
        padding: 24,
        alignItems: 'center',
        marginBottom: 24,
    },
    amountCardValue: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 36,
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
        borderRadius: 8,
    },
    amountCardSubText: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 14,
        color: Colors.textSecondary,
    },
    detailsCard: {
        backgroundColor: '#F9FAFB',
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
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 14,
        color: Colors.textSecondary,
    },
    detailValue: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 14,
        color: Colors.textPrimary,
    },
    detailDivider: {
        height: 1,
        backgroundColor: '#E5E7EB',
        marginVertical: 16,
    },
    chainValue: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    viewButton: {
        backgroundColor: Colors.primary,
        borderRadius: 30,
        paddingVertical: 16,
        alignItems: 'center',
    },
    viewButtonText: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 16,
        color: '#FFFFFF',
    },
    recurringFooterRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
});
