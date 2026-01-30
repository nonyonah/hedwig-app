import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Modal, Alert, Animated, RefreshControl, TextInput, KeyboardAvoidingView, Platform, ScrollView, Image } from 'react-native';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../hooks/useAuth';
import { Users, Plus, User, Envelope, Phone, Trash, PencilSimple, X, List, CurrencyDollar, Clock, Buildings } from 'phosphor-react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import * as Haptics from 'expo-haptics';
import { Colors, useThemeColors } from '../../theme/colors';
import { Typography } from '../../styles/typography';
import { Sidebar } from '../../components/Sidebar';
import { ProfileModal } from '../../components/ProfileModal';
import { LinearGradient } from 'expo-linear-gradient';
import Analytics from '../../services/analytics';
import { useAnalyticsScreen } from '../../hooks/useAnalyticsScreen';

interface Client {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    company?: string;
    totalEarnings: number;
    outstandingBalance: number;
    createdAt: string;
}

export default function ClientsScreen() {
    const router = useRouter();
    const { getAccessToken, user } = useAuth();
    const themeColors = useThemeColors();
    const [clients, setClients] = useState<Client[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [showFormModal, setShowFormModal] = useState(false);
    const [isEditing, setIsEditing] = useState(false);

    // Track page view
    useAnalyticsScreen('Clients');

    // Form state
    const [formName, setFormName] = useState('');
    const [formEmail, setFormEmail] = useState('');
    const [formPhone, setFormPhone] = useState('');
    const [formCompany, setFormCompany] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // Sidebar state
    const [conversations, setConversations] = useState<any[]>([]);
    const [userName, setUserName] = useState({ firstName: '', lastName: '' });

    // Profile modal state
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [profileIcon, setProfileIcon] = useState<{ type: 'gradient' | 'emoji' | 'image'; colorIndex?: number; emoji?: string; imageUri?: string }>({ type: 'gradient', colorIndex: 0 });
    const [walletAddresses, setWalletAddresses] = useState<{ evm?: string; solana?: string; bitcoin?: string }>({});

    // Profile color gradient options
    const PROFILE_COLOR_OPTIONS: readonly [string, string, string][] = [
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
    ];

    const slideAnim = useRef(new Animated.Value(0)).current;
    const formSlideAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        fetchClients();
    }, [user]);

    // Fetch user data and conversations for sidebar
    useEffect(() => {
        const fetchUserData = async () => {
            if (!user) return;
            try {
                const token = await getAccessToken();
                const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

                // Fetch user profile
                const profileResponse = await fetch(`${apiUrl}/api/users/profile`, {
                    headers: { 'Authorization': `Bearer ${token}` },
                });
                const profileData = await profileResponse.json();

                if (profileData.success && profileData.data) {
                    const userData = profileData.data.user || profileData.data;
                    setUserName({
                        firstName: userData.firstName || userData.displayName?.split(' ')[0] || '',
                        lastName: userData.lastName || userData.displayName?.split(' ').slice(1).join(' ') || ''
                    });

                    // Set profile icon
                    if (userData.avatar) {
                        try {
                            if (userData.avatar.trim().startsWith('{')) {
                                const parsed = JSON.parse(userData.avatar);
                                setProfileIcon(parsed);
                            } else {
                                setProfileIcon({ type: 'image', imageUri: userData.avatar });
                            }
                        } catch (e) {
                            setProfileIcon({ type: 'image', imageUri: userData.avatar });
                        }
                    } else if (userData.profileEmoji) {
                        setProfileIcon({ type: 'emoji', emoji: userData.profileEmoji });
                    } else if (userData.profileColorIndex !== undefined) {
                        setProfileIcon({ type: 'gradient', colorIndex: userData.profileColorIndex });
                    }

                    // Set wallet addresses
                    setWalletAddresses({
                        evm: userData.ethereumWalletAddress || userData.baseWalletAddress || userData.celoWalletAddress,
                        solana: userData.solanaWalletAddress
                    });
                }

                // Fetch recent conversations for sidebar
                const conversationsResponse = await fetch(`${apiUrl}/api/chat/conversations`, {
                    headers: { 'Authorization': `Bearer ${token}` },
                });
                if (conversationsResponse.ok) {
                    const conversationsData = await conversationsResponse.json();
                    if (conversationsData.success && conversationsData.data) {
                        setConversations(conversationsData.data.slice(0, 10)); // Get recent 10
                    }
                }
            } catch (error) {
                console.error('Failed to fetch user data:', error);
            }
        };
        fetchUserData();
    }, [user]);

    const fetchClients = async () => {
        try {
            const token = await getAccessToken();
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

            const response = await fetch(`${apiUrl}/api/clients`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
                console.error('Failed to fetch clients: HTTP', response.status);
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();

            if (data.success) {
                setClients(data.data.clients || []);
            } else {
                console.error('Failed to fetch clients:', data.error);
            }
        } catch (error) {
            console.error('Error fetching clients:', error);
            // Don't show alert for rate limiting, just log
        } finally {
            setIsLoading(false);
            setRefreshing(false);
        }
    };

    const onRefresh = () => {
        setRefreshing(true);
        fetchClients();
    };

    const handleDelete = async (clientId: string) => {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

        Alert.alert(
            'Delete Client',
            'Are you sure you want to delete this client? This action cannot be undone.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const token = await getAccessToken();
                            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

                            const response = await fetch(`${apiUrl}/api/clients/${clientId}`, {
                                method: 'DELETE',
                                headers: { 'Authorization': `Bearer ${token}` },
                            });

                            const data = await response.json();

                            if (data.success) {
                                setClients(prev => prev.filter(c => c.id !== clientId));
                                setShowDetailModal(false);
                                Alert.alert('Success', 'Client deleted successfully');
                            } else {
                                Alert.alert('Error', data.error?.message || 'Failed to delete client');
                            }
                        } catch (error) {
                            console.error('Failed to delete client:', error);
                            Alert.alert('Error', 'Failed to delete client');
                        }
                    }
                },
            ]
        );
    };

    const openDetailModal = (client: Client) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setSelectedClient(client);
        setShowDetailModal(true);
        Animated.spring(slideAnim, {
            toValue: 1,
            useNativeDriver: true,
            damping: 25,
            stiffness: 300,
        }).start();
    };

    const closeDetailModal = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        Animated.timing(slideAnim, {
            toValue: 0,
            duration: 250,
            useNativeDriver: true,
        }).start(() => setShowDetailModal(false));
    };

    const openFormModal = (client?: Client) => {
        if (client) {
            setIsEditing(true);
            setSelectedClient(client);
            setFormName(client.name);
            setFormEmail(client.email || '');
            setFormPhone(client.phone || '');
            setFormCompany(client.company || '');
        } else {
            setIsEditing(false);
            setSelectedClient(null);
            setFormName('');
            setFormEmail('');
            setFormPhone('');
            setFormCompany('');
        }
        setShowFormModal(true);
        Animated.spring(formSlideAnim, {
            toValue: 1,
            useNativeDriver: true,
            damping: 25,
            stiffness: 300,
        }).start();
    };

    const closeFormModal = () => {
        Animated.timing(formSlideAnim, {
            toValue: 0,
            duration: 250,
            useNativeDriver: true,
        }).start(() => {
            setShowFormModal(false);
            setFormName('');
            setFormEmail('');
            setFormPhone('');
            setFormCompany('');
        });
    };
    const handleSaveClient = async () => {
        if (!formName.trim()) {
            Alert.alert('Error', 'Name is required');
            return;
        }

        setIsSaving(true);
        try {
            const token = await getAccessToken();
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

            const method = isEditing ? 'PUT' : 'POST';
            const url = isEditing
                ? `${apiUrl}/api/clients/${selectedClient?.id}`
                : `${apiUrl}/api/clients`;

            const response = await fetch(url, {
                method,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: formName,
                    email: formEmail || undefined,
                    phone: formPhone || undefined,
                    company: formCompany || undefined,
                }),
            });

            if (!response.ok) {
                console.error('Failed to save client: HTTP', response.status);
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();

            if (data.success) {
                if (isEditing) {
                    setClients(prev => prev.map(c =>
                        c.id === selectedClient?.id ? data.data.client : c
                    ));
                } else {
                    setClients(prev => [data.data.client, ...prev]);
                    // Track client created
                    Analytics.clientCreated(user?.id || 'unknown', data.data.client.id);
                }
                closeFormModal();
                setShowDetailModal(false);
                Alert.alert('Success', `Client ${isEditing ? 'updated' : 'created'} successfully`);
            } else {
                Alert.alert('Error', data.error?.message || 'Failed to save client');
            }
        } catch (error) {
            console.error('Failed to save client:', error);
            Alert.alert('Error', 'Failed to save client');
        } finally {
            setIsSaving(false);
        }
    };

    const renderRightActions = (clientId: string) => (
        <TouchableOpacity style={styles.deleteAction} onPress={() => handleDelete(clientId)}>
            <Trash size={24} color="#FFF" weight="bold" />
        </TouchableOpacity>
    );

    const renderClientItem = ({ item }: { item: Client }) => {
        // Format earnings for the pill (e.g. $1.2k, $500) or time since added
        let pillText = '';
        let isEarnings = false;

        if (item.totalEarnings > 0) {
            isEarnings = true;
            if (item.totalEarnings >= 1000) {
                pillText = `$${(item.totalEarnings / 1000).toFixed(1)}k`;
            } else {
                pillText = `$${item.totalEarnings.toFixed(0)}`;
            }
        } else {
            // Show time since client was added
            const createdDate = new Date(item.createdAt);
            const now = new Date();
            const diffMs = now.getTime() - createdDate.getTime();
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

            if (diffDays === 0) {
                pillText = 'Today';
            } else if (diffDays === 1) {
                pillText = '1d ago';
            } else if (diffDays < 7) {
                pillText = `${diffDays}d ago`;
            } else if (diffDays < 30) {
                const weeks = Math.floor(diffDays / 7);
                pillText = `${weeks}w ago`;
            } else if (diffDays < 365) {
                const months = Math.floor(diffDays / 30);
                pillText = `${months}mo ago`;
            } else {
                const years = Math.floor(diffDays / 365);
                pillText = `${years}y ago`;
            }
        }

        return (
            <GestureHandlerRootView>
                <Swipeable renderRightActions={() => renderRightActions(item.id)}>
                    <TouchableOpacity style={[styles.clientItem, { borderBottomColor: themeColors.border }]} onPress={() => openDetailModal(item)}>
                        <View style={styles.clientItemContent}>
                            {/* Left content */}
                            <View style={styles.clientItemLeft}>
                                <Text style={[styles.clientItemCompany, { color: themeColors.textSecondary }]}>{item.company || 'Individual'}</Text>
                                <Text style={[styles.clientItemName, { color: themeColors.textPrimary }]} numberOfLines={1}>{item.name}</Text>
                                <Text style={[styles.clientItemMeta, { color: themeColors.textTertiary }]}>
                                    {item.email || 'No email'} {item.phone ? `· ${item.phone}` : ''}
                                </Text>
                            </View>
                            {/* Right - Earnings badge */}
                            <View style={[
                                styles.clientIconCircle,
                                isEarnings ? styles.clientIconCircleActive : { backgroundColor: themeColors.surface },
                                isEarnings ? { backgroundColor: '#DCFCE7' } : {} // Keep light green for earnings? Or maybe themeColors.primaryLight? Let's use hardcoded light green for now but maybe better distinct color
                            ]}>
                                <Text style={[
                                    styles.clientIconText,
                                    isEarnings ? styles.clientIconTextActive : { color: themeColors.textSecondary }
                                ]}>
                                    {pillText}
                                </Text>
                            </View>
                        </View>
                    </TouchableOpacity>
                </Swipeable>
            </GestureHandlerRootView>
        );
    };

    // Sidebar component (always rendered)


    if (isLoading) {
        return (
            <>

                <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color={Colors.primary} />
                        <Text style={[styles.loadingText, { color: themeColors.textSecondary }]}>Loading clients...</Text>
                    </View>
                </SafeAreaView>
            </>
        );
    }

    return (
        <>

            <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
                {/* Header */}
                <View style={[styles.header, { backgroundColor: themeColors.background }]}>
                    <View style={styles.headerTop}>
                        <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]}>Clients</Text>
                        <View style={styles.headerRight}>
                            <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); openFormModal(); }}>
                                <Plus size={24} color={themeColors.textPrimary} />
                            </TouchableOpacity>
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
                    </View>
                </View>

                {/* Client List */}
                {clients.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Users size={64} color={themeColors.textSecondary} weight="light" />
                        <Text style={[styles.emptyTitle, { color: themeColors.textPrimary }]}>No Clients Yet</Text>
                        <Text style={[styles.emptySubtitle, { color: themeColors.textSecondary }]}>
                            Add your first client to start tracking earnings and creating invoices
                        </Text>
                        <TouchableOpacity style={styles.addClientButton} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); openFormModal(); }}>
                            <Plus size={20} color="#FFF" />
                            <Text style={styles.addClientButtonText}>Add Client</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <FlatList
                        data={clients}
                        keyExtractor={(item) => item.id}
                        renderItem={renderClientItem}
                        contentContainerStyle={styles.listContent}
                        showsVerticalScrollIndicator={false}
                        refreshControl={
                            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
                        }
                    />
                )}

                {/* Detail Modal */}
                <Modal visible={showDetailModal} transparent animationType="fade" onRequestClose={closeDetailModal}>
                    <View style={styles.modalOverlay}>
                        {/* iOS blur / Android scrim */}
                        {Platform.OS === 'ios' ? (
                            <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
                        ) : (
                            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.32)' }]} />
                        )}
                        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={closeDetailModal} />
                        <Animated.View
                            style={[
                                styles.detailModalContent,
                                { backgroundColor: themeColors.background },
                                { transform: [{ translateY: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [600, 0] }) }] }
                            ]}
                        >
                            {/* Centered Title */}
                            <Text style={[styles.detailModalTitle, { color: themeColors.textPrimary }]}>{selectedClient?.name || 'Client Details'}</Text>

                            {selectedClient && (
                                <ScrollView showsVerticalScrollIndicator={false} style={styles.detailModalBody} contentContainerStyle={{ paddingBottom: 16 }}>
                                    {/* Company Badge */}
                                    {selectedClient.company && (
                                        <View style={styles.companyBadge}>
                                            <Buildings size={16} color={themeColors.textSecondary} weight="fill" />
                                            <Text style={[styles.companyBadgeText, { color: themeColors.textSecondary }]}>{selectedClient.company}</Text>
                                        </View>
                                    )}

                                    {/* Earnings Summary Card */}
                                    <View style={styles.summaryCard}>
                                        <Text style={styles.summaryCardLabel}>Total Earnings</Text>
                                        <Text style={styles.summaryCardValue}>${selectedClient.totalEarnings.toFixed(2)}</Text>
                                        {selectedClient.outstandingBalance > 0 && (
                                            <View style={styles.summaryCardSub}>
                                                <Clock size={14} color="#F59E0B" />
                                                <Text style={styles.summaryCardSubText}>${selectedClient.outstandingBalance.toFixed(2)} outstanding</Text>
                                            </View>
                                        )}
                                    </View>

                                    {/* Contact Details Card */}
                                    <View style={[styles.detailsCard, { backgroundColor: themeColors.surface }]}>
                                        {selectedClient.email && (
                                            <>
                                                <View style={styles.detailCardRow}>
                                                    <Text style={[styles.detailCardLabel, { color: themeColors.textSecondary }]}>Email</Text>
                                                    <Text style={[styles.detailCardValue, { color: themeColors.textPrimary }]}>{selectedClient.email}</Text>
                                                </View>
                                                {selectedClient.phone && <View style={[styles.detailCardDivider, { backgroundColor: themeColors.border }]} />}
                                            </>
                                        )}
                                        {selectedClient.phone && (
                                            <View style={styles.detailCardRow}>
                                                <Text style={[styles.detailCardLabel, { color: themeColors.textSecondary }]}>Phone</Text>
                                                <Text style={[styles.detailCardValue, { color: themeColors.textPrimary }]}>{selectedClient.phone}</Text>
                                            </View>
                                        )}
                                        {!selectedClient.email && !selectedClient.phone && (
                                            <View style={styles.detailCardRow}>
                                                <Text style={[styles.detailCardLabel, { color: themeColors.textSecondary }]}>Contact</Text>
                                                <Text style={[styles.detailCardValue, { color: themeColors.textSecondary }]}>No contact info</Text>
                                            </View>
                                        )}
                                    </View>

                                    {/* Client Since */}
                                    <View style={[styles.detailsCard, { backgroundColor: themeColors.surface }]}>
                                        <View style={styles.detailCardRow}>
                                            <Text style={[styles.detailCardLabel, { color: themeColors.textSecondary }]}>Client Since</Text>
                                            <Text style={[styles.detailCardValue, { color: themeColors.textPrimary }]}>
                                                {new Date(selectedClient.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                            </Text>
                                        </View>
                                    </View>
                                </ScrollView>
                            )}

                            {/* Action Buttons - Gojek Style */}
                            <View style={styles.detailModalActions}>
                                <TouchableOpacity
                                    style={styles.outlineButton}
                                    onPress={() => { closeDetailModal(); setTimeout(() => openFormModal(selectedClient!), 300); }}
                                >
                                    <Text style={styles.outlineButtonText}>Edit</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={styles.dangerButton}
                                    onPress={() => handleDelete(selectedClient!.id)}
                                >
                                    <Text style={styles.dangerButtonText}>Delete</Text>
                                </TouchableOpacity>
                            </View>
                        </Animated.View>
                    </View>
                </Modal>

                {/* Form Modal */}
                <Modal visible={showFormModal} transparent animationType="fade" onRequestClose={closeFormModal}>
                    <KeyboardAvoidingView
                        style={styles.modalOverlay}
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    >
                        {/* iOS blur / Android scrim */}
                        {Platform.OS === 'ios' ? (
                            <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
                        ) : (
                            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.32)' }]} />
                        )}
                        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={closeFormModal} />
                        <Animated.View
                            style={[
                                styles.formModalContent,
                                { backgroundColor: themeColors.background },
                                { transform: [{ translateY: formSlideAnim.interpolate({ inputRange: [0, 1], outputRange: [600, 0] }) }] }
                            ]}
                        >
                            <View style={styles.modalHeader}>
                                <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>{isEditing ? 'Edit Client' : 'New Client'}</Text>
                                <TouchableOpacity
                                    style={[styles.closeButton, { backgroundColor: themeColors.surface }]}
                                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); closeFormModal(); }}
                                >
                                    <X size={20} color={themeColors.textSecondary} weight="bold" />
                                </TouchableOpacity>
                            </View>

                            <ScrollView style={styles.formBody}>
                                <View style={styles.inputGroup}>
                                    <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Name *</Text>
                                    <TextInput
                                        style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.textPrimary }]}
                                        value={formName}
                                        onChangeText={setFormName}
                                        placeholder="Client name"
                                        placeholderTextColor={themeColors.textTertiary}
                                    />
                                </View>

                                <View style={styles.inputGroup}>
                                    <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Email</Text>
                                    <TextInput
                                        style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.textPrimary }]}
                                        value={formEmail}
                                        onChangeText={setFormEmail}
                                        placeholder="client@example.com"
                                        placeholderTextColor={themeColors.textTertiary}
                                        keyboardType="email-address"
                                        autoCapitalize="none"
                                    />
                                </View>

                                <View style={styles.inputGroup}>
                                    <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Phone</Text>
                                    <TextInput
                                        style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.textPrimary }]}
                                        value={formPhone}
                                        onChangeText={setFormPhone}
                                        placeholder="+1 234 567 8900"
                                        placeholderTextColor={themeColors.textTertiary}
                                        keyboardType="phone-pad"
                                    />
                                </View>

                                <View style={styles.inputGroup}>
                                    <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>Company</Text>
                                    <TextInput
                                        style={[styles.input, { backgroundColor: themeColors.background, borderColor: themeColors.border, color: themeColors.textPrimary }]}
                                        value={formCompany}
                                        onChangeText={setFormCompany}
                                        placeholder="Company name (optional)"
                                        placeholderTextColor={themeColors.textTertiary}
                                    />
                                </View>
                            </ScrollView>

                            <TouchableOpacity
                                style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
                                onPress={handleSaveClient}
                                disabled={isSaving}
                            >
                                {isSaving ? (
                                    <ActivityIndicator color="#FFF" />
                                ) : (
                                    <Text style={styles.saveButtonText}>{isEditing ? 'Save Changes' : 'Create Client'}</Text>
                                )}
                            </TouchableOpacity>
                        </Animated.View>
                    </KeyboardAvoidingView>
                </Modal>

                {/* Profile Modal */}
                <ProfileModal
                    visible={showProfileModal}
                    onClose={() => setShowProfileModal(false)}
                    userName={userName}
                    walletAddresses={walletAddresses}
                    profileIcon={profileIcon}
                />
            </SafeAreaView>
        </>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        ...Typography.body,
        color: Colors.textSecondary,
        marginTop: 12,
    },
    header: {
        backgroundColor: Colors.background,
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
    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
    },
    profileIcon: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: Colors.primary,
    },
    listContent: {
        padding: 16,
    },
    clientItem: {
        paddingVertical: 16,
        paddingHorizontal: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#E5E7EB',
    },
    clientItemContent: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    clientItemLeft: {
        flex: 1,
        marginRight: 16,
    },
    clientItemCompany: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 14,
        color: Colors.textSecondary,
        marginBottom: 4,
    },
    clientItemName: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 18,
        color: Colors.textPrimary,
        marginBottom: 4,
    },
    clientItemMeta: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 14,
        color: Colors.textTertiary,
    },
    clientIconCircle: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#F3F4F6',
        justifyContent: 'center',
        alignItems: 'center',
    },
    clientIconCircleActive: {
        backgroundColor: '#DCFCE7',
    },
    clientIconText: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 12,
        color: Colors.textSecondary,
    },
    clientIconTextActive: {
        color: '#16A34A',
    },
    // Keep old styles for reference
    leftColumn: {
        marginRight: 16,
        paddingTop: 0,
    },
    statusPill: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        alignSelf: 'flex-start',
    },
    statusPillActive: {
        backgroundColor: '#ECFDF5', // Light green
    },
    statusPillNew: {
        backgroundColor: '#F3F4F6', // Light gray
    },
    statusPillText: {
        fontSize: 12,
        fontWeight: '700',
    },
    statusPillTextActive: {
        color: '#059669', // Dark green
    },
    statusPillTextNew: {
        color: '#6B7280', // Gray
    },
    rightColumn: {
        flex: 1,
    },
    hostRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 6,
        gap: 6,
    },
    hostText: {
        ...Typography.body,
        color: Colors.textSecondary,
        fontWeight: '600',
        fontSize: 14,
    },
    itemTitle: {
        ...Typography.h2,
        fontSize: 20,
        fontWeight: '700',
        color: Colors.textPrimary,
        marginBottom: 10,
    },
    detailsContainer: {
        gap: 8,
    },
    detailRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    detailText: {
        ...Typography.body,
        color: Colors.textSecondary,
        fontSize: 15,
        fontWeight: '500',
    },
    deleteAction: {
        backgroundColor: '#EF4444',
        justifyContent: 'center',
        alignItems: 'center',
        width: 80,
    },
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 40,
    },
    emptyTitle: {
        ...Typography.h3,
        color: Colors.textPrimary,
        marginTop: 16,
    },
    emptySubtitle: {
        ...Typography.body,
        color: Colors.textSecondary,
        textAlign: 'center',
        marginTop: 8,
    },
    addClientButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.primary,
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 24,
        marginTop: 24,
        gap: 8,
    },
    addClientButtonText: {
        ...Typography.bodyBold,
        color: '#FFF',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: { // Form modal
        backgroundColor: Colors.background,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: '80%',
    },
    // New Detail Modal Styles (Gojek-inspired)
    detailModalContent: {
        // backgroundColor: '#FFFFFF', // Overridden
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 24,
        paddingTop: 24,
        paddingBottom: 40,
        maxHeight: '90%',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 10,
    },
    detailModalTitle: {
        ...Typography.h2,
        fontSize: 22,
        fontWeight: '700',
        // color: Colors.textPrimary, // Overridden
        textAlign: 'center',
        marginBottom: 8,
    },
    detailModalBody: {
        flexGrow: 1,
        flexShrink: 1,
        marginTop: 8,
    },
    companyBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        marginBottom: 20,
    },
    companyBadgeText: {
        ...Typography.body,
        // color: Colors.textSecondary, // Overridden via inline or default
        fontSize: 15,
    },
    summaryCard: {
        // backgroundColor: '#F0FDF4', // Overridden
        borderRadius: 16,
        padding: 20,
        alignItems: 'center',
        marginBottom: 16,
    },
    summaryCardLabel: {
        ...Typography.caption,
        // color: '#059669', // Overridden
        fontSize: 13,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    summaryCardValue: {
        ...Typography.h1,
        fontSize: 36,
        fontWeight: '700',
        color: '#059669',
        marginTop: 4,
    },
    summaryCardSub: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 8,
    },
    summaryCardSubText: {
        ...Typography.caption,
        color: '#F59E0B',
        fontSize: 13,
        fontWeight: '600',
    },
    detailsCard: {
        backgroundColor: '#F9FAFB',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
    },
    detailCardRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 8,
    },
    detailCardLabel: {
        ...Typography.body,
        color: Colors.textSecondary,
        fontSize: 15,
    },
    detailCardValue: {
        ...Typography.body,
        color: Colors.textPrimary,
        fontSize: 15,
        fontWeight: '600',
        textAlign: 'right',
        flex: 1,
        marginLeft: 16,
    },
    detailCardDivider: {
        height: 1,
        backgroundColor: '#E5E7EB',
        marginVertical: 4,
    },
    detailModalActions: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 16,
    },
    outlineButton: {
        flex: 1,
        paddingVertical: 16,
        borderRadius: 30,
        borderWidth: 1.5,
        borderColor: Colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    outlineButtonText: {
        ...Typography.bodyBold,
        color: Colors.primary,
        fontSize: 16,
    },
    dangerButton: {
        flex: 1,
        paddingVertical: 16,
        borderRadius: 30,
        backgroundColor: '#EF4444',
        alignItems: 'center',
        justifyContent: 'center',
    },
    dangerButtonText: {
        ...Typography.bodyBold,
        color: '#FFFFFF',
        fontSize: 16,
    },
    formModalContent: {
        // backgroundColor: '#FFFFFF', // Overridden
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        padding: 24,
        paddingBottom: 40,
        maxHeight: '90%',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 10,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    modalTitle: {
        ...Typography.h3,
        color: Colors.textPrimary,
    },
    closeButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        // backgroundColor: '#F3F4F6', // Overridden
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalBody: {
        padding: 20,
    },
    detailSection: {
        alignItems: 'center',
        marginBottom: 24,
    },
    detailAvatarLarge: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: Colors.primaryLight,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
    },
    detailName: {
        ...Typography.h2,
        color: Colors.textPrimary,
    },
    detailCompany: {
        ...Typography.body,
        color: Colors.textSecondary,
        marginTop: 4,
    },
    earningsRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 24,
    },
    earningsCard: {
        flex: 1,
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
    },
    earningsCardGreen: {
        backgroundColor: '#ECFDF5',
    },
    earningsCardOrange: {
        backgroundColor: '#FFFBEB',
    },
    earningsCardAmount: {
        ...Typography.h3,
        color: Colors.textPrimary,
        marginTop: 8,
    },
    earningsCardLabel: {
        ...Typography.caption,
        color: Colors.textSecondary,
        marginTop: 4,
    },
    contactSection: {
        backgroundColor: Colors.surface,
        borderRadius: 12,
        padding: 16,
        marginBottom: 24,
    },
    contactRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 8,
    },
    contactText: {
        ...Typography.body,
        color: Colors.textPrimary,
    },
    actionButtons: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 24,
    },
    editButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: Colors.primaryLight,
        paddingVertical: 14,
        borderRadius: 12,
    },
    editButtonText: {
        ...Typography.bodyBold,
        color: Colors.primary,
    },
    deleteButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: '#FEE2E2',
        paddingVertical: 14,
        borderRadius: 12,
    },
    deleteButtonText: {
        ...Typography.bodyBold,
        color: '#EF4444',
    },
    formBody: {
        // No extra padding needed - formModalContent has padding: 24
    },
    inputGroup: {
        marginBottom: 20,
    },
    inputLabel: {
        ...Typography.caption,
        color: Colors.textSecondary,
        marginBottom: 8,
    },
    input: {
        backgroundColor: Colors.surface,
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: 12,
        padding: 16,
        ...Typography.body,
        color: Colors.textPrimary,
    },
    saveButton: {
        backgroundColor: Colors.primary,
        marginTop: 20,
        paddingVertical: 16,
        borderRadius: 30,
        alignItems: 'center',
    },
    saveButtonDisabled: {
        opacity: 0.7,
    },
    saveButtonText: {
        ...Typography.bodyBold,
        color: '#FFF',
    },
});
