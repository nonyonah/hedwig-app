import React, { useState, useEffect, useRef, forwardRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, ActivityIndicator, Alert, Platform, Image, Linking } from 'react-native';
import { useEmbeddedEthereumWallet, useEmbeddedSolanaWallet } from '@privy-io/expo';
import { ethers } from 'ethers';
import { TrueSheet } from '@hedwig/true-sheet';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Clipboard from 'expo-clipboard';
import { X, CheckCircle, TriangleAlert as Warning, Fingerprint, SquareArrowOutUpRight as ArrowSquareOut, CircleX as XCircle, Copy } from './ui/AppIcon';
import { Colors, useThemeColors } from '../theme/colors';
import { Typography } from '../styles/typography';
import LottieView from 'lottie-react-native';
import * as WebBrowser from 'expo-web-browser';
import { modalHaptic } from './ui/ModalStyles';
import { useSettings } from '../context/SettingsContext';
import { useAuth } from '../hooks/useAuth';
import { useWallet } from '../hooks/useWallet';
import { useGatewayBalance, formatGatewayUsdc, GatewayPerDomainBalance } from '../hooks/useGatewayBalance';
import IOSGlassIconButton from './ui/IOSGlassIconButton';
import { TransactionSuccessActions } from './TransactionSuccessActions';
import { getEvmUsdcChain, SOLANA_CLUSTER, SOLANA_USDC_MINT } from '../lib/usdcFeeNetworks';
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
import {
    buildSolanaBurnIntent,
    signSolanaBurnIntent,
} from '../lib/gateway/burn-intent-solana';
import { buildDestinationFields } from '../lib/gateway/recipients';
import {
    pollForwardedTransfer,
    previewGatewayFees,
    submitBurnIntents,
} from '../services/gatewayApi';
import { GATEWAY_SOLANA_GAS_FEE_USDC } from '../lib/gateway/constants';
import bs58 from 'bs58';
import {
    Connection,
    PublicKey,
    SystemProgram,
    LAMPORTS_PER_SOL,
    Transaction,
    TransactionInstruction,
    clusterApiUrl
} from '@solana/web3.js';

// SPL Token Program IDs
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const USDC_DECIMALS = 6;

const { height } = Dimensions.get('window');

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
    'base':     { name: 'Base',     icon: ICONS.base,     explorer: 'https://basescan.org/tx/',          type: 'evm' },
    'celo':     { name: 'Celo',     icon: ICONS.celo,     explorer: 'https://celoscan.io/tx/',           type: 'evm' },
    'arbitrum': { name: 'Arbitrum', icon: ICONS.arbitrum, explorer: 'https://arbiscan.io/tx/',           type: 'evm' },
    'polygon':  { name: 'Polygon',  icon: ICONS.polygon,  explorer: 'https://polygonscan.com/tx/',       type: 'evm' },
    'optimism': { name: 'Optimism', icon: ICONS.optimism, explorer: 'https://optimistic.etherscan.io/tx/', type: 'evm' },
    'solana':   { name: 'Solana',   icon: ICONS.solana,   explorer: 'https://explorer.solana.com/tx/',   type: 'solana' },
    'stacks':   { name: 'Stacks',   icon: require('../assets/icons/networks/stacks.png'), explorer: 'https://explorer.hiro.so/txid/', type: 'stacks' },
};

// ERC20 ABI for transfers
const ERC20_ABI = [
    "function transfer(address to, uint256 amount) returns (bool)",
    "function decimals() view returns (uint8)"
];

