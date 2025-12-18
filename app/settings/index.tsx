import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch, Image, TextInput, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { CaretLeft, Check, Moon, Sun, Globe, User, SignOut, CaretRight } from 'phosphor-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../theme/colors';
import { useSettings, Currency, Theme } from '../../context/SettingsContext';
import { usePrivy } from '@privy-io/expo';
import { LinearGradient } from 'expo-linear-gradient';
import { getUserGradient } from '../../utils/gradientUtils';

const CURRENCIES: { code: Currency; label: string; symbol: string }[] = [
    { code: 'USD', label: 'US Dollar', symbol: '$' },
    { code: 'NGN', label: 'Nigerian Naira', symbol: '₦' },
    { code: 'GHS', label: 'Ghanaian Cedi', symbol: '₵' },
    { code: 'KES', label: 'Kenyan Shilling', symbol: 'KSh' },
];

export default function SettingsScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { currency, setCurrency, theme, setTheme, currentTheme } = useSettings();
    const { user, logout } = usePrivy();

    const [loading, setLoading] = useState(false);

    // Parse user data
    const privyUser = user as any;
    const email = privyUser?.email?.address || privyUser?.id || 'User';
    // Assuming backend data fetched elsewhere or stored in context if we had a UserContext
    // For now we'll just use what we have available or mock for "edit profile" demo
    // Ideally we fetch the latest profile data from backend on mount

    const handleLogout = async () => {
        try {
            await logout();
            router.replace('/auth/welcome');
        } catch (error) {
            console.error('Logout failed:', error);
            Alert.alert('Error', 'Failed to log out');
        }
    };

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => router.back()}
                >
                    <CaretLeft size={24} color={Colors.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Settings</Text>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

                {/* Profile Section */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Profile</Text>
                    <TouchableOpacity
                        style={styles.profileCard}
                        onPress={() => router.push({ pathname: '/auth/profile', params: { email: email } })}
                    >
                        <LinearGradient
                            colors={getUserGradient(user?.id)}
                            style={styles.avatar}
                        >
                            <User size={24} color="white" weight="bold" />
                        </LinearGradient>
                        <View style={styles.profileInfo}>
                            <Text style={styles.profileName}>Edit Profile</Text>
                            <Text style={styles.profileSubtitle}>Update name and photo</Text>
                        </View>
                        <CaretRight size={20} color={Colors.textSecondary} />
                    </TouchableOpacity>
                </View>

                {/* Appearance Section */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Appearance</Text>
                    <View style={styles.settingItem}>
                        <View style={styles.settingLeft}>
                            <View style={[styles.iconContainer, { backgroundColor: '#F3F4F6' }]}>
                                {theme === 'dark' ? <Moon size={20} color={Colors.textPrimary} /> : <Sun size={20} color={Colors.textPrimary} />}
                            </View>
                            <Text style={styles.settingLabel}>Theme</Text>
                        </View>
                        <View style={styles.themeSelector}>
                            {(['light', 'dark', 'system'] as Theme[]).map((t) => (
                                <TouchableOpacity
                                    key={t}
                                    style={[
                                        styles.themeOption,
                                        theme === t && styles.themeOptionSelected
                                    ]}
                                    onPress={() => setTheme(t)}
                                >
                                    <Text style={[
                                        styles.themeOptionText,
                                        theme === t && styles.themeOptionTextSelected
                                    ]}>
                                        {t.charAt(0).toUpperCase() + t.slice(1)}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                </View>

                {/* Currency Section */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Currency</Text>
                    {CURRENCIES.map((c) => (
                        <TouchableOpacity
                            key={c.code}
                            style={styles.currencyItem}
                            onPress={() => setCurrency(c.code)}
                        >
                            <View style={styles.settingLeft}>
                                <View style={[styles.iconContainer, { backgroundColor: '#EFF6FF' }]}>
                                    <Text style={styles.currencySymbol}>{c.symbol}</Text>
                                </View>
                                <View>
                                    <Text style={styles.settingLabel}>{c.code}</Text>
                                    <Text style={styles.settingSubLabel}>{c.label}</Text>
                                </View>
                            </View>
                            {currency === c.code && (
                                <Check size={20} color={Colors.primary} weight="bold" />
                            )}
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Account Actions */}
                <View style={[styles.section, { marginTop: 20 }]}>
                    <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
                        <SignOut size={20} color="#EF4444" weight="bold" />
                        <Text style={styles.logoutText}>Log Out</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.footer}>
                    <Text style={styles.versionText}>Version 1.0.0</Text>
                </View>

            </ScrollView>
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
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    backButton: {
        padding: 4,
    },
    headerTitle: {
        fontFamily: 'RethinkSans_700Bold',
        fontSize: 18,
        color: Colors.textPrimary,
    },
    content: {
        padding: 20,
        paddingBottom: 40,
    },
    section: {
        marginBottom: 32,
    },
    sectionTitle: {
        fontFamily: 'RethinkSans_700Bold',
        fontSize: 14,
        color: Colors.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 16,
    },
    profileCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F9FAFB',
        padding: 16,
        borderRadius: 16,
    },
    avatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    profileInfo: {
        flex: 1,
    },
    profileName: {
        fontFamily: 'RethinkSans_600SemiBold',
        fontSize: 16,
        color: Colors.textPrimary,
    },
    profileSubtitle: {
        fontFamily: 'RethinkSans_400Regular',
        fontSize: 14,
        color: Colors.textSecondary,
    },
    settingItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    settingLeft: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    settingLabel: {
        fontFamily: 'RethinkSans_600SemiBold',
        fontSize: 16,
        color: Colors.textPrimary,
    },
    settingSubLabel: {
        fontFamily: 'RethinkSans_400Regular',
        fontSize: 13,
        color: Colors.textSecondary,
    },
    themeSelector: {
        flexDirection: 'row',
        backgroundColor: '#F3F4F6',
        borderRadius: 20,
        padding: 2,
    },
    themeOption: {
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 18,
    },
    themeOptionSelected: {
        backgroundColor: '#FFFFFF',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    themeOptionText: {
        fontFamily: 'RethinkSans_500Medium',
        fontSize: 13,
        color: Colors.textSecondary,
    },
    themeOptionTextSelected: {
        color: Colors.textPrimary,
        fontFamily: 'RethinkSans_600SemiBold',
    },
    currencyItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    currencySymbol: {
        fontFamily: 'RethinkSans_700Bold',
        fontSize: 18,
        color: Colors.primary,
    },
    logoutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        backgroundColor: '#FEF2F2',
        borderRadius: 16,
    },
    logoutText: {
        fontFamily: 'RethinkSans_600SemiBold',
        fontSize: 16,
        color: '#EF4444',
        marginLeft: 8,
    },
    footer: {
        alignItems: 'center',
        marginTop: 20,
    },
    versionText: {
        fontFamily: 'RethinkSans_400Regular',
        fontSize: 12,
        color: Colors.textSecondary,
    },
});
