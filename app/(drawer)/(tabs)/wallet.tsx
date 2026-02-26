import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, RefreshControl, LayoutAnimation, Platform, UIManager, Share } from 'react-native';
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
import { useAuth } from '../../../hooks/useAuth';
import { useWallet } from '../../../hooks/useWallet';
import { LinearGradient } from 'expo-linear-gradient';
import { Settings as Gear, Copy, QrCode, ChevronDown as CaretDown, ChevronLeft as CaretLeft, X, Share2 as ShareNetwork, Share as Export } from 'lucide-react-native';
import QRCode from 'react-native-qrcode-svg';
import { useRouter, useNavigation, useFocusEffect } from 'expo-router';
import { DrawerActions } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import { useEmbeddedSolanaWallet } from '@privy-io/expo';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import * as WebBrowser from 'expo-web-browser';
import { getUserGradient } from '../../../utils/gradientUtils';
import { TutorialCard } from '../../../components/TutorialCard';
import { useTutorial } from '../../../hooks/useTutorial';
import AndroidDropdownMenu from '../../../components/ui/AndroidDropdownMenu';

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
    ['#64748B', '#475569', '#334155'],
    ['#1F2937', '#111827', '#030712'],
] as const;

const CHAINS = [
    { id: 'base', name: 'Base', icon: require('../../../assets/icons/networks/base.png') },
    { id: 'solana', name: 'Solana', icon: require('../../../assets/icons/networks/solana.png') },
];

const SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';
const USDC_MINT_ADDRESS = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

