import React, { useState, useEffect, useRef, forwardRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Alert, Platform, Image } from 'react-native';
import { TrueSheet } from '@hedwig/true-sheet';
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
import { getChainAddParams, getEvmUsdcChain, getNativeFeeSymbol } from '../lib/usdcFeeNetworks';
import { useGatewayBalance, formatGatewayUsdc } from '../hooks/useGatewayBalance';
import {
    GATEWAY_DOMAINS,
    GATEWAY_EVM_CHAINS,
    GATEWAY_MINTER_EVM,
    type GatewayChainKey,
    type GatewayEvmChainKey,
} from '../lib/gateway/constants';
import {
    addressToBytes32,
    buildBurnIntent,
    getEvmWalletClient,
    signEvmBurnIntent,
} from '../lib/gateway/burn-intent-evm';
import { buildDestinationFields } from '../lib/gateway/recipients';
import {
    pollForwardedTransfer,
    previewGatewayFees,
    submitBurnIntents,
} from '../services/gatewayApi';

const { height } = Dimensions.get('window');

const formatUsdcFee = (subunits: bigint): string => {
    const whole = Number(subunits) / 1_000_000;
    if (!Number.isFinite(whole)) return '—';
    if (whole === 0) return '$0.00';
    if (whole < 0.01) return `$${whole.toFixed(4)}`;
    return `$${whole.toFixed(2)}`;
};

// Icons for tokens and chains
const ICONS = {
    usdc: require('../assets/icons/tokens/usdc.png'),
    base: require('../assets/icons/networks/base.png'),
    celo: require('../assets/icons/networks/celo.png'),
    solana: require('../assets/icons/networks/solana.png'),
    arbitrum: require('../assets/icons/networks/arbitrum.png'),
    polygon: require('../assets/icons/networks/polygon.png'),
    optimism: require('../assets/icons/networks/optimism.png'),
};

