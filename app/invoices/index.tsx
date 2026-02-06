import React, { useEffect, useState, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Image, Alert, RefreshControl, ActionSheetIOS, Platform, LayoutAnimation, UIManager, ScrollView, Animated } from 'react-native';
import { BottomSheetModal, BottomSheetView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../hooks/useAuth';
import { List, Receipt, Clock, CheckCircle, WarningCircle, X, UserCircle, ShareNetwork, Wallet, Trash, Bell, DotsThree } from 'phosphor-react-native';
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
import { useSettings } from '../../context/SettingsContext';
import { formatCurrency, getCurrencySymbol } from '../../utils/currencyUtils';
import { useAnalyticsScreen } from '../../hooks/useAnalyticsScreen';
import Analytics from '../../services/analytics';

// Icons for tokens and chains
const ICONS = {
    usdc: require('../../assets/icons/tokens/usdc.png'),
    base: require('../../assets/icons/networks/base.png'),
    celo: require('../../assets/icons/networks/celo.png'),
    solana: require('../../assets/icons/networks/solana.png'),
    arbitrum: require('../../assets/icons/networks/arbitrum.png'),
    optimism: require('../../assets/icons/networks/optimism.png'),
    statusPending: require('../../assets/icons/status/pending.png'),
    statusSuccess: require('../../assets/icons/status/success.png'),
    statusFailed: require('../../assets/icons/status/failed.png'),
};

const CHAINS: Record<string, any> = {
    'base': { name: 'Base', icon: ICONS.base },
    'celo': { name: 'Celo', icon: ICONS.celo },
    'solana': { name: 'Solana', icon: ICONS.solana },
    'arbitrum': { name: 'Arbitrum', icon: ICONS.arbitrum },
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

export default function InvoicesScreen() {
    // Track screen view
    useAnalyticsScreen('Invoices');

    const router = useRouter();
    const params = useLocalSearchParams();
    const { getAccessToken, user } = useAuth();
    const settings = useSettings();
    const currency = settings?.currency || 'USD';
    const themeColors = useThemeColors();
    const [invoices, setInvoices] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
    const bottomSheetRef = useRef<BottomSheetModal>(null);
    const [showProfileModal, setShowProfileModal] = useState(false);

    const [userName, setUserName] = useState({ firstName: '', lastName: '' });
    const [profileIcon, setProfileIcon] = useState<{ emoji?: string; colorIndex?: number; imageUri?: string }>({});
    const [walletAddresses, setWalletAddresses] = useState<{ evm?: string; solana?: string }>({});
    const [showActionMenu, setShowActionMenu] = useState(false);
    const [conversations, setConversations] = useState<any[]>([]);
    const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'pending' | 'due_soon'>((useLocalSearchParams().filter as any) || 'all');

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

    // Helper to get chain icon - handles various formats like 'solana_devnet'
    const getChainIcon = (chain?: string) => {
        const c = chain?.toLowerCase() || 'base';
        if (c.includes('solana')) return ICONS.solana;
        if (c.includes('celo')) return ICONS.celo;
        if (c.includes('arbitrum')) return ICONS.arbitrum;
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
    }, [user]);

    useEffect(() => {
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

                    // Set profile icon
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
                        setProfileIcon({ emoji: userData.profileEmoji });
                    } else if (userData.profileColorIndex !== undefined) {
                        setProfileIcon({ colorIndex: userData.profileColorIndex });
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
        fetchUserData();
    }, [user]);

    const fetchInvoices = async () => {
        try {
            const token = await getAccessToken();
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

            console.log('Fetching invoices...');
            const response = await fetch(`${apiUrl}/api/documents?type=INVOICE`, {
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

    const openModal = (invoice: any) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setSelectedInvoice(invoice);
        bottomSheetRef.current?.present();
    };

    const closeModal = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        bottomSheetRef.current?.dismiss();
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
                    <Trash size={24} color="#FFFFFF" weight="fill" />
                </TouchableOpacity>
            </Animated.View>
        );
    };

    const renderItem = ({ item }: { item: any }) => {
        return (
            <TouchableOpacity
                style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}
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
                        <Image source={getChainIcon(item.chain)} style={styles.cardChainBadge} />
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
        <View style={{ flex: 1 }}>
            <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
                <View style={[styles.header, { backgroundColor: themeColors.background }]}>
                    <View style={styles.headerTop}>
                        <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]}>Invoices</Text>
                        <TouchableOpacity onPress={() => setShowProfileModal(true)}>
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
                        data={filteredInvoices}
                        renderItem={renderItem}
                        keyExtractor={(item) => item.id}
                        contentContainerStyle={styles.listContent}
                        showsVerticalScrollIndicator={false}
                        alwaysBounceVertical={true}
                        refreshControl={
                            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
                        }
                        ListEmptyComponent={
                            <View style={styles.emptyState}>
                                <Receipt size={64} color={themeColors.textSecondary} weight="duotone" />
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



            <BottomSheetModal
                ref={bottomSheetRef}
                index={0}
                enableDynamicSizing={true}
                enablePanDownToClose={true}
                backdropComponent={(props) => (
                    <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.5} />
                )}
                backgroundStyle={{ backgroundColor: themeColors.background, borderRadius: 24 }}
                handleIndicatorStyle={{ backgroundColor: themeColors.textSecondary }}
            >
                <BottomSheetView style={{ paddingBottom: 40, paddingHorizontal: 24 }}>
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
                            {selectedInvoice?.status !== 'PAID' && (
                                <TouchableOpacity
                                    onPress={() => {
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                        LayoutAnimation.configureNext(LayoutAnimation.create(
                                            200,
                                            LayoutAnimation.Types.easeInEaseOut,
                                            LayoutAnimation.Properties.opacity
                                        ));
                                        setShowActionMenu(!showActionMenu);
                                    }}
                                    style={styles.menuButton}
                                >
                                    <DotsThree size={24} color={themeColors.textSecondary} weight="bold" />
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity style={[styles.closeButton, { backgroundColor: themeColors.surface }]} onPress={closeModal}>
                                <X size={20} color={themeColors.textSecondary} weight="bold" />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* iOS Pull-Down Style Menu */}
                    {showActionMenu && selectedInvoice?.status !== 'PAID' && (
                        <>
                            {/* Backdrop to dismiss menu */}
                            <TouchableOpacity
                                style={styles.menuBackdrop}
                                activeOpacity={1}
                                onPress={() => {
                                    LayoutAnimation.configureNext(LayoutAnimation.create(
                                        150,
                                        LayoutAnimation.Types.easeInEaseOut,
                                        LayoutAnimation.Properties.opacity
                                    ));
                                    setShowActionMenu(false);
                                }}
                            />
                            <Animated.View
                                style={[
                                    styles.pullDownMenu,
                                    { backgroundColor: themeColors.surface, borderColor: themeColors.border },
                                    {
                                        opacity: 1,
                                        transform: [{ scale: 1 }]
                                    }
                                ]}
                            >
                                <TouchableOpacity
                                    style={styles.pullDownMenuItem}
                                    onPress={async () => {
                                        setShowActionMenu(false);
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
                                                        onPress: async (email) => {
                                                            if (!email || !email.includes('@')) {
                                                                Alert.alert('Error', 'Please enter a valid email address');
                                                                return;
                                                            }
                                                            try {
                                                                const token = await getAccessToken();
                                                                const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

                                                                // Update document with email
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
                                                                    // Update local state
                                                                    setSelectedInvoice({
                                                                        ...selectedInvoice,
                                                                        content: { ...selectedInvoice.content, recipient_email: email }
                                                                    });
                                                                    // Proceed to send reminder
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
                                    }}
                                >
                                    <Bell size={18} color={Colors.primary} weight="fill" />
                                    <Text style={[styles.pullDownMenuText, { color: themeColors.textPrimary }]}>Send Reminder</Text>
                                </TouchableOpacity>

                                <View style={[styles.pullDownMenuDivider, { backgroundColor: themeColors.border }]} />

                                <TouchableOpacity
                                    style={styles.pullDownMenuItem}
                                    onPress={async () => {
                                        setShowActionMenu(false);
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
                                    }}
                                >
                                    <Bell size={18} color={selectedInvoice?.content?.reminders_enabled !== false ? Colors.textSecondary : Colors.primary} weight={selectedInvoice?.content?.reminders_enabled !== false ? 'regular' : 'fill'} />
                                    <Text style={[styles.pullDownMenuText, { color: themeColors.textPrimary }]}>
                                        {selectedInvoice?.content?.reminders_enabled !== false ? 'Disable Auto-Reminders' : 'Enable Auto-Reminders'}
                                    </Text>
                                </TouchableOpacity>

                                <View style={[styles.pullDownMenuDivider, { backgroundColor: themeColors.border }]} />

                                <TouchableOpacity
                                    style={styles.pullDownMenuItem}
                                    onPress={() => {
                                        setShowActionMenu(false);
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                                        handleDelete(selectedInvoice.id);
                                        closeModal();
                                    }}
                                >
                                    <Trash size={18} color="#EF4444" weight="fill" />
                                    <Text style={[styles.pullDownMenuText, { color: '#EF4444' }]}>Delete</Text>
                                </TouchableOpacity>
                            </Animated.View>
                        </>
                    )}

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
                                <Image
                                    source={getChainIcon(selectedInvoice?.chain)}
                                    style={styles.smallIcon}
                                />
                                <Text style={[styles.detailValue, { color: themeColors.textPrimary }]}>
                                    {getChainName(selectedInvoice?.chain)}
                                </Text>
                            </View>
                        </View>
                    </View>

                    <TouchableOpacity
                        style={styles.viewButton}
                        onPress={async () => {
                            try {
                                const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
                                const url = `${apiUrl}/invoice/${selectedInvoice.id}`;
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
                </BottomSheetView>
            </BottomSheetModal>
        </View >
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
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 28,
        color: Colors.textPrimary,
    },
    profileIcon: {
        width: 32,
        height: 32,
        borderRadius: 16,
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
    },
    card: {
        backgroundColor: '#f5f5f5',
        borderRadius: 24,
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
        borderRadius: 9,
        borderWidth: 2,
        borderColor: '#FFFFFF',
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
        fontSize: 32,
        fontWeight: '700',
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
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#F3F4F6',
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
});
