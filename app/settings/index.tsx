import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch, Image, TextInput, Alert, TouchableWithoutFeedback, Platform, Animated, ActivityIndicator } from 'react-native';
import { BottomSheetModal, BottomSheetView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { TrueSheet } from '@hedwig/true-sheet';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import * as WebBrowser from 'expo-web-browser';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, useThemeColors } from '../../theme/colors';
import { useSettings, Theme } from '../../context/SettingsContext';
import { useAuth } from '../../hooks/useAuth';
import { useBillingStatus } from '../../hooks/useBillingStatus';
import { LinearGradient } from 'expo-linear-gradient';
import { getUserGradient } from '../../utils/gradientUtils';
import { Sidebar } from '../../components/Sidebar';
import { Button } from '../../components/Button';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { useAnalyticsScreen } from '../../hooks/useAnalyticsScreen';
import Analytics from '../../services/analytics';
import { useKYC } from '../../hooks/useKYC';
import KYCVerificationModal from '../../components/KYCVerificationModal';
import { useTutorial } from '../../hooks/useTutorial';
import { getPublicWebBaseUrl } from '../../utils/publicWebUrl';
import { Linking } from 'react-native';
import { SvgXml } from 'react-native-svg';
import IOSGlassIconButton from '../../components/ui/IOSGlassIconButton';
import {
    ChevronRight as CaretRight,
    Check,
    ShieldAlert as ShieldWarning,
    Lock,
    Copy,
    AlertCircle as WarningCircle,
    SquareCheck as CheckSquare,
    Square,
    ChevronLeft as CaretLeft,
    Calendar as CalendarIcon,
} from '../../components/ui/AppIcon';


const GOOGLE_CALENDAR_SVG = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <g transform="translate(3.75 3.75)">
    <path fill="#FFFFFF" d="M148.882,43.618l-47.368-5.263l-57.895,5.263L38.355,96.25l5.263,52.632l52.632,6.579l52.632-6.579l5.263-53.947L148.882,43.618z"/>
    <path fill="#1A73E8" d="M65.211,125.276c-3.934-2.658-6.658-6.539-8.145-11.671l9.132-3.763c0.829,3.158,2.276,5.605,4.342,7.342c2.053,1.737,4.553,2.592,7.474,2.592c2.987,0,5.553-0.908,7.697-2.724s3.224-4.132,3.224-6.934c0-2.868-1.132-5.211-3.395-7.026s-5.105-2.724-8.5-2.724h-5.276v-9.039H76.5c2.921,0,5.382-0.789,7.382-2.368c2-1.579,3-3.737,3-6.487c0-2.447-0.895-4.395-2.684-5.855s-4.053-2.197-6.803-2.197c-2.684,0-4.816,0.711-6.395,2.145s-2.724,3.197-3.447,5.276l-9.039-3.763c1.197-3.395,3.395-6.395,6.618-8.987c3.224-2.592,7.342-3.895,12.342-3.895c3.697,0,7.026,0.711,9.974,2.145c2.947,1.434,5.263,3.421,6.934,5.947c1.671,2.539,2.5,5.382,2.5,8.539c0,3.224-0.776,5.947-2.329,8.184c-1.553,2.237-3.461,3.947-5.724,5.145v0.539c2.987,1.25,5.421,3.158,7.342,5.724c1.908,2.566,2.868,5.632,2.868,9.211s-0.908,6.776-2.724,9.579c-1.816,2.803-4.329,5.013-7.513,6.618c-3.197,1.605-6.789,2.421-10.776,2.421C73.408,129.263,69.145,127.934,65.211,125.276z"/>
    <path fill="#1A73E8" d="M121.25,79.961l-9.974,7.25l-5.013-7.605l17.987-12.974h6.895v61.197h-9.895L121.25,79.961z"/>
    <path fill="#EA4335" d="M148.882,196.25l47.368-47.368l-23.684-10.526l-23.684,10.526l-10.526,23.684L148.882,196.25z"/>
    <path fill="#34A853" d="M33.092,172.566l10.526,23.684h105.263v-47.368H43.618L33.092,172.566z"/>
    <path fill="#4285F4" d="M12.039-3.75C3.316-3.75-3.75,3.316-3.75,12.039v136.842l23.684,10.526l23.684-10.526V43.618h105.263l10.526-23.684L148.882-3.75H12.039z"/>
    <path fill="#188038" d="M-3.75,148.882v31.579c0,8.724,7.066,15.789,15.789,15.789h31.579v-47.368H-3.75z"/>
    <path fill="#FBBC04" d="M148.882,43.618v105.263h47.368V43.618l-23.684-10.526L148.882,43.618z"/>
    <path fill="#1967D2" d="M196.25,43.618V12.039c0-8.724-7.066-15.789-15.789-15.789h-31.579v47.368H196.25z"/>
  </g>
</svg>`;

const APPLE_CALENDAR_SVG = `<svg viewBox="0 0 41.5 51" xmlns="http://www.w3.org/2000/svg">
  <path d="M40.2,17.4c-3.4,2.1-5.5,5.7-5.5,9.7c0,4.5,2.7,8.6,6.8,10.3c-0.8,2.6-2,5-3.5,7.2c-2.2,3.1-4.5,6.3-7.9,6.3s-4.4-2-8.4-2c-3.9,0-5.3,2.1-8.5,2.1s-5.4-2.9-7.9-6.5C2,39.5,0.1,33.7,0,27.6c0-9.9,6.4-15.2,12.8-15.2c3.4,0,6.2,2.2,8.3,2.2c2,0,5.2-2.3,9-2.3C34.1,12.2,37.9,14.1,40.2,17.4z M28.3,8.1C30,6.1,30.9,3.6,31,1c0-0.3,0-0.7-0.1-1c-2.9,0.3-5.6,1.7-7.5,3.9c-1.7,1.9-2.7,4.3-2.8,6.9c0,0.3,0,0.6,0.1,0.9c0.2,0,0.5,0.1,0.7,0.1C24.1,11.6,26.6,10.2,28.3,8.1z" fill="black"/>
