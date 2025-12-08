import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Modal, Dimensions, ScrollView, Platform, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { usePrivy, useEmbeddedEthereumWallet, useEmbeddedSolanaWallet } from '@privy-io/expo';
import * as Clipboard from 'expo-clipboard';
import { SignOut, Copy, Wallet, CaretRight, CaretLeft, X, UserCircle } from 'phosphor-react-native';
import { Colors } from '../theme/colors';
import { Typography } from '../styles/typography';
import { ethers } from 'ethers';

import {
    NetworkBase, NetworkSolana, NetworkCelo, NetworkLisk, NetworkOptimism, NetworkPolygon, NetworkArbitrumOne,
    TokenETH, TokenUSDC, TokenUSDT, TokenMATIC, TokenSOL, TokenCELO, TokenCUSD, TokenCNGN
} from './CryptoIcons';
import { getUserGradient } from '../utils/gradientUtils';

// RPC URLs
const RPC_URLS = {
    base: 'https://sepolia.base.org',
    celo: 'https://alfajores-forno.celo-testnet.org'
};

// Token Contracts for checking balance
const TOKEN_CONTRACTS = {
    base: {
        USDC: '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
    },
    celo: {
        cUSD: '0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1'
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
    addressType: 'evm' | 'solana';
    tokens: { symbol: string; icon: React.FC<any> }[];
}

const SUPPORTED_CHAINS: ChainInfo[] = [
    {
        name: 'Base', // Base Sepolia
        id: 84532,
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
        id: 900, // Solana doesn't really use numeric chain ID like EVM, using placeholder
        icon: NetworkSolana,
        color: '#9945FF',
        addressType: 'solana',
        tokens: [
            { symbol: 'SOL', icon: TokenSOL },
            { symbol: 'USDC', icon: TokenUSDC },
            { symbol: 'USDT', icon: TokenUSDT }
        ]
    },
    {
        name: 'Celo', // Celo Alfajores
        id: 44787,
        icon: NetworkCelo,
        color: '#35D07F',
        addressType: 'evm',
        tokens: [
            { symbol: 'CELO', icon: TokenCELO },
            { symbol: 'cUSD', icon: TokenCUSD }
        ]
    },
    {
        name: 'Lisk',
        id: 1135,
        icon: NetworkLisk,
        color: '#0D1D2D',
        addressType: 'evm',
        tokens: [
            { symbol: 'ETH', icon: TokenETH },
            { symbol: 'USDT', icon: TokenUSDT }
        ]
    },
    {
        name: 'Optimism',
        id: 10,
        icon: NetworkOptimism,
        color: '#FF0420',
        addressType: 'evm',
        tokens: [
            { symbol: 'ETH', icon: TokenETH },
            { symbol: 'USDC', icon: TokenUSDC }
        ]
    },
    {
        name: 'Polygon',
        id: 137,
        icon: NetworkPolygon,
        color: '#8247E5',
        addressType: 'evm',
        tokens: [
            { symbol: 'MATIC', icon: TokenMATIC },
            { symbol: 'USDC', icon: TokenUSDC }
        ]
    },
    {
        name: 'Arbitrum',
        id: 42161,
        icon: NetworkArbitrumOne,
        color: '#2D374B',
        addressType: 'evm',
        tokens: [
            { symbol: 'ETH', icon: TokenETH },
            { symbol: 'USDC', icon: TokenUSDC }
        ]
    },
];

interface ProfileModalProps {
    visible: boolean;
    onClose: () => void;
    userName?: { firstName: string; lastName: string };
    walletAddresses?: { evm?: string; solana?: string };
}

export const ProfileModal: React.FC<ProfileModalProps> = ({ visible, onClose, userName, walletAddresses }) => {
    const { user, logout, getAccessToken } = usePrivy();
    const ethereumWallet = useEmbeddedEthereumWallet();
    const solanaWallet = useEmbeddedSolanaWallet();

    const [isRendered, setIsRendered] = useState(false);
    const [viewMode, setViewMode] = useState<'main' | 'assets' | 'chains'>('main');
    const [selectedChain, setSelectedChain] = useState<ChainInfo>(SUPPORTED_CHAINS[0]);
    const [ethAddress, setEthAddress] = useState<string>('');
    const [solAddress, setSolAddress] = useState<string>('');
    const [balances, setBalances] = useState<any>({});
    const [totalBalance, setTotalBalance] = useState('0.00');

    const modalAnim = useRef(new Animated.Value(height)).current;
    const opacityAnim = useRef(new Animated.Value(0)).current;

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

            // Similar check for Solana - simplified for now as Privy usually creates both or one based on config
            // But we'll wrap in try/catch to be safe
            if (user && solWalletAny && !solWalletAny.account && !hasEmbeddedWallet) {
                try {
                    await solWalletAny.create();
                } catch (error: any) {
                    if (!error.message?.includes('already exists')) {
                        console.log('Solana wallet creation error:', error);
                    }
                }
            }
        };
        setupWallets();
    }, [user]);

    // Fetch Balances via Backend API
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
                    if (bal.chain === 'base_sepolia') {
                        if (bal.asset === 'eth') {
                            newBalances['Base_ETH'] = parseFloat(bal.display_values?.eth || '0').toFixed(6);
                            totalUsd += parseFloat(bal.display_values?.usd || '0');
                        } else if (bal.asset === 'usdc') {
                            newBalances['Base_USDC'] = parseFloat(bal.display_values?.token || '0').toFixed(2);
                            totalUsd += parseFloat(bal.display_values?.usd || '0');
                        }
                    } else if (bal.chain === 'celo_alfajores') {
                        if (bal.asset === 'celo') {
                            newBalances['Celo_CELO'] = parseFloat(bal.display_values?.celo || '0').toFixed(6);
                            totalUsd += parseFloat(bal.display_values?.usd || '0');
                        } else if (bal.asset === 'cusd') {
                            newBalances['Celo_cUSD'] = parseFloat(bal.display_values?.token || '0').toFixed(2);
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

        fetchBalances();
    }, [visible, user]);

    // Update addresses when wallets change
    // Update addresses from multiple sources
    // Update addresses from multiple sources
    useEffect(() => {
        const ethWalletAny = ethereumWallet as any;
        const solWalletAny = solanaWallet as any;

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

        console.log('[ProfileModal] Final state - ethAddress:', ethAddress, 'solAddress:', solAddress);
    }, [ethereumWallet, solanaWallet, user, ethAddress, solAddress, walletAddresses]);

    useEffect(() => {
        if (visible) {
            setIsRendered(true);
            Animated.parallel([
                Animated.timing(opacityAnim, {
                    toValue: 1,
                    duration: 150,
                    useNativeDriver: true,
                }),
                Animated.spring(modalAnim, {
                    toValue: 0,
                    damping: 25,
                    stiffness: 300,
                    useNativeDriver: true,
                })
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(opacityAnim, {
                    toValue: 0,
                    duration: 100,
                    useNativeDriver: true,
                }),
                Animated.spring(modalAnim, {
                    toValue: height,
                    damping: 25,
                    stiffness: 300,
                    useNativeDriver: true,
                })
            ]).start(() => {
                setIsRendered(false);
                setViewMode('main');
            });
        }
    }, [visible]);

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
                    <Animated.View
                        style={[
                            StyleSheet.absoluteFill,
                            {
                                backgroundColor: 'rgba(0,0,0,0.5)',
                                opacity: opacityAnim
                            }
                        ]}
                    />
                    <TouchableOpacity
                        style={StyleSheet.absoluteFill}
                        activeOpacity={1}
                        onPress={onClose}
                    />
                    <Animated.View
                        style={[
                            styles.profileModalContent,
                            { transform: [{ translateY: modalAnim }] }
                        ]}
                    >
                        {/* Header */}
                        <View style={styles.modalHeader}>
                            <View style={styles.userInfo}>
                                <LinearGradient
                                    colors={getUserGradient(user?.id || userName?.firstName)}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                    style={styles.avatarContainer}
                                >
                                    {userName?.firstName && (
                                        <Text style={styles.avatarText}>{userName.firstName[0].toUpperCase()}</Text>
                                    )}
                                </LinearGradient>
                                <View>
                                    <Text style={styles.profileName}>
                                        {userName?.firstName ? `${userName.firstName} ${userName.lastName}` : 'User'}
                                    </Text>
                                    <TouchableOpacity
                                        style={styles.addressCopy}
                                        onPress={async () => {
                                            const address = selectedChain.addressType === 'evm' ? ethAddress : solAddress;

                                            if (address) {
                                                await Clipboard.setStringAsync(address);
                                                Alert.alert('Copied', 'Address copied to clipboard');
                                            }
                                        }}
                                    >
                                        <Text style={styles.profileAddress}>
                                            {selectedChain.addressType === 'evm'
                                                ? (ethAddress ? `${ethAddress.slice(0, 6)}...${ethAddress.slice(-4)}` : '0x...')
                                                : (solAddress ? `${solAddress.slice(0, 6)}...${solAddress.slice(-4)}` : 'Not connected')
                                            }
                                        </Text>
                                        <Copy size={14} color={Colors.textSecondary} />
                                    </TouchableOpacity>
                                </View>
                            </View>
                            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                                <X size={20} color={Colors.textSecondary} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView
                            style={styles.scrollView}
                            showsVerticalScrollIndicator={false}
                            bounces={true}
                        >
                            {/* Content based on viewMode */}
                            {viewMode === 'main' && (
                                <View style={styles.mainContent}>
                                    {/* Total Balance Card */}
                                    <View style={styles.balanceCard}>
                                        <Text style={styles.balanceLabel}>Total Balance</Text>
                                        <Text style={styles.balanceAmount}>${totalBalance}</Text>
                                    </View>

                                    <View style={styles.menuList}>
                                        {/* Chain Selector */}
                                        <TouchableOpacity
                                            style={styles.menuItem}
                                            onPress={() => setViewMode('chains')}
                                        >
                                            <View style={styles.menuItemLeft}>
                                                <selectedChain.icon width={24} height={24} />
                                                <View>
                                                    <Text style={styles.menuItemTitle}>{selectedChain.name}</Text>
                                                    <Text style={styles.menuItemSubtitle}>
                                                        {selectedChain.addressType === 'evm'
                                                            ? (selectedChain.name === 'Base' ? `${parseFloat(balances['Base_ETH'] || '0').toFixed(4)} ETH` : `${parseFloat(balances['Celo_CELO'] || '0').toFixed(4)} CELO`)
                                                            : '0 SOL'
                                                        }
                                                    </Text>
                                                </View>
                                            </View>
                                            <CaretRight size={20} color={Colors.textSecondary} />
                                        </TouchableOpacity>

                                        {/* View Assets */}
                                        <TouchableOpacity
                                            style={styles.menuItem}
                                            onPress={() => setViewMode('assets')}
                                        >
                                            <View style={styles.menuItemLeft}>
                                                <Wallet size={24} color={Colors.textPrimary} />
                                                <Text style={styles.menuItemTitle}>View Assets</Text>
                                            </View>
                                            <CaretRight size={20} color={Colors.textSecondary} />
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            )}

                            {viewMode === 'assets' && (
                                <View style={styles.assetsView}>
                                    <TouchableOpacity
                                        style={styles.backButton}
                                        onPress={() => setViewMode('main')}
                                    >
                                        <CaretLeft size={20} color={Colors.textSecondary} />
                                        <Text style={styles.backButtonText}>Back</Text>
                                    </TouchableOpacity>

                                    <Text style={styles.viewTitle}>Assets ({selectedChain.name})</Text>

                                    <View style={styles.assetList}>
                                        {selectedChain.tokens.map((token, idx) => {
                                            // Construct key for balance lookup e.g. Base_ETH or Celo_cUSD
                                            const key = `${selectedChain.name}_${token.symbol}`;
                                            const balance = balances[key] || '0.00';

                                            return (
                                                <View key={idx} style={styles.assetItem}>
                                                    <View style={styles.assetIcon}>
                                                        <token.icon width={24} height={24} />
                                                    </View>
                                                    <View style={styles.assetInfo}>
                                                        <Text style={styles.assetName}>{token.symbol}</Text>
                                                        <Text style={styles.assetBalance}>{parseFloat(balance).toFixed(4)}</Text>
                                                    </View>
                                                </View>
                                            );
                                        })}
                                    </View>
                                </View>
                            )}

                            {viewMode === 'chains' && (
                                <View style={styles.chainsView}>
                                    <TouchableOpacity
                                        style={styles.backButton}
                                        onPress={() => setViewMode('main')}
                                    >
                                        <CaretLeft size={20} color={Colors.textSecondary} />
                                        <Text style={styles.backButtonText}>Back</Text>
                                    </TouchableOpacity>

                                    <Text style={styles.viewTitle}>Select Chain</Text>

                                    {SUPPORTED_CHAINS.map((chain, idx) => (
                                        <TouchableOpacity
                                            key={idx}
                                            style={[
                                                styles.chainOption,
                                                selectedChain.name === chain.name && styles.selectedChainOption
                                            ]}
                                            onPress={() => {
                                                setSelectedChain(chain);
                                                setViewMode('main');
                                            }}
                                        >
                                            <View style={styles.chainOptionLeft}>
                                                <chain.icon width={24} height={24} />
                                                <Text style={styles.chainOptionName}>{chain.name}</Text>
                                            </View>
                                            {selectedChain.name === chain.name && (
                                                <View style={styles.selectedDot} />
                                            )}
                                        </TouchableOpacity>
                                    ))}
                                </View>
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
        backgroundColor: '#f5f5f5',
        borderRadius: 50,
        borderWidth: 1,
        borderColor: '#fafafa',
        borderStyle: 'solid',
        padding: 24,
        paddingBottom: 40,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
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
    profileName: {
        ...Typography.body,
        fontWeight: '600',
        color: Colors.textPrimary,
        fontSize: 16,
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
        padding: 4,
    },
    mainContent: {
        gap: 24,
    },
    balanceCard: {
        alignItems: 'center',
        paddingVertical: 12,
    },
    balanceLabel: {
        ...Typography.caption,
        color: Colors.textSecondary,
        marginBottom: 8,
        fontSize: 14,
    },
    balanceAmount: {
        ...Typography.title,
        color: Colors.textPrimary,
        fontSize: 40,
        fontWeight: '700',
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
        ...Typography.body,
        fontWeight: '600',
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
        ...Typography.body,
        fontWeight: '600',
        color: Colors.textPrimary,
    },
    menuItemSubtitle: {
        ...Typography.caption,
        color: Colors.textSecondary,
    },
    disconnectButton: {
        marginTop: 8,
        backgroundColor: '#FFFFFF',
        borderColor: '#FEE2E2',
    },
    disconnectText: {
        ...Typography.body,
        fontWeight: '500',
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
