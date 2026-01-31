import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Dimensions, ScrollView, Platform, Alert, Image, Keyboard } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../hooks/useAuth';
import { useWallet } from '../hooks/useWallet';
import * as Clipboard from 'expo-clipboard';
import { Copy, Wallet, CaretRight, CaretLeft, X } from 'phosphor-react-native';
import { Colors, useThemeColors } from '../theme/colors';
import { Typography } from '../styles/typography';
import { BottomSheetModal, BottomSheetView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';

import {
    NetworkBase, NetworkSolana,
    TokenETH, TokenUSDC, TokenSOL
} from './CryptoIcons';
import { getUserGradient } from '../utils/gradientUtils';
import { modalHaptic } from './ui/ModalStyles';
import { useSettings } from '../context/SettingsContext';

// RPC URLs
const RPC_URLS = {
    base: 'https://mainnet.base.org'
};

const { height } = Dimensions.get('window');

interface ChainInfo {
    name: string;
    icon: React.FC<any>;
    color: string;
    id: number;
    addressType: 'evm' | 'solana' | 'bitcoin';
    tokens: { symbol: string; icon: React.FC<any> }[];
}

const SUPPORTED_CHAINS: ChainInfo[] = [
    {
        name: 'Base', // Base Mainnet
        id: 8453,
        icon: NetworkBase,
        color: '#0052FF',
        addressType: 'evm',
        tokens: [
            { symbol: 'ETH', icon: TokenETH },
            { symbol: 'USDC', icon: TokenUSDC }
        ]
    },
    {
        name: 'Solana',
        id: 900,
        icon: NetworkSolana,
        color: '#14F195',
        addressType: 'solana',
        tokens: [
            { symbol: 'SOL', icon: TokenSOL },
            { symbol: 'USDC', icon: TokenUSDC }
        ]
    }
];

// Profile color gradient options (same as in profile.tsx)
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

interface ProfileModalProps {
    visible: boolean;
    onClose: () => void;
    userName?: { firstName: string; lastName: string };
    walletAddresses?: { evm?: string; solana?: string };
    profileIcon?: { emoji?: string; colorIndex?: number; imageUri?: string };
    onProfileUpdate?: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({ visible, onClose, userName, walletAddresses, profileIcon }) => {
    const { currency, hapticsEnabled } = useSettings();
    const { user, getAccessToken } = useAuth(); // removed logout since it wasn't used in main logic except unused handleLogout
    const { address: blockradarAddress, balances: walletBalances } = useWallet();
    const themeColors = useThemeColors();

    const bottomSheetRef = useRef<BottomSheetModal>(null);

    // Debug: Log profileIcon when modal opens
    useEffect(() => {
        if (visible) {
            console.log('[ProfileModal] profileIcon prop:', JSON.stringify(profileIcon, null, 2));
        }
    }, [visible, profileIcon]);

    const [viewMode, setViewMode] = useState<'main' | 'assets' | 'chains'>('main');
    const [selectedChain, setSelectedChain] = useState<ChainInfo>(SUPPORTED_CHAINS[0]);
    const [ethAddress, setEthAddress] = useState<string>('');
    const [solAddress, setSolAddress] = useState<string>('');
    const [btcAddress, setBtcAddress] = useState<string>('');
    const [balances, setBalances] = useState<any>({});
    const [totalBalance, setTotalBalance] = useState('0.00'); // USD balance
    const [exchangeRate, setExchangeRate] = useState<number>(1); // Rate from USD to selected currency

    // Helper for currency symbol
    const getCurrencySymbol = (curr: string) => {
        switch (curr) {
            case 'NGN': return '₦';
            case 'GHS': return '₵';
            case 'KES': return 'KSh';
            default: return '$';
        }
    };
    const currencySymbol = getCurrencySymbol(currency);

    // Compute displayed balance (converted from USD)
    const displayBalance = currency === 'USD'
        ? totalBalance
        : (parseFloat(totalBalance) * exchangeRate).toLocaleString('en-US', { maximumFractionDigits: 2 });

    // Fetch exchange rate when currency changes
    useEffect(() => {
        const FALLBACK_RATES: Record<string, number> = {
            NGN: 1600,
            GHS: 15,
            KES: 155,
        };

        const fetchExchangeRate = async () => {
            if (currency === 'USD') {
                setExchangeRate(1);
                return;
            }

            try {
                const token = await getAccessToken();
                if (!token) {
                    setExchangeRate(FALLBACK_RATES[currency] || 1);
                    return;
                }

                const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
                const response = await fetch(
                    `${apiUrl}/api/offramp/rates?token=USDC&amount=1&currency=${currency}&network=base`,
                    { headers: { 'Authorization': `Bearer ${token}` } }
                );

                const result = await response.json();
                if (result.success && result.data?.rate) {
                    setExchangeRate(parseFloat(result.data.rate));
                } else {
                    setExchangeRate(FALLBACK_RATES[currency] || 1);
                }
            } catch (error) {
                setExchangeRate(FALLBACK_RATES[currency] || 1);
            }
        };

        fetchExchangeRate();
    }, [currency, getAccessToken]);

    // Staggered entrance animations for internal elements
    const headerAnim = useRef(new Animated.Value(0)).current;
    const balanceAnim = useRef(new Animated.Value(0)).current;
    const chainsAnim = useRef(new Animated.Value(0)).current;
    const viewContentAnim = useRef(new Animated.Value(1)).current; // For view transitions

    // Blockradar address is now managed by backend
    useEffect(() => {
        if (blockradarAddress) {
            setEthAddress(blockradarAddress);
        }
    }, [blockradarAddress]);

    // Fetch Balances via Backend API with periodic refresh
    useEffect(() => {
        const fetchBalances = async () => {
            if (!visible || !user) return;

            try {
                const token = await getAccessToken();
                if (!token) return;

                const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
                const response = await fetch(`${apiUrl}/api/wallet/balance`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (!response.ok) return;

                const data = await response.json();
                const balanceData = data.data?.balances || [];

                const newBalances: any = {};
                let totalUsd = 0;

                balanceData.forEach((bal: any) => {
                    if (bal.chain === 'base') {
                        if (bal.asset === 'eth') {
                            newBalances['Base_ETH'] = parseFloat(bal.display_values?.eth || bal.raw_value || '0') / (bal.raw_value_decimals ? Math.pow(10, bal.raw_value_decimals) : 1e18);
                            newBalances['Base_ETH'] = newBalances['Base_ETH'].toFixed(6);
                            totalUsd += parseFloat(bal.display_values?.usd || '0');
                        } else if (bal.asset === 'usdc') {
                            newBalances['Base_USDC'] = parseFloat(bal.display_values?.usdc || bal.raw_value || '0') / (bal.raw_value_decimals ? Math.pow(10, bal.raw_value_decimals) : 1e6);
                            newBalances['Base_USDC'] = newBalances['Base_USDC'].toFixed(2);
                            totalUsd += parseFloat(bal.display_values?.usd || '0');
                        }
                    } else if (bal.chain === 'solana') {
                        if (bal.asset === 'sol') {
                            newBalances['Solana_SOL'] = parseFloat(bal.display_values?.sol || bal.raw_value || '0') / (bal.raw_value_decimals ? Math.pow(10, bal.raw_value_decimals) : 1e9);
                            newBalances['Solana_SOL'] = newBalances['Solana_SOL'].toFixed(6);
                            totalUsd += parseFloat(bal.display_values?.usd || '0');
                        } else if (bal.asset === 'usdc') {
                            newBalances['Solana_USDC'] = parseFloat(bal.display_values?.usdc || bal.raw_value || '0') / (bal.raw_value_decimals ? Math.pow(10, bal.raw_value_decimals) : 1e6);
                            newBalances['Solana_USDC'] = newBalances['Solana_USDC'].toFixed(2);
                            totalUsd += parseFloat(bal.display_values?.usd || '0');
                        }
                    }
                });

                setBalances(newBalances);
                setTotalBalance(totalUsd.toFixed(2));

                if (data.data?.solanaAddress && !solAddress) {
                    setSolAddress(data.data.solanaAddress);
                }

            } catch (error) {
                console.log('[ProfileModal] Error fetching balances:', error);
            }
        };

        fetchBalances();

        let intervalId: any = null;
        if (visible) {
            intervalId = setInterval(fetchBalances, 30000);
        }

        return () => {
            if (intervalId) clearInterval(intervalId);
        };
    }, [visible, user]);

    useEffect(() => {
        // Use Blockradar address from the wallet hook (EVM)
        if (blockradarAddress && !ethAddress) {
            setEthAddress(blockradarAddress);
        }

        // Check walletAddresses prop from backend (fallback)
        if (walletAddresses) {
            if (walletAddresses.evm && !ethAddress) {
                setEthAddress(walletAddresses.evm);
            }
            if (walletAddresses.solana && !solAddress) {
                setSolAddress(walletAddresses.solana);
            }
        }
    }, [blockradarAddress, user, ethAddress, walletAddresses]);


    // Handle opening/closing with BottomSheetModal
    // Logic: Prop visible -> present()/dismiss()
    useEffect(() => {
        if (visible) {
            modalHaptic('open', hapticsEnabled);
            bottomSheetRef.current?.present();

            // Run animations after a small delay to allow sheet layout
            // Reset stagger animations
            headerAnim.setValue(0);
            balanceAnim.setValue(0);
            chainsAnim.setValue(0);

            Animated.stagger(30, [
                Animated.spring(headerAnim, { toValue: 1, damping: 20, stiffness: 300, useNativeDriver: true }),
                Animated.spring(balanceAnim, { toValue: 1, damping: 20, stiffness: 300, useNativeDriver: true }),
                Animated.spring(chainsAnim, { toValue: 1, damping: 20, stiffness: 300, useNativeDriver: true }),
            ]).start();

        } else {
            modalHaptic('close', hapticsEnabled);
            bottomSheetRef.current?.dismiss();
            Keyboard.dismiss();
            setViewMode('main');
        }
    }, [visible]);

    // Handle Sheet Changes (to sync visible prop if dismissed by gesture)
    const handleSheetChanges = useCallback((index: number) => {
        if (index === -1) {
            onClose(); // This updates the parent's state to match
        }
    }, [onClose]);

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

    // Animate content when view mode changes (any direction)
    useEffect(() => {
        if (visible) {
            viewContentAnim.setValue(0);
            if (viewMode === 'main') {
                balanceAnim.setValue(0);
                chainsAnim.setValue(0);
                Animated.parallel([
                    Animated.timing(balanceAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
                    Animated.timing(chainsAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
                ]).start();
            } else {
                Animated.timing(viewContentAnim, {
                    toValue: 1,
                    duration: 100,
                    useNativeDriver: true,
                }).start();
            }
        }
    }, [viewMode, visible]);

    // Render logic
    return (
        <BottomSheetModal
            ref={bottomSheetRef}
            index={0}
            enableDynamicSizing={true}
            onChange={handleSheetChanges}
            backdropComponent={renderBackdrop}
            enablePanDownToClose
            backgroundStyle={{
                backgroundColor: themeColors.background,
                borderRadius: 24,
            }}
            handleIndicatorStyle={{
                backgroundColor: '#DDDDDD',
                width: 40
            }}
        >
            <BottomSheetView style={styles.sheetContent}>

                {/* Header */}
                <Animated.View style={[styles.modalHeader, { opacity: headerAnim, transform: [{ translateY: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
                    <View style={styles.userInfo}>
                        {profileIcon?.imageUri ? (
                            <Image
                                source={{ uri: profileIcon.imageUri }}
                                style={[styles.avatarContainer, styles.avatarImage]}
                            />
                        ) : profileIcon?.emoji ? (
                            <LinearGradient
                                colors={profileIcon?.colorIndex !== undefined
                                    ? PROFILE_COLOR_OPTIONS[profileIcon.colorIndex]
                                    : ['#F3F4F6', '#E5E7EB', '#D1D5DB']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.avatarContainer}
                            >
                                <Text style={styles.emojiAvatar}>{profileIcon.emoji}</Text>
                            </LinearGradient>
                        ) : (
                            <LinearGradient
                                colors={profileIcon?.colorIndex !== undefined
                                    ? PROFILE_COLOR_OPTIONS[profileIcon.colorIndex]
                                    : getUserGradient(user?.id || userName?.firstName)}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.avatarContainer}
                            >
                                {userName?.firstName && (
                                    <Text style={styles.avatarText}>{userName.firstName[0].toUpperCase()}</Text>
                                )}
                            </LinearGradient>
                        )}
                        <View>
                            <Text style={[styles.profileName, { color: themeColors.textPrimary }]}>
                                {userName?.firstName ? `${userName.firstName} ${userName.lastName}` : 'User'}
                            </Text>
                            <TouchableOpacity
                                style={styles.addressCopy}
                                onPress={async () => {
                                    const address = selectedChain.addressType === 'evm'
                                        ? ethAddress
                                        : selectedChain.addressType === 'solana'
                                            ? solAddress
                                            : btcAddress;

                                    if (address) {
                                        await Clipboard.setStringAsync(address);
                                        Alert.alert('Copied', 'Address copied to clipboard');
                                    }
                                }}
                            >
                                <Text style={[styles.profileAddress, { color: themeColors.textSecondary }]}>
                                    {selectedChain.addressType === 'evm'
                                        ? (ethAddress ? `${ethAddress.slice(0, 6)}...${ethAddress.slice(-4)}` : '0x...')
                                        : selectedChain.addressType === 'solana'
                                            ? (solAddress ? `${solAddress.slice(0, 6)}...${solAddress.slice(-4)}` : 'Not connected')
                                            : (btcAddress ? `${btcAddress.slice(0, 6)}...${btcAddress.slice(-4)}` : 'Not connected')
                                    }
                                </Text>
                                <Copy size={14} color={themeColors.textTertiary} />
                            </TouchableOpacity>
                        </View>
                    </View>
                    <TouchableOpacity onPress={() => bottomSheetRef.current?.dismiss()} style={[styles.closeButton, { backgroundColor: themeColors.surface }]}>
                        <X size={20} color={themeColors.textSecondary} weight="bold" />
                    </TouchableOpacity>
                </Animated.View>

                <ScrollView
                    style={styles.scrollView}
                    showsVerticalScrollIndicator={false}
                    bounces={true}
                >
                    {/* Content based on viewMode */}
                    {viewMode === 'main' && (
                        <View style={styles.mainContent}>
                            {/* Total Balance Card */}
                            <Animated.View style={[styles.balanceCard, { opacity: balanceAnim, transform: [{ translateY: balanceAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
                                <Text style={[styles.balanceLabel, { color: themeColors.textSecondary }]}>Total Balance</Text>
                                <Text style={[styles.balanceAmount, { color: themeColors.textPrimary }]}>{currencySymbol}{displayBalance}</Text>
                            </Animated.View>

                            <Animated.View style={[styles.menuList, { opacity: chainsAnim, transform: [{ translateY: chainsAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
                                {/* Chain Selector */}
                                <TouchableOpacity
                                    style={[styles.menuItem, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}
                                    onPress={() => setViewMode('chains')}
                                >
                                    <View style={styles.menuItemLeft}>
                                        <selectedChain.icon width={24} height={24} />
                                        <View>
                                            <Text style={[styles.menuItemTitle, { color: themeColors.textPrimary }]}>{selectedChain.name}</Text>
                                            <Text style={[styles.menuItemSubtitle, { color: themeColors.textSecondary }]}>
                                                {selectedChain.addressType === 'evm'
                                                    ? `${parseFloat(balances['Base_ETH'] || '0').toFixed(4)} ETH`
                                                    : selectedChain.addressType === 'solana'
                                                        ? `${parseFloat(balances['Solana_SOL'] || '0').toFixed(4)} SOL`
                                                        : `${parseFloat(balances['Bitcoin Testnet_BTC'] || '0').toFixed(6)} BTC`
                                                }
                                            </Text>
                                        </View>
                                    </View>
                                    <CaretRight size={20} color={themeColors.textTertiary} />
                                </TouchableOpacity>

                                {/* View Assets */}
                                <TouchableOpacity
                                    style={[styles.menuItem, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}
                                    onPress={() => setViewMode('assets')}
                                >
                                    <View style={styles.menuItemLeft}>
                                        <Wallet size={24} color={themeColors.textPrimary} />
                                        <Text style={[styles.menuItemTitle, { color: themeColors.textPrimary }]}>View Assets</Text>
                                    </View>
                                    <CaretRight size={20} color={themeColors.textSecondary} />
                                </TouchableOpacity>
                            </Animated.View>
                        </View>
                    )}

                    {viewMode === 'assets' && (
                        <Animated.View style={[styles.assetsView, { opacity: viewContentAnim, transform: [{ translateY: viewContentAnim.interpolate({ inputRange: [0, 1], outputRange: [15, 0] }) }] }]}>
                            <TouchableOpacity
                                style={styles.backButton}
                                onPress={() => setViewMode('main')}
                            >
                                <CaretLeft size={20} color={themeColors.textSecondary} />
                                <Text style={[styles.backButtonText, { color: themeColors.textSecondary }]}>Back</Text>
                            </TouchableOpacity>

                            <Text style={[styles.viewTitle, { color: themeColors.textPrimary }]}>Assets ({selectedChain.name})</Text>

                            <View style={styles.assetList}>
                                {selectedChain.tokens.map((token, idx) => {
                                    // Construct key for balance lookup e.g. Base_ETH or Solana Devnet_SOL
                                    const key = `${selectedChain.name}_${token.symbol}`;
                                    const balance = balances[key] || '0.00';

                                    return (
                                        <View key={idx} style={[styles.assetItem, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                                            <View style={[styles.assetIcon, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                                                <token.icon width={24} height={24} />
                                            </View>
                                            <View style={styles.assetInfo}>
                                                <Text style={[styles.assetName, { color: themeColors.textPrimary }]}>{token.symbol}</Text>
                                                <Text style={[styles.assetBalance, { color: themeColors.textSecondary }]}>{parseFloat(balance).toFixed(4)}</Text>
                                            </View>
                                        </View>
                                    );
                                })}
                            </View>
                        </Animated.View>
                    )}

                    {viewMode === 'chains' && (
                        <Animated.View style={[styles.chainsView, { opacity: viewContentAnim, transform: [{ translateY: viewContentAnim.interpolate({ inputRange: [0, 1], outputRange: [15, 0] }) }] }]}>
                            <TouchableOpacity
                                style={styles.backButton}
                                onPress={() => setViewMode('main')}
                            >
                                <CaretLeft size={20} color={themeColors.textSecondary} />
                                <Text style={[styles.backButtonText, { color: themeColors.textSecondary }]}>Back</Text>
                            </TouchableOpacity>

                            <Text style={[styles.viewTitle, { color: themeColors.textPrimary }]}>Select Chain</Text>

                            {SUPPORTED_CHAINS.map((chain, idx) => (
                                <TouchableOpacity
                                    key={idx}
                                    style={[
                                        styles.chainOption,
                                        { backgroundColor: themeColors.surface, borderColor: themeColors.border },
                                        selectedChain.name === chain.name && { backgroundColor: themeColors.surface, borderColor: Colors.primary }
                                    ]}
                                    onPress={() => {
                                        setSelectedChain(chain);
                                        setViewMode('main');
                                    }}
                                >
                                    <View style={styles.chainOptionLeft}>
                                        <chain.icon width={24} height={24} />
                                        <Text style={[styles.chainOptionName, { color: themeColors.textPrimary }]}>{chain.name}</Text>
                                    </View>
                                    {selectedChain.name === chain.name && (
                                        <View style={styles.selectedDot} />
                                    )}
                                </TouchableOpacity>
                            ))}
                        </Animated.View>
                    )}
                </ScrollView>
            </BottomSheetView>
        </BottomSheetModal>
    );
};

const styles = StyleSheet.create({
    sheetContent: {
        padding: 24,
        paddingBottom: 40, // Needs plenty of padding for bottom safety
        minHeight: 450
    },
    scrollView: {
        flexGrow: 0,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    userInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    avatarContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: {
        ...Typography.h4,
        color: '#FFFFFF',
        fontSize: 16,
    },
    emojiAvatar: {
        fontSize: 22,
    },
    avatarImage: {
        resizeMode: 'cover',
        overflow: 'hidden',
    },
    profileName: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 16,
        color: Colors.textPrimary,
    },
    addressCopy: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    profileAddress: {
        ...Typography.caption,
        color: Colors.textSecondary,
        fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    },
    closeButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#F3F4F6',
        justifyContent: 'center',
        alignItems: 'center',
    },
    mainContent: {
        gap: 24,
    },
    balanceCard: {
        alignItems: 'center',
        paddingVertical: 12,
    },
    balanceLabel: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 14,
        color: Colors.textSecondary,
        marginBottom: 8,
    },
    balanceAmount: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 40,
        color: Colors.textPrimary,
        marginBottom: 24,
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.primary,
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 30,
        gap: 8,
    },
    actionIcon: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.2)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    actionText: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 14,
        color: 'white',
    },
    menuList: {
        gap: 8,
        marginBottom: 0,
    },
    menuItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        backgroundColor: '#F9FAFB',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#F3F4F6',
    },
    menuItemLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    menuItemTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 15,
        color: Colors.textPrimary,
    },
    menuItemSubtitle: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 13,
        color: Colors.textSecondary,
    },
    disconnectButton: {
        marginTop: 8,
        backgroundColor: '#FFFFFF',
        borderColor: '#FEE2E2',
    },
    disconnectText: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 14,
        color: Colors.error,
    },
    viewTitle: {
        ...Typography.h4,
        color: Colors.textPrimary,
        marginBottom: 16,
    },
    backButton: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
        gap: 4,
    },
    backButtonText: {
        ...Typography.body,
        color: Colors.textSecondary,
        fontWeight: '500',
    },
    assetsView: {
        flex: 1,
    },
    assetList: {
        gap: 12,
    },
    assetItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 16,
        backgroundColor: '#F9FAFB',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#F3F4F6',
    },
    assetIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#FFFFFF',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#F3F4F6',
    },
    assetInfo: {
        flex: 1,
    },
    assetName: {
        ...Typography.body,
        fontWeight: '600',
        color: Colors.textPrimary,
    },
    assetBalance: {
        ...Typography.caption,
        color: Colors.textSecondary,
    },
    chainsView: {
        flex: 1,
    },
    chainOption: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        backgroundColor: '#F9FAFB',
        borderRadius: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#F3F4F6',
    },
    selectedChainOption: {
        backgroundColor: '#EFF6FF',
        borderColor: Colors.primary,
    },
    chainOptionLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    chainOptionName: {
        ...Typography.body,
        fontWeight: '500',
        color: Colors.textPrimary,
    },
    selectedDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: Colors.primary,
    },
});
