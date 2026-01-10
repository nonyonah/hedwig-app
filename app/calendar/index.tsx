import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert, RefreshControl, SectionList } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePrivy } from '@privy-io/expo';
import { List, CalendarBlank, Receipt, Target, Folder, Clock, Trash } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import { Colors, useThemeColors } from '../../theme/colors';
import { Sidebar } from '../../components/Sidebar';
import { ProfileModal } from '../../components/ProfileModal';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'react-native';
import { useAnalyticsScreen } from '../../hooks/useAnalyticsScreen';

// Profile color gradient options
const PROFILE_COLOR_OPTIONS = [
    ['#60A5FA', '#3B82F6', '#2563EB'],
    ['#34D399', '#10B981', '#059669'],
    ['#F472B6', '#EC4899', '#DB2777'],
    ['#FBBF24', '#F59E0B', '#D97706'],
    ['#A78BFA', '#8B5CF6', '#7C3AED'],
    ['#F87171', '#EF4444', '#DC2626'],
    ['#2DD4BF', '#14B8A6', '#0D9488'],
    ['#FB923C', '#F97316', '#EA580C'],
] as const;

interface CalendarEvent {
    id: string;
    title: string;
    description: string | null;
    eventDate: string;
    eventType: 'invoice_due' | 'milestone_due' | 'project_deadline' | 'custom';
    status: 'upcoming' | 'completed' | 'cancelled';
    sourceType: string | null;
    sourceId: string | null;
    createdAt: string;
}

interface Section {
    title: string;
    data: CalendarEvent[];
}