const CHAINS: Record<string, any> = {
    'base':     { name: 'Base',     icon: ICONS.base,     type: 'evm' },
    'celo':     { name: 'Celo',     icon: ICONS.celo,     type: 'evm' },
    'arbitrum': { name: 'Arbitrum', icon: ICONS.arbitrum, type: 'evm' },
    'polygon':  { name: 'Polygon',  icon: ICONS.polygon,  type: 'evm' },
    'optimism': { name: 'Optimism', icon: ICONS.optimism, type: 'evm' },
    'solana':   { name: 'Solana',   icon: ICONS.solana,   type: 'solana' },
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
const USDC_DECIMALS = 6;

const buildErc20TransferData = (recipient: string, amount: number, decimals = USDC_DECIMALS): string => {
    const amountWei = BigInt(Math.floor(amount * Math.pow(10, decimals)));
    const recipientPadded = recipient.slice(2).toLowerCase().padStart(64, '0');
    const amountPadded = amountWei.toString(16).padStart(64, '0');
    return '0xa9059cbb' + recipientPadded + amountPadded;
};

const formatFeeAmount = (amount: bigint, decimals: number, symbol: string): string => {
    const formatted = ethers.formatUnits(amount, decimals);
    const value = Number(formatted);
    if (!Number.isFinite(value)) return `~${formatted} ${symbol}`;
    if (value === 0) return `~0 ${symbol}`;
    if (value < 0.000001) return `<0.000001 ${symbol}`;
    const digits = value < 0.01 ? 6 : 4;
    return `~${value.toFixed(digits)} ${symbol}`;
};

const ERC20_TRANSFER_GAS_FALLBACK = 120000n;

const estimateErc20GasWithFallback = async (
    rpcProvider: ethers.JsonRpcProvider,
    _chainConfig: ReturnType<typeof getEvmUsdcChain>,
    payload: Record<string, string>,
): Promise<bigint> => {
    try {
        return await rpcProvider.estimateGas(payload);
    } catch (error: any) {
        console.log('[OfframpModal] Falling back to ERC20 gas limit:', error?.message || error);
        return ERC20_TRANSFER_GAS_FALLBACK;
    }
};

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
    const { hapticsEnabled, gatewayAutoDepositEnabled } = useSettings();
    const gatewayBalance = useGatewayBalance();
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
    const [estimatedNetworkFee, setEstimatedNetworkFee] = useState<string | null>(null);
    const [networkFeeError, setNetworkFeeError] = useState<string | null>(null);
    const [feeBreakdown, setFeeBreakdown] = useState<{
        gasFeeUsdc: bigint;
        transferFeeUsdc: bigint;
        forwarderFeeUsdc: bigint;
        totalFeeUsdc: bigint;
    } | null>(null);
    const [isLoadingRate, setIsLoadingRate] = useState(false);
    const [tokensSent, setTokensSent] = useState(false);
    const [parsedError, setParsedError] = useState<ParsedOfframpError | null>(null);
    const hasTriggeredSuccessNavigation = useRef(false);
    const modalDetents = (modalState === 'failed'
        ? [Platform.OS === 'ios' ? 0.66 : 0.76]
        : ['auto']) as any;

    const kycSheetRef = useRef<TrueSheet>(null);

    // KYC hook
    const { status: kycStatus, isApproved: isKYCApproved, fetchStatus: fetchKYCStatus } = useKYC();

    const estimateNetworkFee = useCallback(async () => {
        if (!data || modalState !== 'confirm') return;
        const network = data.network.toLowerCase();
        const chainConfig = getEvmUsdcChain(network);
        if (!chainConfig) {
            setEstimatedNetworkFee('Network fee applies');
            return;
        }

        // Gateway fee breakdown only applies when the user is settling via
        // the unified USDC path. When aggregated USDC is OFF we use a plain
        // ERC-20 transfer from the EOA — no Forwarder / service fee — so
        // fall through to the native gas estimate below.
        if (data.token.toUpperCase() === 'USDC' && gatewayAutoDepositEnabled) {
            const sourceKey = (() => {
                const n = network;
                if (n.includes('base')) return 'base' as const;
                if (n.includes('arbitrum') || n === 'arb') return 'arbitrum' as const;
                if (n.includes('polygon') || n.includes('matic') || n.includes('amoy')) return 'polygon' as const;
                if (n.includes('optimism') || n === 'op' || n.includes('op sepolia')) return 'optimism' as const;
                return null;
            })();
            if (sourceKey) {
                const valueStr = String(getNetCryptoAmount(toNumber(data.amount)) ?? data.amount);
                const m = valueStr.trim().match(/^(\d+)(?:\.(\d+))?$/);
                const valueSubunits = m
                    ? BigInt(m[1]) * 1_000_000n + BigInt(((m[2] ?? '') + '000000').slice(0, 6))
                    : 0n;
                const fees = previewGatewayFees({
                    sourceChain: sourceKey,
                    destChain: sourceKey,
                    valueUsdc: valueSubunits,
                    sourceGasFeeUsdc: GATEWAY_EVM_CHAINS[sourceKey].gasFeeUsdc,
                    useForwarder: true,
                });
                setFeeBreakdown({
                    gasFeeUsdc: fees.gasFeeUsdc,
                    transferFeeUsdc: fees.transferFeeUsdc,
                    forwarderFeeUsdc: fees.forwarderFeeUsdc,
                    totalFeeUsdc: fees.totalFeeUsdc,
                });
                setNetworkFeeError(null);
                setEstimatedNetworkFee(null);
                return;
            }
            setFeeBreakdown(null);
            setNetworkFeeError(null);
            setEstimatedNetworkFee('Calculated at confirmation');
            return;
        }

        setFeeBreakdown(null);

        try {
            setNetworkFeeError(null);
            setEstimatedNetworkFee(null);
            if (!evmWallets || evmWallets.length === 0) return;

            const wallet = evmWallets[0];
            const provider = await wallet.getProvider();
            const accounts = await provider.request({ method: 'eth_accounts' }) as string[];
            const walletAddress = accounts[0];
            if (!walletAddress) return;

            const tokenAddress = data.token.toUpperCase() === 'USDC' ? chainConfig.usdcAddress : null;
            if (!tokenAddress) return;

            const rpcProvider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
            const transferData = buildErc20TransferData(walletAddress, getNetCryptoAmount(toNumber(data.amount)));
            const estimatePayload: Record<string, string> = {
                from: walletAddress,
                to: tokenAddress,
                data: transferData,
            };

            const gasEstimate = await estimateErc20GasWithFallback(rpcProvider, chainConfig, estimatePayload);
            const feeData = await rpcProvider.getFeeData();
            const gasPrice = feeData.gasPrice || feeData.maxFeePerGas || 1000000000n;
            setEstimatedNetworkFee(formatFeeAmount(gasEstimate * gasPrice, 18, getNativeFeeSymbol(chainConfig)));
        } catch (error: any) {
            console.log('[OfframpModal] Network fee estimation error:', error?.message || error);
            setNetworkFeeError(`Estimate unavailable (paid in ${getNativeFeeSymbol(chainConfig)})`);
        }
    }, [data, modalState, evmWallets, gatewayAutoDepositEnabled]);

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

    useEffect(() => {
        estimateNetworkFee();
    }, [estimateNetworkFee]);

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
            // Use the Privy wallet's canonical (checksum-formatted) address
            // so the EIP-712 signer recovered on Circle's side matches the
            // bytes we embed in spec.sourceSigner / spec.sourceDepositor.
            const walletAddress = (wallet?.address as string | undefined)
                ?? ((await provider.request({ method: 'eth_accounts' })) as string[])[0];

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

            // 3. Send USDC to the Paycrest settlement address. Two paths:
            //    a) Unified balance on → Circle Gateway burn intent + forwarder
            //    b) Unified balance off → direct ERC-20 transfer from EOA
            //       USDC on the picked chain.
            const network = data.network.toLowerCase();
            const tokenSymbol = data.token.toUpperCase();
            if (tokenSymbol !== 'USDC') {
                throw new Error(`Offramp only supports USDC, got ${tokenSymbol}`);
            }

            const destChainKey: GatewayChainKey = (() => {
                const n = network;
                if (n === 'base' || n === 'arbitrum' || n === 'polygon' || n === 'optimism') return n as GatewayEvmChainKey;
                if (n === 'solana' || n === 'solana_devnet') return 'solana';
                throw new Error(`Unsupported destination chain: ${data.network}`);
            })();

            if (destChainKey === 'solana') {
                throw new Error('Solana settlement is not yet supported in the offramp flow.');
            }

            const grossAmount = toNumber(data.amount);
            const providerServiceFee = Number(order.serviceFee || 0);
            const transferAmount = Number(order.cryptoAmount || getNetCryptoAmount(grossAmount)) + (Number.isFinite(providerServiceFee) ? providerServiceFee : 0);
            const transferAmountStr = transferAmount.toFixed(6);
            const transferAmountSubunits = BigInt(Math.floor(transferAmount * 1_000_000));

            Analytics.withdrawalFlowStep('token_transfer_started', {
                order_id: order.id,
                network: data.network,
                token: data.token,
            });

            if (!gatewayAutoDepositEnabled) {
                // ---------- Direct ERC-20 path (unified off) ----------
                const destConfig = GATEWAY_EVM_CHAINS[destChainKey];
                setStatusMessage(`Sending USDC on ${destConfig.name}…`);

                try {
                    await provider.request({
                        method: 'wallet_switchEthereumChain',
                        params: [{ chainId: destConfig.chainIdHex }],
                    });
                } catch (err: any) {
                    const code = err?.code;
                    const message: string = err?.message || '';
                    if (code === 4902 || /unsupported chain/i.test(message)) {
                        try {
                            await provider.request({
                                method: 'wallet_addEthereumChain',
                                params: [{
                                    chainId: destConfig.chainIdHex,
                                    chainName: destConfig.name,
                                    nativeCurrency: {
                                        name: destConfig.nativeSymbol,
                                        symbol: destConfig.nativeSymbol,
                                        decimals: destConfig.nativeDecimals,
                                    },
                                    rpcUrls: [destConfig.rpcUrl],
                                    blockExplorerUrls: [destConfig.explorerUrl.replace(/\/tx\/?$/, '')],
                                }],
                            });
                        } catch (addErr: any) {
                            if (!/already added|exists/i.test(addErr?.message || '')) throw addErr;
                        }
                        await provider.request({
                            method: 'wallet_switchEthereumChain',
                            params: [{ chainId: destConfig.chainIdHex }],
                        });
                    } else {
                        throw err;
                    }
                }

                const erc20Data = buildErc20TransferData(order.receiveAddress, transferAmount);
                const directTxHash = await provider.request({
                    method: 'eth_sendTransaction',
                    params: [{
                        from: walletAddress,
                        to: destConfig.usdc,
                        data: erc20Data,
                        chainId: destConfig.chainIdHex,
                    }],
                }) as string;

                submittedTxHash = directTxHash;
                console.log('[Offramp] Direct ERC-20 tx:', submittedTxHash);
            } else {
                // ---------- Gateway (unified) path ----------
                setStatusMessage('Submitting USDC via Circle Gateway...');

            // Pick a source domain that holds enough Gateway liquidity for
            // the burn. Prefer Base for cheapest gas.
            const liquidityByDomain = new Map<number, bigint>();
            for (const entry of gatewayBalance.perDomain) {
                liquidityByDomain.set(
                    entry.domain,
                    (liquidityByDomain.get(entry.domain) ?? 0n) + BigInt(entry.balance ?? '0')
                );
            }
            const sourceCandidates: GatewayEvmChainKey[] = ['base', 'arbitrum', 'polygon', 'optimism'];
            const sourceChainKey = sourceCandidates.find((key) =>
                (liquidityByDomain.get(GATEWAY_DOMAINS[key]) ?? 0n) >= transferAmountSubunits
            );
            if (!sourceChainKey) {
                const totalGateway = sourceCandidates.reduce(
                    (sum, key) => sum + (liquidityByDomain.get(GATEWAY_DOMAINS[key]) ?? 0n),
                    0n,
                );
                throw new Error(
                    `Unified balance has ${formatGatewayUsdc(totalGateway)} USDC, but no single Gateway chain has enough for this withdrawal yet. Add balance on one supported chain or withdraw a smaller amount.`
                );
            }
            const sourceConfig = GATEWAY_EVM_CHAINS[sourceChainKey];
            const destConfig = GATEWAY_EVM_CHAINS[destChainKey];

            console.log('[Offramp] Burn from', sourceConfig.name, 'mint to', destConfig.name);
            console.log('[Offramp] Receive address:', order.receiveAddress);
            console.log('[Offramp] Amount:', transferAmountStr, tokenSymbol);

            const walletClient = await getEvmWalletClient(sourceChainKey, provider);
            const rpcProvider = new ethers.JsonRpcProvider(sourceConfig.rpcUrl);
            const currentSourceBlock = BigInt(await rpcProvider.getBlockNumber());

            const burnIntent = buildBurnIntent({
                sourceChainKey,
                destChainKey,
                amountUsdc: transferAmountStr,
                sourceDepositor: walletAddress as `0x${string}`,
                destinationRecipient: addressToBytes32(order.receiveAddress as `0x${string}`),
                destinationToken: addressToBytes32(destConfig.usdc),
                destinationContract: addressToBytes32(GATEWAY_MINTER_EVM),
                currentSourceBlock,
                useForwarder: true,
            });

            const fees = previewGatewayFees({
                sourceChain: sourceChainKey,
                destChain: destChainKey,
                valueUsdc: transferAmountSubunits,
                sourceGasFeeUsdc: sourceConfig.gasFeeUsdc,
                useForwarder: true,
            });
            console.log('[Offramp] Gateway fees:', {
                gas: formatGatewayUsdc(fees.gasFeeUsdc),
                transfer: formatGatewayUsdc(fees.transferFeeUsdc),
                forwarder: formatGatewayUsdc(fees.forwarderFeeUsdc),
                total: formatGatewayUsdc(fees.totalFeeUsdc),
            });

            const signed = await signEvmBurnIntent({
                burnIntent,
                sourceChainKey,
                provider,
                account: walletAddress as `0x${string}`,
            });

            const submitResponse = await submitBurnIntents([signed], { useForwarder: true });
            const transferId =
                submitResponse?.transfer?.id ||
                submitResponse?.transferId ||
                submitResponse?.id ||
                submitResponse?.[0]?.transfer?.id ||
                submitResponse?.[0]?.id;
            if (!transferId) {
                throw new Error('Gateway did not return a transfer id for the forwarded request');
            }

            setStatusMessage('Waiting for destination chain confirmation...');
            const record = await pollForwardedTransfer(String(transferId), {
                onTick: (rec) => {
                    if (rec.status) setStatusMessage(`Gateway: ${rec.status}…`);
                },
            });
            if (record.status?.toLowerCase() === 'failed' || record.status?.toLowerCase() === 'expired') {
                throw new Error(`Gateway transfer ${transferId} failed: ${record.error?.message || 'unknown'}`);
            }
            const txHash = String(
                record?.destination?.txHash ||
                record?.destinationTxHash ||
                record?.txHash ||
                transferId
            );
            submittedTxHash = txHash;
            } // end Gateway-path else

            // Mark that tokens have been sent (for error message differentiation)
            setTokensSent(true);
            tokensSentInAttempt = true;
            Analytics.withdrawalFlowStep('token_transfer_submitted', {
                order_id: order.id,
                tx_hash: submittedTxHash,
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

            console.log('[Offramp] Token transfer tx:', submittedTxHash);
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
                        txHash: submittedTxHash,
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
                    body: JSON.stringify({ txHash: submittedTxHash })
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
            // via provider webhook updates and polling.
            setModalState('success');
            Analytics.withdrawalFlowStep('withdrawal_submitted', {
                order_id: order.id,
                tx_hash: submittedTxHash,
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
    const evmDisplayChain = getEvmUsdcChain(network);
    const chain = evmDisplayChain ? { ...CHAINS[evmDisplayChain.key], name: evmDisplayChain.name } : (CHAINS[network] || CHAINS['base']);

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
                                icon={<X size={22} color={themeColors.textSecondary} strokeWidth={3.5} />}
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
                            {feeBreakdown ? (
                                <>
                                    <View style={styles.detailRow}>
                                        <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Network fee</Text>
                                        <Text style={[styles.detailValue, { color: themeColors.textPrimary }]}>
                                            {formatUsdcFee(feeBreakdown.gasFeeUsdc)} USDC
                                        </Text>
                                    </View>
                                    {feeBreakdown.transferFeeUsdc > 0n && (
                                        <View style={styles.detailRow}>
                                            <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Cross-chain fee</Text>
                                            <Text style={[styles.detailValue, { color: themeColors.textPrimary }]}>
                                                {formatUsdcFee(feeBreakdown.transferFeeUsdc)} USDC
                                            </Text>
                                        </View>
                                    )}
                                    <View style={styles.detailRow}>
                                        <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Service fee</Text>
                                        <Text style={[styles.detailValue, { color: themeColors.textPrimary }]}>
                                            {formatUsdcFee(feeBreakdown.forwarderFeeUsdc)} USDC
                                        </Text>
                                    </View>
                                </>
                            ) : (
                                <View style={styles.detailRow}>
                                    <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Est. Network Fee</Text>
                                    <Text style={[styles.detailValue, { color: themeColors.textPrimary }]}>
                                        {networkFeeError || estimatedNetworkFee || 'Calculating...'}
                                    </Text>
                                </View>
                            )}
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
        width: 36,
        height: 36,
        borderRadius: 18,
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
