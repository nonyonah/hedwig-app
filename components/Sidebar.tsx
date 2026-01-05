import React, { useRef, useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Dimensions, ScrollView, Platform, Alert, TextInput, ActivityIndicator, Keyboard, TouchableWithoutFeedback } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { usePrivy } from '@privy-io/expo';
import { House, Link, Receipt, Chat, SignOut, ArrowsLeftRight, Gear, MagnifyingGlass, X, Bank, Users, PaperPlaneTilt, Briefcase, FileText } from 'phosphor-react-native';
import { Colors, useThemeColors } from '../theme/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useSettings } from '../context/SettingsContext';
import { FeedbackModal } from './FeedbackModal';

const { width, height } = Dimensions.get('window');
const SIDEBAR_WIDTH = width * 0.85;

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
    const [showFeedbackModal, setShowFeedbackModal] = useState(false);
    const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

            // Search invoices, payment links, and conversations in parallel
            const [invoicesRes, linksRes, conversationsRes] = await Promise.all([
                fetch(`${apiUrl}/api/documents?type=INVOICE&search=${encodeURIComponent(query)}`, {
                    headers: token ? { 'Authorization': `Bearer ${token}` } : {}
                }).catch(() => null),
                fetch(`${apiUrl}/api/documents?type=PAYMENT_LINK&search=${encodeURIComponent(query)}`, {
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
    const renderMenuItem = (icon: React.ReactNode, label: string, isActive: boolean, onPress: () => void) => (
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
                {React.cloneElement(icon as React.ReactElement<{ color: string }>, {
                    color: isActive ? '#FFFFFF' : themeColors.textPrimary
                })}
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
                        <MagnifyingGlass size={20} color={themeColors.textSecondary} />
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
                                <X size={18} color={themeColors.textSecondary} />
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
                                            {result.type === 'invoice' && <Receipt size={18} color={Colors.primary} />}
                                            {result.type === 'payment_link' && <Link size={18} color={Colors.primary} />}
                                            {result.type === 'conversation' && <Chat size={18} color={Colors.primary} />}
                                            {result.type === 'menu' && <House size={18} color={Colors.primary} />}
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
                                    <House size={22} weight="bold" />,
                                    'Home',
                                    pathname === '/',
                                    () => {
                                        if (onHomeClick) onHomeClick();
                                        else handleNavigation('/');
                                    }
                                )}
                                {renderMenuItem(
                                    <Receipt size={22} weight="bold" />,
                                    'Invoices',
                                    pathname === '/invoices',
                                    () => handleNavigation('/invoices')
                                )}
                                {renderMenuItem(
                                    <Link size={22} weight="bold" />,
                                    'Payment Links',
                                    pathname === '/payment-links',
                                    () => handleNavigation('/payment-links')
                                )}
                                {renderMenuItem(
                                    <Users size={22} weight="bold" />,
                                    'Clients',
                                    pathname === '/clients',
                                    () => handleNavigation('/clients')
                                )}
                                {renderMenuItem(
                                    <Briefcase size={22} weight="bold" />,
                                    'Projects',
                                    pathname === '/projects',
                                    () => handleNavigation('/projects')
                                )}
                                {renderMenuItem(
                                    <FileText size={22} weight="bold" />,
                                    'Contracts',
                                    pathname === '/contracts',
                                    () => handleNavigation('/contracts')
                                )}
                            </View>

                            {/* Previous Chats Section */}
                            {conversations.length > 0 && (
                                <View style={styles.settingsSection}>
                                    <Text style={[styles.sectionTitle, { color: themeColors.textSecondary }]}>PREVIOUS CHATS</Text>
                                    {conversations.slice(0, 5).map((conv) => (
                                        <TouchableOpacity
                                            key={conv.id}
                                            style={styles.menuItem}
                                            onPress={async () => {
                                                if (hapticsEnabled) {
                                                    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                                }
                                                onClose();
                                                // Navigate to home with conversationId - works from any page
                                                if (pathname === '/') {
                                                    // Already on home, use callback
                                                    if (onLoadConversation) {
                                                        onLoadConversation(conv.id);
                                                    }
                                                } else {
                                                    // From other pages, navigate to home with param
                                                    router.push(`/?conversationId=${conv.id}` as any);
                                                }
                                            }}
                                            onLongPress={() => {
                                                if (onDeleteConversation) {
                                                    Alert.alert(
                                                        'Delete Chat',
                                                        'Are you sure you want to delete this conversation?',
                                                        [
                                                            { text: 'Cancel', style: 'cancel' },
                                                            { text: 'Delete', style: 'destructive', onPress: () => onDeleteConversation(conv.id) }
                                                        ]
                                                    );
                                                }
                                            }}
                                        >
                                            <View style={styles.menuIcon}>
                                                <Chat size={22} weight="bold" color={themeColors.textPrimary} />
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
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}

                            {/* Settings Section */}
                            <View style={styles.settingsSection}>
                                <Text style={[styles.sectionTitle, { color: themeColors.textSecondary }]}>SETTINGS</Text>
                                {renderMenuItem(
                                    <ArrowsLeftRight size={22} weight="bold" />,
                                    'Transactions',
                                    pathname === '/transactions',
                                    () => handleNavigation('/transactions')
                                )}
                                {renderMenuItem(
                                    <Bank size={22} weight="bold" />,
                                    'Withdrawals',
                                    pathname === '/offramp-history',
                                    () => handleNavigation('/offramp-history')
                                )}
                                {renderMenuItem(
                                    <Gear size={22} weight="bold" />,
                                    'Settings',
                                    pathname === '/settings',
                                    () => handleNavigation('/settings')
                                )}
                            </View>
                        </ScrollView>

                        {/* Footer - Give Feedback Button */}
                        <View style={[styles.footer, { borderTopColor: themeColors.border }]}>
                            <TouchableOpacity
                                style={[styles.feedbackButton, { borderColor: themeColors.border }]}
                                onPress={async () => {
                                    if (hapticsEnabled) {
                                        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                    }
                                    onClose();
                                    setShowFeedbackModal(true);
                                }}
                            >
                                <PaperPlaneTilt size={22} color={themeColors.textPrimary} weight="bold" />
                                <Text style={[styles.feedbackButtonText, { color: themeColors.textPrimary }]}>Give feedback</Text>
                            </TouchableOpacity>
                        </View>
                    </>
                )}
            </Animated.View>

            {/* Feedback Modal */}
            <FeedbackModal
                visible={showFeedbackModal}
                onClose={() => setShowFeedbackModal(false)}
            />
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
        fontFamily: 'GoogleSansFlex_600SemiBold',
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
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 17,
        color: Colors.textPrimary,
    },
    menuTextActive: {
        color: '#FFFFFF',
        fontFamily: 'GoogleSansFlex_600SemiBold',
    },
    footer: {
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: '#F3F4F6',
    },
    feedbackButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        paddingHorizontal: 24,
        borderRadius: 100,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        gap: 10,
    },
    feedbackButtonText: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 16,
        color: Colors.textPrimary,
    },
});
