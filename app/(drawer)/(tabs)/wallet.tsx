import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, RefreshControl, LayoutAnimation, Platform, UIManager, Alert } from 'react-native';
let ContextMenu: any = null;
let ExpoButton: any = null;
let Host: any = null;
if (Platform.OS === 'ios') {
    try {
        const SwiftUI = require('@expo/ui/swift-ui');
        ContextMenu = SwiftUI.ContextMenu;
        ExpoButton = SwiftUI.Button;
        Host = SwiftUI.Host;
    } catch (e) { }
}
import { BottomSheetModal, BottomSheetView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColors, Colors } from '../../../theme/colors';
import { useSettings } from '../../../context/SettingsContext';
import { useAuth } from '../../../hooks/useAuth';
import { useWallet } from '../../../hooks/useWallet';
import { LinearGradient } from 'expo-linear-gradient';
import { Settings as Gear, Copy, QrCode, ChevronDown as CaretDown, ChevronLeft as CaretLeft, X, ArrowUp } from '../../../components/ui/AppIcon';
import QRCode from 'react-native-qrcode-svg';
import { useRouter, useNavigation, useFocusEffect } from 'expo-router';
import { DrawerActions } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import { getUserGradient } from '../../../utils/gradientUtils';
import { TutorialCard } from '../../../components/TutorialCard';
import { useTutorial } from '../../../hooks/useTutorial';
import AndroidDropdownMenu from '../../../components/ui/AndroidDropdownMenu';

const CHAINS = [
    { id: 'base', name: 'Base', icon: require('../../../assets/icons/networks/base.png') },
    { id: 'solana', name: 'Solana', icon: require('../../../assets/icons/networks/solana.png') },
];

const toNumber = (value: unknown): number => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value !== 'string') return 0;
    const normalized = value.replace(/,/g, '').trim();
    const parsed = parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
};

const getTokenBalance = (entry: any, decimals: number): number => {
    const displayToken = toNumber(entry?.display_values?.token);
    if (displayToken > 0) return displayToken;

    const rawValue = entry?.raw_value;
    if (typeof rawValue === 'string' && rawValue.length > 0) {
        const parsedRaw = Number(rawValue);
        if (Number.isFinite(parsedRaw) && parsedRaw > 0) {
            return parsedRaw / Math.pow(10, decimals);
        }
    }

    return 0;
};

