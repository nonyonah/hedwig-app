import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Image, Alert, Animated, ActionSheetIOS, Platform, LayoutAnimation, UIManager, ScrollView, RefreshControl, Share, useWindowDimensions, DeviceEventEmitter } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { TrueSheet } from '@hedwig/true-sheet';
import * as Clipboard from 'expo-clipboard';
import { useRouter, useLocalSearchParams, useNavigation, useFocusEffect } from 'expo-router';
import { DrawerActions } from '@react-navigation/native';
import * as WebBrowser from 'expo-web-browser';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../hooks/useAuth';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import * as Haptics from 'expo-haptics';
import { Colors, useThemeColors } from '../../theme/colors';
import { Typography } from '../../styles/typography';
import { Sidebar } from '../../components/Sidebar';
import { ProfileModal } from '../../components/ProfileModal';
import { getUserGradient } from '../../utils/gradientUtils';
import { useSettings } from '../../context/SettingsContext';
import { formatCurrency } from '../../utils/currencyUtils';
import { useAnalyticsScreen } from '../../hooks/useAnalyticsScreen';
import AndroidDropdownMenu from '../../components/ui/AndroidDropdownMenu';
import { getPublicWebBaseUrl, normalizePublicWebUrl } from '../../utils/publicWebUrl';
import IOSGlassIconButton from '../../components/ui/IOSGlassIconButton';
import {
    List as ListIcon,
    CheckCircle as CheckCircleIcon,
    Share2 as Share2Icon,
    X as XIcon,
    Wallet as WalletIcon,
    CircleUser as CircleUserIcon,
    Trash as TrashIcon,
    MoreHorizontal as MoreHorizontalIcon,
    Bell as BellIcon,
} from '../../components/ui/AppIcon';

const List = (props: any) => <ListIcon {...props} />;
const CheckCircle = (props: any) => <CheckCircleIcon {...props} />;
const ShareNetwork = (props: any) => <Share2Icon {...props} />;
const X = (props: any) => <XIcon {...props} />;
const Wallet = (props: any) => <WalletIcon {...props} />;
const UserCircle = (props: any) => <CircleUserIcon {...props} />;
const Trash = (props: any) => <TrashIcon {...props} />;
const DotsThree = (props: any) => <MoreHorizontalIcon {...props} />;
const Bell = (props: any) => <BellIcon {...props} />;


