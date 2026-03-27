import React, { useState, useEffect, useRef, forwardRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Alert, Platform, Image } from 'react-native';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { useEmbeddedEthereumWallet } from '@privy-io/expo';
import { ethers } from 'ethers';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Clipboard from 'expo-clipboard';
import { X, CheckCircle, TriangleAlert as Warning, Fingerprint, SquareArrowOutUpRight as ArrowSquareOut, CircleX as XCircle, Landmark as Bank, Copy, ArrowUpDown as ArrowsDownUp, RotateCcw } from './ui/AppIcon';
import { Colors, useThemeColors } from '../theme/colors';
import { Typography } from '../styles/typography';
import LottieView from 'lottie-react-native';
import { useAuth } from '../hooks/useAuth';
import { modalHaptic } from './ui/ModalStyles';
import { useSettings } from '../context/SettingsContext';
import { useLiveTracking } from '../hooks/useLiveTracking';
import { useKYC } from '../hooks/useKYC';
import KYCVerificationModal from './KYCVerificationModal';
import Analytics from '../services/analytics';
import IOSGlassIconButton from './ui/IOSGlassIconButton';

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

const PLATFORM_FEE_RATE = 0.01;
const toNumber = (value: string): number => {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : 0;
};
const getPlatformFee = (grossAmount: number): number => grossAmount * PLATFORM_FEE_RATE;
const getNetCryptoAmount = (grossAmount: number): number => Math.max(0, grossAmount - getPlatformFee(grossAmount));

interface OfframpConfirmationModalProps {
    visible: boolean;
    onClose: () => void;
    data: OfframpData | null;
    onSuccess?: (orderId: string) => void;
}

type ModalState = 'confirm' | 'processing' | 'awaiting_transfer' | 'success' | 'failed';

type OfframpErrorType =
    | 'insufficient_funds'
    | 'gas_fee'
    | 'network'
    | 'bank_validation'
    | 'kyc_required'
    | 'service_busy'
    | 'unknown';

interface ParsedOfframpError {
    type: OfframpErrorType;
    title: string;
    message: string;
    recoveryHint: string;
    shouldShowRetry: boolean;
}

const parseOfframpError = (error: any, hasTokensBeenSent: boolean): ParsedOfframpError => {
    const message = String(error?.message || '').toLowerCase();
    const fallbackMessage = error?.message || 'Unable to submit withdrawal right now. Please try again.';

    if (
        message.includes('insufficient funds') ||
        message.includes('insufficient balance') ||
        message.includes('not enough balance') ||
        message.includes('transfer amount exceeds') ||
        message.includes('gas required exceeds')
    ) {
        return {
            type: 'insufficient_funds',
            title: 'Insufficient wallet balance',
            message: "You're almost there, but your wallet cannot cover the transfer plus gas fee yet.",
            recoveryHint: 'Add a little native token for network fees, or reduce the amount and try again.',
            shouldShowRetry: true,
        };
    }

    if (
        message.includes('gas') &&
        (message.includes('price') || message.includes('limit') || message.includes('fee') || message.includes('estimate'))
    ) {
        return {
            type: 'gas_fee',
            title: 'Unable to estimate network fee',
            message: 'Gas fee estimation failed right now.',
            recoveryHint: 'Retry in a moment, or try a smaller amount.',
            shouldShowRetry: true,
        };
    }

    if (
        message.includes('network') ||
        message.includes('timeout') ||
        message.includes('connection') ||
        message.includes('fetch failed') ||
        message.includes('und_err_connect_timeout')
    ) {
        return {
            type: 'network',
            title: 'Network issue while submitting',
            message: 'We could not reach the settlement service in time.',
            recoveryHint: 'Check your internet connection and retry.',
            shouldShowRetry: true,
        };
    }

    if (
        message.includes('account') ||
        message.includes('bank') ||
        message.includes('beneficiary') ||
        message.includes('invalid recipient')
    ) {
        return {
            type: 'bank_validation',
            title: 'Bank account validation failed',
            message: 'We could not validate the receiving bank details for this withdrawal.',
            recoveryHint: 'Go back, confirm account number and bank, then try again.',
            shouldShowRetry: true,
        };
    }

    if (message.includes('kyc') || message.includes('verification')) {
        return {
            type: 'kyc_required',
            title: 'Verification required',
            message: 'You need to complete identity verification before making a withdrawal.',
            recoveryHint: 'Complete KYC from Settings and try again.',
            shouldShowRetry: false,
        };
    }

    if (message.includes('429') || message.includes('too many requests') || message.includes('rate limit')) {
        return {
            type: 'service_busy',
            title: 'Service is busy right now',
            message: 'Too many requests are being processed at the moment.',
            recoveryHint: 'Please wait a little and retry.',
            shouldShowRetry: true,
        };
    }

    if (hasTokensBeenSent) {
        return {
            type: 'unknown',
            title: 'Transfer submitted, awaiting settlement',
            message: 'Your tokens were already sent. We are waiting for partner confirmation.',
            recoveryHint: 'Track this in Withdrawals. If rejected, refund is returned to your wallet automatically.',
            shouldShowRetry: false,
        };
    }

    return {
        type: 'unknown',
        title: 'Unable to complete offramp',
        message: fallbackMessage,
        recoveryHint: 'Please try again.',
        shouldShowRetry: true,
    };
};