export default function WalletScreen() {
    const themeColors = useThemeColors();
    const { currentTheme } = useSettings();
    const isDark = currentTheme === 'dark';
    const router = useRouter();
    const navigation = useNavigation();
    const { user, getAccessToken } = useAuth();

    // Wallet Hooks
    const {
        balances: walletBalances,
        address: baseAddress,
        solanaAddress,
        getTotalUsd: getBaseTotalUsd,
        fetchBalances: fetchBaseBalances
    } = useWallet();
    const { shouldShowOnScreen, activeStep, activeStepIndex, totalSteps, nextStep, prevStep, skipTutorial } = useTutorial();

    const [userName, setUserName] = useState({ firstName: '', lastName: '' });
    const [profileIcon, setProfileIcon] = useState<{ emoji?: string; colorIndex?: number; imageUri?: string }>({});

    const [refreshing, setRefreshing] = useState(false);
    const receiveSheetRef = useRef<BottomSheetModal>(null);
    const sendSheetRef = useRef<BottomSheetModal>(null);
    const receiveSnapPoints = useMemo(() => ['90%'], []);
    const sendSnapPoints = useMemo(() => ['34%'], []);

    const renderBackdrop = useCallback(
        (props: any) => (
            <BottomSheetBackdrop
                {...props}
                disappearsOnIndex={-1}
                appearsOnIndex={0}
                opacity={0.5}
            />
        ),
        []
    );
    const [selectedChain, setSelectedChain] = useState<'base' | 'solana'>('base');

    // Network Filter & Dropdown
    const [networkFilter, setNetworkFilter] = useState<'all' | 'base' | 'solana'>('all');

    const fetchUserData = useCallback(async () => {
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
                setUserName({ firstName: userData.firstName || '', lastName: userData.lastName || '' });
                if (userData.avatar) {
                    if (userData.avatar.startsWith('data:') || userData.avatar.startsWith('http')) {
                        setProfileIcon({ imageUri: userData.avatar });
                    } else {
                        try {
                            const parsed = JSON.parse(userData.avatar);
                            if (parsed.imageUri) setProfileIcon({ imageUri: parsed.imageUri });
                        } catch (e) { setProfileIcon({ imageUri: userData.avatar }); }
                    }
                }
            }
        } catch (error) { console.error('Failed to fetch user data:', error); }
    }, [user, getAccessToken]);

    const onRefresh = async () => {
        setRefreshing(true);
        await Promise.all([
            fetchUserData(),
            fetchBaseBalances()
        ]);
        setRefreshing(false);
    };

    useFocusEffect(
        React.useCallback(() => {
            fetchUserData();
            fetchBaseBalances();

            const intervalId = setInterval(() => {
                fetchBaseBalances();
            }, 15000);

            return () => clearInterval(intervalId);
        }, [fetchBaseBalances, fetchUserData])
    );

    const selectedAddress = selectedChain === 'solana' ? (solanaAddress || '') : (baseAddress || '');
    const selectedChainMeta = CHAINS.find((chain) => chain.id === selectedChain) || CHAINS[0];

    const copySelectedAddress = async () => {
        if (!selectedAddress) return;
        await Clipboard.setStringAsync(selectedAddress);
        Alert.alert('Copied', `${selectedChainMeta.name} wallet address copied`);
    };

    const totalBalance = toNumber(getBaseTotalUsd());

    const baseUSDC = walletBalances.find(b => b.chain === 'base' && b.asset === 'usdc');
    const baseETH = walletBalances.find(b => b.chain === 'base' && b.asset === 'eth');
    const solanaSOL = walletBalances.find(b => b.chain === 'solana' && b.asset === 'sol');
    const solanaUSDC = walletBalances.find(b => b.chain === 'solana' && b.asset === 'usdc');

    const allTokens = [
        ...(baseETH ? [{
            chain: 'base',
            name: 'Ethereum',
            symbol: 'ETH',
            balance: getTokenBalance(baseETH, 18),
            balanceUsd: toNumber(baseETH.display_values?.usd),
            icon: require('../../../assets/icons/tokens/eth.png')
        }] : []),
        ...(baseUSDC ? [{
            chain: 'base',
            name: 'USD Coin',
            symbol: 'USDC',
            balance: getTokenBalance(baseUSDC, 6),
            balanceUsd: toNumber(baseUSDC.display_values?.usd),
            icon: require('../../../assets/icons/tokens/usdc.png')
        }] : []),
        ...(solanaAddress ? [{
            chain: 'solana',
            name: 'Solana',
            symbol: 'SOL',
            balance: getTokenBalance(solanaSOL, 9),
            balanceUsd: toNumber(solanaSOL?.display_values?.usd),
            icon: require('../../../assets/icons/networks/solana.png')
        }] : []),
        ...(solanaAddress ? [{
            chain: 'solana',
            name: 'USD Coin',
            symbol: 'USDC',
            balance: getTokenBalance(solanaUSDC, 6),
            balanceUsd: toNumber(solanaUSDC?.display_values?.usd),
            icon: require('../../../assets/icons/tokens/usdc.png')
        }] : [])
    ];

    const filteredTokens = allTokens.filter(t => {
        return networkFilter === 'all' || t.chain === networkFilter;
    });

    const getNetworkIcon = (filter: string) => {
        if (filter === 'base') return require('../../../assets/icons/networks/base.png');
        if (filter === 'solana') return require('../../../assets/icons/networks/solana.png');
        return null;
    };

    return (
        <>
            <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
                {/* Header */}
                <View style={[styles.header, { backgroundColor: themeColors.background }]}>
                    <View style={styles.headerLeft}>
                        <TouchableOpacity onPress={() => navigation.dispatch(DrawerActions.openDrawer())}>
                            {profileIcon?.imageUri ? (
                                <Image source={{ uri: profileIcon.imageUri }} style={styles.profileImage} />
                            ) : (
                                <LinearGradient
                                    colors={getUserGradient(user?.id)}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                    style={styles.profileImage}
                                >
                                    <Text style={{ color: 'white', fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 18 }}>
                                        {userName.firstName?.[0] || 'U'}
                                    </Text>
                                </LinearGradient>
                            )}
                        </TouchableOpacity>
                        <View style={styles.headerTextContainer}>
                            <Text style={[styles.headerName, { color: themeColors.textPrimary }]}>
                                {userName.firstName ? `${userName.firstName}'s Wallet` : 'My Wallet'}
                            </Text>
                        </View>
                    </View>
                    <TouchableOpacity style={styles.settingsButton} onPress={() => router.push('/settings')}>
                        <Gear size={24} color={themeColors.textPrimary} />
                    </TouchableOpacity>
                </View>

                <ScrollView
                    style={styles.content}
                    showsVerticalScrollIndicator={false}
                    bounces={true}
                    alwaysBounceVertical={true}
                    overScrollMode="always"
                    contentInsetAdjustmentBehavior="never"
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
                >
                    <View style={styles.balanceSection}>
                        <Text style={[styles.totalBalance, { color: themeColors.textPrimary }]}>
                            ${totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </Text>
                    </View>

                    <View style={styles.actionButtons}>
                        <TouchableOpacity
                            style={styles.actionButton}
                            onPress={() => receiveSheetRef.current?.present()}
                        >
                            <View style={[styles.actionIconBox, { backgroundColor: themeColors.surfaceHighlight || (themeColors.background === '#FFFFFF' ? '#F0EEFF' : 'rgba(37, 99, 235, 0.15)') }]}>
                                <QrCode size={24} color="#2563EB" fill="#2563EB" />
                            </View>
                            <Text style={[styles.actionButtonLabel, { color: themeColors.textPrimary }]}>Receive</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.actionButton}
                            onPress={() => sendSheetRef.current?.present()}
                        >
                            <View style={[styles.actionIconBox, { backgroundColor: themeColors.surfaceHighlight || (themeColors.background === '#FFFFFF' ? '#F0EEFF' : 'rgba(37, 99, 235, 0.15)') }]}>
                                <ArrowUp size={24} color="#2563EB" />
                            </View>
                            <Text style={[styles.actionButtonLabel, { color: themeColors.textPrimary }]}>Send</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.tokenSection}>
                        <View style={styles.tokenHeader}>
                            <Text style={[styles.sectionTitle, { color: themeColors.textSecondary }]}>Tokens</Text>

                            {/* Native Network Dropdown */}
                            {Platform.OS === 'ios' && Host ? (
                                <Host>
                                    <ContextMenu>
                                        <ContextMenu.Trigger>
                                            <View style={[styles.networkFilterButton, { backgroundColor: themeColors.surface }]}>
                                                {networkFilter !== 'all' && (
                                                    <Image source={getNetworkIcon(networkFilter)} style={styles.networkFilterIcon} />
                                                )}
                                                <Text style={[styles.networkFilterText, { color: themeColors.textPrimary }]}>
                                                    {networkFilter === 'all' ? 'All Networks' : networkFilter === 'base' ? 'Base' : 'Solana'}
                                                </Text>
                                                <CaretDown size={14} color={themeColors.textSecondary} strokeWidth={3} />
                                            </View>
                                        </ContextMenu.Trigger>
                                        <ContextMenu.Items>
                                            <ExpoButton onPress={() => setNetworkFilter('all')}>All Networks</ExpoButton>
                                            <ExpoButton onPress={() => setNetworkFilter('base')}>Base</ExpoButton>
                                            <ExpoButton onPress={() => setNetworkFilter('solana')}>Solana</ExpoButton>
                                        </ContextMenu.Items>
                                    </ContextMenu>
                                </Host>
                            ) : (
                                <AndroidDropdownMenu
                                    options={[
                                        { label: 'All Networks', onPress: () => setNetworkFilter('all') },
                                        { label: 'Base', onPress: () => setNetworkFilter('base') },
                                        { label: 'Solana', onPress: () => setNetworkFilter('solana') },
                                    ]}
                                    trigger={
                                        <View style={[styles.networkFilterButton, { backgroundColor: themeColors.surface }]}>
                                            {networkFilter !== 'all' && (
                                                <Image source={getNetworkIcon(networkFilter)} style={styles.networkFilterIcon} />
                                            )}
                                            <Text style={[styles.networkFilterText, { color: themeColors.textPrimary }]}>
                                                {networkFilter === 'all' ? 'All Networks' : networkFilter === 'base' ? 'Base' : 'Solana'}
                                            </Text>
                                            <CaretDown size={14} color={themeColors.textSecondary} strokeWidth={3} />
                                        </View>
                                    }
                                />
                            )}
                        </View>

                        {filteredTokens.map((item, index) => (
                            <TouchableOpacity
                                key={`${item.chain}-${item.symbol}-${index}`}
                                style={[styles.tokenItem, { backgroundColor: themeColors.surface }]}
                                onPress={() =>
                                    router.push({
                                        pathname: '/wallet/token-details',
                                        params: {
                                            symbol: item.symbol,
                                            name: item.name,
                                            chain: item.chain,
                                            balance: String(item.balance),
                                            balanceUsd: String(item.balanceUsd),
                                        },
                                    } as any)
                                }
                                activeOpacity={0.85}
                            >
                                <View style={styles.tokenLeft}>
                                    <View style={styles.tokenIconContainer}>
                                        <Image source={item.icon} style={styles.tokenIconImage} />
                                        <View style={styles.chainBadgeOverlay}>
                                            <Image
                                                source={item.chain === 'base' ? require('../../../assets/icons/networks/base.png') : require('../../../assets/icons/networks/solana.png')}
                                                style={styles.chainBadgeIcon}
                                            />
                                        </View>
                                    </View>
                                    <View>
                                        <Text style={[styles.tokenName, { color: themeColors.textPrimary }]}>{item.name}</Text>
                                        <Text style={[styles.tokenSymbol, { color: themeColors.textSecondary }]}>
                                            {item.balance === 0
                                                ? `0 ${item.symbol}`
                                                : item.symbol === 'ETH' || item.symbol === 'SOL'
                                                    ? `${item.balance.toFixed(6).replace(/\.?0+$/, '')} ${item.symbol}`
                                                    : `${item.balance.toFixed(2).replace(/\.?0+$/, '')} ${item.symbol}`
                                            }
                                        </Text>
                                    </View>
                                </View>
                                <View style={styles.tokenRight}>
                                    <Text style={[styles.tokenBalance, { color: themeColors.textPrimary }]}>
                                        ${item.balanceUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </Text>
                                    <Text style={[styles.chainLabel, { color: themeColors.textSecondary }]}>
                                        {item.chain === 'base' ? 'on Base' : 'on Solana'}
                                    </Text>
                                </View>
                            </TouchableOpacity>
                        ))}
                        {filteredTokens.length === 0 && (
                            <View style={styles.emptyState}>
                                <Text style={[styles.emptyStateText, { color: themeColors.textSecondary }]}>
                                    No tokens found on {networkFilter === 'all' ? 'any network' : networkFilter === 'base' ? 'Base' : 'Solana'}
                                </Text>
                            </View>
                        )}
                    </View>
                </ScrollView>

                {/* Receive Modal - Bottom Sheet */}
                <BottomSheetModal
                    ref={receiveSheetRef}
                    index={0}
                    snapPoints={receiveSnapPoints}
                    enablePanDownToClose={true}
                    backdropComponent={renderBackdrop}
                    backgroundStyle={{ backgroundColor: themeColors.background }}
                    handleIndicatorStyle={{ backgroundColor: themeColors.textSecondary, width: 40 }}
                >
                    <BottomSheetView style={[styles.bottomSheetContent, { backgroundColor: themeColors.background }]}>
                        {/* Header */}
                        <View style={styles.receiveHeader}>
                            <Text style={[styles.receiveHeaderTitle, { color: themeColors.textPrimary }]}>Receive</Text>
                            <TouchableOpacity onPress={() => receiveSheetRef.current?.dismiss()} style={styles.closeButton}>
                                <X size={20} color={themeColors.textPrimary} strokeWidth={3} />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.receiveBody}>
                            <Text style={[styles.receiveSubtext, { color: themeColors.textSecondary }]}>
                                Select a chain to get your receive address
                            </Text>

                            {Platform.OS === 'ios' && Host ? (
                                <Host>
                                    <ContextMenu>
                                        <ContextMenu.Trigger>
                                            <View style={styles.receiveChainDropdownContainer}>
                                                <View style={[styles.networkFilterButton, { backgroundColor: themeColors.surface }]}>
                                                    <Image source={selectedChainMeta.icon} style={styles.receiveChainDropdownIcon} />
                                                    <Text style={[styles.networkFilterText, { color: themeColors.textPrimary }]}>
                                                        {selectedChainMeta.name}
                                                    </Text>
                                                    <CaretDown size={14} color={themeColors.textSecondary} strokeWidth={3} />
                                                </View>
                                            </View>
                                        </ContextMenu.Trigger>
                                        <ContextMenu.Items>
                                            <ExpoButton onPress={() => setSelectedChain('base')}>Base</ExpoButton>
                                            <ExpoButton onPress={() => setSelectedChain('solana')}>Solana</ExpoButton>
                                        </ContextMenu.Items>
                                    </ContextMenu>
                                </Host>
                            ) : (
                                <AndroidDropdownMenu
                                    options={[
                                        { label: 'Base', onPress: () => setSelectedChain('base') },
                                        { label: 'Solana', onPress: () => setSelectedChain('solana') },
                                    ]}
                                    trigger={
                                        <View style={[styles.receiveChainDropdown, { backgroundColor: themeColors.surface }]}>
                                            <Image source={selectedChainMeta.icon} style={styles.receiveChainDropdownIcon} />
                                            <Text style={[styles.receiveChainDropdownText, { color: themeColors.textPrimary }]}>
                                                {selectedChainMeta.name}
                                            </Text>
                                            <CaretDown size={14} color={themeColors.textSecondary} strokeWidth={3} />
                                        </View>
                                    }
                                />
                            )}

                            <View style={[styles.qrCard, { backgroundColor: isDark ? '#000000' : '#FFFFFF' }]}>
                                <QRCode
                                    value={selectedAddress || 'no-address'}
                                    size={210}
                                    backgroundColor={isDark ? '#000000' : '#FFFFFF'}
                                    color={isDark ? '#FFFFFF' : '#000000'}
                                />
                            </View>

                            <Text
                                style={[styles.addressValue, { color: themeColors.textPrimary }]}
                                numberOfLines={2}
                                ellipsizeMode="middle"
                            >
                                {selectedAddress || 'Address not available'}
                            </Text>

                            <View style={styles.receiveActionRow}>
                                <TouchableOpacity
                                    style={[styles.receiveActionButton, { backgroundColor: themeColors.surface }]}
                                    onPress={copySelectedAddress}
                                    disabled={!selectedAddress}
                                >
                                    <Copy size={18} color={themeColors.textPrimary} />
                                    <Text style={[styles.receiveActionButtonText, { color: themeColors.textPrimary }]}>Copy</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </BottomSheetView>
                </BottomSheetModal>

                <BottomSheetModal
                    ref={sendSheetRef}
                    index={0}
                    snapPoints={sendSnapPoints}
                    enablePanDownToClose={true}
                    backdropComponent={renderBackdrop}
                    backgroundStyle={{ backgroundColor: themeColors.background }}
                    handleIndicatorStyle={{ backgroundColor: themeColors.textSecondary, width: 40 }}
                >
                    <BottomSheetView style={[styles.sendSheetContent, { backgroundColor: themeColors.background }]}>
                        <Text style={[styles.sendSheetTitle, { color: themeColors.textPrimary }]}>Send</Text>
                        <Text style={[styles.sendSheetSubtitle, { color: themeColors.textSecondary }]}>Choose how you want to move funds</Text>

                        <TouchableOpacity
                            style={[styles.sendOptionCard, { backgroundColor: themeColors.surface }]}
                            onPress={() => {
                                sendSheetRef.current?.dismiss();
                                router.push('/wallet/send-address' as any);
                            }}
                        >
                            <View>
                                <Text style={[styles.sendOptionTitle, { color: themeColors.textPrimary }]}>Send crypto</Text>
                                <Text style={[styles.sendOptionSubtitle, { color: themeColors.textSecondary }]}>Transfer to any wallet address</Text>
                            </View>
                            <CaretLeft size={20} color={themeColors.textSecondary} style={{ transform: [{ rotate: '180deg' }] }} />
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.sendOptionCard, { backgroundColor: themeColors.surface }]}
                            onPress={() => {
                                sendSheetRef.current?.dismiss();
                                router.push('/offramp-history/create' as any);
                            }}
                        >
                            <View>
                                <Text style={[styles.sendOptionTitle, { color: themeColors.textPrimary }]}>Withdraw to bank</Text>
                                <Text style={[styles.sendOptionSubtitle, { color: themeColors.textSecondary }]}>Cash out to your account</Text>
                            </View>
                            <CaretLeft size={20} color={themeColors.textSecondary} style={{ transform: [{ rotate: '180deg' }] }} />
                        </TouchableOpacity>
                    </BottomSheetView>
                </BottomSheetModal>
            </SafeAreaView>

            {/* Tutorial card for wallet step */}
            {shouldShowOnScreen('wallet') && activeStep && (
                <TutorialCard
                    step={activeStepIndex + 1}
                    totalSteps={totalSteps}
                    title={activeStep.title}
                    body={activeStep.body}
                    anchorPosition={activeStep.anchorPosition}
                    onNext={nextStep}
                    onBack={prevStep}
                    onSkip={skipTutorial}
                />)}
        </>
    );
}