const buildErc20TransferData = (recipient: string, amount: string, decimals = USDC_DECIMALS): string => {
    const amountWei = BigInt(Math.floor(parseFloat(amount) * Math.pow(10, decimals)));
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

const trimTrailingZeros = (value: string): string =>
    value.includes('.') ? value.replace(/\.?0+$/, '') : value;

const formatDisplayAmount = (amount: string, token: string): string => {
    const normalized = amount.replace(/,/g, '').trim();
    const numeric = Number(normalized);
    if (!Number.isFinite(numeric)) return `${amount} ${token}`;

    const symbol = token.toUpperCase();
    const decimals =
        ['USDC', 'USDT', 'USD'].includes(symbol) ? 2 :
        numeric >= 1 ? 6 :
        numeric >= 0.000001 ? 8 :
        10;

    return `${trimTrailingZeros(numeric.toFixed(decimals))} ${token}`;
};

const ERC20_TRANSFER_GAS_FALLBACK = 120000n;

const normaliseToGatewayChainKey = (network: string): GatewayChainKey | null => {
    const n = network.toLowerCase().trim();
    if (n.includes('solana')) return 'solana';
    if (n.includes('base')) return 'base';
    if (n.includes('arbitrum') || n === 'arb') return 'arbitrum';
    if (n.includes('polygon') || n.includes('matic') || n.includes('amoy')) return 'polygon';
    if (n.includes('optimism') || n === 'op' || n.includes('op sepolia')) return 'optimism';
    return null;
};

const formatUsdcFee = (subunits: bigint): string => {
    const whole = Number(subunits) / 1_000_000;
    if (!Number.isFinite(whole)) return '—';
    if (whole === 0) return '$0.00';
    if (whole < 0.01) return `$${whole.toFixed(4)}`;
    return `$${whole.toFixed(2)}`;
};

const parseUsdcAmount = (amount: string): bigint => {
    const trimmed = amount.trim();
    if (!/^\d+(\.\d+)?$/.test(trimmed)) return 0n;
    const [intPart, fracPart = ''] = trimmed.split('.');
    const padded = (fracPart + '000000').slice(0, 6);
    return BigInt(intPart) * 1_000_000n + BigInt(padded);
};

const parseTokenAmountToSubunits = (amount: string, decimals: number): bigint => {
    const trimmed = amount.trim();
    if (!/^\d+(\.\d+)?$/.test(trimmed)) return 0n;
    const [intPart, fracPart = ''] = trimmed.split('.');
    const padded = (fracPart + '0'.repeat(decimals)).slice(0, decimals);
    return BigInt(intPart) * (10n ** BigInt(decimals)) + BigInt(padded || '0');
};

interface FeeBreakdown {
    gasFeeUsdc: bigint;
    transferFeeUsdc: bigint;
    forwarderFeeUsdc: bigint;
    totalFeeUsdc: bigint;
    chainLabel: string;
}

const estimateErc20GasWithFallback = async (
    rpcProvider: ethers.JsonRpcProvider,
    _chainConfig: ReturnType<typeof getEvmUsdcChain>,
    payload: Record<string, string>,
): Promise<bigint> => {
    try {
        return await rpcProvider.estimateGas(payload);
    } catch (error: any) {
        console.log('[TransactionConfirmationModal] Falling back to ERC20 gas limit:', error?.message || error);
        return ERC20_TRANSFER_GAS_FALLBACK;
    }
};

const TOKEN_ADDRESSES = {
    solana: {
        USDC: SOLANA_USDC_MINT
    }
};

interface TransactionData {
    amount: string;
    token: string;
    recipient: string;
    network: string; // 'base' | 'celo' | 'solana' | 'optimism' | ...
    /** When true the user picked the unified USDC row — route via Gateway. */
    unified?: boolean;
}

interface TransactionConfirmationModalProps {
    visible: boolean;
    onClose: () => void;
    data: TransactionData | null;
    onSuccess?: (hash: string) => void;
}

type ModalState = 'confirm' | 'processing' | 'success' | 'failed';

// Helper function to convert technical errors into user-friendly messages
const parseErrorMessage = (error: any): string => {
    const message = error?.message?.toLowerCase() || '';

    // Gas-related errors
    if (message.includes('insufficient funds') || message.includes('gas required exceeds') ||
        message.includes('insufficient balance') || message.includes('not enough balance')) {
        return "You're close, but this wallet cannot cover the transfer plus network fee yet. Add a little native token for gas or lower the amount and try again.";
    }
    if (message.includes('gas') && (message.includes('limit') || message.includes('price'))) {
        return 'Network fees could not be estimated right now. Wait a moment and try again, or retry with a smaller amount.';
    }

    // Network errors
    if (message.includes('network') || message.includes('connection') || message.includes('timeout')) {
        return 'Network connection issue. Please check your internet connection and try again.';
    }

    // User rejection
    if (message.includes('rejected') || message.includes('denied') || message.includes('cancelled')) {
        return 'Transaction was cancelled.';
    }

    // Wallet errors
    if (message.includes('wallet') && message.includes('not available')) {
        return 'Wallet not available. Please ensure you are logged in and try again.';
    }

    // Chain/network switch errors
    if (message.includes('switch') && message.includes('chain')) {
        return 'Please switch to the correct network in your wallet settings.';
    }

    // Nonce errors
    if (message.includes('nonce')) {
        return 'Transaction conflict detected. Please wait a moment and try again.';
    }

    // Token errors
    if (message.includes('token') && message.includes('not supported')) {
        return 'This token is not supported on the selected network.';
    }

    // Default: return a cleaned up version of the original message
    const cleanMessage = error?.message || 'An unexpected error occurred';
    // Truncate very long technical messages
    if (cleanMessage.length > 100) {
        return 'Transaction failed. Please try again or contact support if the issue persists.';
    }
    return cleanMessage;
};

export const TransactionConfirmationModal = forwardRef<TrueSheet, TransactionConfirmationModalProps>(({ onClose, data, onSuccess }, ref) => {
    // Early return MUST be before any hooks to follow Rules of Hooks
    if (!data) return null;

    const { hapticsEnabled } = useSettings();
    const themeColors = useThemeColors();
    const { getAccessToken } = useAuth();
    const ethereumWallet = useEmbeddedEthereumWallet();
    const solanaWallet = useEmbeddedSolanaWallet();
    const gatewayBalance = useGatewayBalance();
    const { fetchBalances: refreshWalletBalances } = useWallet();

    const evmWallets = (ethereumWallet as any)?.wallets || [];
    const solanaWallets = (solanaWallet as any)?.wallets || [];

    const [modalState, setModalState] = useState<ModalState>('confirm');
    const [txHash, setTxHash] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState('');
    const [estimatedGas, setEstimatedGas] = useState<string | null>(null);
    const [gasError, setGasError] = useState<string | null>(null);
    const [feeBreakdown, setFeeBreakdown] = useState<FeeBreakdown | null>(null);

    // Helper to normalize network name
    const normalizeNetwork = (network: string): string => {
        const n = network.toLowerCase().trim();
        if (n === 'solana' || n === 'solana devnet' || n === 'solanadevnet' || n === 'solana_devnet' || n === 'solana mainnet') {
            return 'solana';
        }
        return n;
    };

    // Helper to determine if network is Solana
    const isSolanaNetwork = (network: string): boolean => {
        const n = network.toLowerCase().trim();
        return n === 'solana' || n === 'solana_devnet' || n === 'solanadevnet' || n === 'solana devnet' || n === 'solana mainnet';
    };

    const estimateGasFee = useCallback(async () => {
        if (!data || modalState !== 'confirm') return;
        if (!data.amount || !data.recipient || !data.token) {
            console.log('[TransactionConfirmationModal] Missing data for gas estimation');
            return;
        }

        const network = data.network.toLowerCase();

        // USDC via Gateway: settlement is in USDC, deducted from unified
        // balance. Show itemized breakdown (gas + service + cross-chain) so
        // user sees exactly what Circle charges.
        if (data.token.toUpperCase() === 'USDC' && data.unified === true) {
            const destKey = normaliseToGatewayChainKey(network);
            if (destKey) {
                const value = parseUsdcAmount(data.amount);
                const sourceGasFeeUsdc = destKey === 'solana'
                    ? GATEWAY_SOLANA_GAS_FEE_USDC
                    : GATEWAY_EVM_CHAINS[destKey as GatewayEvmChainKey].gasFeeUsdc;
                const fees = previewGatewayFees({
                    sourceChain: destKey,
                    destChain: destKey,
                    valueUsdc: value,
                    sourceGasFeeUsdc,
                    useForwarder: true,
                });
                setFeeBreakdown({
                    gasFeeUsdc: fees.gasFeeUsdc,
                    transferFeeUsdc: fees.transferFeeUsdc,
                    forwarderFeeUsdc: fees.forwarderFeeUsdc,
                    totalFeeUsdc: fees.totalFeeUsdc,
                    chainLabel: destKey === 'solana' ? 'Solana' : GATEWAY_EVM_CHAINS[destKey as GatewayEvmChainKey].name,
                });
                setGasError(null);
                setEstimatedGas(null);
                return;
            }
            setFeeBreakdown(null);
            setGasError(null);
            setEstimatedGas('Calculated at confirmation');
            return;
        }

        setFeeBreakdown(null);

        if (isSolanaNetwork(network)) {
            setEstimatedGas('~0.000005 SOL');
            return;
        }

        const evmKey = normaliseToGatewayChainKey(network);
        if (!evmKey || evmKey === 'solana') return;
        const chainConfig = GATEWAY_EVM_CHAINS[evmKey as GatewayEvmChainKey];
        if (!chainConfig) return;

        try {
            setGasError(null);
            setEstimatedGas(null);

            const rpcProvider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
            const tokenSymbol = data.token.toUpperCase();

            if (!evmWallets || evmWallets.length === 0) return;
            const provider = await evmWallets[0].getProvider();
            const accounts = await provider.request({ method: 'eth_accounts' }) as string[];
            const fromAddress = accounts[0];
            if (!fromAddress) return;

            const isNativeToken = tokenSymbol === chainConfig.nativeSymbol;
            const tokenAddress = tokenSymbol === 'USDC' ? chainConfig.usdc : null;
            if (!isNativeToken && !tokenAddress) return;

            const estimatePayload: Record<string, string> = isNativeToken
                ? {
                    from: fromAddress,
                    to: data.recipient,
                    value: `0x${parseTokenAmountToSubunits(data.amount, chainConfig.nativeDecimals).toString(16)}`,
                }
                : {
                    from: fromAddress,
                    to: tokenAddress as string,
                    data: buildErc20TransferData(data.recipient, data.amount),
                    value: '0x0',
                };

            const [feeData, gasEstimate] = await Promise.all([
                rpcProvider.getFeeData(),
                isNativeToken
                    ? rpcProvider.estimateGas(estimatePayload)
                    : estimateErc20GasWithFallback(rpcProvider, null, estimatePayload),
            ]);
            const gasPrice = feeData.gasPrice || 1000000000n;
            const gasCost = gasEstimate * gasPrice;
            setEstimatedGas(formatFeeAmount(gasCost, chainConfig.nativeDecimals, chainConfig.nativeSymbol));
        } catch (error: any) {
            console.log('Gas estimation error:', error.message);
            setGasError(`Estimate unavailable (paid in ${chainConfig.nativeSymbol})`);
        }
    }, [data, modalState, evmWallets]);

    const handleSheetPresented = useCallback(() => {
        modalHaptic('open', hapticsEnabled);
        setModalState('confirm');
        setTxHash(null);
        // Refresh on-chain balances eagerly so the direct-ERC20 fallback
        // path inside handleEvmTransaction sees the latest per-chain USDC
        // figures instead of stale state from the previous screen.
        void refreshWalletBalances();
        void gatewayBalance.refresh();
        // Pre-warm the Privy embedded wallet provider. The first call to
        // wallets/authenticate often aborts on cold start; warming here while
        // the user reads the confirm sheet hides that latency.
        if (evmWallets && evmWallets.length > 0) {
            void evmWallets[0].getProvider()
                .then((p: any) => p?.request?.({ method: 'eth_accounts' }))
                .catch(() => { /* ignore — actual call retries */ });
        }
        estimateGasFee();
    }, [hapticsEnabled, estimateGasFee, refreshWalletBalances, evmWallets, gatewayBalance]);

    const handleSheetDismissed = useCallback(() => {
        modalHaptic('close', hapticsEnabled);
        setStatusMessage('');
        setModalState('confirm');
        onClose();
    }, [hapticsEnabled, onClose]);

    const handleDismiss = useCallback(() => {
        if (typeof ref !== 'function') {
            void ref?.current?.dismiss().catch(() => {});
        }
    }, [ref]);

    // Handle Solana transaction
    const handleSolanaTransaction = async () => {
        if (!data) throw new Error('No transaction data');

        if (!solanaWallets || solanaWallets.length === 0) {
            throw new Error('Solana wallet not available. Please create a Solana wallet first.');
        }

        const wallet = solanaWallets[0];
        const fromAddress = (wallet as any).address;
        if (!fromAddress) {
            throw new Error('No Solana wallet address');
        }

        console.log('=== Solana Transaction ===');
        console.log('From:', fromAddress);
        console.log('To:', data.recipient);
        console.log('Amount:', data.amount, data.token);

        const connection = new Connection(clusterApiUrl(SOLANA_CLUSTER), 'confirmed');

        const tokenSymbol = data.token.toUpperCase();

        // ========================================
        // NATIVE SOL TRANSFER
        // ========================================
        if (tokenSymbol === 'SOL') {
            console.log('[Solana] Processing native SOL transfer...');
            const senderPubkey = new PublicKey(fromAddress);
            const recipientPubkey = new PublicKey(data.recipient);
            const lamports = BigInt(Math.round(parseFloat(data.amount) * LAMPORTS_PER_SOL));
            if (lamports <= 0n) throw new Error('Invalid SOL amount');

            const transaction = new Transaction().add(
                SystemProgram.transfer({
                    fromPubkey: senderPubkey,
                    toPubkey: recipientPubkey,
                    lamports: Number(lamports),
                }),
            );
            const { blockhash } = await connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = senderPubkey;

            const provider = await wallet.getProvider();
            const result = await provider.request({
                method: 'signAndSendTransaction',
                params: { transaction, connection },
            });
            const signature = result.signature;
            console.log('Solana SOL Transaction Signature:', signature);
            return signature;
        }

        // ========================================
        // SPL TOKEN (USDC) TRANSFER
        // ========================================
        console.log('[Solana] Processing SPL Token transfer...');

        const mintAddress = TOKEN_ADDRESSES.solana.USDC;
        if (!mintAddress) {
            throw new Error(`${tokenSymbol} is not supported on Solana`);
        }

        const mintPubkey = new PublicKey(mintAddress);
        const senderPubkey = new PublicKey(fromAddress);
        const recipientPubkey = new PublicKey(data.recipient);

            // Convert amount to smallest units (USDC has 6 decimals)
        const amount = BigInt(Math.floor(parseFloat(data.amount) * Math.pow(10, USDC_DECIMALS)));

        console.log(`[Solana] Transferring ${amount} ${tokenSymbol} units`);

            // Derive Associated Token Accounts
        const [senderATA] = await PublicKey.findProgramAddress(
            [senderPubkey.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mintPubkey.toBuffer()],
            ASSOCIATED_TOKEN_PROGRAM_ID
        );
        const [recipientATA] = await PublicKey.findProgramAddress(
            [recipientPubkey.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mintPubkey.toBuffer()],
            ASSOCIATED_TOKEN_PROGRAM_ID
        );

        console.log('[Solana] ATAs:', { sender: senderATA.toString(), recipient: recipientATA.toString() });

        const transaction = new Transaction();

            // Check if recipient ATA exists, create if not
        const recipientATAInfo = await connection.getAccountInfo(recipientATA);
        if (!recipientATAInfo) {
            console.log('[Solana] Creating recipient ATA...');
            const splSystemProgram = new PublicKey('11111111111111111111111111111111');
            transaction.add(
                new TransactionInstruction({
                    keys: [
                        { pubkey: senderPubkey, isSigner: true, isWritable: true },
                        { pubkey: recipientATA, isSigner: false, isWritable: true },
                        { pubkey: recipientPubkey, isSigner: false, isWritable: false },
                        { pubkey: mintPubkey, isSigner: false, isWritable: false },
                        { pubkey: splSystemProgram, isSigner: false, isWritable: false },
                        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
                    ],
                    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
                    data: Buffer.alloc(0),
                })
            );
        }

            // Create SPL Token transfer instruction
            // Instruction layout: byte 0 = 3 (Transfer), bytes 1-8 = amount (u64 LE)
        const transferData = Buffer.alloc(9);
        transferData.writeUInt8(3, 0); // Transfer instruction
        // Write u64 little-endian
        const low = Number(amount & BigInt(0xFFFFFFFF));
        const high = Number((amount >> BigInt(32)) & BigInt(0xFFFFFFFF));
        transferData.writeUInt32LE(low, 1);
        transferData.writeUInt32LE(high, 5);

        transaction.add(
            new TransactionInstruction({
                keys: [
                    { pubkey: senderATA, isSigner: false, isWritable: true },
                    { pubkey: recipientATA, isSigner: false, isWritable: true },
                    { pubkey: senderPubkey, isSigner: true, isWritable: false },
                ],
                programId: TOKEN_PROGRAM_ID,
                data: transferData,
            })
        );

            // Get recent blockhash
        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = senderPubkey;

            // Get the Privy provider and send transaction
        const provider = await wallet.getProvider();

        console.log('[Solana] Sending SPL Token transaction via Privy provider...');

        const result = await provider.request({
            method: 'signAndSendTransaction',
            params: {
                transaction: transaction,
                connection: connection,
            },
        });

        const signature = result.signature;
        console.log('Solana SPL Token Transaction Signature:', signature);

            // Wait for confirmation using polling
        let confirmed = false;
        let attempts = 0;
        const maxAttempts = 30;

        while (!confirmed && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            attempts++;

            try {
                const status = await connection.getSignatureStatuses([signature]);
                if (status.value[0]) {
                    const confirmationStatus = status.value[0].confirmationStatus;
                    if (confirmationStatus === 'confirmed' || confirmationStatus === 'finalized') {
                        confirmed = true;
                        console.log('[Solana] SPL Token Transaction confirmed!', confirmationStatus);
                    }
                }
            } catch (e) {
                console.warn('[Solana] Confirmation check error:', e);
            }
        }

        if (!confirmed) {
            console.warn('Transaction confirmation timed out, but transaction was sent:', signature);
        }

        return signature;
    };

    /**
     * Pick a Gateway source domain. EVM domains are preferred (cheaper gas),
     * then Solana. Returns null if no single domain holds enough liquidity —
     * Gateway lets us split across multiple intents but for the MVP we ask
     * the user to consolidate via deposit if no single chain covers it.
     */
    const pickSourceChain = (
        amountUsdcSubunits: bigint,
        perDomainOverride?: GatewayPerDomainBalance[],
    ): GatewayChainKey | null => {
        const source = perDomainOverride ?? gatewayBalance.perDomain;
        const liquidity = new Map<number, bigint>();
        for (const entry of source) {
            const existing = liquidity.get(entry.domain) ?? 0n;
            liquidity.set(entry.domain, existing + BigInt(entry.balance ?? '0'));
        }
        const preferenceOrder: GatewayChainKey[] = ['base', 'arbitrum', 'polygon', 'optimism', 'solana'];
        for (const key of preferenceOrder) {
            const domain = GATEWAY_DOMAINS[key];
            const balance = liquidity.get(domain) ?? 0n;
            if (balance >= amountUsdcSubunits) return key;
        }
        return null;
    };

    /**
     * Read the latest /api/gateway/balance directly. The state-bound poll can
     * lag the first confirmation tap by a few seconds — falling back to a
     * fresh fetch prevents a spurious "No chain holds enough USDC" failure.
     */
    const fetchFreshGatewayPerDomain = async (): Promise<GatewayPerDomainBalance[]> => {
        try {
            const token = await getAccessToken();
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
            const res = await fetch(`${apiUrl}/api/gateway/balance`, {
                headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            });
            const json = await res.json();
            const list = json?.data?.perDomain;
            return Array.isArray(list) ? (list as GatewayPerDomainBalance[]) : [];
        } catch {
            return [];
        }
    };

    /**
     * Send USDC via Circle Gateway:
     *   1. Pick a source domain that has enough unified balance (EVM-first,
     *      Solana fallback).
     *   2. Build + sign a burn intent — EIP-712 (viem) for EVM source,
     *      custom binary + Ed25519 (Privy embedded Solana wallet) for
     *      Solana source.
     *   3. Submit to Circle with `enableForwarder=true` so Circle pays the
     *      destination gas; the user only spends USDC + the $0.20 forwarder fee.
     *   4. Poll the transfer record until terminal state, return the
     *      destination tx hash for explorer linking.
     */
    /**
     * Direct ERC-20 / native transfer from the Privy embedded EOA on
     * `destChainKey`. Used when the user picks a per-chain USDC row (opted
     * out of Gateway) or sends a native token like ETH/POL. Requires native
     * gas on the source chain — Gateway's Forwarder is bypassed entirely.
     */
    const sendDirectErc20OnSource = async ({
        destChainKey,
        tokenSymbol,
        amountSubunits,
    }: {
        destChainKey: GatewayEvmChainKey;
        tokenSymbol: string;
        amountSubunits: bigint;
    }): Promise<string> => {
        if (!data) throw new Error('No transaction data');
        if (!evmWallets || evmWallets.length === 0) {
            throw new Error('No EVM wallet available. Please ensure you are logged in.');
        }

        const sourceConfig = GATEWAY_EVM_CHAINS[destChainKey];
        if (!sourceConfig) throw new Error(`Unsupported chain: ${destChainKey}`);

        const wallet = evmWallets[0];
        const provider = await wallet.getProvider();
        if (!provider) throw new Error('Wallet provider not ready. Please try again.');

        setStatusMessage(`Sending ${tokenSymbol} on ${sourceConfig.name}…`);

        try {
            await provider.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: sourceConfig.chainIdHex }],
            });
        } catch (switchError: any) {
            // Privy throws code 4902 OR a generic "Unsupported chainId" message
            // when the chain is not in its allowlist. Both paths need
            // wallet_addEthereumChain to register the chain, then a retry.
            const code = switchError?.code;
            const message: string = switchError?.message || '';
            const isMissing = code === 4902 || /unsupported chain/i.test(message);
            if (!isMissing) throw switchError;
            try {
                await provider.request({
                    method: 'wallet_addEthereumChain',
                    params: [{
                        chainId: sourceConfig.chainIdHex,
                        chainName: sourceConfig.name,
                        nativeCurrency: {
                            name: sourceConfig.nativeSymbol,
                            symbol: sourceConfig.nativeSymbol,
                            decimals: sourceConfig.nativeDecimals,
                        },
                        rpcUrls: [sourceConfig.rpcUrl],
                        blockExplorerUrls: [sourceConfig.explorerUrl.replace(/\/tx\/?$/, '')],
                    }],
                });
            } catch (addErr: any) {
                if (!/already added|exists/i.test(addErr?.message || '')) throw addErr;
            }
            await provider.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: sourceConfig.chainIdHex }],
            });
        }

        const fromAddress = (wallet?.address as `0x${string}` | undefined)
            ?? (((await provider.request({ method: 'eth_accounts' })) as string[])[0] as `0x${string}`);
        if (!fromAddress) throw new Error('No wallet address found');

        // Native send (ETH / POL) — simple value transfer to recipient.
        if (tokenSymbol === sourceConfig.nativeSymbol) {
            const txHash = await provider.request({
                method: 'eth_sendTransaction',
                params: [{
                    from: fromAddress,
                    to: data.recipient as `0x${string}`,
                    value: `0x${amountSubunits.toString(16)}`,
                    chainId: sourceConfig.chainIdHex,
                }],
            }) as string;
            return txHash;
        }

        // ERC-20 USDC transfer.
        if (tokenSymbol !== 'USDC') {
            throw new Error(`Token ${tokenSymbol} not supported on ${sourceConfig.name}`);
        }
        const transferData = buildErc20TransferData(data.recipient, data.amount);
        const txHash = await provider.request({
            method: 'eth_sendTransaction',
            params: [{
                from: fromAddress,
                to: sourceConfig.usdc,
                data: transferData,
                value: '0x0',
                chainId: sourceConfig.chainIdHex,
            }],
        }) as string;
        return txHash;
    };

    const handleEvmTransaction = async () => {
        if (!data) throw new Error('No transaction data');

        const tokenSymbol = data.token.toUpperCase();

        const destChainKey: GatewayChainKey = (() => {
            const n = data.network.toLowerCase();
            if (n === 'base' || n === 'arbitrum' || n === 'polygon' || n === 'optimism') return n as GatewayEvmChainKey;
            if (n === 'solana' || n === 'solana_devnet' || n === 'solana mainnet') return 'solana';
            throw new Error(`Unsupported destination chain: ${data.network}`);
        })();

        // Per-chain USDC + native tokens skip Gateway and go straight on-chain
        // via the embedded EOA. Only the unified-USDC row routes through the
        // Gateway burn-intent + Forwarder flow.
        const useGateway = data.unified === true && tokenSymbol === 'USDC';

        if (!useGateway) {
            if (destChainKey === 'solana') {
                // Native + USDC sends on Solana already go through the
                // Solana-specific handler upstream — guard here as defense.
                throw new Error('Solana sends must use the Solana flow.');
            }
            const sourceConfig = GATEWAY_EVM_CHAINS[destChainKey as GatewayEvmChainKey];
            if (!sourceConfig) {
                throw new Error(`Unsupported chain: ${data.network}`);
            }
            const value = tokenSymbol === 'USDC'
                ? parseUsdcAmount(data.amount)
                : parseTokenAmountToSubunits(data.amount, sourceConfig.nativeDecimals);
            return await sendDirectErc20OnSource({
                destChainKey,
                tokenSymbol,
                amountSubunits: value,
            });
        }

        if (tokenSymbol !== 'USDC') {
            throw new Error(`Gateway transfers only support USDC, got ${tokenSymbol}`);
        }

        const value = parseUsdcAmount(data.amount);
        let sourceChainKey = pickSourceChain(value);
        let freshPerDomain: GatewayPerDomainBalance[] | undefined;
        if (!sourceChainKey) {
            // State-bound poll can be stale on the first tap; pull a fresh
            // /api/gateway/balance before declaring insufficient liquidity.
            freshPerDomain = await fetchFreshGatewayPerDomain();
            if (freshPerDomain.length > 0) {
                sourceChainKey = pickSourceChain(value, freshPerDomain);
            }
        }
        if (!sourceChainKey) {
            const liquiditySource = freshPerDomain && freshPerDomain.length > 0
                ? freshPerDomain
                : gatewayBalance.perDomain;
            const totalGateway = liquiditySource.reduce(
                (sum, d) => sum + BigInt(d.balance ?? '0'),
                0n,
            );
            throw new Error(
                `Unified balance has ${formatGatewayUsdc(totalGateway)} USDC, but no single Gateway chain has enough for this transfer yet. Add balance on one supported chain or send a smaller amount.`
            );
        }

        const dest = buildDestinationFields(destChainKey, data.recipient);
        const recipientSetupOptions = dest.recipientOwnerAddressBytes32
            ? { includeRecipientSetup: true, recipientOwnerAddress: dest.recipientOwnerAddressBytes32 }
            : undefined;

        let signed;
        let sourceLabel: string;
        let sourceGasFeeUsdc: bigint;

        if (sourceChainKey === 'solana') {
            // Solana-source path — Privy embedded Solana wallet signs the
            // custom binary burn intent with Ed25519. The provider is shared
            // by every domain (Solana has only one), so no chain switching.
            if (!solanaWallets || solanaWallets.length === 0) {
                throw new Error('No Solana wallet available. Please ensure you are logged in.');
            }
            const sWallet = solanaWallets[0];
            const sProvider = await sWallet.getProvider();
            if (!sProvider) throw new Error('Solana wallet provider not ready.');

            const sourceDepositor = sWallet.address as string;
            setStatusMessage(`Signing burn intent on Solana…`);

            const connection = new Connection(clusterApiUrl(SOLANA_CLUSTER as any), 'confirmed');
            const slot = BigInt(await connection.getSlot('confirmed'));

            const burnIntent = buildSolanaBurnIntent({
                destChainKey,
                amountUsdc: data.amount,
                sourceDepositor,
                destinationRecipient: dest.destinationRecipient,
                destinationToken: dest.destinationToken,
                destinationContract: dest.destinationContract,
                currentSlot: slot,
                useForwarder: true,
            });

            signed = await signSolanaBurnIntent({
                burnIntent,
                signMessage: async (payload: Uint8Array) => {
                    const messageB58 = bs58.encode(payload);
                    const result = await sProvider.request({
                        method: 'signMessage',
                        params: { message: messageB58 },
                    });
                    return (result as any).signature as string;
                },
            });
            sourceLabel = 'Solana';
            sourceGasFeeUsdc = 150_000n;
        } else {
            // EVM source path.
            if (!evmWallets || evmWallets.length === 0) {
                throw new Error('No EVM wallet available. Please ensure you are logged in.');
            }
            const sourceConfig = GATEWAY_EVM_CHAINS[sourceChainKey];
            sourceLabel = sourceConfig.name;
            sourceGasFeeUsdc = sourceConfig.gasFeeUsdc;

            setStatusMessage(`Signing burn intent on ${sourceConfig.name}…`);

            const wallet = evmWallets[0];
            const provider = await wallet.getProvider();
            if (!provider) throw new Error('Wallet provider not ready. Please try again.');

            const walletClient = await getEvmWalletClient(sourceChainKey, provider);

            // viem's signTypedData + Privy's iframe RPC sign with the wallet's
            // own (checksum-formatted) account. If sourceSigner is derived
            // from a different cased string than what Privy signs with, the
            // recovered signer on Circle's side will mismatch the spec field
            // even though the address bytes are identical. We therefore pull
            // the canonical address from the embedded wallet record itself
            // and feed the SAME string into both buildBurnIntent and
            // signTypedData so the comparison is byte-exact.
            const canonicalAddress: `0x${string}` = (wallet?.address as `0x${string}` | undefined)
                ?? (((await provider.request({ method: 'eth_accounts' })) as string[])[0] as `0x${string}`);
            if (!canonicalAddress) throw new Error('No wallet address found');
            const fromAddress = canonicalAddress;

            const rpcProvider = new ethers.JsonRpcProvider(sourceConfig.rpcUrl);
            const currentSourceBlock = BigInt(await rpcProvider.getBlockNumber());

            const burnIntent = buildBurnIntent({
                sourceChainKey,
                destChainKey,
                amountUsdc: data.amount,
                sourceDepositor: fromAddress as `0x${string}`,
                destinationRecipient: dest.destinationRecipient,
                destinationToken: dest.destinationToken,
                destinationContract: dest.destinationContract,
                currentSourceBlock,
                useForwarder: true,
            });

            signed = await signEvmBurnIntent({
                burnIntent,
                sourceChainKey,
                provider,
                account: fromAddress as `0x${string}`,
            });
        }

        const fees = previewGatewayFees({
            sourceChain: sourceChainKey,
            destChain: destChainKey,
            valueUsdc: value,
            sourceGasFeeUsdc,
            useForwarder: true,
        });
        console.log('[Gateway] Fee preview:', {
            source: sourceLabel,
            gas: formatGatewayUsdc(fees.gasFeeUsdc),
            transfer: formatGatewayUsdc(fees.transferFeeUsdc),
            forwarder: formatGatewayUsdc(fees.forwarderFeeUsdc),
            total: formatGatewayUsdc(fees.totalFeeUsdc),
        });

        setStatusMessage('Submitting to Circle Gateway…');

        const submitResponse = await submitBurnIntents(
            [{ ...signed, ...(recipientSetupOptions ? { recipientSetupOptions } : {}) }],
            { useForwarder: true }
        );
        // Forwarder responses bury the id under different keys depending on
        // the variant — try the documented locations and fail loudly if none
        // match so we don't silently lose the transfer.
        const transferId =
            submitResponse?.transfer?.id ||
            submitResponse?.transferId ||
            submitResponse?.id ||
            submitResponse?.[0]?.transfer?.id ||
            submitResponse?.[0]?.id;
        if (!transferId) {
            throw new Error('Gateway did not return a transfer id for the forwarded request');
        }

        setStatusMessage('Waiting for destination chain confirmation…');
        const record = await pollForwardedTransfer(String(transferId), {
            onTick: (rec) => {
                if (rec.status) setStatusMessage(`Gateway: ${rec.status}…`);
            },
        });

        if (record.status?.toLowerCase() === 'failed' || record.status?.toLowerCase() === 'expired') {
            throw new Error(`Gateway transfer ${transferId} failed: ${record.error?.message || 'unknown'}`);
        }

        const destTxHash =
            record?.destination?.txHash ||
            record?.destinationTxHash ||
            record?.txHash ||
            transferId;

        return String(destTxHash);
    };

    const handleConfirm = async () => {
        if (!data) return;

        // 1. Biometric Auth
        try {
            const hasHardware = await LocalAuthentication.hasHardwareAsync();
            if (hasHardware) {
                const authResult = await LocalAuthentication.authenticateAsync({
                    promptMessage: 'Authenticate to confirm transaction',
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

        // 2. Execute Transaction
        try {
            setModalState('processing');
            setStatusMessage('Processing...');

            const network = data.network.toLowerCase();
            const tokenSymbolUpper = data.token.toUpperCase();
            let transactionHash: string;

            // Unified USDC routes through Circle Gateway regardless of
            // destination chain — handleEvmTransaction handles burn-intent
            // construction + signing on whichever source chain holds the
            // liquidity (EVM or Solana). Direct SPL transfer is only for the
            // per-chain row when the user has opted out of unified balance.
            const useGateway = data.unified === true && tokenSymbolUpper === 'USDC';

            if (isSolanaNetwork(network) && !useGateway) {
                transactionHash = await handleSolanaTransaction();
            } else if (network === 'stacks' || network === 'stacks_testnet' || network === 'stacks testnet') {
                const { payInvoice } = require('../services/stacksWallet');
                // Use token as optional invoice ID if specialized, otherwise default
                const txId = await payInvoice(
                    data.recipient,
                    data.amount,
                    // Use a simple reference if available, otherwise undefined
                    undefined
                );

                if (!txId) throw new Error('Stacks transaction failed');
                transactionHash = txId;

                // Add link for Stacks explorer
                setTxHash(txId);
            } else {
                transactionHash = await handleEvmTransaction();
            }

            setTxHash(transactionHash);

            // Log transaction to backend for AI insights
            try {
                const authToken = await getAccessToken();
                const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
                const network = data.network.toLowerCase();
                const loggedChainConfig = getEvmUsdcChain(network);

                // Determine chain and get sender address
                let fromAddress = '';
                if (isSolanaNetwork(network)) {
                    fromAddress = solanaWallets[0]?.address || '';
                } else {
                    const wallet = evmWallets[0];
                    if (wallet) {
                        const provider = await wallet.getProvider();
                        const accounts = await provider.request({ method: 'eth_accounts' }) as string[];
                        fromAddress = accounts[0] || '';
                    }
                }

                await fetch(`${apiUrl}/api/transactions`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${authToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        type: 'PAYMENT_SENT',
                        txHash: transactionHash,
                        amount: data.amount,
                        token: data.token,
                        chain: network.toUpperCase() === 'SOLANA' ? 'SOLANA' : loggedChainConfig?.key?.toUpperCase() || network.toUpperCase(),
                        fromAddress: fromAddress,
                        toAddress: data.recipient,
                        status: 'CONFIRMED',
                    })
                });
                console.log('[Transaction] Logged to backend');
            } catch (logError) {
                console.log('[Transaction] Failed to log (non-fatal):', logError);
            }

            setModalState('success');
            if (onSuccess) onSuccess(transactionHash);

        } catch (error: any) {
            console.error('Transaction Failed:', error);
            setStatusMessage(parseErrorMessage(error));
            setModalState('failed');
        }
    };

    const openExplorer = async () => {
        if (!txHash || !data) return;
        const network = data.network.toLowerCase();
        const evmChain = getEvmUsdcChain(network);
        const chainInfo = evmChain
            ? { ...CHAINS[evmChain.key], explorer: evmChain.explorerUrl, name: evmChain.name }
            : CHAINS[network];
        if (chainInfo && chainInfo.explorer) {
            let url = chainInfo.explorer + txHash;
            // Add cluster param for Solana
            if (chainInfo.type === 'solana' && chainInfo.cluster) {
                url += `?cluster=${chainInfo.cluster}`;
            }
            await WebBrowser.openBrowserAsync(url);
        }
    };

    // Early return already handled at the top of the component
    const network = normalizeNetwork(data.network);
    const evmDisplayChain = getEvmUsdcChain(network);
    const chain = evmDisplayChain ? { ...CHAINS[evmDisplayChain.key], name: evmDisplayChain.name } : (CHAINS[network] || CHAINS['solana']);
    const displayAmount = formatDisplayAmount(data.amount, data.token);
    const modalDetents = (modalState === 'failed'
        ? [Platform.OS === 'ios' ? 0.66 : 0.76]
        : ['auto']) as any;

    const renderContent = () => {
        switch (modalState) {
            case 'processing':
                return (
                    <View style={styles.processingContainer}>
                        <LottieView
                            source={require('../assets/animations/processing.json')}
                            autoPlay
                            loop
                            style={styles.processingLottie}
                        />
                        <Text style={[styles.statusTitle, { color: themeColors.textPrimary }]}>We're doing the thing...</Text>
                    </View>
                );
            case 'success': {
                const shortHash = txHash
                    ? `${txHash.slice(0, 10)}…${txHash.slice(-8)}`
                    : '';
                const copyHash = async () => {
                    if (!txHash) return;
                    await Clipboard.setStringAsync(txHash);
                    modalHaptic('open', hapticsEnabled);
                };
                return (
                    <View style={styles.successContainer}>
                        <LottieView
                            source={require('../assets/animations/success.json')}
                            autoPlay
                            loop={false}
                            style={styles.successLottie}
                        />
                        <Text style={[styles.successAmount, { color: themeColors.textPrimary }]}>
                            {displayAmount}
                        </Text>
                        <Text style={[styles.successSubtitle, { color: themeColors.textSecondary }]}>
                            sent successfully
                        </Text>

                        <View style={[styles.successCard, { backgroundColor: themeColors.surface }]}>
                            <View style={styles.detailRow}>
                                <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>To</Text>
                                <Text
                                    style={[styles.detailValue, { color: themeColors.textPrimary }]}
                                    numberOfLines={1}
                                    ellipsizeMode="middle"
                                >
                                    {data.recipient
                                        ? `${data.recipient.slice(0, 8)}…${data.recipient.slice(-6)}`
                                        : ''}
                                </Text>
                            </View>
                            <View style={styles.detailRow}>
                                <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Network</Text>
                                <View style={[styles.chainBadge, { backgroundColor: themeColors.background }]}>
                                    {chain?.icon && <Image source={chain.icon} style={styles.chainIcon} />}
                                    <Text style={[styles.chainName, { color: themeColors.textPrimary }]}>
                                        {chain?.name || data.network}
                                    </Text>
                                </View>
                            </View>
                            {shortHash ? (
                                <TouchableOpacity
                                    style={styles.detailRow}
                                    onPress={copyHash}
                                    activeOpacity={0.6}
                                >
                                    <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Tx hash</Text>
                                    <View style={styles.hashRow}>
                                        <Text style={[styles.detailValue, { color: themeColors.textPrimary }]}>
                                            {shortHash}
                                        </Text>
                                        <Copy size={14} color={themeColors.textSecondary} />
                                    </View>
                                </TouchableOpacity>
                            ) : null}
                        </View>

                        <View style={styles.successActionsWrap}>
                            <TransactionSuccessActions
                                onExplorer={openExplorer}
                                onDone={handleDismiss}
                            />
                        </View>
                    </View>
                );
            }
            case 'failed':
                return (
                    <View style={styles.statusContainer}>
                        <XCircle size={120} color="white" fill={Colors.error || '#EF4444'} style={{ marginBottom: 24 }} />
                        <Text style={[styles.statusTitle, { color: themeColors.textPrimary }]}>Transaction failed. Don't worry your funds are safe.</Text>
                        <Text style={styles.errorMessage}>{statusMessage}</Text>
                        <View style={styles.actionButtonsContainer}>
                            <TouchableOpacity style={styles.closeButtonMain} onPress={handleDismiss}>
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
                            <Text style={[styles.title, { color: themeColors.textPrimary }]}>Confirm Transaction</Text>
                            <IOSGlassIconButton
                                onPress={handleDismiss}
                                systemImage="xmark"
                                circleStyle={[styles.closeButton, { backgroundColor: themeColors.surface }]}
                                icon={<X size={22} color={themeColors.textSecondary} strokeWidth={3.5} />}
                            />
                        </View>

                        {/* Amount */}
                        <View style={styles.amountContainer}>
                            <Text style={[styles.amountLabel, { color: themeColors.textSecondary }]}>You're sending</Text>
                            <Text
                                style={[styles.amount, { color: themeColors.textPrimary }]}
                                numberOfLines={2}
                                adjustsFontSizeToFit
                                minimumFontScale={0.72}
                            >
                                {displayAmount}
                            </Text>
                        </View>

                        {/* Details */}
                        <View style={[styles.detailsContainer, { backgroundColor: themeColors.surface }]}>
                            <View style={styles.detailRow}>
                                <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>To</Text>
                                <Text style={[styles.detailValue, { color: themeColors.textPrimary }]} numberOfLines={1} ellipsizeMode="middle">
                                    {data.recipient ? `${data.recipient.slice(0, 8)}...${data.recipient.slice(-6)}` : 'Loading...'}
                                </Text>
                            </View>
                            <View style={styles.detailRow}>
                                <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Network</Text>
                                <View style={[styles.chainBadge, { backgroundColor: themeColors.background }]}>
                                    {chain?.icon && <Image source={chain.icon} style={styles.chainIcon} />}
                                    <Text style={[styles.chainName, { color: themeColors.textPrimary }]}>{chain?.name || data.network}</Text>
                                </View>
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
                                    <View style={styles.detailRow}>
                                        <Text style={[styles.detailLabel, { color: themeColors.textSecondary, fontWeight: '600' }]}>Total fee</Text>
                                        <Text style={[styles.detailValue, { color: themeColors.textPrimary, fontWeight: '600' }]}>
                                            {formatUsdcFee(feeBreakdown.totalFeeUsdc)} USDC
                                        </Text>
                                    </View>
                                </>
                            ) : (
                                <View style={styles.detailRow}>
                                    <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Est. Fee</Text>
                                    <Text style={[styles.detailValue, { color: themeColors.textPrimary }]}>
                                        {gasError ? gasError : (estimatedGas || 'Calculating...')}
                                    </Text>
                                </View>
                            )}
                        </View>

                        {/* Biometric Warning */}
                        <View style={[styles.warningContainer, { backgroundColor: themeColors.surface }]}>
                            <Fingerprint size={24} color={Colors.primary} />
                            <Text style={[styles.warningText, { color: themeColors.textSecondary }]}>
                                You'll need to authenticate with biometrics to confirm this transaction
                            </Text>
                        </View>

                        {/* Confirm Button */}
                        <TouchableOpacity style={styles.confirmButton} onPress={handleConfirm}>
                            <Text style={styles.confirmButtonText}>Confirm</Text>
                        </TouchableOpacity>
                    </>
                );
        }
    };

    return (
        <TrueSheet
            ref={ref}
            detents={modalDetents}
            cornerRadius={Platform.OS === 'ios' ? 50 : 24}
            backgroundColor={themeColors.background}
            grabber={true}
            onDidPresent={handleSheetPresented}
            onDidDismiss={handleSheetDismissed}
        >
            <View
                style={{
                    paddingHorizontal: 24,
                    paddingTop: Platform.OS === 'android' ? 34 : 12,
                    paddingBottom: Platform.OS === 'android' ? 6 : 12,
                }}
            >
                {renderContent()}
            </View>
        </TrueSheet>
    );
});

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
        paddingBottom: Platform.OS === 'ios' ? 20 : 16,
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
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#F3F4F6',
        justifyContent: 'center',
        alignItems: 'center',
    },
    amountContainer: {
        alignItems: 'center',
        width: '100%',
        marginBottom: 32,
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
        width: '100%',
        textAlign: 'center',
        alignSelf: 'center',
    },
    detailsContainer: {
        backgroundColor: '#F9FAFB',
        borderRadius: 16,
        padding: 16,
        marginBottom: 24,
        gap: 16,
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
        paddingVertical: 40,
    },
    successContainer: {
        alignItems: 'center',
        paddingTop: 8,
        paddingBottom: 16,
    },
    successLottie: {
        width: 140,
        height: 140,
    },
    successAmount: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 28,
        marginTop: 4,
        width: '100%',
        textAlign: 'center',
    },
    successSubtitle: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 14,
        marginTop: 4,
        marginBottom: 24,
    },
    successCard: {
        width: '100%',
        borderRadius: 18,
        padding: 16,
        gap: 6,
    },
    hashRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    successActionsWrap: {
        width: '100%',
        marginTop: 24,
    },
    processingContainer: {
        alignItems: 'center',
        paddingVertical: 18,
    },
    processingLottie: {
        width: 112,
        height: 112,
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
        marginTop: 24,
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
    actionButtonsContainer: {
        marginTop: 32,
        width: '100%',
        gap: 12,
    },
    explorerButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#EEF2FF',
        paddingVertical: 14,
        borderRadius: 30,
        gap: 8,
    },
    explorerButtonText: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 14,
        color: Colors.primary,
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
