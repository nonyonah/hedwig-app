import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Animated, Dimensions, ActivityIndicator, Alert, Platform, Image } from 'react-native';
import { useEmbeddedEthereumWallet } from '@privy-io/expo';
import { ethers } from 'ethers';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Clipboard from 'expo-clipboard';
import { X, CheckCircle, Warning, Fingerprint, ArrowSquareOut, XCircle, Bank, Copy, CurrencyNgn, ArrowsDownUp } from 'phosphor-react-native';
import { Colors, useThemeColors } from '../theme/colors';
import { Typography } from '../styles/typography';
import LottieView from 'lottie-react-native';
import * as WebBrowser from 'expo-web-browser';
import { useAuth } from '../hooks/useAuth';
import { ModalBackdrop, modalHaptic } from './ui/ModalStyles';
import { useSettings } from '../context/SettingsContext';
import { useLiveTracking } from '../hooks/useLiveTracking';
import { SwiftUIBottomSheet } from './ios/SwiftUIBottomSheet';
import { useKYC } from '../hooks/useKYC';
import KYCVerificationModal from './KYCVerificationModal';
import Analytics from '../services/analytics';

const { height } = Dimensions.get('window');

// Icons for tokens and chains
const ICONS = {
    usdc: require('../assets/icons/tokens/usdc.png'),
    base: require('../assets/icons/networks/base.png'),
    celo: require('../assets/icons/networks/celo.png'),
};

// Chain configurations
const CHAINS: Record<string, any> = {
    'base': { name: 'Base', icon: ICONS.base, type: 'evm' },
    'celo': { name: 'Celo', icon: ICONS.celo, type: 'evm' },
};

// RPC URLs
const RPC_URLS: Record<string, string> = {
    base: 'https://base-mainnet.g.alchemy.com/v2/f69kp28_ExLI1yBQmngVL3g16oUzv2up',
    celo: 'https://forno.celo.org'
};

// Token Addresses - MAINNET
const TOKEN_ADDRESSES: Record<string, Record<string, string>> = {
    base: {
        USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'  // Base Mainnet USDC
    },
    celo: {
        USDC: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C'   // Celo Mainnet USDC
    }
};

// Chain IDs for mainnet
const CHAIN_IDS: Record<string, string> = {
    base: '0x2105',     // 8453 in hex (Base Mainnet)
    celo: '0xa4ec'      // 42220 in hex (Celo Mainnet)
};

interface OfframpData {
    amount: string;
    token: string;
    network: string;
    fiatCurrency: string;
    bankName: string;
    accountNumber: string;
    accountName: string;
    rate?: string;
    estimatedFiat?: string;
}

interface OfframpConfirmationModalProps {
    visible: boolean;
    onClose: () => void;
    data: OfframpData | null;
    onSuccess?: (orderId: string) => void;
}

type ModalState = 'confirm' | 'processing' | 'awaiting_transfer' | 'success' | 'failed';

