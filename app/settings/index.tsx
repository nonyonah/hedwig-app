import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch, Image, TextInput, Alert, Modal, TouchableWithoutFeedback, Platform, Animated } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';
import { CaretRight, List, CaretDown, Check, ShieldWarning, Lock, Copy, WarningCircle, CheckSquare, Square } from 'phosphor-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, useThemeColors } from '../../theme/colors';
import { useSettings, Theme } from '../../context/SettingsContext';
import { usePrivy } from '@privy-io/expo';
import { LinearGradient } from 'expo-linear-gradient';
import { getUserGradient } from '../../utils/gradientUtils';
import { Sidebar } from '../../components/Sidebar';
import { Button } from '../../components/Button';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { useAnalyticsScreen } from '../../hooks/useAnalyticsScreen';
import Analytics from '../../services/analytics';



const THEMES: { code: Theme; label: string }[] = [
    { code: 'light', label: 'Light' },
    { code: 'dark', label: 'Dark' },
    { code: 'system', label: 'System' },
];

export default function SettingsScreen() {
    // Track screen view
    useAnalyticsScreen('Settings');

    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { theme, setTheme, hapticsEnabled, setHapticsEnabled, liveTrackingEnabled, setLiveTrackingEnabled } = useSettings();
    const themeColors = useThemeColors();
    const { user, logout, getAccessToken } = usePrivy();

    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [conversations, setConversations] = useState<any[]>([]);
    const [userName, setUserName] = useState({ firstName: '', lastName: '' });
    const [profileIcon, setProfileIcon] = useState<{ emoji?: string; colorIndex?: number; imageUri?: string }>({});

    // Modals state
    const [showThemeModal, setShowThemeModal] = useState(false);
    const [showRecoveryWarning, setShowRecoveryWarning] = useState(false);
    const [recoveryAcknowledged, setRecoveryAcknowledged] = useState(false);

    // Security state
    const [biometricsEnabled, setBiometricsEnabled] = useState(false);
    const [isBiometricExporting, setIsBiometricExporting] = useState(false);

    // Animation for bottom sheet
    const slideAnim = useRef(new Animated.Value(0)).current;

    // Parse user data
    const privyUser = user as any;
    const email = privyUser?.email?.address || privyUser?.id || 'User';

    useEffect(() => {
        fetchUserData();
        fetchConversations();
        loadBiometricsState();
    }, []);

    const loadBiometricsState = async () => {
        try {
            const enabled = await AsyncStorage.getItem('biometricsEnabled');
            setBiometricsEnabled(enabled === 'true');
        } catch (error) {
            console.error('Failed to load biometrics state:', error);
        }
    };

    const fetchUserData = async () => {
        try {
            const token = await getAccessToken();
            if (!token) return;
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
            const response = await fetch(`${apiUrl}/api/users/profile`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                const userData = data.data?.user || data.data;
                if (userData) {
                    setUserName({
                        firstName: userData.firstName || '',
                        lastName: userData.lastName || ''
                    });
                    // Parse avatar
                    if (userData.avatar) {
                        try {
                            if (typeof userData.avatar === 'string' && userData.avatar.trim().startsWith('{')) {
                                setProfileIcon(JSON.parse(userData.avatar));
                            } else if (typeof userData.avatar === 'string' && userData.avatar.startsWith('data:')) {
                                setProfileIcon({ imageUri: userData.avatar });
                            }
                        } catch (e) {
                            setProfileIcon({ imageUri: userData.avatar });
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error fetching user:', error);
        }
    };

    const fetchConversations = async () => {
        try {
            const token = await getAccessToken();
            if (!token) return;
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
            const response = await fetch(`${apiUrl}/api/chat/conversations`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                setConversations(data.data || []);
            }
        } catch (error) {
            console.error('Error fetching conversations:', error);
        }
    };

    const handleLogout = async () => {
        Alert.alert(
            "Log Out",
            "Are you sure you want to log out?",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Log Out",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            Analytics.userLoggedOut();
                            await logout();
                            router.replace('/auth/welcome');
                        } catch (error) {
                            console.error('Logout failed:', error);
                            Alert.alert('Error', 'Failed to log out');
                        }
                    }
                }
            ]
        );
    };

    const handleDeleteAccount = () => {
        Alert.alert(
            "Delete Account",
            "Are you sure? This action cannot be undone.",
            [
                { text: "Cancel", style: "cancel" },
                { text: "Delete", style: "destructive", onPress: () => console.log("Delete account") }
            ]
        );
    };

    const toggleBiometrics = async (value: boolean) => {
        if (value) {
            // Enabling biometrics
            const hasHardware = await LocalAuthentication.hasHardwareAsync();
            if (!hasHardware) {
                Alert.alert('Error', 'Biometric hardware not available on this device.');
                return;
            }

            const isEnrolled = await LocalAuthentication.isEnrolledAsync();
            if (!isEnrolled) {
                Alert.alert('Error', 'No biometrics enrolled on this device. Please set them up in settings.');
                return;
            }

            const result = await LocalAuthentication.authenticateAsync({
                promptMessage: 'Authenticate to enable biometrics',
            });

            if (result.success) {
                setBiometricsEnabled(true);
                await AsyncStorage.setItem('biometricsEnabled', 'true');
            }
        } else {
            // Disabling biometrics
            setBiometricsEnabled(false);
            await AsyncStorage.setItem('biometricsEnabled', 'false');
        }
    };

    const renderSelectionModal = (
        visible: boolean,
        onClose: () => void,
        title: string,
        options: any[],
        selectedValue: string,
        onSelect: (val: any) => void
    ) => (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <View style={styles.modalOverlay}>
                {/* iOS blur / Android scrim */}
                {Platform.OS === 'ios' ? (
                    <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
                ) : (
                    <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.32)' }]} />
                )}
                <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => {
                    if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    onClose();
                }} />
                <TouchableWithoutFeedback>
                    <View style={[styles.modalContent, { backgroundColor: themeColors.surface }]}>
                        <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>{title}</Text>
                        {options.map((opt) => (
                            <TouchableOpacity
                                key={opt.code}
                                style={[styles.modalItem, { borderBottomColor: themeColors.border }]}
                                onPress={() => {
                                    if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                    onSelect(opt.code);
                                    onClose();
                                }}
                            >
                                <Text style={[
                                    styles.modalItemText,
                                    { color: themeColors.textPrimary },
                                    selectedValue === opt.code && styles.modalItemTextSelected
                                ]}>
                                    {opt.label}
                                </Text>
                                {selectedValue === opt.code && (
                                    <Check size={20} color={Colors.primary} weight="bold" />
                                )}
                            </TouchableOpacity>
                        ))}
                    </View>
                </TouchableWithoutFeedback>
            </View>
        </Modal>
    );

    const renderRecoveryWarningModal = () => (
        <Modal
            visible={showRecoveryWarning}
            transparent
            animationType="slide"
            onRequestClose={() => {
                setShowRecoveryWarning(false);
                setRecoveryAcknowledged(false);
            }}
        >
            <View style={styles.bottomSheetOverlay}>
                <TouchableOpacity
                    style={StyleSheet.absoluteFill}
                    activeOpacity={1}
                    onPress={() => {
                        if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setShowRecoveryWarning(false);
                        setRecoveryAcknowledged(false);
                    }}
                />
                <View style={[styles.bottomSheetContent, { backgroundColor: themeColors.surface }]}>
                    {/* Handle Bar */}
                    <View style={styles.handleBar} />

                    {/* Shield Icon */}
                    <View style={styles.shieldIconContainer}>
                        <View style={[styles.shieldIconBackground, { backgroundColor: themeColors.border }]}>
                            <ShieldWarning size={32} color={themeColors.textPrimary} weight="fill" />
                        </View>
                    </View>

                    {/* Title */}
                    <Text style={[styles.recoveryTitle, { color: themeColors.textPrimary }]}>
                        Keep Your Recovery Phrase Safe
                    </Text>

                    {/* Subtitle */}
                    <Text style={[styles.recoverySubtitle, { color: themeColors.textSecondary }]}>
                        Your wallet key controls access to your funds. Anyone with it can move assets without permission.
                    </Text>

                    {/* Warning Items */}
                    <View style={styles.warningItemsContainer}>
                        <View style={styles.warningItem}>
                            <Lock size={24} color={themeColors.textSecondary} weight="regular" />
                            <Text style={[styles.warningItemText, { color: themeColors.textPrimary }]}>
                                Your recovery phrase is like a password, keep it secret.
                            </Text>
                        </View>

                        <View style={styles.warningItem}>
                            <Copy size={24} color={themeColors.textSecondary} weight="regular" />
                            <Text style={[styles.warningItemText, { color: themeColors.textPrimary }]}>
                                If you enter it in another app, it can steal your funds and Hedwig account.
                            </Text>
                        </View>

                        <View style={styles.warningItem}>
                            <WarningCircle size={24} color={themeColors.textSecondary} weight="regular" />
                            <Text style={[styles.warningItemText, { color: themeColors.textPrimary }]}>
                                We do not recommend ever sharing it with any app or person.
                            </Text>
                        </View>
                    </View>

                    {/* Checkbox */}
                    <TouchableOpacity
                        style={styles.checkboxContainer}
                        onPress={() => {
                            if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setRecoveryAcknowledged(!recoveryAcknowledged);
                        }}
                    >
                        {recoveryAcknowledged ? (
                            <CheckSquare size={24} color={Colors.primary} weight="fill" />
                        ) : (
                            <Square size={24} color={themeColors.textSecondary} weight="regular" />
                        )}
                        <Text style={[styles.checkboxText, { color: themeColors.textSecondary }]}>
                            I understand that sharing this key could lead to loss of funds.
                        </Text>
                    </TouchableOpacity>

                    {/* Continue Button - with biometric auth */}
                    <Button
                        title={isBiometricExporting ? 'Authenticating...' : 'Continue'}
                        loading={isBiometricExporting}
                        disabled={!recoveryAcknowledged || isBiometricExporting}
                        variant={recoveryAcknowledged ? 'primary' : 'secondary'}
                        size="large"
                        onPress={async () => {
                            if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            setIsBiometricExporting(true);

                            try {
                                // Authenticate with biometrics
                                const authResult = await LocalAuthentication.authenticateAsync({
                                    promptMessage: 'Authenticate to view recovery phrase',
                                    cancelLabel: 'Cancel',
                                    disableDeviceFallback: false,
                                });

                                if (authResult.success) {
                                    setShowRecoveryWarning(false);
                                    setRecoveryAcknowledged(false);

                                    // Open in-app browser
                                    const webClientUrl = process.env.EXPO_PUBLIC_WEB_CLIENT_URL || 'https://hedwig.vercel.app';
                                    const exportUrl = `${webClientUrl}/export-wallet`;
                                    await WebBrowser.openBrowserAsync(exportUrl, {
                                        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
                                        controlsColor: Colors.primary,
                                    });
                                } else {
                                    Alert.alert('Authentication Failed', 'Please try again to access your recovery phrase.');
                                }
                            } catch (error) {
                                console.error('Biometric auth error:', error);
                                Alert.alert('Authentication Error', 'Failed to authenticate. Please try again.');
                            } finally {
                                setIsBiometricExporting(false);
                            }
                        }}
                    />
                </View>
            </View>
        </Modal>
    );

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: themeColors.background }]}>
            {/* Header */}
            <View style={[styles.header, { backgroundColor: themeColors.background }]}>
                <TouchableOpacity
                    style={styles.headerButton}
                    onPress={() => setIsSidebarOpen(true)}
                >
                    <List size={24} color={themeColors.textPrimary} weight="bold" />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]}>Settings</Text>
                <View style={styles.headerButton} />
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

                {/* Profile Settings */}
                <View style={styles.sectionHeaderContainer}>
                    {/* Could add a title here if needed, but per design it seems cleaner without or integrated */}
                </View>
                <TouchableOpacity
                    style={styles.profileCard}
                    onPress={() => router.push({ pathname: '/auth/profile', params: { email: email, edit: 'true' } })}
                >
                    {profileIcon.imageUri ? (
                        <Image source={{ uri: profileIcon.imageUri }} style={styles.avatar} />
                    ) : profileIcon.emoji ? (
                        <View style={[styles.avatar, { backgroundColor: themeColors.surface, justifyContent: 'center', alignItems: 'center' }]}>
                            <Text style={{ fontSize: 20 }}>{profileIcon.emoji}</Text>
                        </View>
                    ) : (
                        <LinearGradient
                            colors={getUserGradient(user?.id)}
                            style={styles.avatar}
                        >
                            <Text style={{ color: 'white', fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 18 }}>
                                {userName.firstName?.[0]?.toUpperCase() || 'U'}
                            </Text>
                        </LinearGradient>
                    )}
                    <View style={styles.profileInfo}>
                        <Text style={[styles.profileName, { color: themeColors.textPrimary }]}>
                            {userName.firstName ? `${userName.firstName} ${userName.lastName}`.trim() : 'Edit Profile'}
                        </Text>
                        <Text style={[styles.profileSubtitle, { color: themeColors.textSecondary }]}>Update name and photo</Text>
                    </View>
                    <CaretRight size={20} color={themeColors.textSecondary} />
                </TouchableOpacity>

                <View style={styles.spacer} />

                {/* General Settings */}
                <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>General Settings</Text>
                <View style={[styles.settingsGroup, { backgroundColor: themeColors.surface }]}>
                    <TouchableOpacity style={styles.settingRow} onPress={() => setShowThemeModal(true)}>
                        <Text style={[styles.settingLabel, { color: themeColors.textPrimary }]}>Theme</Text>
                        <View style={styles.settingValueContainer}>
                            <Text style={[styles.settingValue, { color: themeColors.textSecondary }]}>
                                {THEMES.find(t => t.code === theme)?.label || 'System'}
                            </Text>
                            {/* <CaretDown size={16} color={themeColors.textSecondary} /> */}
                        </View>
                    </TouchableOpacity>

                    <View style={[styles.divider, { backgroundColor: themeColors.border }]} />

                    <View style={styles.settingRow}>
                        <Text style={[styles.settingLabel, { color: themeColors.textPrimary }]}>Haptic Feedback</Text>
                        <Switch
                            trackColor={{ false: themeColors.border, true: Colors.success }}
                            thumbColor={"#FFFFFF"}
                            ios_backgroundColor={themeColors.border}
                            value={hapticsEnabled}
                            onValueChange={setHapticsEnabled}
                        />
                    </View>

                    <View style={[styles.divider, { backgroundColor: themeColors.border }]} />

                    <View style={styles.settingRow}>
                        <Text style={[styles.settingLabel, { color: themeColors.textPrimary }]}>{Platform.OS === 'ios' ? 'Live Activities' : 'Live Updates'}</Text>
                        <Switch
                            trackColor={{ false: themeColors.border, true: Colors.success }}
                            thumbColor={"#FFFFFF"}
                            ios_backgroundColor={themeColors.border}
                            value={liveTrackingEnabled}
                            onValueChange={setLiveTrackingEnabled}
                        />
                    </View>
                </View>

                <View style={styles.spacer} />

                {/* Security */}
                <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>Security</Text>
                <View style={[styles.settingsGroup, { backgroundColor: themeColors.surface }]}>
                    <TouchableOpacity style={styles.settingRow} onPress={() => setShowRecoveryWarning(true)}>
                        <Text style={[styles.settingLabel, { color: themeColors.textPrimary }]}>Recovery Phrase</Text>
                        <CaretRight size={20} color={themeColors.textSecondary} />
                    </TouchableOpacity>

                    <View style={[styles.divider, { backgroundColor: themeColors.border }]} />

                    <View style={styles.settingRow}>
                        <Text style={[styles.settingLabel, { color: themeColors.textPrimary }]}>Biometrics</Text>
                        <Switch
                            trackColor={{ false: themeColors.border, true: Colors.success }}
                            thumbColor={"#FFFFFF"}
                            ios_backgroundColor={themeColors.border}
                            value={biometricsEnabled}
                            onValueChange={toggleBiometrics}
                        />
                    </View>
                </View>

                <View style={styles.spacer} />

                <View style={styles.spacer} />

                {/* Delete Account */}
                <Button
                    title="Delete Account"
                    onPress={handleDeleteAccount}
                    style={{ backgroundColor: '#EF4444' }}
                    textStyle={{ color: '#FFFFFF' }}
                    size="large"
                />

                {/* Log Out */}
                <Button
                    title="Log Out"
                    onPress={handleLogout}
                    style={{ backgroundColor: themeColors.surface, marginTop: 12 }}
                    textStyle={{ color: themeColors.textPrimary }}
                    size="large"
                />

                <View style={styles.footer}>
                    <Text style={styles.versionText}>Version 1.0.0</Text>
                </View>

            </ScrollView>

            <Sidebar
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
                userName={userName}
                conversations={conversations}
                onHomeClick={() => router.push('/')}
                onLoadConversation={(id) => router.push(`/?conversationId=${id}`)}
            />

            {/* Theme Modal */}
            {renderSelectionModal(
                showThemeModal,
                () => setShowThemeModal(false),
                "Select Theme",
                THEMES,
                theme,
                setTheme
            )}

            {/* Recovery Warning Modal */}
            {renderRecoveryWarningModal()}

        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FFFFFF',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 12,
        // backgroundColor: '#FFFFFF', // Overridden
        // Removed border bottom
        height: 60,
    },
    headerButton: {
        width: 40,
        alignItems: 'flex-start',
    },
    headerTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 22, // Increased from 18
        color: Colors.textPrimary,
    },
    content: {
        padding: 20,
        paddingBottom: 60,
    },
    spacer: {
        height: 24,
    },
    sectionTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 14,
        color: Colors.textPrimary,
        marginBottom: 8,
    },
    sectionHeaderContainer: {
        marginBottom: 8,
    },
    infoContainer: {
        backgroundColor: '#F3F4F6',
        padding: 16,
        borderRadius: 12,
    },
    infoText: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 16,
        color: Colors.textSecondary,
    },
    settingsGroup: {
        backgroundColor: '#F9FAFB',
        borderRadius: 12,
        overflow: 'hidden',
    },
    settingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        height: 56,
    },
    settingLabel: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 16,
        color: Colors.textPrimary,
    },
    settingValueContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    settingValue: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 16,
        color: Colors.textSecondary,
        marginRight: 4,
    },
    divider: {
        height: 1,
        backgroundColor: '#F3F4F6',
        marginLeft: 16,
    },
    // Profile Card Styles
    profileCard: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 24,
    },
    avatar: {
        width: 64,
        height: 64,
        borderRadius: 32,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    profileInfo: {
        flex: 1,
    },
    profileName: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 18,
        color: Colors.textPrimary,
        marginBottom: 4,
    },
    profileSubtitle: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 14,
        color: Colors.textSecondary,
    },
    // Buttons
    footer: {
        marginTop: 32,
        alignItems: 'center',
    },
    versionText: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 12,
        color: Colors.textTertiary,
    },
    // Modals
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'center',
        padding: 24,
    },
    modalContent: {
        backgroundColor: 'white',
        borderRadius: 20,
        padding: 24,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 10,
        elevation: 5,
    },
    modalTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 18,
        marginBottom: 16,
        color: Colors.textPrimary,
        textAlign: 'center',
    },
    modalItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    modalItemText: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 16,
        color: Colors.textPrimary,
    },
    modalItemTextSelected: {
        color: Colors.primary,
        fontFamily: 'GoogleSansFlex_600SemiBold',
    },
    // Recovery Warning Modal Styles
    recoveryModalContent: {
        backgroundColor: 'white',
        borderRadius: 24,
        padding: 24,
        marginHorizontal: 24,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 16,
        elevation: 8,
    },
    shieldIconContainer: {
        alignItems: 'center',
        marginBottom: 20,
    },
    shieldIconBackground: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: '#2A2A2E',
        justifyContent: 'center',
        alignItems: 'center',
    },
    recoveryTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 22,
        textAlign: 'center',
        marginBottom: 12,
    },
    recoverySubtitle: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 20,
    },
    warningItemsContainer: {
        marginBottom: 24,
    },
    warningItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 16,
    },
    warningItemText: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 14,
        flex: 1,
        marginLeft: 12,
        lineHeight: 20,
    },
    checkboxContainer: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 20,
    },
    checkboxText: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 14,
        flex: 1,
        marginLeft: 12,
        lineHeight: 20,
    },
    continueButton: {
        borderRadius: 16,
        paddingVertical: 16,
        alignItems: 'center',
    },
    continueButtonText: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 16,
    },
    // Bottom Sheet Styles
    bottomSheetOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    bottomSheetContent: {
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 24,
        paddingBottom: 40,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.15,
        shadowRadius: 16,
        elevation: 8,
    },
    handleBar: {
        width: 40,
        height: 4,
        backgroundColor: '#D1D5DB',
        borderRadius: 2,
        alignSelf: 'center',
        marginBottom: 20,
    },
});