export default function CalendarScreen() {
    useAnalyticsScreen('Calendar');

    const router = useRouter();
    const { getAccessToken, user } = usePrivy();
    const themeColors = useThemeColors();
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [userName, setUserName] = useState({ firstName: '', lastName: '' });
    const [profileIcon, setProfileIcon] = useState<{ emoji?: string; colorIndex?: number; imageUri?: string }>({});
    const [walletAddresses, setWalletAddresses] = useState<{ evm?: string; solana?: string }>({});
    const [conversations, setConversations] = useState<any[]>([]);

    // Group events by date
    const sections = useMemo(() => {
        const grouped: Record<string, CalendarEvent[]> = {};

        events.forEach(event => {
            const date = new Date(event.eventDate);
            const today = new Date();
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            let label: string;
            if (date.toDateString() === today.toDateString()) {
                label = 'Today';
            } else if (date.toDateString() === tomorrow.toDateString()) {
                label = 'Tomorrow';
            } else {
                label = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
            }

            if (!grouped[label]) {
                grouped[label] = [];
            }
            grouped[label].push(event);
        });

        return Object.entries(grouped).map(([title, data]) => ({ title, data }));
    }, [events]);

    useEffect(() => {
        fetchEvents();
        fetchUserData();
    }, [user]);

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

                if (userData.avatar) {
                    try {
                        if (userData.avatar.trim().startsWith('{')) {
                            const parsed = JSON.parse(userData.avatar);
                            setProfileIcon(parsed);
                        } else {
                            setProfileIcon({ imageUri: userData.avatar });
                        }
                    } catch {
                        setProfileIcon({ imageUri: userData.avatar });
                    }
                } else if (userData.profileColorIndex !== undefined) {
                    setProfileIcon({ colorIndex: userData.profileColorIndex });
                }

                setWalletAddresses({
                    evm: userData.ethereumWalletAddress,
                    solana: userData.solanaWalletAddress
                });
            }

            const conversationsResponse = await fetch(`${apiUrl}/api/chat/conversations`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            const conversationsData = await conversationsResponse.json();
            if (conversationsData.success && conversationsData.data) {
                setConversations(conversationsData.data.slice(0, 10));
            }
        } catch (error) {
            console.error('Failed to fetch user data:', error);
        }
    };

    const fetchEvents = async () => {
        try {
            const token = await getAccessToken();
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

            const response = await fetch(`${apiUrl}/api/calendar?status=upcoming`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();

            if (data.success) {
                setEvents(data.data.events);
            } else {
                console.error('Failed to fetch events:', data.error);
            }
        } catch (error) {
            console.error('Error fetching events:', error);
        } finally {
            setIsLoading(false);
            setRefreshing(false);
        }
    };

    const onRefresh = () => {
        setRefreshing(true);
        fetchEvents();
    };

    const handleDelete = async (eventId: string) => {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

        Alert.alert(
            'Delete Event',
            'Are you sure you want to delete this calendar event?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const token = await getAccessToken();
                            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

                            const response = await fetch(`${apiUrl}/api/calendar/${eventId}`, {
                                method: 'DELETE',
                                headers: { 'Authorization': `Bearer ${token}` },
                            });

                            const data = await response.json();

                            if (data.success) {
                                setEvents(prev => prev.filter(e => e.id !== eventId));
                            } else {
                                Alert.alert('Error', data.error?.message || 'Failed to delete event');
                            }
                        } catch (error) {
                            Alert.alert('Error', 'Failed to delete event');
                        }
                    }
                },
            ]
        );
    };

    const getEventIcon = (eventType: string) => {
        switch (eventType) {
            case 'invoice_due': return <Receipt size={24} color={Colors.primary} weight="fill" />;
            case 'milestone_due': return <Target size={24} color="#10B981" weight="fill" />;
            case 'project_deadline': return <Folder size={24} color="#F59E0B" weight="fill" />;
            default: return <CalendarBlank size={24} color="#8B5CF6" weight="fill" />;
        }
    };

    const getEventTypeLabel = (eventType: string) => {
        switch (eventType) {
            case 'invoice_due': return 'Invoice';
            case 'milestone_due': return 'Milestone';
            case 'project_deadline': return 'Deadline';
            default: return 'Reminder';
        }
    };

    const getEventTypeColor = (eventType: string) => {
        switch (eventType) {
            case 'invoice_due': return '#EEF2FF';
            case 'milestone_due': return '#ECFDF5';
            case 'project_deadline': return '#FEF3C7';
            default: return '#F3E8FF';
        }
    };

    const getEventTypeTextColor = (eventType: string) => {
        switch (eventType) {
            case 'invoice_due': return Colors.primary;
            case 'milestone_due': return '#059669';
            case 'project_deadline': return '#D97706';
            default: return '#7C3AED';
        }
    };

    const renderEvent = ({ item }: { item: CalendarEvent }) => {
        const time = new Date(item.eventDate).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });

        return (
            <TouchableOpacity
                style={[styles.eventCard, { backgroundColor: themeColors.surface }]}
                onLongPress={() => handleDelete(item.id)}
                delayLongPress={500}
            >
                <View style={[styles.eventIconContainer, { backgroundColor: getEventTypeColor(item.eventType) }]}>
                    {getEventIcon(item.eventType)}
                </View>
                <View style={styles.eventContent}>
                    <Text style={[styles.eventTitle, { color: themeColors.textPrimary }]} numberOfLines={1}>
                        {item.title}
                    </Text>
                    <View style={styles.eventMeta}>
                        <Clock size={14} color={themeColors.textSecondary} />
                        <Text style={[styles.eventTime, { color: themeColors.textSecondary }]}>{time}</Text>
                        <View style={[styles.eventTypeBadge, { backgroundColor: getEventTypeColor(item.eventType) }]}>
                            <Text style={[styles.eventTypeText, { color: getEventTypeTextColor(item.eventType) }]}>
                                {getEventTypeLabel(item.eventType)}
                            </Text>
                        </View>
                    </View>
                </View>
                <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => handleDelete(item.id)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                    <Trash size={20} color={themeColors.textSecondary} />
                </TouchableOpacity>
            </TouchableOpacity>
        );
    };

    const renderSectionHeader = ({ section }: { section: Section }) => (
        <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>{section.title}</Text>
        </View>
    );

    return (
        <View style={{ flex: 1 }}>
            <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
                <View style={[styles.header, { backgroundColor: themeColors.background }]}>
                    <TouchableOpacity onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setIsSidebarOpen(true);
                    }}>
                        <List size={24} color={themeColors.textPrimary} weight="bold" />
                    </TouchableOpacity>
                    <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]}>Calendar</Text>
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
                    <SectionList
                        sections={sections}
                        renderItem={renderEvent}
                        renderSectionHeader={renderSectionHeader}
                        keyExtractor={(item) => item.id}
                        contentContainerStyle={styles.listContent}
                        showsVerticalScrollIndicator={false}
                        stickySectionHeadersEnabled={false}
                        refreshControl={
                            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
                        }
                        ListEmptyComponent={
                            <View style={styles.emptyState}>
                                <CalendarBlank size={64} color={themeColors.textSecondary} weight="duotone" />
                                <Text style={[styles.emptyStateTitle, { color: themeColors.textPrimary }]}>No Upcoming Events</Text>
                                <Text style={[styles.emptyStateText, { color: themeColors.textSecondary }]}>
                                    Create invoices with due dates or say{'\n'}"remind me to..." to add events
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

            <Sidebar
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
                userName={userName}
                conversations={conversations}
                onHomeClick={() => router.push('/')}
                onLoadConversation={(id) => router.push(`/?conversationId=${id}`)}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 12,
        height: 60,
    },
    headerTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 22,
    },
    profileIcon: {
        width: 32,
        height: 32,
        borderRadius: 16,
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
    sectionHeader: {
        marginBottom: 12,
        marginTop: 8,
    },
    sectionTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 18,
    },
    eventCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 16,
        marginBottom: 12,
        gap: 12,
    },
    eventIconContainer: {
        width: 48,
        height: 48,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    eventContent: {
        flex: 1,
    },
    eventTitle: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 16,
        marginBottom: 4,
    },
    eventMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    eventTime: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 13,
    },
    eventTypeBadge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6,
        marginLeft: 8,
    },
    eventTypeText: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 11,
    },
    deleteButton: {
        padding: 8,
    },
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingTop: 100,
    },
    emptyStateTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 18,
        marginTop: 16,
    },
    emptyStateText: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 14,
        textAlign: 'center',
        marginTop: 8,
        lineHeight: 20,
    },
});
