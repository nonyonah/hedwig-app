import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Modal, RefreshControl, Alert, LayoutAnimation, Platform, UIManager, Animated } from 'react-native';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColors, Colors } from '../../../theme/colors';
import { useAuth } from '../../../hooks/useAuth';
import { useWallet } from '../../../hooks/useWallet';
import { LinearGradient } from 'expo-linear-gradient';
import { Gear, Copy, QrCode, CaretDown, ArrowsLeftRight, PaperPlaneTilt, Bank, List } from 'phosphor-react-native';
import { useRouter, useNavigation, useFocusEffect } from 'expo-router';
import { DrawerActions } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import { useEmbeddedSolanaWallet } from '@privy-io/expo';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import * as WebBrowser from 'expo-web-browser';
import { getUserGradient } from '../../../utils/gradientUtils';

// Profile color gradient options (consistent with other screens)
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

const CHAINS = [
    { id: 'base', name: 'Base', icon: require('../../../assets/icons/networks/base.png') },
    { id: 'solana', name: 'Solana', icon: require('../../../assets/icons/networks/solana.png') },
];

const SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com'; // Or use a better provided one from env
const USDC_MINT_ADDRESS = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

export default function WalletScreen() {
    const themeColors = useThemeColors();
    const router = useRouter();
    const navigation = useNavigation();
    const { user, getAccessToken } = useAuth();

    // Base Wallet Hook (Backend managed)
    const {
        balances: baseBalances,
        address: baseAddress,
        getTotalUsd: getBaseTotalUsd,
        fetchBalances: fetchBaseBalances
    } = useWallet();

    // Solana Wallet Hook (Privy Embedded)
    const solanaWalletState = useEmbeddedSolanaWallet();
    const solanaAddress = (solanaWalletState as any)?.wallets?.[0]?.address;

    const [userName, setUserName] = useState({ firstName: '', lastName: '' });
    const [profileIcon, setProfileIcon] = useState<{ emoji?: string; colorIndex?: number; imageUri?: string }>({});

    // Solana State
    const [solanaBalances, setSolanaBalances] = useState<{ sol: number, usdc: number }>({ sol: 0, usdc: 0 });
    const [solanaPrices, setSolanaPrices] = useState<{ sol: number, usdc: number }>({ sol: 0, usdc: 1 });
    const [isSolanaLoading, setIsSolanaLoading] = useState(false);

    const [refreshing, setRefreshing] = useState(false);
    const [showQRModal, setShowQRModal] = useState(false);
    const [selectedChain, setSelectedChain] = useState(CHAINS[0]);
    const [networkFilter, setNetworkFilter] = useState<'all' | 'base' | 'solana'>('all');
    const [showNetworkDropdown, setShowNetworkDropdown] = useState(false);
    const dropdownAnimation = useState(new Animated.Value(0))[0];

    useEffect(() => {
        fetchUserData();
        fetchBaseBalances();
    }, []);

    // Refetch profile data when screen comes into focus
    useFocusEffect(
        React.useCallback(() => {
            if (user) {
                fetchUserData();
            }
        }, [user])
    );

    useEffect(() => {
        if (solanaAddress) {
            fetchSolanaBalances(solanaAddress);
        }
    }, [solanaAddress]);

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

                // Set profile icon - handle data URIs and regular URLs
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
        } catch (error) {
            console.error('Failed to fetch user data:', error);
        }
    };

    const fetchSolanaBalances = async (address: string) => {
        try {
            setIsSolanaLoading(true);
            const connection = new Connection(SOLANA_RPC_URL);
            const publicKey = new PublicKey(address);

            // 1. Get SOL Balance
            const solBalanceLamports = await connection.getBalance(publicKey);
            const solBalance = solBalanceLamports / LAMPORTS_PER_SOL;

            // 2. Get USDC Balance (SPL Token)
            let usdcBalance = 0;
            // Note: This is a simplified fetch. In a production app, we might want to use getParsedTokenAccountsByOwner for all tokens.
            // For now, specifically checking USDC.
            try {
                const usdcMint = new PublicKey(USDC_MINT_ADDRESS);
                const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, { mint: usdcMint });

                if (tokenAccounts.value.length > 0) {
                    // Sum up all accounts if there are multiple (though usually just one associated token account)
                    usdcBalance = tokenAccounts.value.reduce((acc, account) => {
                        const parsedInfo = account.account.data.parsed.info;
                        return acc + (parsedInfo.tokenAmount.uiAmount || 0);
                    }, 0);
                }
            } catch (e) {
                console.log('Error fetching Solana USDC balance:', e);
            }

            // 3. Fetch SOL Price (Simple fetch from an API like CoinGecko or internal if available, mocking for now or using a public one)
            // For simplicity and robustness without extra API keys, I'll set a hardcoded fallback or try a simple public endpoint if strictly needed.
            // I'll stick to a placeholder price fetch or rely on what we can get.
            // TODO: Integrate real price feed. For now, assuming SOL ~ $150 for display if API not available.
            let solPrice = 150;
            try {
                const priceRes = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
                const priceData = await priceRes.json();
                if (priceData.solana?.usd) {
                    solPrice = priceData.solana.usd;
                }
            } catch (err) {
                // Ignore price fetch error
            }

            setSolanaBalances({ sol: solBalance, usdc: usdcBalance });
            setSolanaPrices({ sol: solPrice, usdc: 1 }); // USDC is ~1

        } catch (error) {
            console.error('Failed to fetch Solana balances:', error);
        } finally {
            setIsSolanaLoading(false);
        }
    };

    const onRefresh = async () => {
        setRefreshing(true);
        await Promise.all([
            fetchUserData(),
            fetchBaseBalances(),
            solanaAddress ? fetchSolanaBalances(solanaAddress) : Promise.resolve()
        ]);
        setRefreshing(false);
    };

    const copyAddress = async () => {
        const address = selectedChain.id === 'solana' ? solanaAddress : baseAddress;
        if (address) {
            await Clipboard.setStringAsync(address);
            Alert.alert('Copied', 'Address copied to clipboard');
        } else {
            Alert.alert('Error', 'No address found');
        }
    };

    const formatAddress = (address?: string | null) => {
        if (!address) return '...';
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    };

    // Calculate Total Balance
    const baseTotal = parseFloat(getBaseTotalUsd());
    const solanaTotal = (solanaBalances.sol * solanaPrices.sol) + (solanaBalances.usdc * solanaPrices.usdc);
    const totalBalance = baseTotal + solanaTotal;

    // Combine tokens for list - separate by chain, not grouped
    const baseUSDC = baseBalances.find(b => b.asset === 'usdc');
    const baseETH = baseBalances.find(b => b.asset === 'eth');
    
    const allTokens = [
        // ETH on Base
        ...(baseETH ? [{
            chain: 'base',
            name: 'Ethereum',
            symbol: 'ETH',
            balance: parseFloat(baseETH.display_values?.eth || baseETH.raw_value || '0') / (baseETH.raw_value_decimals ? Math.pow(10, baseETH.raw_value_decimals) : 1e18),
            balanceUsd: parseFloat(baseETH.display_values?.usd || '0'),
            icon: require('../../../assets/icons/tokens/eth.png')
        }] : []),
        // USDC on Base
        ...(baseUSDC ? [{
            chain: 'base',
            name: 'USD Coin',
            symbol: 'USDC',
            balance: parseFloat(baseUSDC.display_values?.usdc || baseUSDC.raw_value || '0') / (baseUSDC.raw_value_decimals ? Math.pow(10, baseUSDC.raw_value_decimals) : 1e6),
            balanceUsd: parseFloat(baseUSDC.display_values?.usd || '0'),
            icon: require('../../../assets/icons/tokens/usdc.png')
        }] : []),
        // SOL on Solana
        ...(solanaAddress ? [{
            chain: 'solana',
            name: 'Solana',
            symbol: 'SOL',
            balance: solanaBalances.sol,
            balanceUsd: solanaBalances.sol * solanaPrices.sol,
            icon: require('../../../assets/icons/networks/solana.png')
        }] : []),
        // USDC on Solana
        ...(solanaAddress ? [{
            chain: 'solana',
            name: 'USD Coin',
            symbol: 'USDC',
            balance: solanaBalances.usdc,
            balanceUsd: solanaBalances.usdc * solanaPrices.usdc,
            icon: require('../../../assets/icons/tokens/usdc.png')
        }] : [])
    ];

    // Filter tokens by network
    const filteredTokens = networkFilter === 'all' 
        ? allTokens 
        : allTokens.filter(t => t.chain === networkFilter);

    return (
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
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
            >
                {/* Total Balance */}
                <View style={styles.balanceSection}>
                    <Text style={[styles.totalBalance, { color: themeColors.textPrimary }]}>
                        ${totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                </View>

                {/* Primary Actions */}
                <View style={styles.actionButtons}>
                    <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => setShowQRModal(true)}
                    >
                        <View style={[styles.actionIconBox, { backgroundColor: themeColors.surfaceHighlight || (themeColors.background === '#FFFFFF' ? '#F0EEFF' : 'rgba(37, 99, 235, 0.15)') }]}>
                            <QrCode size={24} color="#2563EB" weight="fill" />
                        </View>
                        <Text style={[styles.actionButtonLabel, { color: themeColors.textPrimary }]}>Receive</Text>
                    </TouchableOpacity>
                </View>

                {/* Token List with Network Filter */}
                <View style={styles.tokenSection}>
                    <View style={styles.tokenHeader}>
                        <Text style={[styles.sectionTitle, { color: themeColors.textSecondary }]}>Tokens</Text>
                        <TouchableOpacity 
                            style={[styles.networkFilterButton, { backgroundColor: themeColors.surface }]}
                            onPress={() => {
                                if (!showNetworkDropdown) {
                                    setShowNetworkDropdown(true);
                                    Animated.spring(dropdownAnimation, {
                                        toValue: 1,
                                        damping: 15,
                                        stiffness: 150,
                                        useNativeDriver: true,
                                    }).start();
                                } else {
                                    Animated.timing(dropdownAnimation, {
                                        toValue: 0,
                                        duration: 200,
                                        useNativeDriver: true,
                                    }).start(() => setShowNetworkDropdown(false));
                                }
                            }}
                        >
                            {networkFilter === 'all' ? (
                                <Text style={[styles.networkFilterText, { color: themeColors.textPrimary }]}>All Networks</Text>
                            ) : (
                                <>
                                    <Image 
                                        source={networkFilter === 'base' ? require('../../../assets/icons/networks/base.png') : require('../../../assets/icons/networks/solana.png')} 
                                        style={styles.networkFilterIcon} 
                                    />
                                    <Text style={[styles.networkFilterText, { color: themeColors.textPrimary }]}>
                                        {networkFilter === 'base' ? 'Base' : 'Solana'}
                                    </Text>
                                </>
                            )}
                            <CaretDown size={16} color={themeColors.textSecondary} weight="bold" />
                        </TouchableOpacity>
                    </View>

                    {/* Network Dropdown */}
                    {showNetworkDropdown && (
                        <Animated.View 
                            style={[
                                styles.networkDropdown, 
                                { backgroundColor: themeColors.surface },
                                {
                                    opacity: dropdownAnimation,
                                    transform: [
                                        {
                                            scale: dropdownAnimation.interpolate({
                                                inputRange: [0, 1],
                                                outputRange: [0.95, 1],
                                            }),
                                        },
                                        {
                                            translateY: dropdownAnimation.interpolate({
                                                inputRange: [0, 1],
                                                outputRange: [-10, 0],
                                            }),
                                        },
                                    ],
                                }
                            ]}
                        >
                            <TouchableOpacity 
                                style={[styles.networkDropdownItem, networkFilter === 'all' && { backgroundColor: 'rgba(99, 102, 241, 0.1)' }]}
                                onPress={() => { 
                                    setNetworkFilter('all');
                                    Animated.timing(dropdownAnimation, {
                                        toValue: 0,
                                        duration: 200,
                                        useNativeDriver: true,
                                    }).start(() => setShowNetworkDropdown(false));
                                }}
                            >
                                <Text style={[styles.networkDropdownText, { color: themeColors.textPrimary }]}>All Networks</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                                style={[styles.networkDropdownItem, networkFilter === 'base' && { backgroundColor: 'rgba(99, 102, 241, 0.1)' }]}
                                onPress={() => { 
                                    setNetworkFilter('base');
                                    Animated.timing(dropdownAnimation, {
                                        toValue: 0,
                                        duration: 200,
                                        useNativeDriver: true,
                                    }).start(() => setShowNetworkDropdown(false));
                                }}
                            >
                                <Image source={require('../../../assets/icons/networks/base.png')} style={styles.networkDropdownIcon} />
                                <Text style={[styles.networkDropdownText, { color: themeColors.textPrimary }]}>Base</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                                style={[styles.networkDropdownItem, networkFilter === 'solana' && { backgroundColor: 'rgba(99, 102, 241, 0.1)' }]}
                                onPress={() => { 
                                    setNetworkFilter('solana');
                                    Animated.timing(dropdownAnimation, {
                                        toValue: 0,
                                        duration: 200,
                                        useNativeDriver: true,
                                    }).start(() => setShowNetworkDropdown(false));
                                }}
                            >
                                <Image source={require('../../../assets/icons/networks/solana.png')} style={styles.networkDropdownIcon} />
                                <Text style={[styles.networkDropdownText, { color: themeColors.textPrimary }]}>Solana</Text>
                            </TouchableOpacity>
                        </Animated.View>
                    )}

                    {filteredTokens.map((item, index) => (
                        <View key={`${item.chain}-${item.symbol}-${index}`} style={[styles.tokenItem, { backgroundColor: themeColors.surface }]}>
                            <View style={styles.tokenLeft}>
                                <View style={styles.tokenIconContainer}>
                                    <Image source={item.icon} style={styles.tokenIconImage} />
                                    {/* Chain badge overlay */}
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

            {/* QR Code Modal for Receive */}
            <Modal
                visible={showQRModal}
                transparent
                animationType="slide"
                onRequestClose={() => setShowQRModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { backgroundColor: themeColors.background }]}>
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>Receive Assets</Text>
                            <TouchableOpacity onPress={() => setShowQRModal(false)}>
                                <Text style={{ color: themeColors.textSecondary, fontSize: 16 }}>Close</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Chain Selector */}
                        <View style={[styles.chainSelector, { backgroundColor: themeColors.surface }]}>
                            {CHAINS.map((chain) => (
                                <TouchableOpacity
                                    key={chain.id}
                                    style={[
                                        styles.chainOption,
                                        selectedChain.id === chain.id && { backgroundColor: Colors.primary }
                                    ]}
                                    onPress={() => setSelectedChain(chain)}
                                >
                                    <Image source={chain.icon} style={styles.chainOptionIcon} />
                                    <Text style={[
                                        styles.chainOptionText,
                                        { color: selectedChain.id === chain.id ? '#FFFFFF' : themeColors.textPrimary }
                                    ]}>
                                        {chain.name}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* Address Display */}
                        <View style={[styles.qrContainer, { backgroundColor: '#FFFFFF' }]}>
                            {/* In a real app, generate the QR code image here */}
                            <QrCode size={160} color="#000000" />
                        </View>

                        <View style={[styles.addressContainer, { backgroundColor: themeColors.surface }]}>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.addressLabel, { color: themeColors.textSecondary }]}>Your {selectedChain.name} Address</Text>
                                <Text style={[styles.fullAddress, { color: themeColors.textPrimary }]}>
                                    {selectedChain.id === 'solana' ? (solanaAddress || 'Loading...') : (baseAddress || 'Loading...')}
                                </Text>
                            </View>
                            <TouchableOpacity onPress={copyAddress} style={styles.copyButton}>
                                <Copy size={24} color={Colors.primary} />
                            </TouchableOpacity>
                        </View>

                        <Text style={[styles.warningText, { color: themeColors.textSecondary }]}>
                            Only send {selectedChain.name} network assets to this address.
                        </Text>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 12,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    profileImage: {
        width: 40,
        height: 40,
        borderRadius: 20,
    },
    headerTextContainer: {
        justifyContent: 'center',
    },
    headerName: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 18,
    },
    settingsButton: {
        padding: 8,
    },
    content: {
        flex: 1,
        paddingHorizontal: 20,
    },
    balanceSection: {
        marginTop: 24,
        marginBottom: 32,
        alignItems: 'flex-start',
    },
    totalBalance: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 42,
        letterSpacing: -1,
    },
    actionButtons: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 32,
    },
    actionButton: {
        alignItems: 'center',
        gap: 8,
    },
    actionIconBox: {
        width: 56,
        height: 56,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    actionButtonLabel: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 13,
    },
    tokenSection: {
        marginBottom: 100,
    },
    tokenHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    sectionTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 18,
    },
    networkFilterButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 12,
    },
    networkFilterIcon: {
        width: 16,
        height: 16,
        borderRadius: 8,
    },
    networkFilterText: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 13,
    },
    networkDropdown: {
        borderRadius: 16,
        padding: 8,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
    },
    networkDropdownItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 12,
        paddingVertical: 12,
        borderRadius: 12,
    },
    networkDropdownIcon: {
        width: 20,
        height: 20,
        borderRadius: 10,
    },
    networkDropdownText: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 14,
    },
    tokenItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderRadius: 20,
        marginBottom: 12,
    },
    tokenLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    tokenIconContainer: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'transparent',
        position: 'relative',
    },
    tokenIconImage: {
        width: 32,
        height: 32,
        borderRadius: 16,
    },
    chainBadgeOverlay: {
        position: 'absolute',
        bottom: -2,
        right: -2,
        backgroundColor: '#FFFFFF',
        borderRadius: 8,
        padding: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    chainBadgeIcon: {
        width: 12,
        height: 12,
        borderRadius: 6,
    },
    tokenName: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 16,
    },
    chainBadge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 8,
    },
    chainBadgeText: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 11,
    },
    tokenSymbol: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 13,
        marginTop: 2,
    },
    chainLabel: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 12,
        marginTop: 2,
    },
    chainText: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 13,
    },
    tokenRight: {
        alignItems: 'flex-end',
    },
    tokenBalance: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 16,
        marginBottom: 2,
    },
    tokenAmount: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 13,
    },
    emptyState: {
        padding: 20,
        alignItems: 'center',
    },
    emptyStateText: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 14,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        padding: 24,
        paddingBottom: 48,
        height: '85%',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    modalTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 20,
    },
    chainSelector: {
        flexDirection: 'row',
        padding: 4,
        borderRadius: 16,
        marginBottom: 32,
        gap: 8,
    },
    chainOption: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
        borderRadius: 12,
        gap: 8,
    },
    chainOptionIcon: {
        width: 20,
        height: 20,
        borderRadius: 10,
    },
    chainOptionText: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 14,
    },
    qrContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        borderRadius: 24,
        marginBottom: 24,
        alignSelf: 'center',
    },
    addressContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 16,
        marginBottom: 24,
    },
    addressLabel: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 12,
        marginBottom: 4,
    },
    fullAddress: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 14,
    },
    copyButton: {
        width: 44,
        height: 44,
        justifyContent: 'center',
        alignItems: 'center',
    },
    warningText: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 13,
        textAlign: 'center',
    },
});