export const OfframpConfirmationModal: React.FC<OfframpConfirmationModalProps> = ({ visible, onClose, data, onSuccess }) => {
    const { hapticsEnabled } = useSettings();
    const themeColors = useThemeColors();
    const ethereumWallet = useEmbeddedEthereumWallet();
    const { getAccessToken } = useAuth();
    const { startTracking } = useLiveTracking();
    const evmWallets = (ethereumWallet as any)?.wallets || [];

    const [modalState, setModalState] = useState<ModalState>('confirm');
    const [orderId, setOrderId] = useState<string | null>(null);
    const [receiveAddress, setReceiveAddress] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState('');
    const [isRendered, setIsRendered] = useState(false);
    const [currentRate, setCurrentRate] = useState<string>('');
    const [estimatedFiat, setEstimatedFiat] = useState<string>('');
    const [isLoadingRate, setIsLoadingRate] = useState(false);
    const [tokensSent, setTokensSent] = useState(false); // Track if tokens were sent to Paycrest
    const [showKYCModal, setShowKYCModal] = useState(false);

    // KYC hook
    const { status: kycStatus, isApproved: isKYCApproved, fetchStatus: fetchKYCStatus } = useKYC();

    const modalAnim = useRef(new Animated.Value(height)).current;
    const opacityAnim = useRef(new Animated.Value(0)).current;

    // Fetch exchange rate when modal becomes visible
    useEffect(() => {
        const fetchRate = async () => {
            if (!visible || !data || modalState !== 'confirm') return;

            // Use provided rate if available
            if (data.rate && data.estimatedFiat) {
                setCurrentRate(data.rate);
                setEstimatedFiat(data.estimatedFiat);
                return;
            }

            setIsLoadingRate(true);
            try {
                const token = await getAccessToken();
                const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

                const response = await fetch(
                    `${apiUrl}/api/offramp/rates?token=${data.token}&amount=${data.amount}&currency=${data.fiatCurrency}&network=${data.network}`,
                    { headers: { 'Authorization': `Bearer ${token}` } }
                );

                const result = await response.json();
                if (result.success && result.data?.rate) {
                    const rate = result.data.rate;
                    setCurrentRate(rate);
                    const fiat = parseFloat(data.amount) * parseFloat(rate);
                    setEstimatedFiat(fiat.toFixed(2));
                }
            } catch (error) {
                console.error('Failed to fetch rate:', error);
            } finally {
                setIsLoadingRate(false);
            }
        };

        fetchRate();
    }, [visible, data, modalState]);

    useEffect(() => {
        if (visible) {
            setIsRendered(true);
            setModalState('confirm');
            setOrderId(null);
            setReceiveAddress(null);
            modalHaptic('open', hapticsEnabled); // Haptic feedback
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
                })
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
                setStatusMessage('');
                setModalState('confirm');
                setTokensSent(false);
            });
        }
    }, [visible]);

    const handleConfirm = async () => {
        if (!data) return;

        // 0. Check KYC status first
        if (!isKYCApproved) {
            Analytics.offrampBlockedKyc();
            setShowKYCModal(true);
            return;
        }

        // 1. Biometric Auth
        try {
            const hasHardware = await LocalAuthentication.hasHardwareAsync();
            if (hasHardware) {
                const authResult = await LocalAuthentication.authenticateAsync({
                    promptMessage: 'Authenticate to confirm offramp',
                    fallbackLabel: 'Use Passcode'
                });

                if (!authResult.success) {
                    Alert.alert('Authentication Failed', 'Please try again.');
                    return;
                }
            }
        } catch (e) {
            console.log('Biometric error:', e);
            Alert.alert('Error', 'Biometric authentication failed.');
            return;
        }

        // 2. Create Offramp Order
        try {
            setModalState('processing');
            setStatusMessage('Creating offramp order...');

            // Get wallet address for return address
            if (!evmWallets || evmWallets.length === 0) {
                throw new Error('No wallet available. Please ensure you are logged in.');
            }

            const wallet = evmWallets[0];
            const provider = await wallet.getProvider();
            const accounts = await provider.request({ method: 'eth_accounts' }) as string[];
            const walletAddress = accounts[0];

            if (!walletAddress) {
                throw new Error('No wallet address found');
            }

            const authToken = await getAccessToken();
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

            const response = await fetch(`${apiUrl}/api/offramp/create`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({
                    amount: data.amount,
                    token: data.token,
                    network: data.network,
                    bankName: data.bankName,
                    accountNumber: data.accountNumber,
                    accountName: data.accountName,
                    returnAddress: walletAddress,
                    currency: data.fiatCurrency
                })
            });

            const result = await response.json();

            if (!result.success || !result.data?.order) {
                throw new Error(result.error?.message || 'Failed to create offramp order');
            }

            const order = result.data.order;
            setOrderId(order.id);
            setReceiveAddress(order.receiveAddress);

            // 3. Send tokens to Paycrest receive address automatically
            setStatusMessage('Sending tokens to Paycrest...');

            const network = data.network.toLowerCase();
            const tokenSymbol = data.token.toUpperCase();
            const tokenAddress = TOKEN_ADDRESSES[network]?.[tokenSymbol];

            if (!tokenAddress) {
                throw new Error(`Token ${data.token} not supported on ${network}`);
            }

            // Build ERC20 transfer transaction
            const decimals = 6; // USDC has 6 decimals
            const amountWei = BigInt(Math.floor(parseFloat(data.amount) * Math.pow(10, decimals)));
            const recipientPadded = order.receiveAddress.slice(2).toLowerCase().padStart(64, '0');
            const amountPadded = amountWei.toString(16).padStart(64, '0');
            const transferData = '0xa9059cbb' + recipientPadded + amountPadded;

            console.log('[Offramp] Sending tokens to:', order.receiveAddress);
            console.log('[Offramp] Amount:', data.amount, tokenSymbol);

            // Use ethers to estimate gas and get proper fee data
            const rpcUrl = RPC_URLS[network];
            const rpcProvider = new ethers.JsonRpcProvider(rpcUrl);

            // Get gas estimates
            const gasEstimate = await rpcProvider.estimateGas({
                from: walletAddress,
                to: tokenAddress,
                data: transferData
            });
            const gasLimit = '0x' + (gasEstimate * 150n / 100n).toString(16);

            // Get fee data
            const feeData = await rpcProvider.getFeeData();
            const maxFeePerGas = feeData.maxFeePerGas || BigInt(30000000000);
            const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || BigInt(1500000000);

            // Get nonce
            const nonce = await rpcProvider.getTransactionCount(walletAddress, 'pending');
            const nonceHex = '0x' + nonce.toString(16);

            const txParams = {
                from: walletAddress,
                to: tokenAddress,
                data: transferData,
                gasLimit: gasLimit,
                nonce: nonceHex,
                maxFeePerGas: '0x' + maxFeePerGas.toString(16),
                maxPriorityFeePerGas: '0x' + maxPriorityFeePerGas.toString(16),
                chainId: CHAIN_IDS[network],
            };

            console.log('[Offramp] TX params:', JSON.stringify(txParams, null, 2));

            // Send transaction using Privy wallet
            const txHash = await provider.request({
                method: 'eth_sendTransaction',
                params: [txParams]
            }) as string;

            // Mark that tokens have been sent (for error message differentiation)
            setTokensSent(true);

            console.log('[Offramp] Token transfer tx:', txHash);
            setStatusMessage('Waiting for confirmation...');

            // 4. Log transaction to backend for AI insights
            try {
                await fetch(`${apiUrl}/api/transactions`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${authToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        type: 'OFFRAMP',
                        txHash: txHash,
                        amount: data.amount,
                        token: data.token,
                        chain: network.toUpperCase(),
                        fromAddress: walletAddress,
                        toAddress: order.receiveAddress,
                        status: 'PENDING',
                        amountInNgn: estimatedFiat ? parseFloat(estimatedFiat) : null,
                    })
                });
                console.log('[Offramp] Transaction logged to backend');
            } catch (logError) {
                console.log('[Offramp] Failed to log transaction (non-fatal):', logError);
            }

            // 5. Update order with tx hash via backend
            try {
                await fetch(`${apiUrl}/api/offramp/orders/${order.id}`, {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bearer ${authToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ txHash })
                });
            } catch (e) {
                console.log('[Offramp] Failed to update order with txHash:', e);
                // Non-critical, continue to success
            }

            // 5. Start live tracking for lock screen updates (non-fatal if it fails)
            try {
                await startTracking({
                    orderId: order.id,
                    fiatAmount: parseFloat(estimatedFiat) || 0,
                    fiatCurrency: data.fiatCurrency || 'NGN',
                    bankName: data.bankName || 'Bank',
                    accountNumber: data.accountNumber || '',
                    status: 'PENDING',
                });
                console.log('[Offramp] Live tracking started for order:', order.id);
            } catch (trackingError) {
                console.log('[Offramp] Live tracking failed (non-fatal):', trackingError);
                // Non-fatal - don't fail the offramp if live tracking fails
            }

            // 6. Success!
            setModalState('success');

        } catch (error: any) {
            console.error('Offramp Failed:', error);
            setStatusMessage(error.message || 'Unknown error');
            setModalState('failed');
        }
    };

    const handleCopyAddress = async () => {
        if (receiveAddress) {
            await Clipboard.setStringAsync(receiveAddress);
            Alert.alert('Copied!', 'Receive address copied to clipboard');
        }
    };

    const handleTransferComplete = () => {
        setModalState('success');
        if (onSuccess && orderId) {
            onSuccess(orderId);
        }
    };

    if (!isRendered || !data) return null;

    const network = data.network.toLowerCase();
    const chain = CHAINS[network] || CHAINS['base'];

    const renderContent = () => {
        switch (modalState) {
            case 'processing':
                return (
                    <View style={styles.statusContainer}>
                        <LottieView
                            source={require('../assets/animations/processing.json')}
                            autoPlay
                            loop
                            style={styles.lottie}
                        />
                        <Text style={styles.statusTitle}>Creating offramp order...</Text>
                    </View>
                );

            case 'awaiting_transfer':
                return (
                    <View style={styles.statusContainer}>
                        <ArrowsDownUp size={80} color={Colors.primary} weight="fill" style={{ marginBottom: 16 }} />
                        <Text style={styles.statusTitle}>Send crypto to complete offramp</Text>
                        <Text style={styles.statusSubtitle}>
                            Transfer {data.amount} {data.token} to the address below
                        </Text>

                        <View style={styles.addressContainer}>
                            <Text style={styles.addressLabel}>Receive Address</Text>
                            <TouchableOpacity style={styles.addressBox} onPress={handleCopyAddress}>
                                <Text style={styles.addressText} numberOfLines={2}>
                                    {receiveAddress}
                                </Text>
                                <Copy size={20} color={Colors.primary} />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.infoBox}>
                            <Text style={styles.infoText}>
                                After sending, your {data.fiatCurrency} {estimatedFiat || '...'} will be deposited to your bank account.
                            </Text>
                        </View>

                        <View style={styles.actionButtonsContainer}>
                            <TouchableOpacity style={styles.confirmButton} onPress={handleTransferComplete}>
                                <Text style={styles.confirmButtonText}>I've Sent the Crypto</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                );

            case 'success':
                return (
                    <View style={styles.statusContainer}>
                        <LottieView
                            source={require('../assets/animations/success.json')}
                            autoPlay
                            loop={false}
                            style={[styles.lottie, { width: 200, height: 200 }]}
                        />
                        <Text style={styles.statusTitle}>Offramp initiated successfully!</Text>
                        <Text style={styles.statusSubtitle}>
                            Your {data.fiatCurrency} {estimatedFiat || data.estimatedFiat} will be deposited to {data.bankName} ending in ...{data.accountNumber.slice(-4)}
                        </Text>

                        <View style={styles.actionButtonsContainer}>
                            <TouchableOpacity style={styles.closeButtonMain} onPress={onClose}>
                                <Text style={styles.closeButtonText}>Close</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                );

            case 'failed':
                return (
                    <View style={styles.statusContainer}>
                        <XCircle size={120} color={Colors.error || '#EF4444'} weight="fill" style={{ marginBottom: 24 }} />
                        <Text style={styles.statusTitle}>
                            {tokensSent ? 'Offramp Failed' : 'Offramp Failed'}
                        </Text>
                        <Text style={styles.statusSubtitle}>
                            {tokensSent
                                ? "Your tokens have been sent to Paycrest. If the order was rejected, your funds will be automatically refunded to your wallet within 24 hours."
                                : "Don't worry, no funds were moved."
                            }
                        </Text>
                        {statusMessage ? (
                            <Text style={styles.errorMessage}>{statusMessage}</Text>
                        ) : null}
                        <View style={styles.actionButtonsContainer}>
                            <TouchableOpacity style={styles.closeButtonMain} onPress={onClose}>
                                <Text style={styles.closeButtonText}>Close</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                );

            default: // 'confirm'
                return (
                    <>
                        {/* Header */}
                        <View style={styles.header}>
                            <Text style={[styles.title, { color: themeColors.textPrimary }]}>Confirm Offramp</Text>
                            <TouchableOpacity style={[styles.closeButton, { backgroundColor: themeColors.surface }]} onPress={onClose}>
                                <X size={20} color={themeColors.textSecondary} weight="bold" />
                            </TouchableOpacity>
                        </View>

                        {/* Amount */}
                        <View style={styles.amountContainer}>
                            <Text style={[styles.amountLabel, { color: themeColors.textSecondary }]}>You're converting</Text>
                            <Text style={[styles.amount, { color: themeColors.textPrimary }]}>{data.amount} {data.token}</Text>
                            <View style={styles.fiatEstimate}>
                                <CurrencyNgn size={18} color={themeColors.textSecondary} />
                                <Text style={[styles.fiatAmount, { color: themeColors.textSecondary }]}>
                                    {isLoadingRate ? 'Calculating...' : `≈ ${data.fiatCurrency} ${estimatedFiat || data.estimatedFiat || '...'}`}
                                </Text>
                            </View>
                        </View>

                        {/* Details */}
                        <View style={[styles.detailsContainer, { backgroundColor: themeColors.surface }]}>
                            <View style={styles.detailRow}>
                                <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Network</Text>
                                <View style={[styles.chainBadge, { backgroundColor: themeColors.background }]}>
                                    {chain?.icon && <Image source={chain.icon} style={styles.chainIcon} />}
                                    <Text style={[styles.chainName, { color: themeColors.textPrimary }]}>{chain?.name || data.network}</Text>
                                </View>
                            </View>
                            <View style={styles.detailRow}>
                                <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Exchange Rate</Text>
                                <Text style={[styles.detailValue, { color: themeColors.textPrimary }]}>
                                    1 {data.token} = {isLoadingRate ? '...' : `${data.fiatCurrency} ${currentRate || data.rate || '...'}`}
                                </Text>
                            </View>
                            <View style={[styles.divider, { backgroundColor: themeColors.border }]} />
                            <View style={styles.detailRow}>
                                <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Bank</Text>
                                <Text style={[styles.detailValue, { color: themeColors.textPrimary }]}>{data.bankName}</Text>
                            </View>
                            <View style={styles.detailRow}>
                                <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Account</Text>
                                <Text style={[styles.detailValue, { color: themeColors.textPrimary }]}>{data.accountNumber}</Text>
                            </View>
                            <View style={styles.detailRow}>
                                <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Name</Text>
                                <Text style={[styles.detailValue, { color: themeColors.textPrimary }]}>{data.accountName || 'Not provided'}</Text>
                            </View>
                        </View>

                        {/* Biometric Warning */}
                        <View style={[styles.warningContainer, { backgroundColor: themeColors.surface }]}>
                            <Fingerprint size={24} color={Colors.primary} />
                            <Text style={[styles.warningText, { color: themeColors.textSecondary }]}>
                                You'll need to authenticate with biometrics to confirm this offramp
                            </Text>
                        </View>

                        {/* Confirm Button */}
                        <TouchableOpacity style={styles.confirmButton} onPress={handleConfirm}>
                            <Text style={styles.confirmButtonText}>Confirm Offramp</Text>
                        </TouchableOpacity>
                    </>
                );
        }
    };

    // iOS: Use native SwiftUI BottomSheet
    if (Platform.OS === 'ios') {
        return (
            <>
                <SwiftUIBottomSheet isOpen={isRendered} onClose={onClose} height={0.75}>
                    <View style={[styles.iosContent, { backgroundColor: themeColors.background }]}>
                        {renderContent()}
                    </View>
                </SwiftUIBottomSheet>
                <KYCVerificationModal
                    visible={showKYCModal}
                    onClose={() => setShowKYCModal(false)}
                    onVerified={() => {
                        setShowKYCModal(false);
                        fetchKYCStatus(); // Refresh status after verification
                    }}
                />
            </>
        );
    }

    // Android: Use existing Modal
    return (
        <>
            <Modal
                visible={isRendered}
                transparent={true}
                animationType="none"
                onRequestClose={onClose}
            >
                <View style={styles.overlay}>
                    <ModalBackdrop opacity={opacityAnim} />
                    <TouchableOpacity
                        style={StyleSheet.absoluteFill}
                        activeOpacity={1}
                        onPress={onClose}
                    />
                    <Animated.View
                        style={[
                            styles.modalContent,
                            { transform: [{ translateY: modalAnim }] }
                        ]}
                    >
                        {renderContent()}
                    </Animated.View>
                </View>
            </Modal>
            <KYCVerificationModal
                visible={showKYCModal}
                onClose={() => setShowKYCModal(false)}
                onVerified={() => {
                    setShowKYCModal(false);
                    fetchKYCStatus(); // Refresh status after verification
                }}
            />
        </>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'transparent',
    },
    modalContent: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        padding: 24,
        paddingBottom: Platform.OS === 'ios' ? 40 : 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 10,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    title: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 20,
        color: Colors.textPrimary,
    },
    closeButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#F3F4F6',
        justifyContent: 'center',
        alignItems: 'center',
    },
    amountContainer: {
        alignItems: 'center',
        marginBottom: 24,
    },
    amountLabel: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 14,
        color: Colors.textSecondary,
        marginBottom: 8,
    },
    amount: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 36,
        color: Colors.textPrimary,
    },
    fiatEstimate: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 8,
        gap: 4,
    },
    fiatAmount: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 16,
        color: Colors.textSecondary,
    },
    detailsContainer: {
        backgroundColor: '#F9FAFB',
        borderRadius: 16,
        padding: 16,
        marginBottom: 24,
        gap: 12,
    },
    detailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    detailLabel: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 14,
        color: Colors.textSecondary,
    },
    detailValue: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 14,
        color: Colors.textPrimary,
        maxWidth: 180,
    },
    divider: {
        height: 1,
        backgroundColor: '#E5E7EB',
        marginVertical: 4,
    },
    chainBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        gap: 8,
    },
    chainIcon: {
        width: 20,
        height: 20,
        borderRadius: 10,
    },
    chainName: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 14,
        color: Colors.textPrimary,
    },
    warningContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#EEF2FF',
        padding: 16,
        borderRadius: 12,
        marginBottom: 24,
        gap: 12,
    },
    warningText: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 13,
        color: Colors.primary,
        flex: 1,
    },
    confirmButton: {
        backgroundColor: Colors.primary,
        paddingVertical: 16,
        borderRadius: 30,
        alignItems: 'center',
    },
    confirmButtonText: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 16,
        color: '#FFFFFF',
    },
    statusContainer: {
        alignItems: 'center',
        paddingVertical: 32,
    },
    lottie: {
        width: 150,
        height: 150,
    },
    statusTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 18,
        color: Colors.textPrimary,
        textAlign: 'center',
        marginTop: 16,
        paddingHorizontal: 20,
    },
    statusSubtitle: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 14,
        color: Colors.textSecondary,
        textAlign: 'center',
        marginTop: 8,
        paddingHorizontal: 20,
    },
    errorMessage: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 14,
        color: Colors.error || '#EF4444',
        textAlign: 'center',
        marginTop: 12,
        paddingHorizontal: 20,
    },
    addressContainer: {
        width: '100%',
        marginTop: 24,
        paddingHorizontal: 16,
    },
    addressLabel: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 14,
        color: Colors.textSecondary,
        marginBottom: 8,
    },
    addressBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F3F4F6',
        padding: 16,
        borderRadius: 12,
        gap: 12,
    },
    addressText: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 13,
        color: Colors.textPrimary,
        flex: 1,
    },
    infoBox: {
        backgroundColor: '#FEF3C7',
        padding: 16,
        borderRadius: 12,
        marginTop: 16,
        marginHorizontal: 16,
    },
    infoText: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 13,
        color: '#92400E',
        textAlign: 'center',
    },
    actionButtonsContainer: {
        marginTop: 24,
        width: '100%',
        gap: 12,
    },
    closeButtonMain: {
        backgroundColor: Colors.primary,
        paddingVertical: 16,
        borderRadius: 30,
        alignItems: 'center',
    },
    closeButtonText: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 16,
        color: '#FFFFFF',
    },
    iosContent: {
        flex: 1,
        padding: 20,
        paddingBottom: 8,
    },
});

export default OfframpConfirmationModal;