</svg>`;


const THEMES: { code: Theme; label: string }[] = [
    { code: 'light', label: 'Light' },
    { code: 'dark', label: 'Dark' },
    { code: 'system', label: 'System' },
];

type TrueSheetLikeRef = {
    present: (index?: number, animated?: boolean) => Promise<void>;
    dismiss: (animated?: boolean) => Promise<void>;
};

const TrueSheetComponent: React.ComponentType<any> | null = TrueSheet as unknown as React.ComponentType<any>;

let SwiftUIBottomSheet: any = null;
let SwiftUIGroup: any = null;
let presentationDetentsModifier: any = null;
let presentationDragIndicatorModifier: any = null;
if (Platform.OS === 'ios') {
    try {
        const swiftUI = require('@expo/ui/swift-ui');
        SwiftUIBottomSheet = swiftUI.BottomSheet;
        SwiftUIGroup = swiftUI.Group;
        const swiftUIModifiers = require('@expo/ui/swift-ui/modifiers');
        presentationDetentsModifier = swiftUIModifiers.presentationDetents;
        presentationDragIndicatorModifier = swiftUIModifiers.presentationDragIndicator;
    } catch (e) {
        console.warn('Failed to load iOS SwiftUI BottomSheet:', e);
    }
}

export default function SettingsScreen() {
    // Track screen view
    useAnalyticsScreen('Settings');

    const router = useRouter();
    const insets = useSafeAreaInsets();
    const {
        theme,
        setTheme,
        hapticsEnabled,
        setHapticsEnabled,
        liveTrackingEnabled,
        setLiveTrackingEnabled,
        lockScreenEnabled,
        setLockScreenEnabled
    } = useSettings();
    const themeColors = useThemeColors();
    const { user, logout, getAccessToken } = useAuth();
    const {
        hasActiveEntitlement,
        isLoadingBillingStatus,
        isBillingEnforcementEnabled,
        refreshBillingStatus,
    } = useBillingStatus({ autoConfigureRevenueCat: false });


    const { replayTutorial } = useTutorial();

    const [conversations, setConversations] = useState<any[]>([]);
    const [userName, setUserName] = useState({ firstName: '', lastName: '' });
    const [profileIcon, setProfileIcon] = useState<{ emoji?: string; colorIndex?: number; imageUri?: string }>({});

    // Modals refs
    const themeSheetRef = useRef<TrueSheetLikeRef | null>(null);
    const themeFallbackSheetRef = useRef<BottomSheetModal>(null);
    const recoverySheetRef = useRef<TrueSheetLikeRef | null>(null);
    const recoveryFallbackSheetRef = useRef<BottomSheetModal>(null);
    const calendarSheetRef = useRef<TrueSheetLikeRef | null>(null);
    const calendarFallbackSheetRef = useRef<BottomSheetModal>(null);
    const [recoveryAcknowledged, setRecoveryAcknowledged] = useState(false);
    const [calendarSubscribeUrl, setCalendarSubscribeUrl] = useState<string | null>(null);
    const [isFetchingCalendarLink, setIsFetchingCalendarLink] = useState(false);
    const [isThemeSheetPresented, setIsThemeSheetPresented] = useState(false);
    const [isRecoverySheetPresented, setIsRecoverySheetPresented] = useState(false);
    const [isCalendarSheetPresented, setIsCalendarSheetPresented] = useState(false);

    // Security state
    const [biometricsEnabled, setBiometricsEnabled] = useState(false);
    const [isBiometricExporting, setIsBiometricExporting] = useState(false);

    const kycSheetRef = useRef<TrueSheet>(null);
    const [isCheckingConnection, setIsCheckingConnection] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState<'unknown' | 'online' | 'offline'>('unknown');

    // KYC status
    const { status: kycStatus, isApproved: isKYCApproved, fetchStatus: fetchKYCStatus } = useKYC();

    // Animation for bottom sheet
    const slideAnim = useRef(new Animated.Value(0)).current;

    // Parse user data
    const privyUser = user as any;
    const email = privyUser?.email?.address || privyUser?.id || 'User';
    // Use the TrueSheet shim path for stability.
    // On iOS this still renders native SwiftUI sheets via `@hedwig/true-sheet`.
    const shouldUseSwiftUIBottomSheet = false;

    useEffect(() => {
        fetchUserData();
        fetchConversations();
        loadBiometricsState();
    }, []);

    // Refetch profile data when screen comes into focus
    useFocusEffect(
        React.useCallback(() => {
            if (user) {
                fetchUserData();
                void refreshBillingStatus();
            }
        }, [refreshBillingStatus, user])
    );

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
                    // Parse avatar - handle data URIs and regular URLs
                    if (userData.avatar) {
                        if (userData.avatar.startsWith('data:') || userData.avatar.startsWith('http')) {
                            setProfileIcon({ imageUri: userData.avatar });
                        } else {
                            try {
                                const parsed = JSON.parse(userData.avatar);
                                if (parsed.imageUri) {
                                    setProfileIcon({ imageUri: parsed.imageUri });
                                }
                            } catch (e) {
                                setProfileIcon({ imageUri: userData.avatar });
                            }
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
            "Are you sure you want to delete your account? Your data will be permanently deleted after 90 days. You can log back in within this period to restore your account.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            const token = await getAccessToken();
                            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

                            const response = await fetch(`${apiUrl}/api/users/account`, {
                                method: 'DELETE',
                                headers: {
                                    'Authorization': `Bearer ${token}`,
                                    'Content-Type': 'application/json',
                                },
                            });

                            const data = await response.json();

                            if (data.success) {
                                // Track account deletion
                                Analytics.userLoggedOut();

                                Alert.alert(
                                    "Account Scheduled for Deletion",
                                    `Your account will be permanently deleted on ${new Date(data.data.deletionScheduledFor).toLocaleDateString()}. Log back in within 90 days to restore your account.`,
                                    [
                                        {
                                            text: "OK",
                                            onPress: async () => {
                                                await logout();
                                                router.replace('/auth/welcome');
                                            }
                                        }
                                    ]
                                );
                            } else {
                                Alert.alert('Error', data.error?.message || 'Failed to delete account');
                            }
                        } catch (error) {
                            console.error('Delete account error:', error);
                            Alert.alert('Error', 'Failed to delete account. Please try again.');
                        }
                    }
                }
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

    const checkConnection = async () => {
        try {
            setIsCheckingConnection(true);
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
            const healthResponse = await fetch(`${apiUrl}/health`);
            if (healthResponse.ok) {
                setConnectionStatus('online');
                return;
            }
            const token = await getAccessToken();
            const profileResponse = await fetch(`${apiUrl}/api/users/profile`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            setConnectionStatus(profileResponse.ok ? 'online' : 'offline');
        } catch {
            setConnectionStatus('offline');
        } finally {
            setIsCheckingConnection(false);
        }
    };

    const fetchCalendarSubscribeLink = async () => {
        try {
            setIsFetchingCalendarLink(true);
            const token = await getAccessToken();
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
            const res = await fetch(`${apiUrl}/api/calendar/ics-token`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            if (data.success && data.data?.subscribeUrl) {
                setCalendarSubscribeUrl(data.data.subscribeUrl);
            } else {
                Alert.alert('Error', 'Failed to fetch calendar subscribe link');
            }
        } catch (error) {
            console.error('Failed to fetch calendar subscribe link:', error);
            Alert.alert('Error', 'Failed to fetch calendar subscribe link');
        } finally {
            setIsFetchingCalendarLink(false);
        }
    };

    const openCalendarSheet = async () => {
        if (shouldUseSwiftUIBottomSheet) {
            setIsCalendarSheetPresented(true);
        } else if (TrueSheetComponent && calendarSheetRef.current?.present) {
            await calendarSheetRef.current.present().catch(() => {});
        } else {
            calendarFallbackSheetRef.current?.present();
        }
        if (!calendarSubscribeUrl && !isFetchingCalendarLink) {
            await fetchCalendarSubscribeLink();
        }
    };

    const openThemeSheet = async () => {
        if (shouldUseSwiftUIBottomSheet) {
            setIsThemeSheetPresented(true);
        } else if (TrueSheetComponent && themeSheetRef.current?.present) {
            await themeSheetRef.current.present().catch(() => {});
        } else {
            themeFallbackSheetRef.current?.present();
        }
    };

    const closeThemeSheet = async () => {
        if (shouldUseSwiftUIBottomSheet) {
            setIsThemeSheetPresented(false);
        } else if (TrueSheetComponent && themeSheetRef.current?.dismiss) {
            await themeSheetRef.current.dismiss().catch(() => {});
        } else {
            themeFallbackSheetRef.current?.dismiss();
        }
    };

    const openRecoverySheet = async () => {
        if (shouldUseSwiftUIBottomSheet) {
            setIsRecoverySheetPresented(true);
        } else if (TrueSheetComponent && recoverySheetRef.current?.present) {
            await recoverySheetRef.current.present().catch(() => {});
        } else {
            recoveryFallbackSheetRef.current?.present();
        }
    };

    const closeRecoverySheet = async () => {
        if (shouldUseSwiftUIBottomSheet) {
            setIsRecoverySheetPresented(false);
        } else if (TrueSheetComponent && recoverySheetRef.current?.dismiss) {
            await recoverySheetRef.current.dismiss().catch(() => {});
        } else {
            recoveryFallbackSheetRef.current?.dismiss();
        }
        setRecoveryAcknowledged(false);
    };

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: themeColors.background }]}>
            {/* Header */}
            <View style={[styles.header, { backgroundColor: themeColors.background }]}>
                <View style={styles.headerTop}>
                    <IOSGlassIconButton
                        onPress={() => router.back()}
                        systemImage="chevron.left"
                        containerStyle={styles.headerButton}
                        circleStyle={[styles.backButtonCircle, { backgroundColor: themeColors.surface }]}
                        icon={<CaretLeft size={26} color={themeColors.textPrimary} strokeWidth={3.5} />}
                    />
                    <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]}>Settings</Text>
                    <View style={styles.headerSpacer} />
                </View>
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
                    ) : (
                        <LinearGradient
                            colors={getUserGradient(user?.id)}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.avatar}
                        >
                            <Text style={{ color: 'white', fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 18 }}>
                                {userName.firstName?.[0]?.toUpperCase() || 'U'}
                            </Text>
                        </LinearGradient>
                    )}
                    <View style={styles.profileInfo}>
                        <View style={styles.profileNameRow}>
                            <Text style={[styles.profileName, { color: themeColors.textPrimary }]}>
                                {userName.firstName ? `${userName.firstName} ${userName.lastName}`.trim() : 'Edit Profile'}
                            </Text>
                            {hasActiveEntitlement ? (
                                <View style={styles.proBadge}>
                                    <Text style={styles.proBadgeText}>PRO</Text>
                                </View>
                            ) : null}
                        </View>
                        <Text style={[styles.profileSubtitle, { color: themeColors.textSecondary }]}>Update name and photo</Text>
                    </View>
                    <CaretRight size={20} color={themeColors.textSecondary} />
                </TouchableOpacity>

                <View style={styles.spacer} />

                {/* General Settings */}
                <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>General Settings</Text>
                <View style={[styles.settingsGroup, { backgroundColor: themeColors.surface }]}>
                    <TouchableOpacity style={styles.settingRow} onPress={openThemeSheet}>
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

                    <View style={[styles.divider, { backgroundColor: themeColors.border }]} />

                    <TouchableOpacity style={styles.settingRow} onPress={checkConnection} disabled={isCheckingConnection}>
                        <Text style={[styles.settingLabel, { color: themeColors.textPrimary }]}>Connection diagnostics</Text>
                        <Text
                            style={[
                                styles.settingValue,
                                {
                                    color:
                                        connectionStatus === 'online'
                                            ? Colors.success
                                            : connectionStatus === 'offline'
                                                ? Colors.error
                                                : themeColors.textSecondary,
                                },
                            ]}
                        >
                            {isCheckingConnection ? 'Checking...' : connectionStatus === 'online' ? 'Online' : connectionStatus === 'offline' ? 'Offline' : 'Unknown'}
                        </Text>
                    </TouchableOpacity>
                    <View style={[styles.divider, { backgroundColor: themeColors.border }]} />

                    <TouchableOpacity
                        style={styles.settingRow}
                        onPress={async () => {
                            await replayTutorial();
                            router.replace('/(drawer)/(tabs)');
                        }}
                    >
                        <Text style={[styles.settingLabel, { color: themeColors.textPrimary }]}>Show app tutorial</Text>
                        <CaretRight size={20} color={themeColors.textSecondary} />
                    </TouchableOpacity>

                    <View style={[styles.divider, { backgroundColor: themeColors.border }]} />

                    <TouchableOpacity style={styles.settingRow} onPress={openCalendarSheet}>
                        <Text style={[styles.settingLabel, { color: themeColors.textPrimary }]}>Connect calendar</Text>
                        <CaretRight size={20} color={themeColors.textSecondary} />
                    </TouchableOpacity>
                </View>

                <View style={styles.spacer} />

                <>
                    <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>Billing</Text>
                    <View style={[styles.settingsGroup, { backgroundColor: themeColors.surface }]}>
                        <TouchableOpacity
                            style={styles.settingRow}
                            onPress={() => {
                                if (hasActiveEntitlement) {
                                    router.push({ pathname: '/paywall', params: { mode: 'manage' } });
                                    return;
                                }
                                router.push('/paywall');
                            }}
                        >
                            <Text style={[styles.settingLabel, { color: themeColors.textPrimary }]}>
                                {hasActiveEntitlement ? 'Manage subscription' : 'View Pro plan'}
                            </Text>
                            <View style={styles.settingValueContainer}>
                                <Text style={[styles.settingValue, { color: themeColors.textSecondary }]}>
                                    {isLoadingBillingStatus
                                        ? 'Checking...'
                                        : hasActiveEntitlement
                                            ? 'Pro active'
                                            : isBillingEnforcementEnabled
                                                ? 'Required'
                                                : 'Upgrade'}
                                </Text>
                                <CaretRight size={20} color={themeColors.textSecondary} />
                            </View>
                        </TouchableOpacity>
                    </View>
                    <View style={styles.spacer} />
                </>

                {/* Security */}
                <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>Security</Text>
                <View style={[styles.settingsGroup, { backgroundColor: themeColors.surface }]}>
                    <TouchableOpacity style={styles.settingRow} onPress={openRecoverySheet}>
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

                    <View style={[styles.divider, { backgroundColor: themeColors.border }]} />

                    <View style={styles.settingRow}>
                        <Text style={[styles.settingLabel, { color: themeColors.textPrimary }]}>Lock Screen</Text>
                        <Switch
                            trackColor={{ false: themeColors.border, true: Colors.success }}
                            thumbColor={"#FFFFFF"}
                            ios_backgroundColor={themeColors.border}
                            value={lockScreenEnabled}
                            onValueChange={(value) => { void setLockScreenEnabled(value); }}
                        />
                    </View>

                    <View style={[styles.divider, { backgroundColor: themeColors.border }]} />

                    <TouchableOpacity style={styles.settingRow} onPress={() => kycSheetRef.current?.present()}>
                        <Text style={[styles.settingLabel, { color: themeColors.textPrimary }]}>Identity Verification</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <View style={[
                                styles.kycBadge,
                                kycStatus === 'approved' && styles.kycBadgeApproved,
                                kycStatus === 'pending' && styles.kycBadgePending,
                                (kycStatus === 'not_started' || kycStatus === 'rejected' || kycStatus === 'retry_required') && styles.kycBadgeUnverified,
                            ]}>
                                <Text style={[
                                    styles.kycBadgeText,
                                    kycStatus === 'approved' && styles.kycBadgeTextApproved,
                                    kycStatus === 'pending' && styles.kycBadgeTextPending,
                                    (kycStatus === 'not_started' || kycStatus === 'rejected' || kycStatus === 'retry_required') && styles.kycBadgeTextUnverified,
                                ]}>
                                    {kycStatus === 'approved' ? 'Verified' : kycStatus === 'pending' ? 'Pending' : 'Unverified'}
                                </Text>
                            </View>
                            <CaretRight size={20} color={themeColors.textSecondary} />
                        </View>
                    </TouchableOpacity>
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


            {/* Theme Modal */}
            {shouldUseSwiftUIBottomSheet ? (
                <SwiftUIBottomSheet
                    isPresented={isThemeSheetPresented}
                    onIsPresentedChange={setIsThemeSheetPresented}
                    fitToContents
                >
                    <SwiftUIGroup
                        modifiers={[
                            ...(presentationDetentsModifier ? [presentationDetentsModifier([{ height: 320 }])] : []),
                            ...(presentationDragIndicatorModifier ? [presentationDragIndicatorModifier('visible')] : []),
                        ]}
                    >
                        <View style={{ padding: 24, paddingTop: 34, paddingBottom: 40, backgroundColor: themeColors.background }}>
                            <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>Select Theme</Text>
                            {THEMES.map((opt) => (
                                <TouchableOpacity
                                    key={opt.code}
                                    style={[styles.modalItem, { borderBottomColor: themeColors.border }]}
                                    onPress={async () => {
                                        if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                        setTheme(opt.code);
                                        await closeThemeSheet();
                                    }}
                                >
                                    <Text style={[
                                        styles.modalItemText,
                                        { color: themeColors.textPrimary },
                                        theme === opt.code && styles.modalItemTextSelected
                                    ]}>
                                        {opt.label}
                                    </Text>
                                    {theme === opt.code && (
                                        <Check size={20} color={Colors.primary} strokeWidth={3} />
                                    )}
                                </TouchableOpacity>
                            ))}
                        </View>
                    </SwiftUIGroup>
                </SwiftUIBottomSheet>
            ) : TrueSheetComponent ? (
                <TrueSheetComponent
                    ref={themeSheetRef}
                    detents={['auto']}
                    cornerRadius={Platform.OS === 'ios' ? 50 : 24}
                    backgroundColor={Platform.OS === 'ios' ? undefined : themeColors.background}
                >
                    <View style={{ padding: 24, paddingTop: Platform.OS === 'ios' ? 34 : 24, paddingBottom: 40 }}>
                        <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>Select Theme</Text>
                        {THEMES.map((opt) => (
                            <TouchableOpacity
                                key={opt.code}
                                style={[styles.modalItem, { borderBottomColor: themeColors.border }]}
                                onPress={async () => {
                                    if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                    setTheme(opt.code);
                                    await closeThemeSheet();
                                }}
                            >
                                <Text style={[
                                    styles.modalItemText,
                                    { color: themeColors.textPrimary },
                                    theme === opt.code && styles.modalItemTextSelected
                                ]}>
                                    {opt.label}
                                </Text>
                                {theme === opt.code && (
                                    <Check size={20} color={Colors.primary} strokeWidth={3} />
                                )}
                            </TouchableOpacity>
                        ))}
                    </View>
                </TrueSheetComponent>
            ) : (
                <BottomSheetModal
                    ref={themeFallbackSheetRef}
                    index={0}
                    enableDynamicSizing={true}
                    enablePanDownToClose={true}
                    backdropComponent={(props) => (
                        <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.5} />
                    )}
                    backgroundStyle={{
                        backgroundColor: themeColors.background,
                        borderTopLeftRadius: Platform.OS === 'ios' ? 50 : 24,
                        borderTopRightRadius: Platform.OS === 'ios' ? 50 : 24,
                    }}
                    handleIndicatorStyle={{ backgroundColor: themeColors.textSecondary }}
                >
                    <BottomSheetView style={{ padding: 24, paddingBottom: 40 }}>
                        <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>Select Theme</Text>
                        {THEMES.map((opt) => (
                            <TouchableOpacity
                                key={opt.code}
                                style={[styles.modalItem, { borderBottomColor: themeColors.border }]}
                                onPress={async () => {
                                    if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                    setTheme(opt.code);
                                    await closeThemeSheet();
                                }}
                            >
                                <Text style={[
                                    styles.modalItemText,
                                    { color: themeColors.textPrimary },
                                    theme === opt.code && styles.modalItemTextSelected
                                ]}>
                                    {opt.label}
                                </Text>
                                {theme === opt.code && (
                                    <Check size={20} color={Colors.primary} strokeWidth={3} />
                                )}
                            </TouchableOpacity>
                        ))}
                    </BottomSheetView>
                </BottomSheetModal>
            )}

            {/* Recovery Warning Modal */}
            {shouldUseSwiftUIBottomSheet ? (
                <SwiftUIBottomSheet
                    isPresented={isRecoverySheetPresented}
                    onIsPresentedChange={(isPresented: boolean) => {
                        setIsRecoverySheetPresented(isPresented);
                        if (!isPresented) {
                            setRecoveryAcknowledged(false);
                        }
                    }}
                >
                    <SwiftUIGroup
                        modifiers={[
                            ...(presentationDetentsModifier ? [presentationDetentsModifier(['medium', 'large'])] : []),
                            ...(presentationDragIndicatorModifier ? [presentationDragIndicatorModifier('visible')] : []),
                        ]}
                    >
                        <View style={{ padding: 24, paddingTop: 34, paddingBottom: 40, backgroundColor: themeColors.background }}>
                            {/* Shield Icon */}
                            <View style={styles.shieldIconContainer}>
                                <View style={[styles.shieldIconBackground, { backgroundColor: themeColors.border }]}>
                                    <ShieldWarning size={32} color={themeColors.textPrimary} fill={themeColors.textPrimary} />
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
                                    <Lock size={24} color={themeColors.textSecondary} />
                                    <Text style={[styles.warningItemText, { color: themeColors.textPrimary }]}>
                                        Your recovery phrase is like a password, keep it secret.
                                    </Text>
                                </View>

                                <View style={styles.warningItem}>
                                    <Copy size={24} color={themeColors.textSecondary} />
                                    <Text style={[styles.warningItemText, { color: themeColors.textPrimary }]}>
                                        If you enter it in another app, it can steal your funds and Hedwig account.
                                    </Text>
                                </View>

                                <View style={styles.warningItem}>
                                    <WarningCircle size={24} color={themeColors.textSecondary} />
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
                                    <CheckSquare size={24} color={Colors.primary} fill={Colors.primary} />
                                ) : (
                                    <Square size={24} color={themeColors.textSecondary} />
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
                                            // Build URL first - fallback to API host in production if web client URL isn't set
                                            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
                                            const apiBaseUrl = apiUrl.replace(/\/api\/?$/, '').replace(/\/$/, '');
                                            const webClientUrl = getPublicWebBaseUrl(process.env.EXPO_PUBLIC_WEB_CLIENT_URL || apiBaseUrl);
                                            const exportUrl = `${webClientUrl}/export-wallet`;

                                            // Close modal AFTER a small delay to let browser open
                                            setIsBiometricExporting(false);

                                            // Open in-app browser first
                                            await WebBrowser.openBrowserAsync(exportUrl, {
                                                presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
                                                controlsColor: Colors.primary,
                                            });

                                            // Close modal after browser is dismissed
                                            await closeRecoverySheet();
                                        } else {
                                            setIsBiometricExporting(false);
                                            Alert.alert('Authentication Failed', 'Please try again to access your recovery phrase.');
                                        }
                                    } catch (error) {
                                        console.error('Biometric auth error:', error);
                                        setIsBiometricExporting(false);
                                        Alert.alert('Authentication Error', 'Failed to authenticate. Please try again.');
                                    }
                                }}
                            />
                        </View>
                    </SwiftUIGroup>
                </SwiftUIBottomSheet>
            ) : TrueSheetComponent ? (
                <TrueSheetComponent
                    ref={recoverySheetRef}
                    detents={['auto']}
                    cornerRadius={Platform.OS === 'ios' ? 50 : 24}
                    backgroundColor={Platform.OS === 'ios' ? undefined : themeColors.background}
                    onDidDismiss={() => setRecoveryAcknowledged(false)}
                >
                    <View style={{ padding: 24, paddingTop: Platform.OS === 'ios' ? 34 : 24, paddingBottom: 40 }}>
                        {/* Shield Icon */}
                        <View style={styles.shieldIconContainer}>
                            <View style={[styles.shieldIconBackground, { backgroundColor: themeColors.border }]}>
                                <ShieldWarning size={32} color={themeColors.textPrimary} fill={themeColors.textPrimary} />
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
                                <Lock size={24} color={themeColors.textSecondary} />
                                <Text style={[styles.warningItemText, { color: themeColors.textPrimary }]}>
                                    Your recovery phrase is like a password, keep it secret.
                                </Text>
                            </View>

                            <View style={styles.warningItem}>
                                <Copy size={24} color={themeColors.textSecondary} />
                                <Text style={[styles.warningItemText, { color: themeColors.textPrimary }]}>
                                    If you enter it in another app, it can steal your funds and Hedwig account.
                                </Text>
                            </View>

                            <View style={styles.warningItem}>
                                <WarningCircle size={24} color={themeColors.textSecondary} />
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
                                <CheckSquare size={24} color={Colors.primary} fill={Colors.primary} />
                            ) : (
                                <Square size={24} color={themeColors.textSecondary} />
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
                                        // Build URL first - fallback to API host in production if web client URL isn't set
                                        const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
                                        const apiBaseUrl = apiUrl.replace(/\/api\/?$/, '').replace(/\/$/, '');
                                        const webClientUrl = getPublicWebBaseUrl(process.env.EXPO_PUBLIC_WEB_CLIENT_URL || apiBaseUrl);
                                        const exportUrl = `${webClientUrl}/export-wallet`;

                                        // Close modal AFTER a small delay to let browser open
                                        setIsBiometricExporting(false);

                                        // Open in-app browser first
                                        await WebBrowser.openBrowserAsync(exportUrl, {
                                            presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
                                            controlsColor: Colors.primary,
                                        });

                                        // Close modal after browser is dismissed
                                        await closeRecoverySheet();
                                    } else {
                                        setIsBiometricExporting(false);
                                        Alert.alert('Authentication Failed', 'Please try again to access your recovery phrase.');
                                    }
                                } catch (error) {
                                    console.error('Biometric auth error:', error);
                                    setIsBiometricExporting(false);
                                    Alert.alert('Authentication Error', 'Failed to authenticate. Please try again.');
                                }
                            }}
                        />
                    </View>
                </TrueSheetComponent>
            ) : (
                <BottomSheetModal
                    ref={recoveryFallbackSheetRef}
                    index={0}
                    enableDynamicSizing={true}
                    enablePanDownToClose={true}
                    backdropComponent={(props) => (
                        <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.5} />
                    )}
                    backgroundStyle={{
                        backgroundColor: themeColors.background,
                        borderTopLeftRadius: Platform.OS === 'ios' ? 50 : 24,
                        borderTopRightRadius: Platform.OS === 'ios' ? 50 : 24,
                    }}
                    handleIndicatorStyle={{ backgroundColor: themeColors.textSecondary }}
                    onDismiss={() => setRecoveryAcknowledged(false)}
                >
                    <BottomSheetView style={{ padding: 24, paddingBottom: 40 }}>
                        {/* Shield Icon */}
                        <View style={styles.shieldIconContainer}>
                            <View style={[styles.shieldIconBackground, { backgroundColor: themeColors.border }]}>
                                <ShieldWarning size={32} color={themeColors.textPrimary} fill={themeColors.textPrimary} />
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
                                <Lock size={24} color={themeColors.textSecondary} />
                                <Text style={[styles.warningItemText, { color: themeColors.textPrimary }]}>
                                    Your recovery phrase is like a password, keep it secret.
                                </Text>
                            </View>

                            <View style={styles.warningItem}>
                                <Copy size={24} color={themeColors.textSecondary} />
                                <Text style={[styles.warningItemText, { color: themeColors.textPrimary }]}>
                                    If you enter it in another app, it can steal your funds and Hedwig account.
                                </Text>
                            </View>

                            <View style={styles.warningItem}>
                                <WarningCircle size={24} color={themeColors.textSecondary} />
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
                                <CheckSquare size={24} color={Colors.primary} fill={Colors.primary} />
                            ) : (
                                <Square size={24} color={themeColors.textSecondary} />
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
                                        // Build URL first - fallback to API host in production if web client URL isn't set
                                        const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
                                        const apiBaseUrl = apiUrl.replace(/\/api\/?$/, '').replace(/\/$/, '');
                                        const webClientUrl = getPublicWebBaseUrl(process.env.EXPO_PUBLIC_WEB_CLIENT_URL || apiBaseUrl);
                                        const exportUrl = `${webClientUrl}/export-wallet`;

                                        // Close modal AFTER a small delay to let browser open
                                        setIsBiometricExporting(false);

                                        // Open in-app browser first
                                        await WebBrowser.openBrowserAsync(exportUrl, {
                                            presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
                                            controlsColor: Colors.primary,
                                        });

                                        // Close modal after browser is dismissed
                                        await closeRecoverySheet();
                                    } else {
                                        setIsBiometricExporting(false);
                                        Alert.alert('Authentication Failed', 'Please try again to access your recovery phrase.');
                                    }
                                } catch (error) {
                                    console.error('Biometric auth error:', error);
                                    setIsBiometricExporting(false);
                                    Alert.alert('Authentication Error', 'Failed to authenticate. Please try again.');
                                }
                            }}
                        />
                    </BottomSheetView>
                </BottomSheetModal>
            )}

            {/* KYC Verification Modal */}
            <KYCVerificationModal
                ref={kycSheetRef}
                onClose={() => {}}
                onVerified={() => {
                    fetchKYCStatus();
                }}
            />

            {shouldUseSwiftUIBottomSheet ? (
                <SwiftUIBottomSheet
                    isPresented={isCalendarSheetPresented}
                    onIsPresentedChange={setIsCalendarSheetPresented}
                    fitToContents
                >
                    <SwiftUIGroup
                        modifiers={[
                            ...(presentationDetentsModifier ? [presentationDetentsModifier([{ height: 460 }])] : []),
                            ...(presentationDragIndicatorModifier ? [presentationDragIndicatorModifier('visible')] : []),
                        ]}
                    >
                        <View style={{ padding: 24, paddingTop: 34, paddingBottom: 40, backgroundColor: themeColors.background }}>
                            <View style={styles.shieldIconContainer}>
                                <View style={[styles.shieldIconBackground, { backgroundColor: themeColors.border }]}>
                                    <CalendarIcon size={32} color={themeColors.textPrimary} />
                                </View>
                            </View>
                            <Text style={[styles.recoveryTitle, styles.calendarSheetTitle, { color: themeColors.textPrimary }]}>Connect Calendar</Text>

                            {isFetchingCalendarLink ? (
                                <ActivityIndicator size="small" color={Colors.primary} style={{ marginVertical: 24 }} />
                            ) : calendarSubscribeUrl ? (
                                <View style={styles.calendarOptionsContainer}>
                                    {/* Google Calendar */}
                                    <TouchableOpacity
                                        style={[styles.calendarOptionBtn, { backgroundColor: themeColors.surface }]}
                                        onPress={() => {
                                            const webcalUrl = calendarSubscribeUrl.replace(/^https?:\/\//, 'webcal://');
                                            const googleUrl = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcalUrl)}`;
                                            Linking.openURL(googleUrl);
                                        }}
                                        activeOpacity={0.75}
                                    >
                                        <View style={styles.calendarLogoBox}>
                                            <SvgXml xml={GOOGLE_CALENDAR_SVG} width={28} height={28} />
                                        </View>
                                        <Text style={[styles.calendarOptionTitle, { color: themeColors.textPrimary }]}>Connect Google Calendar</Text>
                                    </TouchableOpacity>

                                    {/* Apple Calendar */}
                                    <TouchableOpacity
                                        style={[styles.calendarOptionBtn, { backgroundColor: themeColors.surface }]}
                                        onPress={() => {
                                            const webcalUrl = calendarSubscribeUrl.replace(/^https?:\/\//, 'webcal://');
                                            Linking.openURL(webcalUrl);
                                        }}
                                        activeOpacity={0.75}
                                    >
                                        <View style={styles.calendarLogoBox}>
                                            <SvgXml xml={APPLE_CALENDAR_SVG} width={28} height={28} />
                                        </View>
                                        <Text style={[styles.calendarOptionTitle, { color: themeColors.textPrimary }]}>Connect Apple Calendar</Text>
                                    </TouchableOpacity>
                                </View>
                            ) : (
                                <Button
                                    title="Retry"
                                    onPress={fetchCalendarSubscribeLink}
                                    variant="secondary"
                                    size="large"
                                />
                            )}
                        </View>
                    </SwiftUIGroup>
                </SwiftUIBottomSheet>
            ) : TrueSheetComponent ? (
                <TrueSheetComponent
                    ref={calendarSheetRef}
                    detents={['auto']}
                    cornerRadius={Platform.OS === 'ios' ? 50 : 24}
                    backgroundColor={Platform.OS === 'ios' ? undefined : themeColors.background}
                >
                    <View style={{ padding: 24, paddingTop: Platform.OS === 'ios' ? 34 : 24, paddingBottom: 40 }}>
                        <View style={styles.shieldIconContainer}>
                            <View style={[styles.shieldIconBackground, { backgroundColor: themeColors.border }]}>
                                <CalendarIcon size={32} color={themeColors.textPrimary} />
                            </View>
                        </View>
                        <Text style={[styles.recoveryTitle, styles.calendarSheetTitle, { color: themeColors.textPrimary }]}>Connect Calendar</Text>

                        {isFetchingCalendarLink ? (
                            <ActivityIndicator size="small" color={Colors.primary} style={{ marginVertical: 24 }} />
                        ) : calendarSubscribeUrl ? (
                            <View style={styles.calendarOptionsContainer}>
                                {/* Google Calendar */}
                                <TouchableOpacity
                                    style={[styles.calendarOptionBtn, { backgroundColor: themeColors.surface }]}
                                    onPress={() => {
                                        const webcalUrl = calendarSubscribeUrl.replace(/^https?:\/\//, 'webcal://');
                                        const googleUrl = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcalUrl)}`;
                                        Linking.openURL(googleUrl);
                                    }}
                                    activeOpacity={0.75}
                                >
                                    <View style={styles.calendarLogoBox}>
                                        <SvgXml xml={GOOGLE_CALENDAR_SVG} width={28} height={28} />
                                    </View>
                                    <Text style={[styles.calendarOptionTitle, { color: themeColors.textPrimary }]}>Connect Google Calendar</Text>
                                </TouchableOpacity>

                                {/* Apple Calendar */}
                                <TouchableOpacity
                                    style={[styles.calendarOptionBtn, { backgroundColor: themeColors.surface }]}
                                    onPress={() => {
                                        const webcalUrl = calendarSubscribeUrl.replace(/^https?:\/\//, 'webcal://');
                                        Linking.openURL(webcalUrl);
                                    }}
                                    activeOpacity={0.75}
                                >
                                    <View style={styles.calendarLogoBox}>
                                        <SvgXml xml={APPLE_CALENDAR_SVG} width={22} height={26} />
                                    </View>
                                    <Text style={[styles.calendarOptionTitle, { color: themeColors.textPrimary }]}>Connect Apple Calendar</Text>
                                </TouchableOpacity>
                            </View>
                        ) : null}
                        <Text style={[styles.calendarSheetSubtitle, { color: themeColors.textSecondary }]}>
                            Subscribe to your Hedwig calendar to see invoice due dates and reminders in your calendar app.
                        </Text>
                    </View>
                </TrueSheetComponent>
            ) : (
                <BottomSheetModal
                    ref={calendarFallbackSheetRef}
                    index={0}
                    enableDynamicSizing={true}
                    enablePanDownToClose={true}
                    backdropComponent={(props) => (
                        <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.5} />
                    )}
                    backgroundStyle={{
                        backgroundColor: themeColors.background,
                        borderTopLeftRadius: Platform.OS === 'ios' ? 50 : 24,
                        borderTopRightRadius: Platform.OS === 'ios' ? 50 : 24,
                    }}
                    handleIndicatorStyle={{ backgroundColor: themeColors.textSecondary }}
                >
                    <BottomSheetView style={{ padding: 24, paddingBottom: 40 }}>
                    <View style={styles.shieldIconContainer}>
                        <View style={[styles.shieldIconBackground, { backgroundColor: themeColors.border }]}>
                            <CalendarIcon size={32} color={themeColors.textPrimary} />
                        </View>
                    </View>
                    <Text style={[styles.recoveryTitle, styles.calendarSheetTitle, { color: themeColors.textPrimary }]}>Connect Calendar</Text>

                    {isFetchingCalendarLink ? (
                        <ActivityIndicator size="small" color={Colors.primary} style={{ marginVertical: 24 }} />
                    ) : calendarSubscribeUrl ? (
                        <View style={styles.calendarOptionsContainer}>
                            {/* Google Calendar */}
                            <TouchableOpacity
                                style={[styles.calendarOptionBtn, { backgroundColor: themeColors.surface }]}
                                onPress={() => {
                                    const webcalUrl = calendarSubscribeUrl.replace(/^https?:\/\//, 'webcal://');
                                    const googleUrl = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcalUrl)}`;
                                    Linking.openURL(googleUrl);
                                }}
                                activeOpacity={0.75}
                            >
                                <View style={styles.calendarLogoBox}>
                                    <SvgXml xml={GOOGLE_CALENDAR_SVG} width={28} height={28} />
                                </View>
                                <Text style={[styles.calendarOptionTitle, { color: themeColors.textPrimary }]}>Connect Google Calendar</Text>
                            </TouchableOpacity>

                            {/* Apple Calendar */}
                            <TouchableOpacity
                                style={[styles.calendarOptionBtn, { backgroundColor: themeColors.surface }]}
                                onPress={() => {
                                    const webcalUrl = calendarSubscribeUrl.replace(/^https?:\/\//, 'webcal://');
                                    Linking.openURL(webcalUrl);
                                }}
                                activeOpacity={0.75}
                            >
                                <View style={styles.calendarLogoBox}>
                                    <SvgXml xml={APPLE_CALENDAR_SVG} width={22} height={26} />
                                </View>
                                <Text style={[styles.calendarOptionTitle, { color: themeColors.textPrimary }]}>Connect Apple Calendar</Text>
                            </TouchableOpacity>
                        </View>
                    ) : null}
                    <Text style={[styles.calendarSheetSubtitle, { color: themeColors.textSecondary }]}>
                        Subscribe to your Hedwig calendar to see invoice due dates and reminders in your calendar app.
                    </Text>
                    </BottomSheetView>
                </BottomSheetModal>
            )}

        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FFFFFF',
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
    headerButton: {
        width: 44,
        height: 44,
        alignItems: 'flex-start',
    },
    backButtonCircle: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: Platform.OS === 'android' ? 26 : 28,
        color: Colors.textPrimary,
    },
    headerSpacer: {
        width: 44,
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
    settingSubLabel: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 12,
        marginTop: 2,
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
    profileNameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 4,
    },
    profileName: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 18,
        color: Colors.textPrimary,
    },
    proBadge: {
        backgroundColor: '#1D4ED8',
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 2,
    },
    proBadgeText: {
        color: '#FFFFFF',
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 10,
        letterSpacing: 0.5,
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
    calendarSheetSubtitle: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 14,
        lineHeight: 20,
        marginTop: 10,
        textAlign: 'center',
    },
    calendarSheetTitle: {
        marginBottom: 22,
    },
    calendarOptionsContainer: {
        gap: 2,
    },
    calendarOptionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 30,
        borderWidth: 0,
        paddingVertical: 14,
        paddingHorizontal: 16,
        gap: 10,
        marginBottom: 12,
    },
    calendarLogoBox: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
    },
    calendarOptionTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 15,
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
    // KYC Badge Styles
    kycBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
    },
    kycBadgeApproved: {
        backgroundColor: 'rgba(16, 185, 129, 0.15)',
    },
    kycBadgePending: {
        backgroundColor: 'rgba(245, 158, 11, 0.15)',
    },
    kycBadgeUnverified: {
        backgroundColor: 'rgba(107, 114, 128, 0.15)',
    },
    kycBadgeText: {
        fontSize: 12,
        fontWeight: '600',
    },
    kycBadgeTextApproved: {
        color: '#10B981',
    },
    kycBadgeTextPending: {
        color: '#F59E0B',
    },
    kycBadgeTextUnverified: {
        color: '#6B7280',
    },
});
