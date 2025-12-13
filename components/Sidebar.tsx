import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Dimensions, ScrollView, Platform, Alert } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { usePrivy } from '@privy-io/expo';
import { House, Link, Receipt, Chat, CaretRight, SignOut, ArrowsLeftRight } from 'phosphor-react-native';
import { Colors } from '../theme/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

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
    const { user, logout } = usePrivy();
    const insets = useSafeAreaInsets();

    // Animation value: 0 (closed) to 1 (open)
    const animValue = useRef(new Animated.Value(0)).current;

    const [isVisible, setIsVisible] = React.useState(isOpen);

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

    const handleLogout = async () => {
        try {
            await logout();
            router.replace('/auth/welcome' as any);
        } catch (error) {
            console.error('Logout failed:', error);
        }
    };

    const handleNavigation = (path: string) => {
        onClose();
        if (pathname !== path) {
            router.push(path as any);
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
            onPress={onPress}
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
                <View style={styles.header}>
                    <Text style={styles.greeting}>
                        Hi <Text style={styles.nameHighlight}>{userName?.firstName || 'User'}!</Text>
                    </Text>
                </View>

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

                    <TouchableOpacity style={styles.logoutItem} onPress={handleLogout}>
                        <View style={styles.menuItemLeft}>
                            <View style={styles.menuIcon}>
                                <SignOut size={22} color={Colors.textPrimary} weight="bold" />
                            </View>
                            <Text style={styles.menuText}>Log out</Text>
                        </View>
                    </TouchableOpacity>
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