// Icons for tokens, networks, and status
const ICONS = {
    usdc: require('../../assets/icons/tokens/usdc.png'),
    base: require('../../assets/icons/networks/base.png'),
    celo: require('../../assets/icons/networks/celo.png'),
    solana: require('../../assets/icons/networks/solana.png'),
    arbitrum: require('../../assets/icons/networks/arbitrum.png'),
    polygon: require('../../assets/icons/networks/polygon.png'),
    lisk: require('../../assets/icons/networks/lisk.png'),
    optimism: require('../../assets/icons/networks/optimism.png'),
    statusPending: require('../../assets/icons/status/pending.png'),
    statusSuccess: require('../../assets/icons/status/success.png'),
    statusFailed: require('../../assets/icons/status/failed.png'),
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

export default function PaymentLinksScreen() {
    const navigation = useNavigation();
    const router = useRouter();
    const params = useLocalSearchParams();

    // Track page view
    useAnalyticsScreen('Payment Links');
    const { getAccessToken, user } = useAuth();
    const settings = useSettings();
    const currency = settings?.currency || 'USD';
    const isDarkTheme = settings?.currentTheme === 'dark';
    const themeColors = useThemeColors();
    const bottomSheetRef = React.useRef<TrueSheet>(null);
    const { height: screenHeight } = useWindowDimensions();
    const sheetMaxHeight = Math.round(screenHeight * (Platform.OS === 'ios' ? 0.6 : 0.7));
    const detailSheetTopPadding = 28;
    const [links, setLinks] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedLink, setSelectedLink] = useState<any>(null);
    const handledSelectedLinkRef = React.useRef<string | null>(null);
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [userName, setUserName] = useState({ firstName: '', lastName: '' });
    const [profileIcon, setProfileIcon] = useState<{ emoji?: string; colorIndex?: number; imageUri?: string }>({});
    const [walletAddresses, setWalletAddresses] = useState<{ evm?: string; solana?: string }>({});
    const [showActionMenu, setShowActionMenu] = useState(false);
    const [conversations, setConversations] = useState<any[]>([]);
    const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'pending' | 'due_soon'>((useLocalSearchParams().filter as any) || 'all');

    const emitTabBarScrollOffset = React.useCallback((offsetY: number) => {
        if (Platform.OS !== 'android') return;
        DeviceEventEmitter.emit('hedwig:tabbar-scroll', offsetY);
    }, []);

    const handleTabBarAwareScroll = React.useCallback((event: any) => {
        emitTabBarScrollOffset(event?.nativeEvent?.contentOffset?.y ?? 0);
    }, [emitTabBarScrollOffset]);

    // Filter links based on status
    const filteredLinks = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const nextWeek = new Date(today);
        nextWeek.setDate(today.getDate() + 7);

        if (statusFilter === 'all') return links;
        if (statusFilter === 'paid') return links.filter(link => link.status === 'PAID');
        if (statusFilter === 'due_soon') {
            return links.filter(link => {
                if (link.status === 'PAID') return false;
                if (!link.content?.due_date) return false;
                const due = new Date(link.content.due_date);
                return due >= today && due <= nextWeek;
            });
        }
        return links.filter(link => link.status !== 'PAID');
    }, [links, statusFilter]);

    useEffect(() => {
        const selectedId = typeof params.selected === 'string' ? params.selected : null;
        if (!selectedId) {
            handledSelectedLinkRef.current = null;
            return;
        }
        if (isLoading || links.length === 0) return;
        if (handledSelectedLinkRef.current === selectedId) return;

        const targetLink = links.find((link) => link.id === selectedId);
        if (!targetLink) return;

        handledSelectedLinkRef.current = selectedId;
        setSelectedLink(targetLink);
        setTimeout(() => {
            bottomSheetRef.current?.present();
            router.setParams({ selected: undefined } as any);
        }, 120);
    }, [params.selected, isLoading, links]);

    // Helper to get chain icon - handles various formats
    const getChainIcon = (chain?: string) => {
        const c = chain?.toLowerCase() || 'base';
        if (c.includes('solana')) return ICONS.solana;
        if (c.includes('celo')) return ICONS.celo;
        if (c.includes('arbitrum')) return ICONS.arbitrum;
        if (c.includes('polygon') || c.includes('matic')) return ICONS.polygon;
        if (c.includes('lisk')) return ICONS.lisk;
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
    const slideAnim = React.useRef(new Animated.Value(0)).current;

    useEffect(() => {
        fetchLinks();
    }, [user]);

    useEffect(() => {
        return () => {
            emitTabBarScrollOffset(0);
        };
    }, [emitTabBarScrollOffset]);

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
            const conversationsResponse = await fetch(`${apiUrl}/api/chat/conversations`, {
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

    const fetchLinks = async () => {
        try {
            const token = await getAccessToken();
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

            console.log('Fetching payment links...');
            const response = await fetch(`${apiUrl}/api/documents?type=PAYMENT_LINK`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            console.log('Payment links response:', data);

            if (data.success) {
                setLinks(data.data.documents);
            } else {
                console.error('Failed to fetch links:', data.error);
            }
        } catch (error) {
            console.error('Error fetching links:', error);
            Alert.alert('Error', 'Failed to load payment links');
        } finally {
            setIsLoading(false);
            setRefreshing(false);
        }
    };

    const onRefresh = () => {
        setRefreshing(true);
        fetchLinks();
    };

    const handleDelete = async (linkId: string) => {
        console.log('handleDelete called for:', linkId);
        // Haptic feedback
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

        Alert.alert(
            'Delete Payment Link',
            'Are you sure you want to delete this payment link? This action cannot be undone.',
            [
                {
                    text: 'Cancel',
                    style: 'cancel',
                    onPress: () => console.log('Delete cancelled')
                },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        console.log('Delete confirmed for:', linkId);
                        try {
                            const token = await getAccessToken();
                            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

                            const response = await fetch(`${apiUrl}/api/documents/${linkId}`, {
                                method: 'DELETE',
                                headers: { 'Authorization': `Bearer ${token}` },
                            });

                            const data = await response.json();

                            if (data.success) {
                                setLinks(prev => prev.filter(link => link.id !== linkId));
                                Alert.alert('Success', 'Payment link deleted successfully');
                            } else {
                                Alert.alert('Error', data.error?.message || 'Failed to delete payment link');
                            }
                        } catch (error) {
                            console.error('Failed to delete payment link:', error);
                            Alert.alert('Error', 'Failed to delete payment link');
                        }
                    }
                },
            ]
        );
    };

    const handleSendReminder = async () => {
        if (!selectedLink) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        const sendReminder = async () => {
            try {
                const token = await getAccessToken();
                const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
                const response = await fetch(`${apiUrl}/api/documents/${selectedLink.id}/remind`, {
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

        if (!selectedLink.content?.recipient_email) {
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
                                const updateRes = await fetch(`${apiUrl}/api/documents/${selectedLink.id}`, {
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
                                    setSelectedLink({
                                        ...selectedLink,
                                        content: { ...selectedLink.content, recipient_email: email }
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
        if (!selectedLink) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        const remindersEnabled = selectedLink?.content?.reminders_enabled !== false;
        const newState = !remindersEnabled;
        try {
            const token = await getAccessToken();
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
            const response = await fetch(`${apiUrl}/api/documents/${selectedLink.id}/toggle-reminders`, {
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
                setSelectedLink({
                    ...selectedLink,
                    content: { ...selectedLink.content, reminders_enabled: newState }
                });
            } else {
                Alert.alert('Error', data.error?.message || 'Failed to toggle reminders');
            }
        } catch (error) {
            Alert.alert('Error', 'Failed to toggle reminders');
        }
    };

    const handleDeleteLink = () => {
        if (!selectedLink) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        handleDelete(selectedLink.id);
        closeModal();
    };

    const handleMarkLinkPaid = async () => {
        if (!selectedLink || selectedLink.status === 'PAID') return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        try {
            const token = await getAccessToken();
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
            const response = await fetch(`${apiUrl}/api/documents/${selectedLink.id}/status`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ status: 'PAID' })
            });
            const data = await response.json();
            if (!data.success) {
                Alert.alert('Error', data.error?.message || 'Failed to mark payment link as paid');
                return;
            }

            const paidAt = new Date().toISOString();
            setLinks(prev => prev.map(link => (
                link.id === selectedLink.id
                    ? {
                        ...link,
                        status: 'PAID',
                        content: {
                            ...(link.content || {}),
                            paid_at: (link.content as any)?.paid_at || paidAt,
                            manual_mark_paid: true,
                        }
                    }
                    : link
            )));
            setSelectedLink((prev: any) => prev ? ({
                ...prev,
                status: 'PAID',
                content: {
                    ...(prev.content || {}),
                    paid_at: (prev.content as any)?.paid_at || paidAt,
                    manual_mark_paid: true,
                }
            }) : prev);
            Alert.alert('Success', 'Payment link marked as paid');
        } catch (error) {
            Alert.alert('Error', 'Failed to mark payment link as paid');
        }
    };

    const getPaymentLinkUrl = (link: any) => {
        const webUrl = getPublicWebBaseUrl(process.env.EXPO_PUBLIC_WEB_CLIENT_URL);
        return normalizePublicWebUrl(
            link?.payment_link_url ||
            link?.content?.blockradar_url ||
            `${webUrl}/pay/${link?.id}`
        );
    };

    const handleShareLink = async () => {
        if (!selectedLink) return;
        try {
            const url = getPaymentLinkUrl(selectedLink);
            await Share.share({
                message: `Payment link ${selectedLink.title || `LINK-${selectedLink.id?.slice(0, 8).toUpperCase()}`}: ${url}`,
                url,
            });
        } catch (error) {
            console.error('Failed to share payment link:', error);
            Alert.alert('Error', 'Failed to share payment link');
        }
    };

    const openModal = (link: any) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setSelectedLink(link);
        bottomSheetRef.current?.present();
    };

    const closeModal = () => {
        void bottomSheetRef.current?.dismiss().catch(() => {});
    };

    const handleModalDismiss = () => {
        setSelectedLink(null);
        setShowActionMenu(false);
    };

    const handleLinkPress = (link: any) => {
        openModal(link);
    };

    const copyToClipboard = async (text: string) => {
        await Clipboard.setStringAsync(text);
        Alert.alert('Copied', 'Link ID copied to clipboard');
    };

    const detailsModalContent = (
        <View style={{ paddingTop: detailSheetTopPadding, paddingBottom: 26, paddingHorizontal: 20 }}>
            <View style={styles.modalHeader}>
                <View style={styles.modalHeaderLeft}>
                    {/* Token icon with status badge */}
                    <View style={styles.modalIconContainer}>
                        <Image
                            source={ICONS.usdc}
                            style={styles.modalTokenIcon}
                        />
                        <Image
                            source={selectedLink?.status === 'PAID' ? ICONS.statusSuccess : ICONS.statusPending}
                            style={styles.modalStatusBadge}
                        />
                    </View>
                    <View>
                        <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>
                            {selectedLink?.status === 'PAID' ? 'Paid' : 'Pending'}
                        </Text>
                        <Text style={[styles.modalSubtitle, { color: themeColors.textSecondary }]}>
                            {selectedLink?.created_at ? `${new Date(selectedLink.created_at).toLocaleDateString('en-GB').replace(/\//g, '-')} ${new Date(selectedLink.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : ''}
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
                                        onPress={handleShareLink}
                                        systemImage="square.and.arrow.up"
                                    />
                                    {selectedLink?.status !== 'PAID' && (
                                        <ExpoButton
                                            label="Mark as Paid"
                                            onPress={handleMarkLinkPaid}
                                            systemImage="checkmark.circle.fill"
                                        />
                                    )}
                                    {selectedLink?.status !== 'PAID' && (
                                        <ExpoButton
                                            label="Send Reminder"
                                            onPress={handleSendReminder}
                                            systemImage="bell.fill"
                                        />
                                    )}
                                    {selectedLink?.status !== 'PAID' && (
                                        <ExpoButton
                                            label={selectedLink?.content?.reminders_enabled !== false ? 'Disable Auto-Reminders' : 'Enable Auto-Reminders'}
                                            onPress={handleToggleReminders}
                                            systemImage={selectedLink?.content?.reminders_enabled !== false ? 'bell.slash.fill' : 'bell.badge.fill'}
                                        />
                                    )}
                                    {selectedLink?.status !== 'PAID' && (
                                        <ExpoButton
                                            label="Delete"
                                            onPress={handleDeleteLink}
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
                                        onPress: handleShareLink,
                                        icon: <ShareNetwork size={16} color={themeColors.textPrimary} strokeWidth={3} />,
                                    },
                                    ...(selectedLink?.status !== 'PAID'
                                        ? [
                                            {
                                                label: 'Mark as Paid',
                                                onPress: handleMarkLinkPaid,
                                                icon: <CheckCircle size={16} color={themeColors.textPrimary} strokeWidth={3} />,
                                            },
                                            {
                                                label: 'Send Reminder',
                                                onPress: handleSendReminder,
                                                icon: <Bell size={16} color={themeColors.textPrimary} strokeWidth={3} />,
                                            },
                                            {
                                                label: selectedLink?.content?.reminders_enabled !== false
                                                    ? 'Disable Auto-Reminders'
                                                    : 'Enable Auto-Reminders',
                                                onPress: handleToggleReminders,
                                                icon: <CheckCircle size={16} color={themeColors.textPrimary} strokeWidth={3} />,
                                            },
                                            {
                                                label: 'Delete',
                                                onPress: handleDeleteLink,
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
                    {formatCurrency((selectedLink?.amount || 0).toString().replace(/[^0-9.]/g, ''), currency)}
                </Text>
                <View style={styles.amountCardSub}>
                    <Image source={ICONS.usdc} style={styles.smallIcon} />
                    <Text style={[styles.amountCardSubText, { color: themeColors.textSecondary }]}>{selectedLink?.amount} USDC</Text>
                </View>
            </View>

            <View style={[styles.detailsCard, { backgroundColor: themeColors.surface }]}>
                <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Link ID</Text>
                    <Text style={[styles.detailValue, { color: themeColors.textPrimary }]}>LINK-{selectedLink?.id?.substring(0, 8).toUpperCase()}</Text>
                </View>
                <View style={[styles.detailDivider, { backgroundColor: themeColors.border }]} />
                <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Description</Text>
                    <Text style={[styles.detailValue, { color: themeColors.textPrimary }]}>{selectedLink?.title}</Text>
                </View>
                <View style={[styles.detailDivider, { backgroundColor: themeColors.border }]} />
                <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Client</Text>
                    <Text style={[styles.detailValue, { color: themeColors.textPrimary }]}>{selectedLink?.content?.clientName || selectedLink?.content?.client_name || 'N/A'}</Text>
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
                            <Image source={ICONS.lisk}     style={{ width: 16, height: 16, borderRadius: 8, marginLeft: -5 }} />
                            <Image source={ICONS.solana}   style={{ width: 16, height: 16, borderRadius: 8, marginLeft: -5 }} />
                        </View>
                        <Text style={[styles.detailValue, { color: themeColors.textPrimary }]}>6 networks</Text>
                    </View>
                </View>
            </View>

            <TouchableOpacity
                style={styles.viewButton}
                onPress={async () => {
                    try {
                        const url = getPaymentLinkUrl(selectedLink);

                        await WebBrowser.openBrowserAsync(url, {
                            presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
                            controlsColor: Colors.primary,
                        });
                    } catch (error: any) {
                        Alert.alert('Error', `Failed to open: ${error?.message}`);
                    }
                }}
            >
                <Text style={styles.viewButtonText}>View Payment Link</Text>
            </TouchableOpacity>
        </View>
    );

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
                onPress={() => handleLinkPress(item)}
                onLongPress={() => handleDelete(item.id)}
                delayLongPress={500}
            >
                <View style={styles.cardHeader}>
                    <View>
                        <Text style={[styles.linkId, { color: themeColors.textSecondary }]}>LINK-{item.id.substring(0, 8).toUpperCase()}</Text>
                        <Text style={[styles.cardTitle, { color: themeColors.textPrimary }]} numberOfLines={1}>{item.title}</Text>
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
                                <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]}>Payment Links</Text>
                            </View>
                        </View>

                        {/* Filter Chips inside Header */}
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.filterContent}
                            style={styles.filterScrollView}
                        >
                            {(['all', 'paid', 'pending', 'due_soon'] as const).map(filter => (
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

                    {isLoading ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color={Colors.primary} />
                        </View>
                    ) : (
                        <FlatList
                            data={filteredLinks}
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
                                < View style={styles.emptyState}>
                                    <ShareNetwork size={64} color={themeColors.textSecondary} />
                                    <Text style={[styles.emptyStateTitle, { color: themeColors.textPrimary }]}>No Payment Links</Text>
                                    <Text style={[styles.emptyStateText, { color: themeColors.textSecondary }]}>
                                        Create a payment link to accept crypto payments
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
                <TrueSheet
                    ref={bottomSheetRef}
                    detents={['auto']}
                    cornerRadius={Platform.OS === 'ios' ? 50 : 24}
                    backgroundBlur="regular"
                    maxContentHeight={sheetMaxHeight}
                    grabber={true}
                    onDidDismiss={handleModalDismiss}
                >
                    {detailsModalContent}
                </TrueSheet>
            </View >

            {/* Tutorial card for links step */}
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
        paddingHorizontal: 16, // Reduced from 20 to match list content
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
        paddingBottom: 120,
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
    linkId: {
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
    badgeIcon: {
        width: 20,
        height: 20,
        borderRadius: 10,
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
    nudgeButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: Colors.surface,
        borderWidth: 1,
        borderColor: Colors.primary,
        paddingVertical: 14,
        borderRadius: 12,
        marginTop: 12,
        gap: 8,
    },
    nudgeButtonText: {
        ...Typography.button,
        color: Colors.primary,
        fontSize: 16,
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
        // backgroundColor: '#F3F4F6', // Overridden
        justifyContent: 'center',
        alignItems: 'center',
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
        // backgroundColor: '#E5E7EB', // Overridden
        marginHorizontal: 8,
    },
    pullDownMenu: {
        position: 'absolute',
        top: 50,
        right: 24,
        // backgroundColor: 'rgba(255, 255, 255, 0.98)', // Overridden
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
        // backgroundColor: 'rgba(0, 0, 0, 0.1)', // Overridden
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
});
