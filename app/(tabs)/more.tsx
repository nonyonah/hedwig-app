import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
    CaretRight
} from 'phosphor-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeColors, Colors } from '../../theme/colors';
import { useAuth } from '../../hooks/useAuth';
import { useAnalyticsScreen } from '../../hooks/useAnalyticsScreen';
import { ProfileModal } from '../../components/ProfileModal';
import { useSettings } from '../../context/SettingsContext';

// Profile color gradient options
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

export default function MoreScreen() {
    useAnalyticsScreen('More');
    const router = useRouter();
    const themeColors = useThemeColors();
    const { user, getAccessToken } = useAuth();
    const { currentTheme } = useSettings();
    const isDark = currentTheme === 'dark';

    // State for user data
    const [userName, setUserName] = useState({ firstName: '', lastName: '' });
    const [profileIcon, setProfileIcon] = useState<{ emoji?: string; colorIndex?: number; imageUri?: string }>({});
    const [walletAddresses, setWalletAddresses] = useState<{ evm?: string; solana?: string }>({});
    const [showProfileModal, setShowProfileModal] = useState(false);

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
            } catch (error) {
                console.error('Failed to fetch user data:', error);
            }
        };
        fetchUserData();
    }, [user]);

    const menuItems = [
        {
            name: 'Insights',
            image: require('../../assets/icons/colored/insights.png'),
            route: '/insights',
            description: 'Analytics & reports'
        },
        {
            name: 'Transactions',
            image: require('../../assets/icons/colored/transactions.png'),
            route: '/transactions',
            description: 'History & details'
        },
        {
            name: 'Withdrawals',
            image: require('../../assets/icons/colored/withdrawals.png'),
            route: '/offramp-history',
            description: 'Cashing out'
        },
        {
            name: 'Calendar',
            image: require('../../assets/icons/colored/calendar.png'),
            route: '/calendar',
            description: 'Schedule & tasks'
        },
        {
            name: 'Projects',
            image: require('../../assets/icons/colored/projects.png'),
            route: '/projects',
            description: 'Manage work'
        },
        {
            name: 'Clients',
            image: require('../../assets/icons/colored/clients.png'),
            route: '/clients',
            description: 'Client database'
        },
    ];

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
            {/* Header */}
            <View style={[styles.header, { backgroundColor: themeColors.background }]}>
                <View style={styles.headerLeft}>
                    <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]}>More</Text>
                </View>

                {/* Profile Icon */}
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

            <ScrollView
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.grid}>
                    {menuItems.map((item, index) => (
                        <TouchableOpacity
                            key={index}
                            style={[
                                styles.card,
                                { backgroundColor: themeColors.surface } // Use standard surface color
                            ]}
                            onPress={() => router.push(item.route as any)}
                        >
                            <View style={styles.iconContainer}>
                                <Image source={item.image} style={styles.coloredIcon} />
                            </View>
                            <View style={styles.cardContent}>
                                <Text style={[styles.cardTitle, { color: themeColors.textPrimary }]}>{item.name}</Text>
                                <Text style={[styles.cardDescription, { color: themeColors.textSecondary }]}>{item.description}</Text>
                            </View>
                        </TouchableOpacity>
                    ))}
                </View>
            </ScrollView>

            <ProfileModal
                visible={showProfileModal}
                onClose={() => setShowProfileModal(false)}
                userName={userName}
                walletAddresses={walletAddresses}
                profileIcon={profileIcon}
            />
        </SafeAreaView>
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
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    headerTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 28,
    },
    profileIcon: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: Colors.primary,
    },
    content: {
        padding: 20,
        paddingBottom: 120, // Tab bar spacing
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12, // Reduced gap
    },
    card: {
        width: '48%', // Slightly wider to fill space with smaller gap
        borderRadius: 16,
        padding: 12, // Reduced padding
        paddingVertical: 16, // Reduced vertical padding
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8, // Reduced gap
    },
    iconContainer: {
        width: 48,
        height: 48,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
    },
    cardContent: {
        alignItems: 'center',
        gap: 4,
    },
    cardTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 16,
        textAlign: 'center',
    },
    cardDescription: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 12,
        textAlign: 'center',
        opacity: 0.8,
    },
    coloredIcon: {
        width: 48,
        height: 48,
        resizeMode: 'contain',
    },
});
