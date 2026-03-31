import React, { useRef, useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Dimensions, ScrollView, Platform, Alert, TextInput, ActivityIndicator, Keyboard, TouchableWithoutFeedback, Share } from 'react-native';
import { useRouter, usePathname, Link } from 'expo-router';
import { usePrivy } from '@privy-io/expo';
import { HugeiconsIcon } from '@hugeicons/react-native';
import * as HugeiconsCore from '@hugeicons/core-free-icons';
import { Colors, useThemeColors } from '../theme/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useSettings } from '../context/SettingsContext';



const { width, height } = Dimensions.get('window');
const SIDEBAR_WIDTH = width * 0.96;
const SIDEBAR_ICON_STROKE = 2;

const HOME_ICON = (HugeiconsCore as any).Home01Icon;
const INVOICE_ICON = (HugeiconsCore as any).Invoice01Icon;
const LINK_ICON = (HugeiconsCore as any).Link01Icon;
const CLIENTS_ICON = (HugeiconsCore as any).UserGroup03Icon;
const PROJECTS_ICON = (HugeiconsCore as any).Folder01Icon;
const CONTRACTS_ICON = (HugeiconsCore as any).File02Icon;
const ANALYTICS_ICON = (HugeiconsCore as any).Analytics01Icon;
const CALENDAR_ICON = (HugeiconsCore as any).Calendar01Icon;
const CHAT_ICON = (HugeiconsCore as any).AiChat01Icon;
const TRANSACTION_ICON = (HugeiconsCore as any).TransactionHistoryIcon;
const WITHDRAWAL_ICON = (HugeiconsCore as any).ReverseWithdrawal01Icon;
const SETTINGS_ICON = (HugeiconsCore as any).Settings01Icon;
const SEARCH_ICON = (HugeiconsCore as any).Search01Icon;
const CLOSE_ICON = (HugeiconsCore as any).Cancel01Icon;

