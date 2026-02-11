import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, KeyboardAvoidingView, Platform, Alert, TouchableOpacity, ScrollView, Image, ActivityIndicator, Animated, Keyboard } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, Check, CaretLeft } from 'phosphor-react-native';
import { Colors, useThemeColors, useKeyboardAppearance } from '../../theme/colors';
import { usePrivy } from '@privy-io/expo';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { getUserGradient } from '../../utils/gradientUtils';
import { Button } from '../../components/Button';
import { useAnalyticsScreen } from '../../hooks/useAnalyticsScreen';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

// Profile color gradient options (10 options)
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
] as const;

export default function ProfileScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const themeColors = useThemeColors();
    const keyboardAppearance = useKeyboardAppearance();
    const { email, edit } = useLocalSearchParams<{ email: string; edit?: string }>();
    const { getAccessToken, user } = usePrivy();

    // Track page view
    useAnalyticsScreen('Profile Setup');

    // State
    const [name, setName] = useState('');
    const [loading, setLoading] = useState(false);
    const [profileIcon, setProfileIcon] = useState<{ emoji?: string; colorIndex?: number; imageUri?: string }>({});

    // View Mode - removed emoji picker
    const [viewMode, setViewMode] = useState<'main'>('main');
    const [showImageOptions, setShowImageOptions] = useState(false);

    // Reduced emoji list (50 options)
    const EMOJI_OPTIONS = [
        '😀', '😊', '😍', '🤩', '😎', '🤓', '🥳', '🥰', '😇', '🤗',
        '😋', '🤤', '🤔', '🤐', '🙄', '😴', '😮', '😱', '😤', '🤬',
        '😈', '👻', '👽', '🤖', '💩', '🤡', '🎃', '💀', '🐶', '🐱',
        '🐻', '🐼', '🦁', '🐯', '🦊', '🐰', '🐷', '🐵', '🦄', '🐦',
        '✨', '🔥', '🌟', '❤️', '💜', '💙', '💚', '💯', '🏆', '🎉',
    ];

    // Keyboard animation
    const keyboardOffset = useRef(new Animated.Value(0)).current;

    // Keyboard listeners for smooth animation matching keyboard speed
    useEffect(() => {
        const keyboardWillShow = Keyboard.addListener(
            Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
            (e) => {
                Animated.timing(keyboardOffset, {
                    toValue: e.endCoordinates.height - insets.bottom,
                    duration: e.duration || 250,
                    useNativeDriver: false,
                }).start();
            }
        );

        const keyboardWillHide = Keyboard.addListener(
            Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
            (e) => {
                Animated.timing(keyboardOffset, {
                    toValue: 0,
                    duration: e.duration || 250,
                    useNativeDriver: false,
                }).start();
            }
        );

        return () => {
            keyboardWillShow.remove();
            keyboardWillHide.remove();
        };
    }, [insets.bottom]);

    // Check if user already exists and pre-fill data
    useEffect(() => {
        checkExistingUser();
    }, []);

    const checkExistingUser = async () => {
        try {
            const token = await getAccessToken();
            const response = await fetch(`${API_URL}/api/auth/me`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                if (data.success && data.data?.user) {
                    const existingUser = data.data.user;

                    // If user already has a firstName, they've already completed profile setup
                    if (existingUser.firstName && existingUser.firstName.trim() !== '' && edit !== 'true') {
                        router.replace('/auth/biometrics');
                        return;
                    }

                    // Otherwise, pre-fill whatever data exists
                    if (existingUser.firstName) {
                        const fullName = existingUser.lastName
                            ? `${existingUser.firstName} ${existingUser.lastName}`
                            : existingUser.firstName;
                        setName(fullName);
                    }
                    // Pre-fill profile icon
                    if (existingUser.avatar) {
                        try {
                            if (existingUser.avatar.startsWith('{')) {
                                setProfileIcon(JSON.parse(existingUser.avatar));
                            } else {
                                setProfileIcon({ imageUri: existingUser.avatar });
                            }
                        } catch (e) {
                            setProfileIcon({ imageUri: existingUser.avatar });
                        }
                    } else if (existingUser.profileEmoji) {
                        setProfileIcon({ emoji: existingUser.profileEmoji });
                    } else if (existingUser.profileColorIndex !== undefined) {
                        setProfileIcon({ colorIndex: existingUser.profileColorIndex });
                    }
                }
            }
        } catch (error) {
            console.log('Could not check existing user:', error);
        }
    };

    const pickImage = async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.5,
                base64: true,
            });

            if (!result.canceled && result.assets[0].base64) {
                const base64 = `data:image/jpeg;base64,${result.assets[0].base64}`;
                setProfileIcon({ imageUri: base64 });
                setShowImageOptions(false);
            }
        } catch (e) {
            Alert.alert('Error', 'Failed to pick image');
        }
    };

    const handleSave = async () => {
        if (!name.trim()) return;

        setLoading(true);
        try {
            const token = await getAccessToken();

            const nameParts = name.trim().split(' ');
            const firstName = nameParts[0];
            const lastName = nameParts.slice(1).join(' ') || '';

            // Save uploaded image or undefined for gradient
            const avatarPayload = profileIcon.imageUri || undefined;

            const profileData = {
                email,
                firstName,
                lastName,
                avatar: avatarPayload
            };

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
                if (edit === 'true') {
                    Alert.alert('Success', 'Profile updated successfully');
                    router.back();
                } else {
                    router.replace('/auth/goal');
                }
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

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: themeColors.background }]}>
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                {viewMode === 'main' && (
                    <>
                        {/* Settings Edit Mode: Header bar with title */}
                        {edit === 'true' && (
                            <View style={styles.headerBar}>
                                <TouchableOpacity style={styles.headerBackButton} onPress={() => router.back()}>
                                    <View style={[styles.backButtonCircle, { backgroundColor: themeColors.surface }]}>
                                        <CaretLeft size={24} color={themeColors.textPrimary} weight="bold" />
                                    </View>
                                </TouchableOpacity>
                                <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]}>Edit Profile</Text>
                                <View style={styles.headerSpacer} />
                            </View>
                        )}

                        {/* Signup Flow: Back button with title section below */}
                        {edit !== 'true' && (
                            <>
                                <TouchableOpacity style={styles.backButtonRow} onPress={() => router.back()}>
                                    <View style={[styles.backButtonCircle, { backgroundColor: themeColors.surface }]}>
                                        <CaretLeft size={24} color={themeColors.textPrimary} weight="bold" />
                                    </View>
                                </TouchableOpacity>
                                <View style={styles.titleSection}>
                                    <Text style={[styles.title, { color: themeColors.textPrimary }]}>Your Profile</Text>
                                    <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>Introduce yourself to others.</Text>
                                </View>
                            </>
                        )}

                        {/* PFP Section - Image upload only */}
                        <View style={styles.pfpSection}>
                            <TouchableOpacity
                                style={styles.pfpContainer}
                                onPress={pickImage}
                            >
                                {profileIcon.imageUri ? (
                                    <Image source={{ uri: profileIcon.imageUri }} style={styles.largeAvatar} />
                                ) : (
                                    <LinearGradient
                                        colors={getUserGradient(user?.id || name)}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 1 }}
                                        style={styles.largeAvatar}
                                    >
                                        <Text style={styles.largeAvatarText}>{name ? name[0].toUpperCase() : 'U'}</Text>
                                    </LinearGradient>
                                )}
                                <View style={[styles.cameraIcon, { backgroundColor: themeColors.background }]}>
                                    <Camera size={20} color={themeColors.textPrimary} weight="fill" />
                                </View>
                            </TouchableOpacity>
                        </View>

                        {/* Name Input */}
                        <View style={styles.formGroup}>
                            <Text style={[styles.label, { color: themeColors.textSecondary }]}>Name</Text>
                            <TextInput
                                style={[styles.input, { backgroundColor: themeColors.surface, color: themeColors.textPrimary }]}
                                placeholder="Your Name"
                                placeholderTextColor={themeColors.textSecondary}
                                value={name}
                                onChangeText={setName}
                                autoCapitalize="words"
                                keyboardAppearance={keyboardAppearance}
                            />
                        </View>
                    </>
                )}

            </ScrollView>

            {/* Fixed Button at Bottom */}
            <Animated.View style={[styles.buttonContainer, { paddingBottom: insets.bottom + 8, transform: [{ translateY: Animated.multiply(keyboardOffset, -1) }], backgroundColor: themeColors.background }]}>
                <Button
                    title="Save Profile"
                    onPress={handleSave}
                    variant="primary"
                    size="large"
                    loading={loading}
                    disabled={!name.trim() || loading}
                />
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FFFFFF',
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 24,
        paddingBottom: 100,
    },
    backButtonRow: {
        paddingVertical: 12,
        marginLeft: -4,
        alignSelf: 'flex-start',
    },
    backButtonCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    // Header bar for settings edit mode
    headerBar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        marginBottom: 16,
    },
    headerBackButton: {
        padding: 4,
        marginLeft: -4,
    },
    headerTitle: {
        flex: 1,
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 18,
        textAlign: 'center',
    },
    headerSpacer: {
        width: 24,
    },
    titleSection: {
        alignItems: 'flex-start',
        marginBottom: 32,
    },
    title: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 28,
        color: Colors.textPrimary,
        marginBottom: 8,
    },
    subtitle: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 16,
        color: Colors.textSecondary,
    },
    pfpSection: {
        marginBottom: 32,
        alignItems: 'center',
        zIndex: 10,
    },
    pfpContainer: {
        width: 120,
        height: 120,
        borderRadius: 60,
        position: 'relative',
    },
    largeAvatar: {
        width: 120,
        height: 120,
        borderRadius: 60,
        justifyContent: 'center',
        alignItems: 'center',
    },
    largeAvatarText: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        color: '#FFFFFF',
        fontSize: 48,
    },
    cameraIcon: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#FFFFFF',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 6,
        elevation: 4,
    },
    imageOptions: {
        position: 'absolute',
        top: 130,
        backgroundColor: 'white',
        borderRadius: 12,
        padding: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 10,
        width: 200,
        zIndex: 50,
    },
    imageOptionItem: {
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    imageOptionText: {
        fontFamily: 'GoogleSansFlex_500Medium',
        color: Colors.textPrimary,
    },
    formGroup: {
        width: '100%',
        marginBottom: 32,
    },
    label: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 14,
        color: Colors.textSecondary,
        marginBottom: 8,
    },
    input: {
        backgroundColor: '#F9FAFB',
        borderRadius: 12,
        padding: 16,
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 16,
        color: Colors.textPrimary,
    },
    buttonContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingHorizontal: 24,
        backgroundColor: '#FFFFFF',
    },

    // Emoji View
    emojiContent: {
        alignItems: 'center',
        paddingTop: 20,
    },
    backButton: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        marginBottom: 24,
        gap: 4,
    },
    backButtonText: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 16,
        color: Colors.textSecondary,
    },
    viewTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 24,
        color: Colors.textPrimary,
        marginBottom: 32,
    },
    emojiInputContainer: {
        width: 120,
        height: 120,
        borderRadius: 60,
        overflow: 'hidden',
        marginBottom: 32,
    },
    emojiPreviewBg: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emojiInput: {
        fontSize: 60,
        textAlign: 'center',
        width: '100%',
        height: '100%',
    },
    colorGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 16,
        justifyContent: 'center',
        marginTop: 16,
    },
    colorOption: {
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    doneButton: {
        marginTop: 40,
        paddingVertical: 12,
        paddingHorizontal: 32,
        backgroundColor: Colors.primary,
        borderRadius: 24,
    },
    doneButtonText: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        color: 'white',
        fontSize: 16,
    },
    // Tab styles
    tabContainer: {
        flexDirection: 'row',
        borderRadius: 12,
        padding: 4,
        marginBottom: 24,
        width: '100%',
    },
    tab: {
        flex: 1,
        paddingVertical: 12,
        alignItems: 'center',
        borderRadius: 8,
    },
    tabActive: {
        backgroundColor: 'rgba(37, 99, 235, 0.1)',
    },
    tabText: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 14,
    },
    // Emoji grid styles
    emojiGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        justifyContent: 'center',
        paddingHorizontal: 8,
    },
    emojiOption: {
        width: 48,
        height: 48,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emojiOptionSelected: {
        borderWidth: 2,
        borderColor: Colors.primary,
    },
});
