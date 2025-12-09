import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, KeyboardAvoidingView, Platform, Alert, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, User, Smiley } from 'phosphor-react-native';
import { Colors } from '../../theme/colors';
import { usePrivy } from '@privy-io/expo';
import { LinearGradient } from 'expo-linear-gradient';
import { Button } from '../../components/Button';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

// Profile icon options - emojis
const EMOJI_OPTIONS = ['😊', '🚀', '💼', '⭐', '🎯', '💡', '🔥', '✨', '🎨', '💪', '🌟', '👋'];

// Profile color gradient options
const COLOR_OPTIONS = [
    ['#60A5FA', '#3B82F6', '#2563EB'], // Blue
    ['#34D399', '#10B981', '#059669'], // Green
    ['#F472B6', '#EC4899', '#DB2777'], // Pink
    ['#FBBF24', '#F59E0B', '#D97706'], // Amber
    ['#A78BFA', '#8B5CF6', '#7C3AED'], // Purple
    ['#F87171', '#EF4444', '#DC2626'], // Red
    ['#2DD4BF', '#14B8A6', '#0D9488'], // Teal
    ['#FB923C', '#F97316', '#EA580C'], // Orange
];

type IconType = 'emoji' | 'color';

export default function ProfileScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { email } = useLocalSearchParams<{ email: string }>();
    const [name, setName] = useState('');
    const [loading, setLoading] = useState(false);
    const [iconType, setIconType] = useState<IconType>('emoji');
    const [selectedEmoji, setSelectedEmoji] = useState('😊');
    const [selectedColorIndex, setSelectedColorIndex] = useState(0);
    const { getAccessToken, user } = usePrivy();

    // Check if user already exists and pre-fill data
    useEffect(() => {
        checkExistingUser();
    }, []);

    const checkExistingUser = async () => {
        try {
            const token = await getAccessToken();
            const response = await fetch(`${API_URL}/api/auth/me`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                if (data.success && data.data?.user) {
                    const existingUser = data.data.user;
                    // Pre-fill name if exists
                    if (existingUser.first_name) {
                        const fullName = existingUser.last_name
                            ? `${existingUser.first_name} ${existingUser.last_name}`
                            : existingUser.first_name;
                        setName(fullName);
                    }
                    // Pre-fill profile icon if exists
                    if (existingUser.profile_emoji) {
                        setSelectedEmoji(existingUser.profile_emoji);
                        setIconType('emoji');
                    } else if (existingUser.profile_color_index !== undefined) {
                        setSelectedColorIndex(existingUser.profile_color_index);
                        setIconType('color');
                    }
                }
            }
        } catch (error) {
            console.log('Could not check existing user:', error);
        }
    };

    const handleSave = async () => {
        if (!name.trim()) return;

        setLoading(true);
        try {
            const token = await getAccessToken();

            // Split name into first and last
            const nameParts = name.trim().split(' ');
            const firstName = nameParts[0];
            const lastName = nameParts.slice(1).join(' ') || '';

            const profileData: any = {
                email,
                firstName,
                lastName,
            };

            // Add profile icon data
            if (iconType === 'emoji') {
                profileData.profileEmoji = selectedEmoji;
                profileData.profileColorIndex = null;
            } else {
                profileData.profileEmoji = null;
                profileData.profileColorIndex = selectedColorIndex;
            }

            const response = await fetch(`${API_URL}/api/auth/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(profileData)
            });

            const data = await response.json();

            if (data.success) {
                router.replace('/auth/biometrics');
            } else {
                throw new Error(data.error?.message || 'Failed to create profile');
            }

        } catch (error) {
            console.error('Profile creation failed:', error);
            Alert.alert('Error', 'Failed to save profile. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const selectedGradient = COLOR_OPTIONS[selectedColorIndex];

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.content}
            >
                <ScrollView showsVerticalScrollIndicator={false}>
                    <Text style={styles.title}>Your Profile</Text>
                    <Text style={styles.subtitle}>Set up your profile to personalize your experience.</Text>

                    {/* Profile Icon Picker */}
                    <View style={styles.iconSection}>
                        <Text style={styles.label}>Profile Icon</Text>

                        {/* Current Icon Preview */}
                        <View style={styles.previewContainer}>
                            <LinearGradient
                                colors={iconType === 'color' ? selectedGradient : ['#F3F4F6', '#E5E7EB', '#D1D5DB']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.iconPreview}
                            >
                                {iconType === 'emoji' ? (
                                    <Text style={styles.emojiPreview}>{selectedEmoji}</Text>
                                ) : (
                                    <Text style={styles.initialPreview}>{name ? name[0].toUpperCase() : '?'}</Text>
                                )}
                            </LinearGradient>
                        </View>

                        {/* Icon Type Tabs */}
                        <View style={styles.tabContainer}>
                            <TouchableOpacity
                                style={[styles.tab, iconType === 'emoji' && styles.tabActive]}
                                onPress={() => setIconType('emoji')}
                            >
                                <Smiley size={18} color={iconType === 'emoji' ? Colors.primary : Colors.textSecondary} />
                                <Text style={[styles.tabText, iconType === 'emoji' && styles.tabTextActive]}>Emoji</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.tab, iconType === 'color' && styles.tabActive]}
                                onPress={() => setIconType('color')}
                            >
                                <View style={styles.colorDot} />
                                <Text style={[styles.tabText, iconType === 'color' && styles.tabTextActive]}>Color</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Options Grid */}
                        {iconType === 'emoji' ? (
                            <View style={styles.optionsGrid}>
                                {EMOJI_OPTIONS.map((emoji, index) => (
                                    <TouchableOpacity
                                        key={index}
                                        style={[
                                            styles.emojiOption,
                                            selectedEmoji === emoji && styles.optionSelected
                                        ]}
                                        onPress={() => setSelectedEmoji(emoji)}
                                    >
                                        <Text style={styles.emojiText}>{emoji}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        ) : (
                            <View style={styles.optionsGrid}>
                                {COLOR_OPTIONS.map((colors, index) => (
                                    <TouchableOpacity
                                        key={index}
                                        style={[
                                            styles.colorOption,
                                            selectedColorIndex === index && styles.optionSelected
                                        ]}
                                        onPress={() => setSelectedColorIndex(index)}
                                    >
                                        <LinearGradient
                                            colors={colors}
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 1, y: 1 }}
                                            style={styles.colorGradient}
                                        />
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}
                    </View>

                    {/* Name Input */}
                    <View style={styles.formGroup}>
                        <Text style={styles.label}>Name</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Your Name"
                            placeholderTextColor="#9CA3AF"
                            value={name}
                            onChangeText={setName}
                            autoCapitalize="words"
                        />
                    </View>
                </ScrollView>

                <View style={styles.bottomSection}>
                    <Button
                        title="Save Profile"
                        onPress={handleSave}
                        variant="primary"
                        size="large"
                        loading={loading}
                        disabled={!name.trim() || loading}
                    />
                    <View style={{ height: insets.bottom + 20 }} />
                </View>
            </KeyboardAvoidingView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FFFFFF',
    },
    content: {
        flex: 1,
        paddingHorizontal: 24,
    },
    title: {
        fontFamily: 'RethinkSans_700Bold',
        fontSize: 28,
        color: Colors.textPrimary,
        marginBottom: 8,
        marginTop: 40,
    },
    subtitle: {
        fontFamily: 'RethinkSans_400Regular',
        fontSize: 16,
        color: Colors.textSecondary,
        marginBottom: 32,
    },
    iconSection: {
        marginBottom: 24,
    },
    label: {
        fontFamily: 'RethinkSans_600SemiBold',
        fontSize: 14,
        color: Colors.textSecondary,
        marginBottom: 12,
    },
    previewContainer: {
        alignItems: 'center',
        marginBottom: 20,
    },
    iconPreview: {
        width: 100,
        height: 100,
        borderRadius: 50,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
        elevation: 5,
    },
    emojiPreview: {
        fontSize: 48,
    },
    initialPreview: {
        fontFamily: 'RethinkSans_700Bold',
        fontSize: 40,
        color: '#FFFFFF',
    },
    tabContainer: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 16,
    },
    tab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        borderRadius: 12,
        backgroundColor: '#F3F4F6',
        gap: 8,
    },
    tabActive: {
        backgroundColor: '#EEF2FF',
        borderWidth: 1,
        borderColor: Colors.primary,
    },
    tabText: {
        fontFamily: 'RethinkSans_500Medium',
        fontSize: 14,
        color: Colors.textSecondary,
    },
    tabTextActive: {
        color: Colors.primary,
    },
    colorDot: {
        width: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: '#8B5CF6',
    },
    optionsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    emojiOption: {
        width: 52,
        height: 52,
        borderRadius: 16,
        backgroundColor: '#F3F4F6',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: 'transparent',
    },
    colorOption: {
        width: 52,
        height: 52,
        borderRadius: 16,
        padding: 4,
        borderWidth: 2,
        borderColor: 'transparent',
    },
    optionSelected: {
        borderColor: Colors.primary,
        backgroundColor: '#EEF2FF',
    },
    colorGradient: {
        flex: 1,
        borderRadius: 12,
    },
    emojiText: {
        fontSize: 24,
    },
    formGroup: {
        marginBottom: 24,
    },
    input: {
        backgroundColor: '#F3F4F6',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 16,
        fontSize: 16,
        fontFamily: 'RethinkSans_400Regular',
        color: Colors.textPrimary,
    },
    bottomSection: {
        paddingTop: 16,
    },
});