export default function WalletScreen() {
    const themeColors = useThemeColors();
    const router = useRouter();
    const navigation = useNavigation();
    const { user, getAccessToken } = useAuth();

    // Wallet Hooks
    const {
        balances: baseBalances,
        address: baseAddress,
        getTotalUsd: getBaseTotalUsd,
        fetchBalances: fetchBaseBalances
    } = useWallet();
    const { shouldShowOnScreen, activeStep, activeStepIndex, totalSteps, nextStep, prevStep, skipTutorial } = useTutorial();

    const solanaWalletState = useEmbeddedSolanaWallet();
    const solanaAddress = (solanaWalletState as any)?.wallets?.[0]?.address;

    const [userName, setUserName] = useState({ firstName: '', lastName: '' });
    const [profileIcon, setProfileIcon] = useState<{ emoji?: string; colorIndex?: number; imageUri?: string }>({});

    // Solana State
    const [solanaBalances, setSolanaBalances] = useState<{ sol: number, usdc: number }>({ sol: 0, usdc: 0 });
    const [solanaPrices, setSolanaPrices] = useState<{ sol: number, usdc: number }>({ sol: 0, usdc: 1 });
    const [isSolanaLoading, setIsSolanaLoading] = useState(false);

    const [refreshing, setRefreshing] = useState(false);
    const bottomSheetRef = useRef<BottomSheetModal>(null);
    const snapPoints = useMemo(() => ['90%'], []);

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

    useEffect(() => {
        fetchUserData();
        fetchBaseBalances();
    }, [fetchUserData, fetchBaseBalances]);

    useFocusEffect(
        React.useCallback(() => {
            if (user) {
                fetchUserData();
            }
        }, [user, fetchUserData])
    );

    useEffect(() => {
        if (solanaAddress) {
            fetchSolanaBalances(solanaAddress);
        }
    }, [solanaAddress]);

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

    const fetchSolanaBalances = useCallback(async (address: string) => {
        try {
            setIsSolanaLoading(true);
            const connection = new Connection(SOLANA_RPC_URL);
            const publicKey = new PublicKey(address);

            const solBalanceLamports = await connection.getBalance(publicKey);
            const solBalance = solBalanceLamports / LAMPORTS_PER_SOL;

            let usdcBalance = 0;
            try {
                const usdcMint = new PublicKey(USDC_MINT_ADDRESS);
                const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, { mint: usdcMint });
                if (tokenAccounts.value.length > 0) {
                    usdcBalance = tokenAccounts.value.reduce((acc, account) => {
                        const parsedInfo = account.account.data.parsed.info;
                        return acc + (parsedInfo.tokenAmount.uiAmount || 0);
                    }, 0);
                }
            } catch (e) { console.log('Error fetching Solana USDC balance:', e); }

            let solPrice = 150;
            try {
                const priceRes = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
                const priceData = await priceRes.json();
                if (priceData.solana?.usd) solPrice = priceData.solana.usd;
            } catch (err) { }

            setSolanaBalances({ sol: solBalance, usdc: usdcBalance });
            setSolanaPrices({ sol: solPrice, usdc: 1 });

        } catch (error) { console.error('Failed to fetch Solana balances:', error); }
        finally { setIsSolanaLoading(false); }
    }, []);

    const onRefresh = async () => {
        setRefreshing(true);
        await Promise.all([
            fetchUserData(),
            fetchBaseBalances(),
            solanaAddress ? fetchSolanaBalances(solanaAddress) : Promise.resolve()
        ]);
        setRefreshing(false);
    };

    useFocusEffect(
        React.useCallback(() => {
            fetchUserData();
            fetchBaseBalances();
            if (solanaAddress) {
                fetchSolanaBalances(solanaAddress);
            }

            const intervalId = setInterval(() => {
                fetchBaseBalances();
                if (solanaAddress) {
                    fetchSolanaBalances(solanaAddress);
                }
            }, 7000);

            return () => clearInterval(intervalId);
        }, [fetchBaseBalances, fetchSolanaBalances, solanaAddress, fetchUserData])
    );

    const copyAddress = async (chain: 'base' | 'solana') => {
        const address = chain === 'solana' ? solanaAddress : baseAddress;
        if (address) {
            await Clipboard.setStringAsync(address);
            // Alert.alert('Copied', `${chain === 'base' ? 'EVM' : 'Solana'} address copied`);
            // Intentionally silent or small toast via generic alert for now as per native menu interaction
        }
    };

    const baseTotal = parseFloat(getBaseTotalUsd());
    const solanaTotal = (solanaBalances.sol * solanaPrices.sol) + (solanaBalances.usdc * solanaPrices.usdc);
    const totalBalance = baseTotal + solanaTotal;

    const baseUSDC = baseBalances.find(b => b.asset === 'usdc');
    const baseETH = baseBalances.find(b => b.asset === 'eth');

    const allTokens = [
        ...(baseETH ? [{
            chain: 'base',
            name: 'Ethereum',
            symbol: 'ETH',
            balance: parseFloat(baseETH.display_values?.token || '0'),
            balanceUsd: parseFloat(baseETH.display_values?.usd || '0'),
            icon: require('../../../assets/icons/tokens/eth.png')
        }] : []),
        ...(baseUSDC ? [{
            chain: 'base',
            name: 'USD Coin',
            symbol: 'USDC',
            balance: parseFloat(baseUSDC.display_values?.token || '0'),
            balanceUsd: parseFloat(baseUSDC.display_values?.usd || '0'),
            icon: require('../../../assets/icons/tokens/usdc.png')
        }] : []),
        ...(solanaAddress ? [{
            chain: 'solana',
            name: 'Solana',
            symbol: 'SOL',
            balance: solanaBalances.sol,
            balanceUsd: solanaBalances.sol * solanaPrices.sol,
            icon: require('../../../assets/icons/networks/solana.png')
        }] : []),
        ...(solanaAddress ? [{
            chain: 'solana',
            name: 'USD Coin',
            symbol: 'USDC',
            balance: solanaBalances.usdc,
            balanceUsd: solanaBalances.usdc * solanaPrices.usdc,
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
                            onPress={() => bottomSheetRef.current?.present()}
                        >
                            <View style={[styles.actionIconBox, { backgroundColor: themeColors.surfaceHighlight || (themeColors.background === '#FFFFFF' ? '#F0EEFF' : 'rgba(37, 99, 235, 0.15)') }]}>
                                <QrCode size={24} color="#2563EB" fill="#2563EB" />
                            </View>
                            <Text style={[styles.actionButtonLabel, { color: themeColors.textPrimary }]}>Receive</Text>
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
                            <View key={`${item.chain}-${item.symbol}-${index}`} style={[styles.tokenItem, { backgroundColor: themeColors.surface }]}>
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
                            </View>
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
                    ref={bottomSheetRef}
                    index={0}
                    snapPoints={snapPoints}
                    enablePanDownToClose={true}
                    backdropComponent={renderBackdrop}
                    backgroundStyle={{ backgroundColor: themeColors.background }}
                    handleIndicatorStyle={{ backgroundColor: themeColors.textSecondary, width: 40 }}
                >
                    <BottomSheetView style={[styles.bottomSheetContent, { backgroundColor: themeColors.background }]}>
                        {/* Header: Receive left-aligned, X on right */}
                        <View style={styles.receiveHeader}>
                            <Text style={[styles.receiveHeaderTitle, { color: themeColors.textPrimary }]}>Receive</Text>
                            <TouchableOpacity onPress={() => bottomSheetRef.current?.dismiss()} style={styles.closeButton}>
                                <X size={20} color={themeColors.textPrimary} strokeWidth={3} />
                            </TouchableOpacity>
                        </View>

                        {/* Main Content */}
                        <View style={styles.receiveBody}>
                            {/* User Name */}
                            <Text style={[styles.receiveUserName, { color: themeColors.textPrimary }]}>
                                {userName.firstName || 'My Wallet'}
                            </Text>

                            {/* Large QR Code Card */}
                            <View style={styles.qrCard}>
                                <QRCode
                                    value={selectedChain === 'solana' ? (solanaAddress || 'loading') : (baseAddress || 'loading')}
                                    size={220}
                                    backgroundColor="#FFFFFF"
                                    color="#000000"
                                />
                            </View>

                            {/* Supported Networks Logos Row */}
                            <View style={styles.supportedNetworksSection}>
                                <View style={styles.networkLogosRow}>
                                    {CHAINS.map((chain) => (
                                        <TouchableOpacity
                                            key={chain.id}
                                            onPress={() => setSelectedChain(chain.id as 'base' | 'solana')}
                                            style={[
                                                styles.networkLogoWrapper,
                                                selectedChain === chain.id && styles.networkLogoActive
                                            ]}
                                        >
                                            <Image source={chain.icon} style={styles.supportedNetworkIcon} />
                                        </TouchableOpacity>
                                    ))}
                                </View>
                                <Text style={[styles.supportedNetworksText, { color: themeColors.textSecondary }]}>Supported Networks</Text>
                            </View>
                        </View>

                        {/* Bottom Action Bar */}
                        <View style={styles.receiveActionBar}>
                            <TouchableOpacity
                                style={styles.receiveActionBtn}
                                onPress={() => {
                                    const address = selectedChain === 'solana' ? (solanaAddress || '') : (baseAddress || '');
                                    Share.share({ message: address });
                                }}
                            >
                                <View style={[styles.receiveActionCircle, { backgroundColor: themeColors.surface }]}>
                                    <Export size={28} color={themeColors.textPrimary} />
                                </View>
                                <Text style={[styles.receiveActionLabel, { color: themeColors.textPrimary }]}>Share</Text>
                            </TouchableOpacity>

                            {Platform.OS === 'ios' && Host ? (
                                <Host>
                                    <ContextMenu>
                                        <ContextMenu.Trigger>
                                            <View style={styles.receiveActionBtn}>
                                                <View style={[styles.receiveActionCircle, { backgroundColor: themeColors.surface }]}>
                                                    <Copy size={28} color={themeColors.textPrimary} />
                                                </View>
                                                <Text style={[styles.receiveActionLabel, { color: themeColors.textPrimary }]}>Copy</Text>
                                            </View>
                                        </ContextMenu.Trigger>
                                        <ContextMenu.Items>
                                            <ExpoButton onPress={() => copyAddress('base')}>Copy EVM Address</ExpoButton>
                                            <ExpoButton onPress={() => copyAddress('solana')}>Copy Solana Address</ExpoButton>
                                        </ContextMenu.Items>
                                    </ContextMenu>
                                </Host>
                            ) : (
                                <AndroidDropdownMenu
                                    options={[
                                        { label: 'Copy EVM Address', onPress: () => copyAddress('base') },
                                        { label: 'Copy Solana Address', onPress: () => copyAddress('solana') },
                                    ]}
                                    trigger={
                                        <View style={styles.receiveActionBtn}>
                                            <View style={[styles.receiveActionCircle, { backgroundColor: themeColors.surface }]}>
                                                <Copy size={28} color={themeColors.textPrimary} />
                                            </View>
                                            <Text style={[styles.receiveActionLabel, { color: themeColors.textPrimary }]}>Copy</Text>
                                        </View>
                                    }
                                />
                            )}
                        </View>
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
    actionButtons: { flexDirection: 'row', gap: 12, marginBottom: 32 },
    actionButton: { alignItems: 'center', gap: 8 },
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
    receiveBody: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
    receiveUserName: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 22, marginBottom: 20 },
    qrCard: { backgroundColor: '#FFFFFF', borderRadius: 28, padding: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 6, width: '100%', aspectRatio: 1 },
    supportedNetworksSection: { alignItems: 'center', gap: 8 },
    networkLogosRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    networkLogoWrapper: { padding: 3, borderRadius: 15, borderWidth: 2, borderColor: 'transparent' },
    networkLogoActive: { borderColor: Colors.primary },
    supportedNetworkIcon: { width: 22, height: 22, borderRadius: 11 },
    supportedNetworksText: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 13, opacity: 0.7 },
    receiveActionBar: { flexDirection: 'row', justifyContent: 'center', gap: 40, paddingBottom: 16, paddingTop: 16 },
    receiveActionBtn: { alignItems: 'center', gap: 8 },
    receiveActionCircle: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center' },
    receiveActionLabel: { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 13 },
});
