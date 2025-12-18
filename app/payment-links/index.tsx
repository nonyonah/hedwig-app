import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Modal, Image, Alert, Animated, ActionSheetIOS, Platform, LayoutAnimation, UIManager } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePrivy } from '@privy-io/expo';
import { List, CheckCircle, ShareNetwork, X, Wallet, UserCircle, Trash, DotsThree, Bell } from 'phosphor-react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../theme/colors';
import { Typography } from '../../styles/typography';
import { Sidebar } from '../../components/Sidebar';
import { ProfileModal } from '../../components/ProfileModal';
import { getUserGradient } from '../../utils/gradientUtils';

// Icons for tokens, networks, and status
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
] as const;

export default function PaymentLinksScreen() {
    const router = useRouter();
    const { getAccessToken, user } = usePrivy();
    const [links, setLinks] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedLink, setSelectedLink] = useState<any>(null);
    const [showModal, setShowModal] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [userName, setUserName] = useState({ firstName: '', lastName: '' });
    const [profileIcon, setProfileIcon] = useState<{ emoji?: string; colorIndex?: number; imageUri?: string }>({});
    const [walletAddresses, setWalletAddresses] = useState<{ evm?: string; solana?: string }>({});
    const [showActionMenu, setShowActionMenu] = useState(false);
    const [conversations, setConversations] = useState<any[]>([]);

    // Helper to get chain icon - handles various formats
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

    // Animation value for modal
    const slideAnim = React.useRef(new Animated.Value(0)).current;

    useEffect(() => {
        fetchLinks();
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
        }
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

    const openModal = (link: any) => {
        setSelectedLink(link);
        setShowModal(true);
        Animated.spring(slideAnim, {
            toValue: 1,
            useNativeDriver: true,
            damping: 25,
            stiffness: 300,
        }).start();
    };

    const closeModal = () => {
        Animated.timing(slideAnim, {
            toValue: 0,
            duration: 250,
            useNativeDriver: true,
        }).start(() => setShowModal(false));
    };

    const handleLinkPress = (link: any) => {
        openModal(link);
    };

    const copyToClipboard = async (text: string) => {
        await Clipboard.setStringAsync(text);
        Alert.alert('Copied', 'Link ID copied to clipboard');
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
                style={styles.card}
                onPress={() => handleLinkPress(item)}
                onLongPress={() => handleDelete(item.id)}
                delayLongPress={500}
            >
                <View style={styles.cardHeader}>
                    <View>
                        <Text style={styles.linkId}>LINK-{item.id.substring(0, 8).toUpperCase()}</Text>
                        <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
                    </View>
                    <View style={styles.iconContainer}>
                        <Image source={ICONS.usdc} style={styles.cardTokenIcon} />
                        <Image source={getChainIcon(item.chain)} style={styles.cardChainBadge} />
                    </View>
                </View>

                <Text style={styles.amount}>${(item.amount || 0).toString().replace(/[^0-9.]/g, '')}</Text>

                <View style={styles.cardFooter}>
                    <Text style={styles.dateText}>
                        {new Date(item.created_at).toLocaleDateString('en-GB', { month: 'short', day: 'numeric', year: 'numeric' })}
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
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => setIsSidebarOpen(true)}>
                        <List size={24} color={Colors.textPrimary} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Payment Links</Text>
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

                {isLoading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color={Colors.primary} />
                    </View>
                ) : (
                    <FlatList
                        data={links}
                        renderItem={renderItem}
                        keyExtractor={(item) => item.id}
                        contentContainerStyle={styles.listContent}
                        ListEmptyComponent={
                            <View style={styles.emptyState}>
                                <ShareNetwork size={64} color={Colors.textSecondary} weight="duotone" />
                                <Text style={styles.emptyStateTitle}>No Payment Links</Text>
                                <Text style={styles.emptyStateText}>
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
            />

            <Sidebar
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
                userName={userName}
                conversations={conversations}
                onHomeClick={() => router.push('/')}
                onLoadConversation={(id) => router.push(`/?conversationId=${id}`)}
            />

            {/* Details Modal */}
            <Modal
                visible={showModal}
                transparent={true}
                animationType="none"
                onRequestClose={closeModal}
            >
                <View style={styles.modalOverlay}>
                    <TouchableOpacity style={StyleSheet.absoluteFill} onPress={closeModal} />
                    <Animated.View
                        style={[
                            styles.modalContent,
                            {
                                transform: [{
                                    translateY: slideAnim.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: [600, 0]
                                    })
                                }]
                            }
                        ]}
                    >
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
                                    <Text style={styles.modalTitle}>
                                        {selectedLink?.status === 'PAID' ? 'Paid' : 'Pending'}
                                    </Text>
                                    <Text style={styles.modalSubtitle}>
                                        {selectedLink?.created_at ? `${new Date(selectedLink.created_at).toLocaleDateString('en-GB').replace(/\//g, '-')} ${new Date(selectedLink.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : ''}
                                    </Text>
                                </View>
                            </View>
                            <View style={styles.modalHeaderRight}>
                                {selectedLink?.status !== 'PAID' && (
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
                                        <DotsThree size={24} color={Colors.textSecondary} weight="bold" />
                                    </TouchableOpacity>
                                )}
                                <TouchableOpacity onPress={closeModal}>
                                    <X size={24} color={Colors.textSecondary} />
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* iOS Pull-Down Style Menu */}
                        {showActionMenu && selectedLink?.status !== 'PAID' && (
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
                                        }}
                                    >
                                        <Bell size={18} color={Colors.primary} weight="fill" />
                                        <Text style={styles.pullDownMenuText}>Send Reminder</Text>
                                    </TouchableOpacity>

                                    <View style={styles.pullDownMenuDivider} />

                                    <TouchableOpacity
                                        style={styles.pullDownMenuItem}
                                        onPress={async () => {
                                            setShowActionMenu(false);
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
                                        }}
                                    >
                                        <Bell size={18} color={selectedLink?.content?.reminders_enabled !== false ? Colors.textSecondary : Colors.primary} weight={selectedLink?.content?.reminders_enabled !== false ? 'regular' : 'fill'} />
                                        <Text style={styles.pullDownMenuText}>
                                            {selectedLink?.content?.reminders_enabled !== false ? 'Disable Auto-Reminders' : 'Enable Auto-Reminders'}
                                        </Text>
                                    </TouchableOpacity>

                                    <View style={styles.pullDownMenuDivider} />

                                    <TouchableOpacity
                                        style={styles.pullDownMenuItem}
                                        onPress={() => {
                                            setShowActionMenu(false);
                                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                                            handleDelete(selectedLink.id);
                                            closeModal();
                                        }}
                                    >
                                        <Trash size={18} color="#EF4444" weight="fill" />
                                        <Text style={[styles.pullDownMenuText, { color: '#EF4444' }]}>Delete</Text>
                                    </TouchableOpacity>
                                </Animated.View>
                            </>
                        )}

                        <View style={styles.amountCard}>
                            <Text style={styles.amountCardValue}>
                                ${(selectedLink?.amount || 0).toString().replace(/[^0-9.]/g, '')}
                            </Text>
                            <View style={styles.amountCardSub}>
                                <Image source={ICONS.usdc} style={styles.smallIcon} />
                                <Text style={styles.amountCardSubText}>{selectedLink?.amount} USDC</Text>
                            </View>
                        </View>

                        <View style={styles.detailsCard}>
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Link ID</Text>
                                <Text style={styles.detailValue}>LINK-{selectedLink?.id?.substring(0, 8).toUpperCase()}</Text>
                            </View>
                            <View style={styles.detailDivider} />
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Description</Text>
                                <Text style={styles.detailValue}>{selectedLink?.title}</Text>
                            </View>
                            <View style={styles.detailDivider} />
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Chain</Text>
                                <View style={styles.chainValue}>
                                    <Image
                                        source={getChainIcon(selectedLink?.chain)}
                                        style={styles.smallIcon}
                                    />
                                    <Text style={styles.detailValue}>{getChainName(selectedLink?.chain)}</Text>
                                </View>
                            </View>
                        </View>

                        <TouchableOpacity
                            style={styles.viewButton}
                            onPress={async () => {
                                try {
                                    const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
                                    const url = `${apiUrl}/payment-link/${selectedLink.id}`;
                                    await WebBrowser.openBrowserAsync(url, {
                                        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
                                        controlsColor: Colors.primary,
                                    });
                                } catch (error: any) {
                                    Alert.alert('Error', `Failed to open: ${error?.message}`);
                                }
                            }}
                        >
                            <Text style={styles.viewButtonText}>View Payment Link</Text>
                        </TouchableOpacity>
                    </Animated.View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 16,
    },
    headerTitle: {
        ...Typography.h2,
        fontSize: 18,
        fontWeight: '600',
    },
    profileIcon: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: Colors.primary,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    listContent: {
        padding: 16,
        paddingBottom: 32,
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
        borderRadius: 9,
        borderWidth: 2,
        borderColor: '#FFFFFF',
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
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        padding: 24,
        paddingBottom: 40,
        maxHeight: '80%',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 10,
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
        gap: 12,
    },
    modalHeaderRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    menuButton: {
        padding: 4,
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
        fontFamily: 'RethinkSans_500Medium',
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
        fontFamily: 'RethinkSans_500Medium',
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
        fontFamily: 'RethinkSans_700Bold',
        fontSize: 18,
        color: Colors.textPrimary,
    },
    modalSubtitle: {
        fontFamily: 'RethinkSans_400Regular',
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
        fontFamily: 'RethinkSans_700Bold',
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
        fontFamily: 'RethinkSans_400Regular',
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
        fontFamily: 'RethinkSans_400Regular',
        fontSize: 14,
        color: Colors.textSecondary,
    },
    detailValue: {
        fontFamily: 'RethinkSans_500Medium',
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
        fontFamily: 'RethinkSans_600SemiBold',
        fontSize: 16,
        color: '#FFFFFF',
    },
});
