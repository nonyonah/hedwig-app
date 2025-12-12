import React, { useRef, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Dimensions, ScrollView, Modal, TouchableWithoutFeedback } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { usePrivy } from '@privy-io/expo';
import { House, Link, Receipt, Chat, CaretRight, SignOut, Trash, CheckCircle, Circle } from 'phosphor-react-native';
import { Colors } from '../theme/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Alert } from 'react-native';
import { BlurView } from 'expo-blur';

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

    const [isVisible, setIsVisible] = useState(isOpen);

    // Selection Mode State
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedChats, setSelectedChats] = useState<Set<string>>(new Set());

    // Context Menu State
    const [contextMenuVisible, setContextMenuVisible] = useState(false);
    const [contextMenuTarget, setContextMenuTarget] = useState<{ id: string, title: string } | null>(null);

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
                // Exit selection mode on close
                setIsSelectionMode(false);
                setSelectedChats(new Set());
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

    // --- Multi-Select Logic ---

    const toggleSelection = (id: string) => {
        const newSelected = new Set(selectedChats);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedChats(newSelected);

        // Auto-exit if empty? Optional. Keeping it active feels better.
        if (newSelected.size === 0 && isSelectionMode) {
            // setIsSelectionMode(false); 
        }
    };

    const enterSelectionMode = (initialId: string) => {
        setIsSelectionMode(true);
        setSelectedChats(new Set([initialId]));
        setContextMenuVisible(false);
    };

    const deleteSelected = () => {
        Alert.alert(
            'Delete Chats',
            `Are you sure you want to delete ${selectedChats.size} conversation${selectedChats.size > 1 ? 's' : ''}?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        if (onDeleteConversation) {
                            // Batch delete (simulated by loop if backend doesn't support batch yet)
                            for (const id of selectedChats) {
                                onDeleteConversation(id);
                            }
                        }
                        setIsSelectionMode(false);
                        setSelectedChats(new Set());
                    }
                }
            ]
        );
    };

    const deleteSingle = (id: string) => {
        setContextMenuVisible(false);
        setTimeout(() => {
            Alert.alert(
                'Delete Conversation',
                'Are you sure you want to delete this conversation?',
                [
                    { text: 'Cancel', style: 'cancel' },
                    {
                        text: 'Delete',
                        style: 'destructive',
                        onPress: () => onDeleteConversation && onDeleteConversation(id)
                    }
                ]
            );
        }, 200);
    };

    // --- Context Menu ---

    const handleLongPress = async (chat: { id: string, title: string }) => {
        // Only show context menu if NOT in selection mode already
        if (isSelectionMode) return;

        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setContextMenuTarget(chat);
        setContextMenuVisible(true);
    };

    const renderMenuItem = (icon: React.ReactNode, label: string, isActive: boolean, onPress: () => void) => (
        <TouchableOpacity
            style={styles.menuItem}
            onPress={onPress}
            disabled={isSelectionMode} // Disable nav during selection
        >
            <View style={[styles.menuItemLeft, isSelectionMode && { opacity: 0.3 }]}>
                <View style={styles.menuIcon}>{icon}</View>
                <Text style={[styles.menuText, isActive && styles.menuTextActive]}>{label}</Text>
            </View>
            {!isSelectionMode && <CaretRight size={16} color="#9CA3AF" weight="bold" />}
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
                {/* Header or Selection Header */}
                <View style={styles.headerContainer}>
                    {isSelectionMode ? (
                        <View style={styles.selectionHeader}>
                            <TouchableOpacity onPress={() => {
                                setIsSelectionMode(false);
                                setSelectedChats(new Set());
                            }}>
                                <Text style={styles.cancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <Text style={styles.selectionTitle}>{selectedChats.size} Selected</Text>
                            <TouchableOpacity
                                onPress={deleteSelected}
                                disabled={selectedChats.size === 0}
                            >
                                <Text style={[styles.deleteText, selectedChats.size === 0 && { opacity: 0.5 }]}>
                                    Delete
                                </Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <View style={styles.header}>
                            <Text style={styles.greeting}>
                                Hi <Text style={styles.nameHighlight}>{userName?.firstName || 'User'}!</Text>
                            </Text>
                        </View>
                    )}
                </View>

                {!isSelectionMode && <View style={styles.divider} />}

                <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
                    {/* Navigation Menu (Dimmed in selection mode) */}
                    <View style={[styles.menuSection, isSelectionMode && { opacity: 0.3 }]}>
                        {renderMenuItem(
                            <House size={22} color={Colors.textPrimary} />,
                            'Home',
                            pathname === '/',
                            () => {
                                if (onHomeClick) onHomeClick();
                                else handleNavigation('/');
                            }
                        )}
                        {renderMenuItem(
                            <Link size={22} color={Colors.textPrimary} />,
                            'Payment Links',
                            pathname === '/payment-links',
                            () => handleNavigation('/payment-links')
                        )}
                        {renderMenuItem(
                            <Receipt size={22} color={Colors.textPrimary} />,
                            'Invoices',
                            pathname === '/invoices',
                            () => handleNavigation('/invoices')
                        )}
                        {renderMenuItem(
                            <Chat size={22} color={Colors.textPrimary} />,
                            'Chats',
                            pathname === '/chats',
                            () => handleNavigation('/chats')
                        )}
                    </View>

                    {/* Recent Chats */}
                    {conversations && conversations.length > 0 && (
                        <View style={styles.recentsSection}>
                            <Text style={[styles.sectionTitle, isSelectionMode && { opacity: 0.5 }]}>
                                Recent Chats
                            </Text>
                            {conversations.slice(0, 5).map((conv) => {
                                const isSelected = selectedChats.has(conv.id);
                                return (
                                    <TouchableOpacity
                                        key={conv.id}
                                        style={[
                                            styles.recentItem,
                                            isSelectionMode && isSelected && styles.recentItemSelected
                                        ]}
                                        onPress={() => {
                                            if (isSelectionMode) {
                                                toggleSelection(conv.id);
                                                Haptics.selectionAsync();
                                            } else {
                                                if (onLoadConversation) {
                                                    onLoadConversation(conv.id);
                                                    onClose();
                                                }
                                            }
                                        }}
                                        onLongPress={() => handleLongPress(conv)}
                                        delayLongPress={400} // Slightly quicker
                                        activeOpacity={0.7}
                                    >
                                        {isSelectionMode ? (
                                            <View style={styles.selectionIcon}>
                                                {isSelected ? (
                                                    <CheckCircle size={22} color={Colors.primary} weight="fill" />
                                                ) : (
                                                    <Circle size={22} color={Colors.textSecondary} />
                                                )}
                                            </View>
                                        ) : (
                                            <Chat size={18} color={Colors.textSecondary} weight="duotone" />
                                        )}

                                        <Text style={[
                                            styles.recentText,
                                            isSelectionMode && { marginLeft: 12 }
                                        ]} numberOfLines={1}>
                                            {conv.title || 'Untitled'}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    )}

                    {!isSelectionMode && (
                        <TouchableOpacity style={styles.logoutItem} onPress={handleLogout}>
                            <View style={styles.menuItemLeft}>
                                <View style={styles.menuIcon}>
                                    <SignOut size={22} color={Colors.textPrimary} />
                                </View>
                                <Text style={styles.menuText}>Log out</Text>
                            </View>
                        </TouchableOpacity>
                    )}
                </ScrollView>

                {!isSelectionMode && (
                    <View style={styles.footer}>
                        <TouchableOpacity style={styles.footerLink}>
                            <Text style={styles.footerText}>Frequently asked questions</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.footerLink}>
                            <Text style={styles.footerText}>Terms & conditions</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.footerLink}>
                            <Text style={styles.footerText}>Privacy notice</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </Animated.View>

            {/* Haptic Touch Context Menu Overlay */}
            <Modal
                visible={contextMenuVisible}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setContextMenuVisible(false)}
            >
                <TouchableWithoutFeedback onPress={() => setContextMenuVisible(false)}>
                    <View style={styles.modalOverlay}>
                        <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />

                        <View style={styles.contextMenuContainer}>
                            <View style={styles.contextMenuHeader}>
                                <Text style={styles.contextMenuTitle} numberOfLines={1}>
                                    {contextMenuTarget?.title || 'Chat Options'}
                                </Text>
                            </View>

                            <View style={styles.contextMenuItems}>
                                <TouchableOpacity
                                    style={styles.contextMenuItem}
                                    onPress={() => contextMenuTarget && enterSelectionMode(contextMenuTarget.id)}
                                >
                                    <Text style={styles.contextMenuText}>Select Chats</Text>
                                    <CheckCircle size={20} color={Colors.textPrimary} />
                                </TouchableOpacity>

                                <View style={styles.contextMenuDivider} />

                                <TouchableOpacity
                                    style={styles.contextMenuItem}
                                    onPress={() => contextMenuTarget && deleteSingle(contextMenuTarget.id)}
                                >
                                    <Text style={[styles.contextMenuText, { color: '#EF4444' }]}>Delete Chat</Text>
                                    <Trash size={20} color="#EF4444" />
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </TouchableWithoutFeedback>
            </Modal>
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
        // marginBottom: 24, 
    },
    selectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    cancelText: {
        fontFamily: 'RethinkSans_500Medium',
        fontSize: 16,
        color: Colors.primary,
    },
    selectionTitle: {
        fontFamily: 'RethinkSans_600SemiBold',
        fontSize: 16,
        color: Colors.textPrimary,
    },
    deleteText: {
        fontFamily: 'RethinkSans_600SemiBold',
        fontSize: 16,
        color: '#EF4444',
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
        fontFamily: 'RethinkSans_500Medium',
        fontSize: 16,
        color: Colors.textPrimary,
    },
    menuTextActive: {
        color: Colors.primary,
        fontFamily: 'RethinkSans_600SemiBold',
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
        fontFamily: 'RethinkSans_600SemiBold',
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
    recentItemSelected: {
        backgroundColor: '#EFF6FF',
    },
    selectionIcon: {
        width: 24,
        alignItems: 'center',
        marginRight: 0,
    },
    recentText: {
        fontFamily: 'RethinkSans_400Regular',
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
    // Context Menu Styles
    modalOverlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.2)', // Fallback if blur fails or extra scrim
    },
    contextMenuContainer: {
        width: 250,
        backgroundColor: 'rgba(255,255,255,0.95)',
        borderRadius: 14,
        overflow: 'hidden',
        // iOS Backdrop Shadow
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 10,
        },
        shadowOpacity: 0.3,
        shadowRadius: 20,
        elevation: 10,
    },
    contextMenuHeader: {
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0,0,0,0.1)',
        alignItems: 'center',
    },
    contextMenuTitle: {
        fontFamily: 'RethinkSans_600SemiBold',
        fontSize: 14,
        color: Colors.textSecondary,
    },
    contextMenuItems: {
        padding: 0,
    },
    contextMenuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        // height: 50,
    },
    contextMenuText: {
        fontFamily: 'RethinkSans_500Medium',
        fontSize: 16,
        color: Colors.textPrimary,
    },
    contextMenuDivider: {
        height: 1,
        backgroundColor: 'rgba(0,0,0,0.1)',
    },
});
