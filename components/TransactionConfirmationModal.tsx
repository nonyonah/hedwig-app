import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Animated, Dimensions, ActivityIndicator, Alert, Platform, Image, Linking } from 'react-native';
import { useEmbeddedEthereumWallet, useEmbeddedSolanaWallet } from '@privy-io/expo';
import { ethers } from 'ethers';
import * as LocalAuthentication from 'expo-local-authentication';
import { X, CheckCircle, Warning, Fingerprint, ArrowSquareOut, XCircle } from 'phosphor-react-native';
import { Colors, useThemeColors } from '../theme/colors';
import { Typography } from '../styles/typography';
import LottieView from 'lottie-react-native';
import * as WebBrowser from 'expo-web-browser';
import { ModalBackdrop, modalHaptic } from './ui/ModalStyles';
import { useSettings } from '../context/SettingsContext';
import { useAuth } from '../hooks/useAuth';
import { SwiftUIBottomSheet } from './ios/SwiftUIBottomSheet';
import {
    Connection,
    PublicKey,
    Transaction,
    TransactionInstruction,
    SystemProgram,
    LAMPORTS_PER_SOL,
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
};

// Chain configurations with explorer URLs
// Solana is temporarily disabled
const CHAINS: Record<string, any> = {
    'base': { name: 'Base', icon: ICONS.base, explorer: 'https://basescan.org/tx/', type: 'evm' },
    'celo': { name: 'Celo', icon: ICONS.celo, explorer: 'https://celoscan.io/tx/', type: 'evm' },
    'stacks': { name: 'Stacks Mainnet', icon: require('../assets/icons/networks/stacks.png'), explorer: 'https://explorer.hiro.so/txid/', type: 'stacks' },
};

// ERC20 ABI for transfers
const ERC20_ABI = [
    "function transfer(address to, uint256 amount) returns (bool)",
    "function decimals() view returns (uint8)"
];

// Token Addresses - MAINNET
const TOKEN_ADDRESSES = {
    base: {
        USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'  // Base Mainnet USDC
    },
    celo: {
        USDC: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C'   // Celo Mainnet USDC
    },
    solana: {
        USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'  // Solana Mainnet USDC
    }
};

// Chain IDs for mainnet
const CHAIN_IDS: Record<string, string> = {
    base: '0x2105',     // 8453 in hex (Base Mainnet)
    celo: '0xa4ec'      // 42220 in hex (Celo Mainnet)
};

// RPC URLs - using Alchemy for EVM chains
const RPC_URLS: Record<string, string> = {
    base: 'https://base-mainnet.g.alchemy.com/v2/f69kp28_ExLI1yBQmngVL3g16oUzv2up',
    celo: 'https://forno.celo.org'
};

