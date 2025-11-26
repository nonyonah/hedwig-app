import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Dimensions, Image } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { usePrivy } from '@privy-io/expo';
import { House, ClockCounterClockwise, Link, Swap, Gear, SignOut, Chat, UserCircle } from 'phosphor-react-native';
import { Colors } from '../theme/colors';
import { Typography } from '../styles/typography';

const { width } = Dimensions.get('window');

interface SidebarProps {
    isOpen: boolean;
    onClose: () => void;
    userName?: { firstName: string; lastName: string };
    conversations?: any[];
    currentConversationId?: string | null;
    onLoadConversation?: (id: string) => void;
    onHomeClick?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
    isOpen,
    onClose,
    userName,
    conversations = [],
    currentConversationId,
    onLoadConversation,
    onHomeClick
}) => {
    const router = useRouter();
    const pathname = usePathname();
    const { user, logout } = usePrivy();
    const sidebarAnim = useRef(new Animated.Value(-width * 0.8)).current;

    useEffect(() => {
        Animated.timing(sidebarAnim, {
            toValue: isOpen ? 0 : -width * 0.8,
            duration: 300,
            useNativeDriver: true,
        }).start();
    }, [isOpen]);

    const handleLogout = async () => {
        try {
            await logout();
            router.replace('/auth/welcome');
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

    return (
        <Animated.View
            style={[
                styles.sidebarOverlay,
                {
                    opacity: sidebarAnim.interpolate({
                        inputRange: [-width * 0.8, 0],
                        outputRange: [0, 1],
                    }),
                }
            ]}
            pointerEvents={isOpen ? 'auto' : 'none'}
        >
            <TouchableOpacity
                style={styles.sidebarOverlayTouchable}
                activeOpacity={1}
                onPress={onClose}
            >
                <Animated.View
                    style={[
                        styles.sidebar,
                        { transform: [{ translateX: sidebarAnim }] }
                    ]}
                >
                    <View style={styles.sidebarContent}>
                        <TouchableOpacity
                            style={styles.sidebarItem}
                            onPress={() => {
                                if (onHomeClick) onHomeClick();
                                else handleNavigation('/');
                            }}
                        >
                            <House size={24} color={Colors.textPrimary} />
                            <Text style={styles.sidebarItemText}>Home</Text>
                        </TouchableOpacity>

                        {/* Recent Conversations Section - Only show if provided */}
                        {conversations.length > 0 && onLoadConversation && (
                            <View style={styles.historySection}>
                                <Text style={styles.historySectionTitle}>Recent Chats</Text>
                                {conversations.map((conv: any) => (
                                    <TouchableOpacity
                                        key={conv.id}
                                        style={[
                                            styles.historyItem,
                                            conv.id === currentConversationId && styles.historyItemActive
                                        ]}
                                        onPress={() => onLoadConversation(conv.id)}
                                    >
                                        <Chat size={20} color={conv.id === currentConversationId ? Colors.primary : Colors.textSecondary} />
                                        <View style={styles.historyItemText}>
                                            <Text style={styles.historyItemTitle} numberOfLines={1}>
                                                {conv.title || 'New conversation'}
                                            </Text>
                                            <Text style={styles.historyItemSubtitle}>
                                                {new Date(conv.updated_at).toLocaleDateString()}
                                            </Text>
                                        </View>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}

                        <View style={styles.sidebarDivider} />

                        <TouchableOpacity style={styles.sidebarItem}>
                            <ClockCounterClockwise size={24} color={Colors.textPrimary} />
                            <Text style={styles.sidebarItemText}>Transactions</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.sidebarItem}
                            onPress={() => handleNavigation('/payment-links')}
                        >
                            <Link size={24} color={Colors.textPrimary} />
                            <Text style={styles.sidebarItemText}>Payment Links</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.sidebarItem}>
                            <Swap size={24} color={Colors.textPrimary} />
                            <Text style={styles.sidebarItemText}>Swap</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.sidebarItem}>
                            <Gear size={24} color={Colors.textPrimary} />
                            <Text style={styles.sidebarItemText}>Settings</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.sidebarFooter}>
                        <View style={styles.userProfile}>
                            <View style={styles.avatarPlaceholder} />
                            <Text style={styles.userName}>
                                {userName?.firstName && userName?.lastName
                                    ? `${userName.firstName} ${userName.lastName}`
                                    : (user as any)?.email?.address?.split('@')[0] || 'User'}
                            </Text>
                        </View>
                        <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
                            <SignOut size={24} color={Colors.error} />
                        </TouchableOpacity>
                    </View>
                </Animated.View>
            </TouchableOpacity>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    sidebarOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1000,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    sidebarOverlayTouchable: {
        flex: 1,
    },
    sidebar: {
        width: width * 0.8,
        height: '100%',
        backgroundColor: '#FFFFFF',
        paddingTop: 60,
        paddingBottom: 40,
        shadowColor: '#000',
        shadowOffset: { width: 2, height: 0 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 5,
    },
    sidebarContent: {
        flex: 1,
        paddingHorizontal: 24,
    },
    sidebarItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        gap: 16,
    },
    sidebarItemText: {
        ...Typography.body,
        fontWeight: '500',
        color: Colors.textPrimary,
    },
    sidebarDivider: {
        height: 1,
        backgroundColor: '#E5E7EB',
        marginVertical: 16,
    },
    historySection: {
        marginTop: 8,
        marginBottom: 16,
    },
    historySectionTitle: {
        ...Typography.caption,
        fontWeight: '600',
        color: Colors.textSecondary,
        marginBottom: 12,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    historyItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 12,
        gap: 12,
        borderRadius: 12,
        marginBottom: 4,
    },
    historyItemActive: {
        backgroundColor: '#EFF6FF',
    },
    historyItemText: {
        flex: 1,
    },
    historyItemTitle: {
        ...Typography.body,
        fontSize: 14,
        fontWeight: '500',
        color: Colors.textPrimary,
    },
    historyItemSubtitle: {
        ...Typography.caption,
        fontSize: 11,
        color: Colors.textSecondary,
    },
    sidebarFooter: {
        paddingHorizontal: 24,
        paddingTop: 24,
        borderTopWidth: 1,
        borderTopColor: '#E5E7EB',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    userProfile: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    avatarPlaceholder: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: Colors.primary,
    },
    userName: {
        ...Typography.body,
        fontWeight: '600',
        color: Colors.textPrimary,
    },
    logoutButton: {
        padding: 8,
    },
});
