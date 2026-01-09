import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Modal, Dimensions, ScrollView, Platform, Alert, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { usePrivy, useEmbeddedEthereumWallet, useEmbeddedSolanaWallet } from '@privy-io/expo';
import * as Clipboard from 'expo-clipboard';
import { SignOut, Copy, Wallet, CaretRight, CaretLeft, X, UserCircle } from 'phosphor-react-native';
import { Colors, useThemeColors } from '../theme/colors';
import { Typography } from '../styles/typography';
import { ethers } from 'ethers';

import {
    NetworkBase, NetworkSolana,
    TokenETH, TokenUSDC, TokenUSDT, TokenSOL
} from './CryptoIcons';
import { getUserGradient } from '../utils/gradientUtils';
import { getOrCreateStacksWallet, getSTXBalance } from '../services/stacksWallet';
import { ModalBackdrop, modalHaptic, getModalAnimationConfig } from './ui/ModalStyles';
import { useSettings } from '../context/SettingsContext';

// RPC URLs
const RPC_URLS = {
    base: 'https://mainnet.base.org'
};

// Token Contracts for checking balance
const TOKEN_CONTRACTS = {
    base: {
        USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' // Base Mainnet USDC
    }
};

// ABI for balanceOf
const BALANCE_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function decimals() view returns (uint8)"
];

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
        id: 0, // Solana uses cluster names not chain IDs
        icon: NetworkSolana,
        color: '#9945FF',
        addressType: 'solana',
        tokens: [
            { symbol: 'SOL', icon: TokenSOL },
            { symbol: 'USDC', icon: TokenUSDC }
        ]
    },
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
    const { currency, hapticsEnabled } = useSettings(); // Use currency and haptics from context
    const { user, logout, getAccessToken } = usePrivy();
    const themeColors = useThemeColors();
    const ethereumWallet = useEmbeddedEthereumWallet();
    const solanaWallet = useEmbeddedSolanaWallet();
    // Stacks wallet is managed by stacksWallet service, not Privy

    // Debug: Log profileIcon when modal opens
    useEffect(() => {
        if (visible) {
            console.log('[ProfileModal] profileIcon prop:', JSON.stringify(profileIcon, null, 2));
            console.log('[ProfileModal] Has imageUri?', !!profileIcon?.imageUri);
        }
    }, [visible, profileIcon]);

    const [isRendered, setIsRendered] = useState(false);
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
        // Fallback rates when API doesn't support the currency (approximate estimates)
        const FALLBACK_RATES: Record<string, number> = {
            NGN: 1600,  // ~1600 NGN per USD
            GHS: 15,    // ~15 GHS per USD
            KES: 155,   // ~155 KES per USD
        };

        const fetchExchangeRate = async () => {
            if (currency === 'USD') {
                setExchangeRate(1);
                return;
            }

            try {
                const token = await getAccessToken();
                if (!token) {
                    // No token, use fallback
                    setExchangeRate(FALLBACK_RATES[currency] || 1);
                    return;
                }

                const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
                // Fetch rate for 1 USDC to the selected currency
                const response = await fetch(
                    `${apiUrl}/api/offramp/rates?token=USDC&amount=1&currency=${currency}&network=base`,
                    { headers: { 'Authorization': `Bearer ${token}` } }
                );

                const result = await response.json();
                if (result.success && result.data?.rate) {
                    setExchangeRate(parseFloat(result.data.rate));
                } else {
                    // API returned error (e.g., currency not supported) - use fallback
                    console.log(`[ProfileModal] Using fallback rate for ${currency}`);
                    setExchangeRate(FALLBACK_RATES[currency] || 1);
                }
            } catch (error) {
                console.log('[ProfileModal] Error fetching exchange rate, using fallback:', error);
                setExchangeRate(FALLBACK_RATES[currency] || 1);
            }
        };

        fetchExchangeRate();
    }, [currency, getAccessToken]);

    const modalAnim = useRef(new Animated.Value(height)).current;
    const opacityAnim = useRef(new Animated.Value(0)).current;

    // Staggered entrance animations for internal elements
    const headerAnim = useRef(new Animated.Value(0)).current;
    const balanceAnim = useRef(new Animated.Value(0)).current;
    const chainsAnim = useRef(new Animated.Value(0)).current;
    const logoutAnim = useRef(new Animated.Value(0)).current;
    const viewContentAnim = useRef(new Animated.Value(1)).current; // For view transitions

    // Create wallets if they don't exist
    useEffect(() => {
        const setupWallets = async () => {
            const ethWalletAny = ethereumWallet as any;
            const solWalletAny = solanaWallet as any;
            const userAny = user as any;

            // Check if user already has an embedded wallet
            const hasEmbeddedWallet = userAny?.linkedAccounts?.some(
                (account: any) => account.type === 'wallet' && account.connectorType === 'embedded'
            );

            // Only try to create if we don't see an embedded wallet in linked accounts
            // and the hook doesn't have an account
            if (user && ethWalletAny && !ethWalletAny.account && !hasEmbeddedWallet) {
                try {
                    await ethWalletAny.create();
                } catch (error: any) {
                    // Ignore "already exists" errors
                    if (!error.message?.includes('already exists')) {
                        console.log('Ethereum wallet creation error:', error);
                    }
                }
            }

            // Similar check for Solana
            if (user && solWalletAny && !solWalletAny.account && !hasEmbeddedWallet) {
                try {
                    await solWalletAny.create();
                } catch (error: any) {
                    if (!error.message?.includes('already exists')) {
                        console.log('Solana wallet creation error:', error);
                    }
                }
            }

            // Stacks wallet generation is TEMPORARILY DISABLED
            // The Stacks SDK's generateWallet uses PBKDF2 which hangs on React Native.
            // TODO: Move Stacks wallet generation to backend or use a lighter library.
            // try {
            //     const stacksWallet = await getOrCreateStacksWallet();
            //     if (stacksWallet) {
            //         setBtcAddress(stacksWallet.address);
            //         console.log('Stacks wallet ready:', stacksWallet.address);
            //     }
            // } catch (error: any) {
            //     console.log('Stacks wallet error:', error);
            // }
            console.log('[ProfileModal] Stacks wallet generation skipped (performance issue)');
        };
        setupWallets();
    }, [user]);

    // Fetch Balances via Backend API with periodic refresh
    useEffect(() => {
        const fetchBalances = async () => {
            if (!visible || !user) return;

            try {
                const token = await getAccessToken();
                if (!token) {
                    console.log('[ProfileModal] No access token available');
                    return;
                }

                const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
                console.log('[ProfileModal] Fetching balances from:', `${apiUrl}/api/wallet/balance`);

                const response = await fetch(`${apiUrl}/api/wallet/balance`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    console.log('[ProfileModal] Balance fetch failed:', response.status, errorText);
                    return;
                }

                const data = await response.json();
                console.log('[ProfileModal] Balance data received:', data);

                const balanceData = data.data?.balances || [];

                const newBalances: any = {};
                let totalUsd = 0;

                balanceData.forEach((bal: any) => {
                    if (bal.chain === 'base') {
                        if (bal.asset === 'eth') {
                            newBalances['Base_ETH'] = parseFloat(bal.display_values?.eth || '0').toFixed(6);
                            totalUsd += parseFloat(bal.display_values?.usd || '0');
                        } else if (bal.asset === 'usdc') {
                            newBalances['Base_USDC'] = parseFloat(bal.display_values?.token || '0').toFixed(2);
                            totalUsd += parseFloat(bal.display_values?.usd || '0');
                        }
                    } else if (bal.chain === 'solana') {
                        if (bal.asset === 'sol') {
                            newBalances['Solana_SOL'] = parseFloat(bal.display_values?.sol || '0').toFixed(6);
                            totalUsd += parseFloat(bal.display_values?.usd || '0');
                        } else if (bal.asset === 'usdc') {
                            newBalances['Solana_USDC'] = parseFloat(bal.display_values?.token || '0').toFixed(2);
                            totalUsd += parseFloat(bal.display_values?.usd || '0');
                        }
                    }
                });

                console.log('[ProfileModal] Parsed balances:', newBalances, 'Total USD:', totalUsd);
                setBalances(newBalances);
                setTotalBalance(totalUsd.toFixed(2));

            } catch (error) {
                console.log('[ProfileModal] Error fetching balances:', error);
            }
        };

        // Initial fetch
        fetchBalances();

        // Periodic refresh every 30 seconds while modal is visible
        let intervalId: NodeJS.Timeout | null = null;
        if (visible) {
            intervalId = setInterval(fetchBalances, 30000);
        }

        // Cleanup interval on unmount or when modal closes
        return () => {
            if (intervalId) {
                clearInterval(intervalId);
            }
        };
    }, [visible, user]);

    // Update addresses when wallets change
    // Update addresses from multiple sources
    // Update addresses from multiple sources
    useEffect(() => {
        const ethWalletAny = ethereumWallet as any;
        const solWalletAny = solanaWallet as any;
        // Note: Stacks address is set in setupWallets useEffect via getOrCreateStacksWallet()

        // Try to get address from embedded wallet hooks first
        if (ethWalletAny?.account?.address) {
            setEthAddress(ethWalletAny.account.address);
        }
        if (solWalletAny?.account?.address) {
            setSolAddress(solWalletAny.account.address);
        }

        // Check walletAddresses prop from backend
        if (walletAddresses) {
            console.log('[ProfileModal] walletAddresses prop received:', walletAddresses);
            if (walletAddresses.evm && !ethAddress) {
                console.log('[ProfileModal] Setting ethAddress from prop:', walletAddresses.evm);
                setEthAddress(walletAddresses.evm);
            }
            if (walletAddresses.solana && !solAddress) {
                console.log('[ProfileModal] Setting solAddress from prop:', walletAddresses.solana);
                setSolAddress(walletAddresses.solana);
            }
        }

        // Fallback to user object if hooks are empty
        if (user) {
            const userAny = user as any;
            console.log('[ProfileModal] user object:', {
                wallet: userAny.wallet,
                linkedAccounts: userAny.linkedAccounts
            });

            // Check primary wallet
            if (userAny.wallet?.address) {
                const address = userAny.wallet.address;
                console.log('[ProfileModal] Primary wallet address:', address);
                if (address.startsWith('0x') && !ethAddress) {
                    console.log('[ProfileModal] Setting ethAddress from user.wallet');
                    setEthAddress(address);
                } else if (!address.startsWith('0x') && !solAddress) {
                    console.log('[ProfileModal] Setting solAddress from user.wallet');
                    setSolAddress(address);
                }
            }

            // Check linked accounts - Prioritize embedded wallets
            if (userAny.linkedAccounts) {
                console.log('[ProfileModal] Checking linkedAccounts for wallets...');
                // Find embedded EVM wallet
                const embeddedEvm = userAny.linkedAccounts.find(
                    (account: any) => account.type === 'wallet' &&
                        account.connectorType === 'embedded' &&
                        account.address.startsWith('0x')
                );

                // Find embedded Solana wallet
                const embeddedSol = userAny.linkedAccounts.find(
                    (account: any) => account.type === 'wallet' &&
                        account.connectorType === 'embedded' &&
                        !account.address.startsWith('0x')
                );

                console.log('[ProfileModal] Found embedded EVM wallet:', embeddedEvm?.address);
                console.log('[ProfileModal] Found embedded Solana wallet:', embeddedSol?.address);

                if (embeddedEvm && !ethAddress) {
                    console.log('[ProfileModal] Setting ethAddress from embedded wallet');
                    setEthAddress(embeddedEvm.address);
                } else if (!ethAddress) {
                    // Fallback to any EVM wallet
                    const anyEvm = userAny.linkedAccounts.find(
                        (account: any) => account.type === 'wallet' && account.address.startsWith('0x')
                    );
                    if (anyEvm) {
                        console.log('[ProfileModal] Setting ethAddress from any EVM wallet:', anyEvm.address);
                        setEthAddress(anyEvm.address);
                    }
                }

                if (embeddedSol && !solAddress) {
                    setEthAddress(embeddedSol.address);
                } else if (!solAddress) {
                    // Fallback to any Solana wallet
                    const anySol = userAny.linkedAccounts.find(
                        (account: any) => account.type === 'wallet' && !account.address.startsWith('0x')
                    );
                    if (anySol) setSolAddress(anySol.address);
                }
            }
        }

        console.log('[ProfileModal] Final state - ethAddress:', ethAddress, 'solAddress:', solAddress, 'btcAddress:', btcAddress);
    }, [ethereumWallet, solanaWallet, user, ethAddress, solAddress, btcAddress, walletAddresses]);

    useEffect(() => {
        if (visible) {
            setIsRendered(true);
            modalHaptic('open', hapticsEnabled); // Haptic feedback
            // Reset stagger animations
            headerAnim.setValue(0);
            balanceAnim.setValue(0);
            chainsAnim.setValue(0);
            logoutAnim.setValue(0);

            // Run ALL animations in parallel using spring for smooth feel
            Animated.parallel([
                Animated.timing(opacityAnim, {
                    toValue: 1,
                    duration: 120,
                    useNativeDriver: true,
                }),
                Animated.spring(modalAnim, {
                    toValue: 0,
                    damping: 28,
                    stiffness: 350,
                    useNativeDriver: true,
                }),
                // Staggered content animations start immediately
                Animated.stagger(30, [
                    Animated.spring(headerAnim, { toValue: 1, damping: 20, stiffness: 300, useNativeDriver: true }),
                    Animated.spring(balanceAnim, { toValue: 1, damping: 20, stiffness: 300, useNativeDriver: true }),
                    Animated.spring(chainsAnim, { toValue: 1, damping: 20, stiffness: 300, useNativeDriver: true }),
                    Animated.spring(logoutAnim, { toValue: 1, damping: 20, stiffness: 300, useNativeDriver: true }),
                ]),
            ]).start();
        } else {
            modalHaptic('close', hapticsEnabled); // Haptic feedback
            Animated.parallel([
                Animated.timing(opacityAnim, {
                    toValue: 0,
                    duration: 80,
                    useNativeDriver: true,
                }),
                Animated.spring(modalAnim, {
                    toValue: height,
                    damping: 28,
                    stiffness: 350,
                    useNativeDriver: true,
                })
            ]).start(() => {
                setIsRendered(false);
                setViewMode('main');
            });
        }
    }, [visible]);

    // Animate content when view mode changes (any direction)
    useEffect(() => {
        if (visible) {
            // Reset and animate both main content and sub-views
            viewContentAnim.setValue(0);
            // Also reset and re-animate main content when returning to main
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

    const handleLogout = async () => {
        try {
            await logout();
        } catch (error) {
            console.error('Logout failed:', error);
        }
    };

    if (!isRendered) return null;

    return (
        <>
            <Modal
                visible={isRendered}
                transparent={true}
                onRequestClose={onClose}
            >
                <View style={[styles.modalOverlay, { backgroundColor: 'transparent' }]}>
                    <ModalBackdrop opacity={opacityAnim} />
                    <TouchableOpacity
                        style={StyleSheet.absoluteFill}
                        activeOpacity={1}
                        onPress={onClose}
                    />
                    <Animated.View
                        style={[
                            styles.profileModalContent,
                            { backgroundColor: themeColors.background },
                            { transform: [{ translateY: modalAnim }] }
                        ]}
                    >
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
                            <TouchableOpacity onPress={onClose} style={[styles.closeButton, { backgroundColor: themeColors.surface }]}>
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
                                                                ? `${parseFloat(balances['Solana Devnet_SOL'] || '0').toFixed(4)} SOL`
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
                    </Animated.View>
                </View>
            </Modal>
            {/* Modal content end */}
        </>
    );
};

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.5)',
        paddingBottom: 17,
        paddingHorizontal: 11,
    },
    profileModalContent: {
        width: '100%',
        maxWidth: 418,
        height: 477,
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        borderBottomLeftRadius: 32,
        borderBottomRightRadius: 32,
        padding: 24,
        paddingBottom: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 10,
    },
    scrollView: {
        flex: 1,
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
