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

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

// Profile color gradient options (Luma Style)
const PROFILE_COLOR_OPTIONS: readonly [string, string, string][] = [
    ['#60A5FA', '#3B82F6', '#2563EB'], // Blue
    ['#34D399', '#10B981', '#059669'], // Green
    ['#F472B6', '#EC4899', '#DB2777'], // Pink
    ['#FBBF24', '#F59E0B', '#D97706'], // Amber
    ['#A78BFA', '#8B5CF6', '#7C3AED'], // Purple
    ['#F87171', '#EF4444', '#DC2626'], // Red
    ['#2DD4BF', '#14B8A6', '#0D9488'], // Teal
    ['#FB923C', '#F97316', '#EA580C'], // Orange
] as const;

export default function ProfileScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const themeColors = useThemeColors();
    const keyboardAppearance = useKeyboardAppearance();
    const { email, edit } = useLocalSearchParams<{ email: string; edit?: string }>();
    const { getAccessToken, user } = usePrivy();

    // State
    const [name, setName] = useState('');
    const [loading, setLoading] = useState(false);
    const [profileIcon, setProfileIcon] = useState<{ emoji?: string; colorIndex?: number; imageUri?: string }>({});

    // View Mode for Emoji Picker
    const [viewMode, setViewMode] = useState<'main' | 'emoji'>('main');
    const [showImageOptions, setShowImageOptions] = useState(false);

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

            let avatarPayload = undefined;
            if (profileIcon.imageUri) avatarPayload = profileIcon.imageUri;
            else if (profileIcon.emoji) avatarPayload = JSON.stringify(profileIcon);
            else if (profileIcon.colorIndex !== undefined) avatarPayload = JSON.stringify(profileIcon);

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
                        <View style={styles.titleSection}>
                            <Text style={[styles.title, { color: themeColors.textPrimary }]}>Your Profile</Text>
                            <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>Introduce yourself to others.</Text>
                        </View>

                        {/* PFP Section */}
                        <View style={styles.pfpSection}>
                            <TouchableOpacity
                                style={styles.pfpContainer}
                                onPress={() => setShowImageOptions(!showImageOptions)}
                            >
                                {profileIcon.imageUri ? (
                                    <Image source={{ uri: profileIcon.imageUri }} style={styles.largeAvatar} />
                                ) : (
                                    <LinearGradient
                                        colors={profileIcon.colorIndex !== undefined
                                            ? PROFILE_COLOR_OPTIONS[profileIcon.colorIndex]
                                            : (profileIcon.emoji ? ['#F3F4F6', '#E5E7EB', '#D1D5DB'] : getUserGradient(user?.id || name))}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 1 }}
                                        style={styles.largeAvatar}
                                    >
                                        {profileIcon.emoji ? (
                                            <Text style={{ fontSize: 40 }}>{profileIcon.emoji}</Text>
                                        ) : (
                                            <Text style={styles.largeAvatarText}>{name ? name[0].toUpperCase() : 'U'}</Text>
                                        )}
                                    </LinearGradient>
                                )}
                                <View style={[styles.cameraIcon, { backgroundColor: themeColors.background }]}>
                                    <Camera size={20} color={themeColors.textPrimary} weight="fill" />
                                </View>
                            </TouchableOpacity>

                            {showImageOptions && (
                                <View style={[styles.imageOptions, { backgroundColor: themeColors.surface }]}>
                                    <TouchableOpacity style={[styles.imageOptionItem, { borderBottomColor: themeColors.border }]} onPress={pickImage}>
                                        <Text style={[styles.imageOptionText, { color: themeColors.textPrimary }]}>Choose from Library</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.imageOptionItem} onPress={() => {
                                        setProfileIcon({ emoji: '😀', colorIndex: 0 });
                                        setViewMode('emoji');
                                        setShowImageOptions(false);
                                    }}>
                                        <Text style={[styles.imageOptionText, { color: themeColors.textPrimary }]}>Use Emoji</Text>
                                    </TouchableOpacity>
                                </View>
                            )}
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

                {viewMode === 'emoji' && (
                    <View style={styles.emojiContent}>
                        <TouchableOpacity style={styles.backButton} onPress={() => setViewMode('main')}>
                            <CaretLeft size={20} color={themeColors.textSecondary} />
                            <Text style={[styles.backButtonText, { color: themeColors.textSecondary }]}>Back</Text>
                        </TouchableOpacity>

                        <Text style={[styles.viewTitle, { color: themeColors.textPrimary }]}>Choose Emoji</Text>

                        <View style={styles.emojiInputContainer}>
                            <LinearGradient
                                colors={PROFILE_COLOR_OPTIONS[profileIcon.colorIndex || 0]}
                                style={styles.emojiPreviewBg}
                            >
                                <TextInput
                                    style={styles.emojiInput}
                                    value={profileIcon.emoji || ''}
                                    onChangeText={(text) => {
                                        if (text.length > 0) setProfileIcon(prev => ({ ...prev, emoji: text.slice(-2) }));
                                        else setProfileIcon(prev => ({ ...prev, emoji: '' }));
                                    }}
                                    placeholder="😀"
                                    maxLength={2}
                                />
                            </LinearGradient>
                        </View>

                        <Text style={[styles.label, { marginTop: 24, color: themeColors.textSecondary }]}>Background Color</Text>
                        <View style={styles.colorGrid}>
                            {PROFILE_COLOR_OPTIONS.map((colors, idx) => (
                                <TouchableOpacity
                                    key={idx}
                                    style={[styles.colorOption, { backgroundColor: colors[1] }]}
                                    onPress={() => setProfileIcon(prev => ({ ...prev, colorIndex: idx }))}
                                >
                                    {profileIcon.colorIndex === idx && <Check size={16} color="white" weight="bold" />}
                                </TouchableOpacity>
                            ))}
                        </View>

                        <TouchableOpacity style={styles.doneButton} onPress={() => setViewMode('main')}>
                            <Text style={styles.doneButtonText}>Done</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </ScrollView>

            {/* Fixed Button at Bottom */}
            {viewMode === 'main' && (
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
            )}
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
    titleSection: {
        alignItems: 'center',
        marginTop: 40,
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
    }
});