const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    profileImage: { width: 40, height: 40, borderRadius: 20 },
    headerTextContainer: { justifyContent: 'center' },
    headerName: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 18 },
    settingsButton: { padding: 8 },
    content: { flex: 1, paddingHorizontal: 20 },
    balanceSection: { marginTop: 24, marginBottom: 32, alignItems: 'flex-start' },
    totalBalance: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 42, letterSpacing: -1 },
    actionButtons: { flexDirection: 'row', justifyContent: 'space-evenly', marginBottom: 32 },
    actionButton: { alignItems: 'center', gap: 8, minWidth: 72 },
    actionIconBox: { width: 56, height: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
    actionButtonLabel: { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 13 },
    tokenSection: { marginBottom: 100 },
    tokenHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    sectionTitle: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 18 },
    networkFilterButton: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' },
    networkFilterIcon: { width: 16, height: 16, borderRadius: 8 },
    networkFilterText: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 13 },
    tokenItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderRadius: 20, marginBottom: 12 },
    tokenLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    tokenIconContainer: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', backgroundColor: 'transparent', position: 'relative' },
    tokenIconImage: { width: 32, height: 32, borderRadius: 16 },
    chainBadgeOverlay: { position: 'absolute', bottom: -2, right: -2, backgroundColor: '#FFFFFF', borderRadius: 8, padding: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
    chainBadgeIcon: { width: 12, height: 12, borderRadius: 6 },
    tokenName: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 16 },
    tokenSymbol: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 13, marginTop: 2 },
    tokenEquivalent: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 13, marginTop: 2 },
    chainLabel: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 12, marginTop: 2 },
    tokenRight: { alignItems: 'flex-end' },
    tokenBalance: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 16, marginBottom: 2 },
    emptyState: { padding: 20, alignItems: 'center' },
    emptyStateText: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 14 },
    fullscreenModal: { flex: 1 },
    bottomSheetContent: { flex: 1, paddingBottom: 20 },
    receiveHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12 },
    receiveHeaderTitle: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 22 },
    closeButton: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center', borderRadius: 18, backgroundColor: 'rgba(128,128,128,0.2)' },
    receiveBody: { flex: 1, alignItems: 'center', paddingHorizontal: 20, paddingTop: 4 },
    receiveSubtext: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 14, marginBottom: 14 },
    receiveChainDropdownContainer: { width: '100%', alignItems: 'center', marginBottom: 18 },
    receiveChainDropdown: { width: '100%', maxWidth: 320, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 16, marginBottom: 18 },
    receiveChainDropdownIcon: { width: 18, height: 18, borderRadius: 9 },
    receiveChainDropdownText: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 14 },
    qrCard: { backgroundColor: '#FFFFFF', borderRadius: 28, padding: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 6, width: '100%', maxWidth: 320, aspectRatio: 1 },
    addressValue: { width: '100%', fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 15, lineHeight: 21, textAlign: 'center', marginBottom: 16 },
    receiveActionRow: { width: '100%', flexDirection: 'row', marginBottom: 18 },
    receiveActionButton: { flex: 1, height: 46, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    receiveActionButtonText: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 14 },
    sendSheetContent: { paddingHorizontal: 20, paddingBottom: 24 },
    sendSheetTitle: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 24, marginBottom: 4 },
    sendSheetSubtitle: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 14, marginBottom: 16 },
    sendOptionCard: { borderRadius: 16, padding: 16, marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sendOptionTitle: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 16, marginBottom: 4 },
    sendOptionSubtitle: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 13 },
});
