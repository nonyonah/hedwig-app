import React, { useRef, useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Dimensions, ScrollView, Platform, Alert, TextInput, ActivityIndicator, Keyboard, TouchableWithoutFeedback } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { usePrivy } from '@privy-io/expo';
import { House, Link, Receipt, Chat, CaretRight, SignOut, ArrowsLeftRight, Gear, MagnifyingGlass, X, Bank } from 'phosphor-react-native';
import { Colors } from '../theme/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useSettings } from '../context/SettingsContext';

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
    const insets = useSafeAreaInsets();

    // Animation value: 0 (closed) to 1 (open)
    const animValue = useRef(new Animated.Value(0)).current;

    const [isVisible, setIsVisible] = React.useState(isOpen);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
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

    const renderMenuItem = (icon: React.ReactNode, label: string, isActive: boolean, onPress: () => void) => (
        <TouchableOpacity
            style={styles.menuItem}
            onPress={async () => {
                if (hapticsEnabled) {
                    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                }
                onPress();
            }}
        >
            <View style={styles.menuItemLeft}>
                <View style={styles.menuIcon}>{icon}</View>
                <Text style={[styles.menuText, isActive && styles.menuTextActive]}>{label}</Text>
            </View>
            <CaretRight size={16} color="#9CA3AF" weight="bold" />
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
                    {
                        transform: [{ translateX: sidebarTranslateX }],
                        paddingTop: insets.top + 20,
                        paddingBottom: insets.bottom + 20,
                    }
                ]}
            >
                {/* Search Header */}
                <View style={styles.searchHeader}>
                    <View style={styles.searchContainer}>
                        <MagnifyingGlass size={20} color={Colors.textSecondary} />
                        <TextInput
                            style={styles.searchInput}
                            placeholder="Search invoices, chats..."
                            placeholderTextColor={Colors.textSecondary}
                            value={searchQuery}
                            onChangeText={handleSearchChange}
                            returnKeyType="search"
                        />
                        {searchQuery.length > 0 && (
                            <TouchableOpacity onPress={() => { setSearchQuery(''); setSearchResults([]); }}>
                                <X size={18} color={Colors.textSecondary} />
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                {/* Search Results */}
                {searchQuery.length > 0 && (
                    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                        <ScrollView
                            style={styles.searchResultsContainer}
                            onScrollBeginDrag={Keyboard.dismiss}
                            keyboardShouldPersistTaps="handled"
                        >
                            {isSearching ? (
                                <ActivityIndicator size="small" color={Colors.primary} style={{ marginVertical: 20 }} />
                            ) : searchResults.length > 0 ? (
                                searchResults.map((result, index) => (
                                    <TouchableOpacity
                                        key={`${result.type}-${result.id}-${index}`}
                                        style={styles.searchResultItem}
                                        onPress={() => handleSearchResultPress(result)}
                                    >
                                        <View style={styles.searchResultIcon}>
                                            {result.type === 'invoice' && <Receipt size={18} color={Colors.primary} />}
                                            {result.type === 'payment_link' && <Link size={18} color={Colors.primary} />}
                                            {result.type === 'conversation' && <Chat size={18} color={Colors.primary} />}
                                            {result.type === 'menu' && <House size={18} color={Colors.primary} />}
                                        </View>
                                        <View style={styles.searchResultText}>
                                            <Text style={styles.searchResultTitle} numberOfLines={1}>{result.title}</Text>
                                            <Text style={styles.searchResultSubtitle} numberOfLines={1}>{result.subtitle}</Text>
                                        </View>
                                        <CaretRight size={14} color={Colors.textSecondary} />
                                    </TouchableOpacity>
                                ))
                            ) : (
                                <Text style={styles.noResultsText}>No results found</Text>
                            )}
                        </ScrollView>
                    </TouchableWithoutFeedback>
                )}

                {/* Only show menu when not searching */}
                {searchQuery.length === 0 && (
                    <>
                        <View style={styles.divider} />

                        <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
                            {/* Navigation Menu */}
                            <View style={styles.menuSection}>
                                {renderMenuItem(
                                    <House size={22} color={Colors.textPrimary} weight="bold" />,
                                    'Home',
                                    pathname === '/',
                                    () => {
                                        if (onHomeClick) onHomeClick();
                                        else handleNavigation('/');
                                    }
                                )}
                                {renderMenuItem(
                                    <Link size={22} color={Colors.textPrimary} weight="bold" />,
                                    'Payment Links',
                                    pathname === '/payment-links',
                                    () => handleNavigation('/payment-links')
                                )}
                                {renderMenuItem(
                                    <Receipt size={22} color={Colors.textPrimary} weight="bold" />,
                                    'Invoices',
                                    pathname === '/invoices',
                                    () => handleNavigation('/invoices')
                                )}
                                {renderMenuItem(
                                    <Chat size={22} color={Colors.textPrimary} weight="bold" />,
                                    'Chats',
                                    pathname === '/chats',
                                    () => handleNavigation('/chats')
                                )}
                                {renderMenuItem(
                                    <ArrowsLeftRight size={22} color={Colors.textPrimary} weight="bold" />,
                                    'Transactions',
                                    pathname === '/transactions',
                                    () => handleNavigation('/transactions')
                                )}
                                {renderMenuItem(
                                    <Bank size={22} color={Colors.textPrimary} weight="bold" />,
                                    'Withdrawals',
                                    pathname === '/offramp-history',
                                    () => handleNavigation('/offramp-history')
                                )}
                                {renderMenuItem(
                                    <Gear size={22} color={Colors.textPrimary} weight="bold" />,
                                    'Settings',
                                    pathname === '/settings',
                                    () => handleNavigation('/settings')
                                )}
                            </View>

                            {/* Recent Chats */}
                            {conversations && conversations.length > 0 && (
                                <View style={styles.recentsSection}>
                                    <Text style={styles.sectionTitle}>
                                        Recent Chats
                                    </Text>
                                    {conversations.slice(0, 3).map((conv) => (
                                        <TouchableOpacity
                                            key={conv.id}
                                            style={styles.recentItem}
                                            onPress={() => {
                                                if (onLoadConversation) {
                                                    onLoadConversation(conv.id);
                                                    onClose();
                                                }
                                            }}
                                            onLongPress={async () => {
                                                if (onDeleteConversation) {
                                                    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                                                    Alert.alert(
                                                        'Delete Conversation',
                                                        'Are you sure you want to delete this conversation?',
                                                        [
                                                            { text: 'Cancel', style: 'cancel' },
                                                            {
                                                                text: 'Delete',
                                                                style: 'destructive',
                                                                onPress: () => onDeleteConversation(conv.id)
                                                            }
                                                        ]
                                                    );
                                                }
                                            }}
                                            delayLongPress={500}
                                        >
                                            <Chat size={18} color={Colors.textSecondary} weight="bold" />
                                            <Text style={styles.recentText} numberOfLines={1}>
                                                {conv.title || 'Untitled'}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}


                        </ScrollView>

                        <View style={styles.footer}>
                            <TouchableOpacity style={styles.footerLink}>
                                <Text style={styles.footerText}>Feedback</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.footerLink}>
                                <Text style={styles.footerText}>Contact us</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.footerLink}>
                                <Text style={styles.footerText}>What's new</Text>
                            </TouchableOpacity>
                        </View>
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
        paddingHorizontal: 24,
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
    },
    headerContainer: {
        marginBottom: 24,
        minHeight: 40,
        justifyContent: 'center',
    },
    header: {
        marginBottom: 24,
    },
    greeting: {
        fontFamily: 'RethinkSans_700Bold',
        fontSize: 32,
        color: Colors.textPrimary,
    },
    nameHighlight: {
        color: Colors.textPrimary,
    },
    searchHeader: {
        marginBottom: 16,
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
        fontFamily: 'RethinkSans_400Regular',
        fontSize: 16,
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
        fontFamily: 'RethinkSans_600SemiBold',
        fontSize: 14,
        color: Colors.textPrimary,
        marginBottom: 2,
    },
    searchResultSubtitle: {
        fontFamily: 'RethinkSans_400Regular',
        fontSize: 12,
        color: Colors.textSecondary,
    },
    noResultsText: {
        fontFamily: 'RethinkSans_400Regular',
        fontSize: 14,
        color: Colors.textSecondary,
        textAlign: 'center',
        paddingVertical: 20,
    },
    divider: {
        height: 1,
        backgroundColor: '#F3F4F6',
        marginBottom: 24,
    },
    scrollContent: {
        flex: 1,
    },
    menuSection: {
        marginBottom: 32,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 16,
    },
    menuItemLeft: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    menuIcon: {
        marginRight: 16,
        width: 24,
        alignItems: 'center',
    },
    menuText: {
        fontFamily: 'RethinkSans_600SemiBold',
        fontSize: 16,
        color: Colors.textPrimary,
    },
    menuTextActive: {
        color: Colors.primary,
        fontFamily: 'RethinkSans_700Bold',
    },
    logoutItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        marginTop: 12,
    },
    recentsSection: {
        marginBottom: 32,
    },
    sectionTitle: {
        fontFamily: 'RethinkSans_700Bold',
        fontSize: 18,
        color: Colors.textPrimary,
        marginBottom: 16,
    },
    recentItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 8,
        marginBottom: 4,
        backgroundColor: '#F9FAFB',
        borderRadius: 8,
    },
    recentText: {
        fontFamily: 'RethinkSans_500Medium',
        fontSize: 14,
        color: Colors.textPrimary,
        marginLeft: 12,
        flex: 1,
    },
    footer: {
        marginTop: 24,
    },
    footerLink: {
        paddingVertical: 8,
    },
    footerText: {
        fontFamily: 'RethinkSans_500Medium',
        fontSize: 13,
        color: Colors.textPrimary,
    },
});