interface SidebarProps {
    isOpen: boolean;
    onClose: () => void;
    userName?: { firstName: string; lastName: string };
    conversations?: any[];
    currentConversationId?: string | null;
    onLoadConversation?: (id: string) => void;
    onHomeClick?: () => void;
    onDeleteConversation?: (id: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
    isOpen,
    onClose,
    userName,
    conversations = [],
    currentConversationId,
    onLoadConversation,
    onHomeClick,
    onDeleteConversation,
}) => {
    const router = useRouter();
    const pathname = usePathname();
    const { user, logout, getAccessToken } = usePrivy();
    const { hapticsEnabled } = useSettings();
    const themeColors = useThemeColors();
    const insets = useSafeAreaInsets();

    // Animation value: 0 (closed) to 1 (open)
    const animValue = useRef(new Animated.Value(0)).current;

    const [isVisible, setIsVisible] = React.useState(isOpen);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (isOpen) {
            setIsVisible(true);
            Animated.timing(animValue, {
                toValue: 1,
                duration: 250,
                useNativeDriver: true,
            }).start();
        } else {
            Animated.timing(animValue, {
                toValue: 0,
                duration: 250,
                useNativeDriver: true,
            }).start(() => {
                setIsVisible(false);
            });
        }
    }, [isOpen]);



    const handleNavigation = (path: string) => {
        onClose();
        setSearchQuery('');
        setSearchResults([]);
        if (pathname !== path) {
            router.push(path as any);
        }
    };

    // Debounced search function
    const performSearch = useCallback(async (query: string) => {
        if (!query.trim()) {
            setSearchResults([]);
            return;
        }

        setIsSearching(true);
        try {
            const token = await getAccessToken();
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

            // Search invoices, recurring invoices, payment links, and conversations in parallel
            const [invoicesRes, linksRes, recurringRes, conversationsRes] = await Promise.all([
                fetch(`${apiUrl}/api/documents?type=INVOICE&search=${encodeURIComponent(query)}`, {
                    headers: token ? { 'Authorization': `Bearer ${token}` } : {}
                }).catch(() => null),
                fetch(`${apiUrl}/api/documents?type=PAYMENT_LINK&search=${encodeURIComponent(query)}`, {
                    headers: token ? { 'Authorization': `Bearer ${token}` } : {}
                }).catch(() => null),
                fetch(`${apiUrl}/api/recurring-invoices`, {
                    headers: token ? { 'Authorization': `Bearer ${token}` } : {}
                }).catch(() => null),
                fetch(`${apiUrl}/api/chat/conversations?search=${encodeURIComponent(query)}`, {
                    headers: token ? { 'Authorization': `Bearer ${token}` } : {}
                }).catch(() => null),
            ]);

            const results: any[] = [];

            if (invoicesRes?.ok) {
                const data = await invoicesRes.json();
                (data.data?.documents || []).slice(0, 3).forEach((inv: any) => {
                    results.push({ type: 'invoice', id: inv.id, title: inv.title || `INV-${inv.id.slice(0, 8)}`, subtitle: `$${inv.amount} USDC` });
                });
            }

            if (linksRes?.ok) {
                const data = await linksRes.json();
                (data.data?.documents || []).slice(0, 3).forEach((link: any) => {
                    results.push({ type: 'payment_link', id: link.id, title: link.title || `LINK-${link.id.slice(0, 8)}`, subtitle: `$${link.amount} USDC` });
                });
            }

            if (recurringRes?.ok) {
                const data = await recurringRes.json();
                const recurringMatches = (data.data?.recurringInvoices || []).filter((ri: any) => {
                    const q = query.toLowerCase();
                    return (
                        String(ri.title || '').toLowerCase().includes(q) ||
                        String(ri.clientName || '').toLowerCase().includes(q) ||
                        String(ri.clientEmail || '').toLowerCase().includes(q) ||
                        String(ri.frequency || '').toLowerCase().includes(q)
                    );
                });
                recurringMatches.slice(0, 3).forEach((ri: any) => {
                    results.push({
                        type: 'recurring_invoice',
                        id: ri.id,
                        title: ri.title || `REC-${ri.id.slice(0, 8)}`,
                        subtitle: `${ri.clientName || ri.clientEmail || 'No client'} • ${ri.frequency || 'monthly'}`,
                    });
                });
            }

            if (conversationsRes?.ok) {
                const data = await conversationsRes.json();
                (data.data || []).slice(0, 3).forEach((conv: any) => {
                    results.push({ type: 'conversation', id: conv.id, title: conv.title || 'Chat', subtitle: new Date(conv.updated_at).toLocaleDateString() });
                });
            }

            // Also filter local menu items
            const menuItems = [
                { type: 'menu', id: '/', title: 'Home', subtitle: 'Go to home screen' },
                { type: 'menu', id: '/invoices', title: 'Invoices', subtitle: 'View all invoices' },
                { type: 'menu', id: '/payment-links', title: 'Payment Links', subtitle: 'View payment links' },
                { type: 'menu', id: '/transactions', title: 'Transactions', subtitle: 'View transactions' },
                { type: 'menu', id: '/offramp-history', title: 'Withdrawals', subtitle: 'View withdrawal history' },
                { type: 'menu', id: '/calendar', title: 'Calendar', subtitle: 'View calendar events' },
                { type: 'menu', id: '/settings', title: 'Settings', subtitle: 'App settings' },
            ];

            const matchingMenus = menuItems.filter(m =>
                m.title.toLowerCase().includes(query.toLowerCase())
            );

            setSearchResults([...matchingMenus, ...results]);
        } catch (error) {
            console.error('Search error:', error);
        } finally {
            setIsSearching(false);
        }
    }, [getAccessToken]);

    // Handle search input change with debounce
    const handleSearchChange = (text: string) => {
        setSearchQuery(text);
        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current);
        }
        searchTimeoutRef.current = setTimeout(() => {
            performSearch(text);
        }, 300);
    };

    const handleSearchResultPress = (result: any) => {
        setSearchQuery('');
        setSearchResults([]);
        onClose();

        switch (result.type) {
            case 'menu':
                router.push(result.id as any);
                break;
            case 'invoice':
                router.push(`/invoices?selected=${result.id}` as any);
                break;
            case 'recurring_invoice':
                router.push(`/invoices?filter=recurring&selectedRecurring=${result.id}` as any);
                break;
            case 'payment_link':
                router.push(`/payment-links?selected=${result.id}` as any);
                break;
            case 'conversation':
                if (onLoadConversation) onLoadConversation(result.id);
                break;
        }
    };

    const backdropOpacity = animValue.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 0.5],
    });

    const sidebarTranslateX = animValue.interpolate({
        inputRange: [0, 1],
        outputRange: [-SIDEBAR_WIDTH, 0],
    });

    // Airbnb-style menu item with active state as black pill
    // Airbnb-style menu item with active state as black pill
    const renderMenuItem = (icon: any, label: string, isActive: boolean, onPress: () => void) => (
        <TouchableOpacity
            style={[styles.menuItem, isActive && styles.menuItemActive]}
            onPress={async () => {
                if (hapticsEnabled) {
                    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                }
                onPress();
            }}
        >
            <View style={[styles.menuIcon, isActive && styles.menuIconActive]}>
                <HugeiconsIcon
                    icon={icon}
                    size={22}
                    color={isActive ? '#FFFFFF' : themeColors.textPrimary}
                    strokeWidth={SIDEBAR_ICON_STROKE}
                />
            </View>
            <Text style={[styles.menuText, { color: themeColors.textPrimary }, isActive && styles.menuTextActive]}>{label}</Text>
        </TouchableOpacity>
    );

    if (!isVisible) return null;

    return (
        <View style={styles.overlay}>
            {/* Backdrop */}
            <Animated.View
                style={[
                    styles.backdrop,
                    { opacity: backdropOpacity }
                ]}
            >
                <TouchableOpacity
                    style={StyleSheet.absoluteFill}
                    activeOpacity={1}
                    onPress={onClose}
                />
            </Animated.View>

            {/* Sidebar Content */}
            <Animated.View
                style={[
                    styles.sidebarContainer,
                    { backgroundColor: themeColors.background },
                    {
                        transform: [{ translateX: sidebarTranslateX }],
                        paddingTop: insets.top + 16,
                        paddingBottom: insets.bottom + 16,
                    }
                ]}
            >
                {/* Search Header */}
                <View style={styles.searchHeader}>
                    <View style={[styles.searchContainer, { backgroundColor: themeColors.surface }]}>
                        <HugeiconsIcon icon={SEARCH_ICON} size={20} color={themeColors.textSecondary} strokeWidth={SIDEBAR_ICON_STROKE} />
                        <TextInput
                            style={[styles.searchInput, { color: themeColors.textPrimary }]}
                            placeholder="Search..."
                            placeholderTextColor={themeColors.textSecondary}
                            value={searchQuery}
                            onChangeText={handleSearchChange}
                            returnKeyType="search"
                        />
                        {searchQuery.length > 0 && (
                            <TouchableOpacity onPress={() => { setSearchQuery(''); setSearchResults([]); }}>
                                <HugeiconsIcon icon={CLOSE_ICON} size={18} color={themeColors.textSecondary} strokeWidth={SIDEBAR_ICON_STROKE} />
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                {/* Search Results */}
                {searchQuery.length > 0 && (
                    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                        <ScrollView
                            style={[styles.searchResultsContainer, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}
                            onScrollBeginDrag={Keyboard.dismiss}
                            keyboardShouldPersistTaps="handled"
                        >
                            {isSearching ? (
                                <ActivityIndicator size="small" color={Colors.primary} style={{ marginVertical: 20 }} />
                            ) : searchResults.length > 0 ? (
                                searchResults.map((result, index) => (
                                    <TouchableOpacity
                                        key={`${result.type}-${result.id}-${index}`}
                                        style={[styles.searchResultItem, { borderBottomColor: themeColors.border }]}
                                        onPress={() => handleSearchResultPress(result)}
                                    >
                                        <View style={[styles.searchResultIcon, { backgroundColor: themeColors.background }]}>
                                            {result.type === 'invoice' && <HugeiconsIcon icon={INVOICE_ICON} size={18} color={themeColors.textPrimary} strokeWidth={SIDEBAR_ICON_STROKE} />}
                                            {result.type === 'recurring_invoice' && <HugeiconsIcon icon={INVOICE_ICON} size={18} color={themeColors.textPrimary} strokeWidth={SIDEBAR_ICON_STROKE} />}
                                            {result.type === 'payment_link' && <HugeiconsIcon icon={LINK_ICON} size={18} color={themeColors.textPrimary} strokeWidth={SIDEBAR_ICON_STROKE} />}
                                            {result.type === 'conversation' && <HugeiconsIcon icon={CHAT_ICON} size={18} color={themeColors.textPrimary} strokeWidth={SIDEBAR_ICON_STROKE} />}
                                            {result.type === 'menu' && <HugeiconsIcon icon={HOME_ICON} size={18} color={themeColors.textPrimary} strokeWidth={SIDEBAR_ICON_STROKE} />}
                                        </View>
                                        <View style={styles.searchResultText}>
                                            <Text style={[styles.searchResultTitle, { color: themeColors.textPrimary }]} numberOfLines={1}>{result.title}</Text>
                                            <Text style={[styles.searchResultSubtitle, { color: themeColors.textSecondary }]} numberOfLines={1}>{result.subtitle}</Text>
                                        </View>
                                    </TouchableOpacity>
                                ))
                            ) : (
                                <Text style={[styles.noResultsText, { color: themeColors.textSecondary }]}>No results found</Text>
                            )}
                        </ScrollView>
                    </TouchableWithoutFeedback>
                )}

                {/* Only show menu when not searching */}
                {searchQuery.length === 0 && (
                    <>
                        <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
                            {/* Primary Navigation */}
                            <View style={styles.menuSection}>
                                {renderMenuItem(
                                    HOME_ICON,
                                    'Home',
                                    pathname === '/',
                                    () => {
                                        if (onHomeClick) onHomeClick();
                                        else handleNavigation('/');
                                    }
                                )}
                                {renderMenuItem(
                                    INVOICE_ICON,
                                    'Invoices',
                                    pathname === '/invoices',
                                    () => handleNavigation('/invoices')
                                )}
                                {renderMenuItem(
                                    LINK_ICON,
                                    'Payment Links',
                                    pathname === '/payment-links',
                                    () => handleNavigation('/payment-links')
                                )}
                                {renderMenuItem(
                                    CLIENTS_ICON,
                                    'Clients',
                                    pathname === '/clients',
                                    () => handleNavigation('/clients')
                                )}
                                {renderMenuItem(
                                    PROJECTS_ICON,
                                    'Projects',
                                    pathname === '/projects',
                                    () => handleNavigation('/projects')
                                )}
                                {renderMenuItem(
                                    CONTRACTS_ICON,
                                    'Contracts',
                                    pathname === '/contracts',
                                    () => handleNavigation('/contracts')
                                )}
                                {renderMenuItem(
                                    ANALYTICS_ICON,
                                    'Insights',
                                    pathname === '/insights',
                                    () => handleNavigation('/insights')
                                )}
                                {renderMenuItem(
                                    CALENDAR_ICON,
                                    'Calendar',
                                    pathname === '/calendar',
                                    () => handleNavigation('/calendar')
                                )}
                            </View>

                            {/* Previous Chats Section */}
                            {conversations.length > 0 && (
                                <View style={styles.settingsSection}>
                                    <Text style={[styles.sectionTitle, { color: themeColors.textSecondary }]}>PREVIOUS CHATS</Text>
                                    {conversations.slice(0, 5).map((conv) => {
                                        const ConversationItem = (
                                            <View style={styles.menuItem}>
                                                <View style={styles.menuIcon}>
                                                    <HugeiconsIcon icon={CHAT_ICON} size={22} color={themeColors.textPrimary} strokeWidth={SIDEBAR_ICON_STROKE} />
                                                </View>
                                                <Text
                                                    style={[
                                                        styles.menuText,
                                                        { color: themeColors.textPrimary }
                                                    ]}
                                                    numberOfLines={1}
                                                >
                                                    {conv.title || 'Untitled Chat'}
                                                </Text>
                                            </View>
                                        );

                                        // iOS: Use expo-router Link for peek/pop
                                        if (Platform.OS === 'ios') {
                                            return (
                                                <Link
                                                    key={conv.id}
                                                    href={`/?conversationId=${conv.id}`}
                                                >
                                                    <Link.Trigger>
                                                        {ConversationItem}
                                                    </Link.Trigger>
                                                    <Link.Preview style={{ width: 280, height: 160 }}>
                                                        <View style={{ flex: 1, padding: 16, backgroundColor: themeColors.background, justifyContent: 'center' }}>
                                                            <HugeiconsIcon icon={CHAT_ICON} size={32} color={Colors.primary} strokeWidth={SIDEBAR_ICON_STROKE} style={{ marginBottom: 12 }} />
                                                            <Text style={{ fontSize: 16, fontFamily: 'GoogleSansFlex_600SemiBold', color: themeColors.textPrimary }} numberOfLines={2}>
                                                                {conv.title || 'Untitled Chat'}
                                                            </Text>
                                                        </View>
                                                    </Link.Preview>
                                                    <Link.Menu>
                                                        <Link.MenuAction
                                                            title="Share"
                                                            icon="square.and.arrow.up"
                                                            onPress={async () => {
                                                                try {
                                                                    await Share.share({
                                                                        message: `Check out this conversation: ${conv.title || 'Untitled Chat'}`,
                                                                    });
                                                                } catch (error) {
                                                                    console.error('Share failed:', error);
                                                                }
                                                            }}
                                                        />
                                                        <Link.MenuAction
                                                            title="Delete"
                                                            icon="trash"
                                                            destructive
                                                            onPress={() => {
                                                                if (onDeleteConversation) {
                                                                    onDeleteConversation(conv.id);
                                                                }
                                                            }}
                                                        />
                                                    </Link.Menu>
                                                </Link>
                                            );
                                        }

                                        // Fallback: Simple TouchableOpacity
                                        return (
                                            <TouchableOpacity
                                                key={conv.id}
                                                onPress={() => {
                                                    onClose();
                                                    if (onLoadConversation) onLoadConversation(conv.id);
                                                }}
                                                onLongPress={() => {
                                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                                    Alert.alert(
                                                        conv.title || 'Untitled Chat',
                                                        undefined,
                                                        [
                                                            {
                                                                text: 'Share',
                                                                onPress: async () => {
                                                                    try {
                                                                        await Share.share({
                                                                            message: `Check out this conversation: ${conv.title || 'Untitled Chat'}`,
                                                                        });
                                                                    } catch (error) {
                                                                        console.error('Share failed:', error);
                                                                    }
                                                                }
                                                            },
                                                            {
                                                                text: 'Delete',
                                                                style: 'destructive',
                                                                onPress: () => {
                                                                    if (onDeleteConversation) {
                                                                        onDeleteConversation(conv.id);
                                                                    }
                                                                }
                                                            },
                                                            { text: 'Cancel', style: 'cancel' }
                                                        ]
                                                    );
                                                }}
                                            >
                                                {ConversationItem}
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            )}

                            {/* Settings Section */}
                            <View style={styles.settingsSection}>
                                <Text style={[styles.sectionTitle, { color: themeColors.textSecondary }]}>SETTINGS</Text>
                                {renderMenuItem(
                                    TRANSACTION_ICON,
                                    'Transactions',
                                    pathname === '/transactions',
                                    () => handleNavigation('/transactions')
                                )}
                                {renderMenuItem(
                                    WITHDRAWAL_ICON,
                                    'Withdrawals',
                                    pathname === '/offramp-history',
                                    () => handleNavigation('/offramp-history')
                                )}
                                {renderMenuItem(
                                    SETTINGS_ICON,
                                    'Settings',
                                    pathname === '/settings',
                                    () => handleNavigation('/settings')
                                )}
                            </View>
                        </ScrollView>
                    </>
                )}
            </Animated.View>
        </View>
    );
};

const styles = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 1000,
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#000000',
    },
    sidebarContainer: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
        width: SIDEBAR_WIDTH,
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 20,
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
    },
    searchHeader: {
        marginBottom: 24,
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F3F4F6',
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        gap: 10,
    },
    searchInput: {
        flex: 1,
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 17,
        color: Colors.textPrimary,
        padding: 0,
    },
    searchResultsContainer: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#F3F4F6',
        maxHeight: 300,
    },
    searchResultItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    searchResultIcon: {
        width: 32,
        height: 32,
        borderRadius: 8,
        backgroundColor: '#EEF2FF',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    searchResultText: {
        flex: 1,
    },
    searchResultTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 14,
        color: Colors.textPrimary,
        marginBottom: 2,
    },
    searchResultSubtitle: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 12,
        color: Colors.textSecondary,
    },
    noResultsText: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 14,
        color: Colors.textSecondary,
        textAlign: 'center',
        paddingVertical: 20,
    },
    scrollContent: {
        flex: 1,
    },
    menuSection: {
        marginBottom: 8,
    },
    settingsSection: {
        marginTop: 8,
    },
    sectionTitle: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 12,
        color: Colors.textSecondary,
        letterSpacing: 0.5,
        marginBottom: 12,
        marginLeft: 4,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: 100,
        marginBottom: 4,
    },
    menuItemActive: {
        backgroundColor: Colors.primary,
    },
    menuIcon: {
        marginRight: 14,
        width: 24,
        alignItems: 'center',
    },
    menuIconActive: {
        // Icon color is handled in the render function
    },
    menuText: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 17,
        color: Colors.textPrimary,
    },
    menuTextActive: {
        color: '#FFFFFF',
        fontFamily: 'GoogleSansFlex_500Medium',
    },
    feedbackButtonText: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 16,
        color: Colors.textPrimary,
    },
});