export const OfframpConfirmationModal = forwardRef<TrueSheet, OfframpConfirmationModalProps>(({ onClose, data, onSuccess }, ref) => {
    const { hapticsEnabled } = useSettings();
    const themeColors = useThemeColors();
    const ethereumWallet = useEmbeddedEthereumWallet();
    const { user, getAccessToken } = useAuth();
    const { startTracking } = useLiveTracking();
    const evmWallets = (ethereumWallet as any)?.wallets || [];

    const [modalState, setModalState] = useState<ModalState>('confirm');
    const [orderId, setOrderId] = useState<string | null>(null);
    const [receiveAddress, setReceiveAddress] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState('');
    const [currentRate, setCurrentRate] = useState<string>('');
    const [estimatedFiat, setEstimatedFiat] = useState<string>('');
    const [isLoadingRate, setIsLoadingRate] = useState(false);
    const [tokensSent, setTokensSent] = useState(false); // Track if tokens were sent to Paycrest
    const [parsedError, setParsedError] = useState<ParsedOfframpError | null>(null);
    const hasTriggeredSuccessNavigation = useRef(false);
    const modalDetents = modalState === 'failed'
        ? [Platform.OS === 'ios' ? 0.66 : 0.76]
        : ['auto'];

    const kycSheetRef = useRef<TrueSheet>(null);

    // KYC hook
    const { status: kycStatus, isApproved: isKYCApproved, fetchStatus: fetchKYCStatus } = useKYC();

    // Fetch exchange rate when data changes
    useEffect(() => {
        const fetchRate = async () => {
            if (!data || modalState !== 'confirm') return;

            console.log('[OfframpModal] Fetching rate for network:', data.network);

            // Skip rate fetching for Solana - it should be bridged first
            if (data.network.toLowerCase() === 'solana') {
                console.log('[Offramp] Skipping rate fetch for Solana - bridge required first');
                return;
            }

            // Use provided rate if available
            if (data.rate && data.estimatedFiat) {
                setCurrentRate(data.rate);
                const gross = toNumber(data.amount);
                const net = getNetCryptoAmount(gross);
                setEstimatedFiat((net * parseFloat(data.rate)).toFixed(2));
                return;
            }

            setIsLoadingRate(true);
            try {
                const token = await getAccessToken();
                const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

                console.log('[OfframpModal] Fetching rate from API:', {
                    token: data.token,
                    amount: data.amount,
                    currency: data.fiatCurrency,
                    network: data.network
                });

                const response = await fetch(
                    `${apiUrl}/api/offramp/rates?token=${data.token}&amount=${data.amount}&currency=${data.fiatCurrency}&network=${data.network}`,
                    { headers: { 'Authorization': `Bearer ${token}` } }
                );

                const result = await response.json();
                if (result.success && result.data?.rate) {
                    const rate = result.data.rate;
                    setCurrentRate(rate);
                    if (typeof result.data?.fiatEstimate === 'number' && Number.isFinite(result.data.fiatEstimate)) {
                        setEstimatedFiat(result.data.fiatEstimate.toFixed(2));
                    } else {
                        const gross = toNumber(data.amount);
                        const net = getNetCryptoAmount(gross);
                        const fiat = net * parseFloat(rate);
                        setEstimatedFiat(fiat.toFixed(2));
                    }
                    console.log('[OfframpModal] Rate fetched successfully:', rate);
                } else {
                    console.log('[OfframpModal] Rate fetch failed:', result);
                }
            } catch (error) {
                console.error('[OfframpModal] Failed to fetch rate:', error);
            } finally {
                setIsLoadingRate(false);
            }
        };

        fetchRate();
    }, [data, modalState]);

    const handleDismiss = useCallback(() => {
        setModalState('confirm');
        setOrderId(null);
        setReceiveAddress(null);
        setStatusMessage('');
        setTokensSent(false);
        setParsedError(null);
        hasTriggeredSuccessNavigation.current = false;
        onClose();
    }, [onClose]);

    useEffect(() => {
        if (modalState !== 'success' || !onSuccess || !orderId || hasTriggeredSuccessNavigation.current) {
            return;
        }

        const timer = setTimeout(() => {
            hasTriggeredSuccessNavigation.current = true;
            onSuccess(orderId);
        }, 800);

        return () => clearTimeout(timer);
    }, [modalState, onSuccess, orderId]);


    const handleConfirm = async () => {
        if (!data) return;
        let createdOrderId: string | null = null;
        let submittedTxHash: string | null = null;
        let tokensSentInAttempt = false;
        setParsedError(null);

        Analytics.withdrawalFlowStep('confirm_tapped', {
            network: data.network,
            token: data.token,
            amount: toNumber(data.amount),
            fiat_currency: data.fiatCurrency,
        });

        // 0. Check KYC status first
        if (!isKYCApproved) {
            Analytics.offrampBlockedKyc();
            Analytics.withdrawalFlowFailed('confirm', 'kyc_required', {
                network: data.network,
                fiat_currency: data.fiatCurrency,
            });
            kycSheetRef.current?.present();
            return;
        }

        // 1. Biometric Auth
        try {
            const hasHardware = await LocalAuthentication.hasHardwareAsync();
            if (hasHardware) {
                Analytics.withdrawalFlowStep('biometric_prompted');
                const authResult = await LocalAuthentication.authenticateAsync({
                    promptMessage: 'Authenticate to confirm offramp',
                    fallbackLabel: 'Use Passcode'
                });

                if (!authResult.success) {
                    Analytics.withdrawalFlowFailed('biometric_auth', authResult.error || 'cancelled');
                    Alert.alert('Authentication Failed', 'Please try again.');
                    return;
                }
                Analytics.withdrawalFlowStep('biometric_verified');
            }
        } catch (e) {
            console.log('Biometric error:', e);
            Analytics.withdrawalFlowFailed('biometric_auth', 'biometric_error');
            Alert.alert('Error', 'Biometric authentication failed.');
            return;
        }

        // 2. Create Offramp Order
        try {
            setModalState('processing');
            setStatusMessage('Creating offramp order...');
            Analytics.withdrawalFlowStep('order_create_started', {
                network: data.network,
                token: data.token,
                amount: toNumber(data.amount),
                fiat_currency: data.fiatCurrency,
            });

            // Get wallet address for return address
            if (!evmWallets || evmWallets.length === 0) {
                Analytics.withdrawalFlowFailed('order_create', 'missing_wallet');
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
            createdOrderId = String(order.id);
            setReceiveAddress(order.receiveAddress);
            Analytics.withdrawalFlowStep('order_created', {
                order_id: order.id,
                network: data.network,
                fiat_currency: data.fiatCurrency,
            });
            if (order.exchangeRate) {
                setCurrentRate(String(order.exchangeRate));
            }
            if (order.fiatAmount) {
                const fiat = Number(order.fiatAmount);
                if (Number.isFinite(fiat) && fiat > 0) {
                    setEstimatedFiat(fiat.toFixed(2));
                }
            }

            // 3. Send tokens to Paycrest receive address automatically
            setStatusMessage('Sending tokens to Paycrest...');
            Analytics.withdrawalFlowStep('token_transfer_started', {
                order_id: order.id,
                network: data.network,
                token: data.token,
            });

            const network = data.network.toLowerCase();
            const tokenSymbol = data.token.toUpperCase();
            const tokenAddress = TOKEN_ADDRESSES[network]?.[tokenSymbol];

            if (!tokenAddress) {
                throw new Error(`Token ${data.token} not supported on ${network}`);
            }

            // Build ERC20 transfer transaction
            const decimals = 6; // USDC has 6 decimals
            const grossAmount = toNumber(data.amount);
            const transferAmount = Number(order.cryptoAmount || getNetCryptoAmount(grossAmount));
            const amountWei = BigInt(Math.floor(transferAmount * Math.pow(10, decimals)));
            const recipientPadded = order.receiveAddress.slice(2).toLowerCase().padStart(64, '0');
            const amountPadded = amountWei.toString(16).padStart(64, '0');
            const transferData = '0xa9059cbb' + recipientPadded + amountPadded;

            console.log('[Offramp] Sending tokens to:', order.receiveAddress);
            console.log('[Offramp] Amount:', transferAmount, tokenSymbol);

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
            submittedTxHash = txHash;

            // Mark that tokens have been sent (for error message differentiation)
            setTokensSent(true);
            tokensSentInAttempt = true;
            Analytics.withdrawalFlowStep('token_transfer_submitted', {
                order_id: order.id,
                tx_hash: txHash,
                network: data.network,
                token: data.token,
                amount: transferAmount,
            });

            Analytics.offrampInitiated(
                String(user?.id || 'unknown'),
                transferAmount,
                data.token,
                data.fiatCurrency
            );

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
                        amount: transferAmount.toString(),
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

            // 6. Tokens sent — transition to success immediately.
            // Real-time status tracking happens in the Withdrawals history screen
            // via Paycrest webhook updates and polling.
            setModalState('success');
            Analytics.withdrawalFlowStep('withdrawal_submitted', {
                order_id: order.id,
                tx_hash: txHash,
                network: data.network,
                fiat_currency: data.fiatCurrency,
                amount: transferAmount,
            });

        } catch (error: any) {
            console.error('Offramp Failed:', error);
            const handledError = parseOfframpError(error, tokensSentInAttempt);
            setParsedError(handledError);
            setStatusMessage(handledError.message);
            setModalState('failed');
            const errorType = handledError.type;
            Analytics.withdrawalFlowFailed('submit', errorType, {
                order_id: createdOrderId,
                tx_hash: submittedTxHash,
                tokens_sent: tokensSentInAttempt,
                network: data.network,
                fiat_currency: data.fiatCurrency,
            });
            Analytics.offrampFailed(errorType);
        }
    };

    const handleRetry = () => {
        setModalState('confirm');
        setStatusMessage('');
        setOrderId(null);
        setReceiveAddress(null);
        setTokensSent(false);
        setParsedError(null);
    };

    const handleTrackWithdrawal = () => {
        if (orderId && onSuccess && !hasTriggeredSuccessNavigation.current) {
            hasTriggeredSuccessNavigation.current = true;
            onSuccess(orderId);
        }
        if (typeof ref !== 'function') {
            void ref?.current?.dismiss().catch(() => {});
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

    const handleClose = () => {
        if (
            modalState === 'success' &&
            onSuccess &&
            orderId &&
            !hasTriggeredSuccessNavigation.current
        ) {
            hasTriggeredSuccessNavigation.current = true;
            onSuccess(orderId);
        }
        if (typeof ref !== 'function') {
            void ref?.current?.dismiss().catch(() => {});
        }
    };

    if (!data) return null;

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
                        <Text style={[styles.statusTitle, { color: themeColors.textPrimary }]}>
                            {statusMessage || 'Creating offramp order...'}
                        </Text>
                    </View>
                );

            case 'awaiting_transfer':
                return (
                    <View style={styles.statusContainer}>
                        <ArrowsDownUp size={80} color={Colors.primary} strokeWidth={3} style={{ marginBottom: 16 }} />
                        <Text style={[styles.statusTitle, { color: themeColors.textPrimary }]}>Send crypto to complete offramp</Text>
                        <Text style={[styles.statusSubtitle, { color: themeColors.textSecondary }]}>
                            Transfer {data.amount} {data.token} to the address below
                        </Text>

                        <View style={styles.addressContainer}>
                            <Text style={[styles.addressLabel, { color: themeColors.textSecondary }]}>Receive Address</Text>
                            <TouchableOpacity
                                style={[styles.addressBox, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}
                                onPress={handleCopyAddress}
                            >
                                <Text style={[styles.addressText, { color: themeColors.textPrimary }]} numberOfLines={2}>
                                    {receiveAddress}
                                </Text>
                                <Copy size={20} color={themeColors.primary} />
                            </TouchableOpacity>
                        </View>

                        <View style={[styles.infoBox, { backgroundColor: themeColors.warningBackground }]}>
                            <Text style={[styles.infoText, { color: themeColors.warning }]}>
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
                        <Text style={[styles.statusTitle, { color: themeColors.textPrimary }]}>Withdrawal submitted!</Text>
                        <Text style={[styles.statusSubtitle, { color: themeColors.textSecondary }]}>
                            Your {data.fiatCurrency} {estimatedFiat || data.estimatedFiat} is being sent to {data.bankName} ending in ...{data.accountNumber.slice(-4)}. Track progress in Withdrawals.
                        </Text>
                    </View>
                );

            case 'failed':
                return (
                    <View style={styles.statusContainer}>
                        <XCircle size={120} color="white" fill={Colors.error || '#EF4444'} style={{ marginBottom: 24 }} />
                        <Text style={[styles.statusTitle, { color: themeColors.textPrimary }]}>
                            {parsedError?.title || 'Offramp Failed'}
                        </Text>
                        <Text style={[styles.statusSubtitle, { color: themeColors.textSecondary }]}>
                            {parsedError?.message ||
                                (tokensSent
                                    ? 'Your tokens were sent successfully, but settlement could not complete right now.'
                                    : "Don't worry, no funds were moved.")}
                        </Text>
                        <View style={[styles.errorHintBox, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                            <Text style={[styles.errorHintText, { color: themeColors.textPrimary }]}>
                                {parsedError?.recoveryHint ||
                                    (tokensSent
                                        ? 'Track this in Withdrawals. If rejected, funds are refunded to your wallet.'
                                        : 'Please try again in a moment.')}
                            </Text>
                        </View>

                        {tokensSent && orderId ? (
                            <Text style={[styles.orderHint, { color: themeColors.textSecondary }]}>
                                Order ID: {orderId}
                            </Text>
                        ) : null}

                        <View style={styles.actionButtonsContainer}>
                            {parsedError?.shouldShowRetry ? (
                                <TouchableOpacity
                                    style={[styles.retryButton, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}
                                    onPress={handleRetry}
                                >
                                    <RotateCcw size={16} color={themeColors.textPrimary} strokeWidth={2.2} />
                                    <Text style={[styles.retryButtonText, { color: themeColors.textPrimary }]}>Try Again</Text>
                                </TouchableOpacity>
                            ) : null}

                            <TouchableOpacity
                                style={styles.closeButtonMain}
                                onPress={tokensSent && orderId ? handleTrackWithdrawal : handleClose}
                            >
                                <Text style={styles.closeButtonText}>{tokensSent && orderId ? 'Track Withdrawal' : 'Close'}</Text>
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
                            <IOSGlassIconButton
                                onPress={handleClose}
                                systemImage="xmark"
                                circleStyle={[styles.closeButton, { backgroundColor: themeColors.surface }]}
                                icon={<X size={20} color={themeColors.textSecondary} strokeWidth={3} />}
                            />
                        </View>

                        {/* Amount */}
                        <View style={styles.amountContainer}>
                            <Text style={[styles.amountLabel, { color: themeColors.textSecondary }]}>You're converting</Text>
                            <Text style={[styles.amount, { color: themeColors.textPrimary }]}>{data.amount} {data.token}</Text>
                            <View style={styles.fiatEstimate}>
                                <Text style={{ fontSize: 18, color: themeColors.textSecondary, fontWeight: 'bold' }}>₦</Text>
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
                            <View style={styles.detailRow}>
                                <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Platform Fee (1%)</Text>
                                <Text style={[styles.detailValue, { color: themeColors.textPrimary }]}>
                                    {getPlatformFee(toNumber(data.amount)).toFixed(2)} {data.token}
                                </Text>
                            </View>
                            <View style={styles.detailRow}>
                                <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Net Converted</Text>
                                <Text style={[styles.detailValue, { color: themeColors.textPrimary }]}>
                                    {getNetCryptoAmount(toNumber(data.amount)).toFixed(2)} {data.token}
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

    return (
        <>
            <TrueSheet
                ref={ref}
                detents={modalDetents}
                cornerRadius={Platform.OS === 'ios' ? 50 : 24}
                backgroundBlur="regular"
                grabber={true}
                onDidDismiss={handleDismiss}
            >
                <View style={styles.contentContainer}>
                    {renderContent()}
                </View>
            </TrueSheet>

            <KYCVerificationModal
                ref={kycSheetRef}
                onClose={() => {}}
                onVerified={() => {
                    fetchKYCStatus(); // Refresh status after verification
                }}
            />
        </>
    );
});

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'transparent',
    },
    contentContainer: {
        paddingHorizontal: 24,
        paddingTop: Platform.OS === 'android' ? 34 : 12,
        paddingBottom: Platform.OS === 'android' ? 6 : 12,
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
        fontFamily: 'GoogleSansFlex_400Regular',
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
    errorHintBox: {
        marginTop: 12,
        borderRadius: 14,
        borderWidth: 1,
        paddingHorizontal: 14,
        paddingVertical: 12,
    },
    errorHintText: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 13,
        color: Colors.textPrimary,
        textAlign: 'center',
        lineHeight: 18,
    },
    orderHint: {
        marginTop: 10,
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 12,
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
        borderWidth: 1,
        borderColor: '#E5E7EB',
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
    retryButton: {
        borderWidth: 1,
        paddingVertical: 14,
        borderRadius: 30,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 8,
    },
    retryButtonText: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 15,
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