interface TransactionData {
    amount: string;
    token: string;
    recipient: string;
    network: string; // 'base' | 'celo' | 'solana'
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
        return 'Insufficient funds for gas fees. Please add more funds to your wallet to cover the transaction fee.';
    }
    if (message.includes('gas') && (message.includes('limit') || message.includes('price'))) {
        return 'Unable to estimate gas. The network may be congested. Please try again later.';
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

export const TransactionConfirmationModal: React.FC<TransactionConfirmationModalProps> = ({ visible, onClose, data, onSuccess }) => {
    const { hapticsEnabled } = useSettings();
    const themeColors = useThemeColors();
    const { getAccessToken } = useAuth();
    const ethereumWallet = useEmbeddedEthereumWallet();
    const solanaWallet = useEmbeddedSolanaWallet();

    const evmWallets = (ethereumWallet as any)?.wallets || [];
    const solanaWallets = (solanaWallet as any)?.wallets || [];

    const [modalState, setModalState] = useState<ModalState>('confirm');
    const [txHash, setTxHash] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState('');
    const [isRendered, setIsRendered] = useState(false);
    const [estimatedGas, setEstimatedGas] = useState<string | null>(null);
    const [gasError, setGasError] = useState<string | null>(null);

    const modalAnim = useRef(new Animated.Value(height)).current;
    const opacityAnim = useRef(new Animated.Value(0)).current;

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

    // Estimate gas when modal becomes visible (EVM only)
    useEffect(() => {
        const estimateGasFee = async () => {
            if (!visible || !data || modalState !== 'confirm') return;

            const network = data.network.toLowerCase();

            // Skip gas estimation for Solana
            if (isSolanaNetwork(network)) {
                setEstimatedGas('~0.000005 SOL');
                return;
            }

            try {
                setGasError(null);
                const rpcUrl = RPC_URLS[network];
                if (!rpcUrl) return;

                const rpcProvider = new ethers.JsonRpcProvider(rpcUrl);
                const tokenSymbol = data.token.toUpperCase();

                const isNative =
                    (network === 'base' && tokenSymbol === 'ETH') ||
                    (network === 'celo' && tokenSymbol === 'CELO');

                // Get wallet address
                if (!evmWallets || evmWallets.length === 0) return;
                const provider = await evmWallets[0].getProvider();
                const accounts = await provider.request({ method: 'eth_accounts' }) as string[];
                const fromAddress = accounts[0];
                if (!fromAddress) return;

                const feeData = await rpcProvider.getFeeData();
                const gasPrice = feeData.gasPrice || 1000000000n;

                let gasEstimate: bigint;
                if (isNative) {
                    const value = ethers.parseEther(data.amount);
                    gasEstimate = await rpcProvider.estimateGas({
                        from: fromAddress,
                        to: data.recipient,
                        value: value
                    });
                } else {
                    const chainTokens = TOKEN_ADDRESSES[network as keyof typeof TOKEN_ADDRESSES];
                    const tokenAddress = chainTokens ? (chainTokens as any)[tokenSymbol] : null;
                    if (!tokenAddress) return;

                    const decimals = 6;
                    const amountWei = BigInt(Math.floor(parseFloat(data.amount) * Math.pow(10, decimals)));
                    const recipientPadded = data.recipient.slice(2).toLowerCase().padStart(64, '0');
                    const amountPadded = amountWei.toString(16).padStart(64, '0');
                    const txData = '0xa9059cbb' + recipientPadded + amountPadded;

                    gasEstimate = await rpcProvider.estimateGas({
                        from: fromAddress,
                        to: tokenAddress,
                        data: txData
                    });
                }

                const gasCost = gasEstimate * gasPrice;
                const gasCostEth = ethers.formatEther(gasCost);
                const gasCostFloat = parseFloat(gasCostEth);
                const symbol = network === 'celo' ? 'CELO' : 'ETH';
                setEstimatedGas(`~${gasCostFloat.toFixed(6)} ${symbol}`);
            } catch (error: any) {
                console.log('Gas estimation error:', error.message);
                setGasError('Unable to estimate');
            }
        };

        estimateGasFee();
    }, [visible, data, evmWallets, modalState]);

    useEffect(() => {
        if (visible) {
            setIsRendered(true);
            setModalState('confirm'); // Reset state on open
            setTxHash(null);
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
            });
        }
    }, [visible]);

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

        // Connect to Solana Mainnet
        const connection = new Connection(clusterApiUrl('mainnet-beta'), 'confirmed');

        const tokenSymbol = data.token.toUpperCase();

        if (tokenSymbol === 'SOL') {
            // Native SOL transfer
            const lamports = Math.floor(parseFloat(data.amount) * LAMPORTS_PER_SOL);

            const transaction = new Transaction().add(
                SystemProgram.transfer({
                    fromPubkey: new PublicKey(fromAddress),
                    toPubkey: new PublicKey(data.recipient),
                    lamports: lamports,
                })
            );

            // Get recent blockhash
            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = new PublicKey(fromAddress);

            // Get the Privy provider
            const provider = await wallet.getProvider();

            console.log('[Solana] Sending transaction via Privy provider...');

            // Privy's EmbeddedSolanaWalletProvider expects:
            // request({ method: 'signAndSendTransaction', params: { transaction, connection } })
            const result = await provider.request({
                method: 'signAndSendTransaction',
                params: {
                    transaction: transaction,
                    connection: connection,
                },
                // sponsor: true, // Enable gas sponsorship (temporarily disabled)
            });

            const signature = result.signature;
            console.log('Solana Transaction Signature:', signature);

            // Wait for confirmation using polling (avoids WebSocket issues)
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
                            console.log('[Solana] Transaction confirmed!', confirmationStatus);
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
        } else {
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
                // Create Associated Token Account instruction
                transaction.add(
                    new TransactionInstruction({
                        keys: [
                            { pubkey: senderPubkey, isSigner: true, isWritable: true },
                            { pubkey: recipientATA, isSigner: false, isWritable: true },
                            { pubkey: recipientPubkey, isSigner: false, isWritable: false },
                            { pubkey: mintPubkey, isSigner: false, isWritable: false },
                            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
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
                // sponsor: true, // Enable gas sponsorship (temporarily disabled)
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
        }
    };

    // Handle EVM transaction (Base, Celo)
    const handleEvmTransaction = async () => {
        if (!data) throw new Error('No transaction data');

        if (!evmWallets || evmWallets.length === 0) {
            throw new Error('No wallet available. Please ensure you are logged in.');
        }

        const wallet = evmWallets[0];
        const provider = await wallet.getProvider();
        if (!provider) {
            throw new Error('Wallet provider not ready. Please try again.');
        }

        const network = data.network.toLowerCase();
        const tokenSymbol = data.token.toUpperCase();

        // Switch to the correct testnet chain
        const targetChainId = CHAIN_IDS[network];
        if (targetChainId) {
            try {
                await provider.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: targetChainId }],
                });
            } catch (switchError: any) {
                console.log('Chain switch error:', switchError);
                throw new Error(`Please switch to ${network === 'base' ? 'Base' : 'Celo'} network manually.`);
            }
        }

        // Get sender address
        const accounts = await provider.request({ method: 'eth_accounts' }) as string[];
        const fromAddress = accounts[0];
        if (!fromAddress) {
            throw new Error('No wallet address found');
        }

        console.log('=== EVM Transaction Debug ===');
        console.log('From Address:', fromAddress);
        console.log('Network:', network);
        console.log('Token:', tokenSymbol);

        // Use RPC for proper gas estimation
        const rpcUrl = RPC_URLS[network];
        if (!rpcUrl) {
            throw new Error(`No RPC URL configured for ${network}`);
        }
        const rpcProvider = new ethers.JsonRpcProvider(rpcUrl);

        // Get the current nonce
        const nonce = await rpcProvider.getTransactionCount(fromAddress, 'pending');
        const nonceHex = '0x' + nonce.toString(16);

        // Get current gas prices
        const feeData = await rpcProvider.getFeeData();
        const maxFeePerGas = feeData.maxFeePerGas || feeData.gasPrice || 1000000000n;
        const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || 1000000n;

        let transactionHash: string;

        const isNative =
            (network === 'base' && tokenSymbol === 'ETH') ||
            (network === 'celo' && tokenSymbol === 'CELO');

        if (isNative) {
            const value = ethers.parseEther(data.amount);

            // Get gas estimate
            const gasEstimate = await rpcProvider.estimateGas({
                from: fromAddress,
                to: data.recipient,
                value: value
            });

            const gasLimit = '0x' + (gasEstimate * 150n / 100n).toString(16);
            const valueHex = '0x' + value.toString(16);

            const txParams = {
                from: fromAddress,
                to: data.recipient,
                value: valueHex,
                gasLimit: gasLimit,
                nonce: nonceHex,
                maxFeePerGas: '0x' + maxFeePerGas.toString(16),
                maxPriorityFeePerGas: '0x' + maxPriorityFeePerGas.toString(16),
                chainId: targetChainId
            };

            console.log('Native TX Params:', JSON.stringify(txParams, null, 2));

            transactionHash = await provider.request({
                method: 'eth_sendTransaction',
                params: [txParams],
                // sponsor: true, // Enable gas sponsorship (temporarily disabled)
            }) as string;

        } else {
            // ERC20 Transfer
            const chainTokens = TOKEN_ADDRESSES[network as keyof typeof TOKEN_ADDRESSES];
            const tokenAddress = chainTokens ? (chainTokens as any)[tokenSymbol] : null;

            if (!tokenAddress) {
                throw new Error(`Token ${tokenSymbol} not supported on ${network}`);
            }

            const decimals = 6;
            const amountWei = BigInt(Math.floor(parseFloat(data.amount) * Math.pow(10, decimals)));
            const recipientPadded = data.recipient.slice(2).toLowerCase().padStart(64, '0');
            const amountPadded = amountWei.toString(16).padStart(64, '0');
            const txData = '0xa9059cbb' + recipientPadded + amountPadded;

            const gasEstimate = await rpcProvider.estimateGas({
                from: fromAddress,
                to: tokenAddress,
                data: txData
            });

            const gasLimit = '0x' + (gasEstimate * 150n / 100n).toString(16);

            const txParams = {
                from: fromAddress,
                to: tokenAddress,
                data: txData,
                gasLimit: gasLimit,
                nonce: nonceHex,
                maxFeePerGas: '0x' + maxFeePerGas.toString(16),
                maxPriorityFeePerGas: '0x' + maxPriorityFeePerGas.toString(16),
                chainId: targetChainId
            };

            console.log('ERC20 TX Params:', JSON.stringify(txParams, null, 2));

            transactionHash = await provider.request({
                method: 'eth_sendTransaction',
                params: [txParams],
                // sponsor: true, // Enable gas sponsorship (temporarily disabled)
            }) as string;
        }

        console.log('Transaction Hash:', transactionHash);

        // Wait for confirmation
        const receipt = await rpcProvider.waitForTransaction(transactionHash);
        if (!receipt || receipt.status !== 1) {
            throw new Error('Transaction failed on-chain');
        }

        return transactionHash;
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
            let transactionHash: string;

            if (isSolanaNetwork(network)) {
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
                        chain: network.toUpperCase() === 'SOLANA' ? 'SOLANA' : network.toUpperCase() === 'BASE' ? 'BASE' : 'CELO',
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
        const chainInfo = CHAINS[network];
        if (chainInfo && chainInfo.explorer) {
            let url = chainInfo.explorer + txHash;
            // Add cluster param for Solana
            if (chainInfo.type === 'solana' && chainInfo.cluster) {
                url += `?cluster=${chainInfo.cluster}`;
            }
            await WebBrowser.openBrowserAsync(url);
        }
    };

    if (!isRendered || !data) return null;

    const network = normalizeNetwork(data.network);
    const chain = CHAINS[network] || CHAINS['solana'];

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
                        <Text style={[styles.statusTitle, { color: themeColors.textPrimary }]}>We're doing the thing...</Text>
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
                        <Text style={[styles.statusTitle, { color: themeColors.textPrimary }]}>Transaction has been completed successfully</Text>

                        <View style={styles.actionButtonsContainer}>
                            <TouchableOpacity style={[styles.explorerButton, { backgroundColor: themeColors.surface }]} onPress={openExplorer}>
                                <Text style={styles.explorerButtonText}>View on Block Explorer</Text>
                                <ArrowSquareOut size={20} color={Colors.primary} />
                            </TouchableOpacity>

                            <TouchableOpacity style={styles.closeButtonMain} onPress={onClose}>
                                <Text style={styles.closeButtonText}>Close Page</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                );
            case 'failed':
                return (
                    <View style={styles.statusContainer}>
                        <XCircle size={120} color={Colors.error || '#EF4444'} weight="fill" style={{ marginBottom: 24 }} />
                        <Text style={[styles.statusTitle, { color: themeColors.textPrimary }]}>Transaction failed. Don't worry your funds are safe.</Text>
                        <Text style={styles.errorMessage}>{statusMessage}</Text>
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
                            <Text style={[styles.title, { color: themeColors.textPrimary }]}>Confirm Transaction</Text>
                            <TouchableOpacity style={[styles.closeButton, { backgroundColor: themeColors.surface }]} onPress={onClose}>
                                <X size={20} color={themeColors.textSecondary} weight="bold" />
                            </TouchableOpacity>
                        </View>

                        {/* Amount */}
                        <View style={styles.amountContainer}>
                            <Text style={[styles.amountLabel, { color: themeColors.textSecondary }]}>You're sending</Text>
                            <Text style={[styles.amount, { color: themeColors.textPrimary }]}>{data.amount} {data.token}</Text>
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
                            <View style={styles.detailRow}>
                                <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Est. Fee</Text>
                                <Text style={[styles.detailValue, { color: themeColors.textPrimary }]}>
                                    {gasError ? gasError : (estimatedGas || 'Calculating...')}
                                </Text>
                            </View>
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

    // iOS: Use native SwiftUI BottomSheet
    if (Platform.OS === 'ios') {
        return (
            <SwiftUIBottomSheet isOpen={isRendered} onClose={onClose} height={0.55}>
                <View style={[styles.iosContent, { backgroundColor: themeColors.background }]}>
                    {renderContent()}
                </View>
            </SwiftUIBottomSheet>
        );
    }

    // Android: Use existing Modal
    return (
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
                        { backgroundColor: themeColors.background },
                        { transform: [{ translateY: modalAnim }] }
                    ]}
                >
                    {renderContent()}
                </Animated.View>
            </View>
        </Modal>
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
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#F3F4F6',
        justifyContent: 'center',
        alignItems: 'center',
    },
    amountContainer: {
        alignItems: 'center',
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
