import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Animated, Dimensions, ActivityIndicator, Alert, Platform, Image, Linking } from 'react-native';
import { useEmbeddedEthereumWallet, useEmbeddedSolanaWallet } from '@privy-io/expo';
import { ethers } from 'ethers';
import * as LocalAuthentication from 'expo-local-authentication';
import { X, CheckCircle, Warning, Fingerprint, ArrowSquareOut, XCircle } from 'phosphor-react-native';
import { Colors } from '../theme/colors';
import { Typography } from '../styles/typography';
import LottieView from 'lottie-react-native';
import * as WebBrowser from 'expo-web-browser';
import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, clusterApiUrl } from '@solana/web3.js';

const { height } = Dimensions.get('window');

// Icons for tokens and chains
const ICONS = {
    usdc: require('../assets/icons/tokens/usdc.png'),
    base: require('../assets/icons/networks/base.png'),
    celo: require('../assets/icons/networks/celo.png'),
    solana: require('../assets/icons/networks/solana.png'),
};

// Chain configurations with explorer URLs
const CHAINS: Record<string, any> = {
    'base': { name: 'Base Sepolia', icon: ICONS.base, explorer: 'https://sepolia.basescan.org/tx/', type: 'evm' },
    'celo': { name: 'Celo Sepolia', icon: ICONS.celo, explorer: 'https://celo-sepolia.celoscan.io/tx/', type: 'evm' },
    'solana': { name: 'Solana Devnet', icon: ICONS.solana, explorer: 'https://explorer.solana.com/tx/', type: 'solana', cluster: 'devnet' },
    'solana_devnet': { name: 'Solana Devnet', icon: ICONS.solana, explorer: 'https://explorer.solana.com/tx/', type: 'solana', cluster: 'devnet' },
};

// ERC20 ABI for transfers
const ERC20_ABI = [
    "function transfer(address to, uint256 amount) returns (bool)",
    "function decimals() view returns (uint8)"
];

// Token Addresses - TESTNET
const TOKEN_ADDRESSES = {
    base: {
        USDC: '0x036CbD53842c5426634e7929541eC2318f3dCF7e'  // Base Sepolia Testnet USDC
    },
    celo: {
        USDC: '0x01C5C0122039549AD1493B8220cABEdD739BC44E'   // Celo Sepolia USDC
    },
    solana: {
        USDC: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'  // Solana Devnet USDC
    }
};

// Chain IDs for testnet
const CHAIN_IDS: Record<string, string> = {
    base: '0x14a34',     // 84532 in hex (Base Sepolia)
    celo: '0xaa056c'     // 11142220 in hex (Celo Sepolia)
};

// RPC URLs - using Alchemy for EVM chains
const RPC_URLS: Record<string, string> = {
    base: 'https://base-sepolia.g.alchemy.com/v2/f69kp28_ExLI1yBQmngVL3g16oUzv2up',
    celo: 'https://forno.celo-sepolia.celo-testnet.org'
};

interface TransactionData {
    amount: string;
    token: string;
    recipient: string;
    network: string; // 'base' | 'celo' | 'solana' | 'solana_devnet'
}

interface TransactionConfirmationModalProps {
    visible: boolean;
    onClose: () => void;
    data: TransactionData | null;
    onSuccess?: (hash: string) => void;
}

type ModalState = 'confirm' | 'processing' | 'success' | 'failed';

export const TransactionConfirmationModal: React.FC<TransactionConfirmationModalProps> = ({ visible, onClose, data, onSuccess }) => {
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
        if (n === 'solana' || n === 'solana devnet' || n === 'solanadevnet') {
            return 'solana_devnet';
        }
        return n;
    };

    // Helper to determine if network is Solana
    const isSolanaNetwork = (network: string): boolean => {
        const normalized = normalizeNetwork(network);
        return normalized === 'solana' || normalized === 'solana_devnet';
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

        // Connect to Solana Devnet
        const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');

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

            // Privy's Solana provider expects the transaction object directly
            // Use signAndSendTransaction with the transaction object
            let signature: string;

            try {
                // Try using the provider's signAndSendTransaction method
                // Privy expects: { transaction: Transaction } or just the transaction
                const result = await provider.signAndSendTransaction(transaction);
                signature = typeof result === 'string' ? result : result.signature;
            } catch (providerError: any) {
                console.log('Provider signAndSendTransaction failed, trying request method:', providerError.message);

                // Fallback: try using provider.request with serialized transaction
                const serializedTransaction = transaction.serialize({
                    requireAllSignatures: false,
                    verifySignatures: false
                });

                const base64Transaction = Buffer.from(serializedTransaction).toString('base64');

                const result = await provider.request({
                    method: 'signAndSendTransaction',
                    params: {
                        transaction: base64Transaction,
                    },
                });

                signature = typeof result === 'string' ? result : (result as any).signature;
            }

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
            // SPL Token transfer (USDC, etc.) - For now, throw not implemented
            throw new Error(`SPL Token transfers (${tokenSymbol}) coming soon. Please use SOL for now.`);
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
                throw new Error(`Please switch to ${network === 'base' ? 'Base Sepolia' : 'Celo Sepolia'} testnet manually.`);
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
                params: [txParams]
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
                params: [txParams]
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
            } else {
                transactionHash = await handleEvmTransaction();
            }

            setTxHash(transactionHash);
            setModalState('success');
            if (onSuccess) onSuccess(transactionHash);

        } catch (error: any) {
            console.error('Transaction Failed:', error);
            setStatusMessage(error.message || 'Unknown error');
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
    const chain = CHAINS[network] || CHAINS['solana_devnet'];

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
                        <Text style={styles.statusTitle}>We're doing the thing...</Text>
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
                        <Text style={styles.statusTitle}>Transaction has been completed successfully</Text>

                        <View style={styles.actionButtonsContainer}>
                            <TouchableOpacity style={styles.explorerButton} onPress={openExplorer}>
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
                        <Text style={styles.statusTitle}>Transaction failed. Don't worry your funds are safe.</Text>
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
                            <Text style={styles.title}>Confirm Transaction</Text>
                            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                                <X size={24} color={Colors.textSecondary} />
                            </TouchableOpacity>
                        </View>

                        {/* Amount */}
                        <View style={styles.amountContainer}>
                            <Text style={styles.amountLabel}>You're sending</Text>
                            <Text style={styles.amount}>{data.amount} {data.token}</Text>
                        </View>

                        {/* Details */}
                        <View style={styles.detailsContainer}>
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>To</Text>
                                <Text style={styles.detailValue} numberOfLines={1} ellipsizeMode="middle">
                                    {data.recipient.slice(0, 8)}...{data.recipient.slice(-6)}
                                </Text>
                            </View>
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Network</Text>
                                <View style={styles.chainBadge}>
                                    {chain?.icon && <Image source={chain.icon} style={styles.chainIcon} />}
                                    <Text style={styles.chainName}>{chain?.name || data.network}</Text>
                                </View>
                            </View>
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Est. Fee</Text>
                                <Text style={styles.detailValue}>
                                    {gasError ? gasError : (estimatedGas || 'Calculating...')}
                                </Text>
                            </View>
                        </View>

                        {/* Biometric Warning */}
                        <View style={styles.warningContainer}>
                            <Fingerprint size={24} color={Colors.primary} />
                            <Text style={styles.warningText}>
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
        <Modal
            visible={isRendered}
            transparent={true}
            animationType="none"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <Animated.View
                    style={[
                        StyleSheet.absoluteFill,
                        { backgroundColor: 'rgba(0,0,0,0.5)', opacity: opacityAnim }
                    ]}
                />
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
        fontFamily: 'RethinkSans_700Bold',
        fontSize: 20,
        color: Colors.textPrimary,
    },
    closeButton: {
        padding: 4,
    },
    amountContainer: {
        alignItems: 'center',
        marginBottom: 32,
    },
    amountLabel: {
        fontFamily: 'RethinkSans_400Regular',
        fontSize: 14,
        color: Colors.textSecondary,
        marginBottom: 8,
    },
    amount: {
        fontFamily: 'RethinkSans_700Bold',
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
        fontFamily: 'RethinkSans_400Regular',
        fontSize: 14,
        color: Colors.textSecondary,
    },
    detailValue: {
        fontFamily: 'RethinkSans_500Medium',
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
        fontFamily: 'RethinkSans_500Medium',
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
        fontFamily: 'RethinkSans_400Regular',
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
        fontFamily: 'RethinkSans_600SemiBold',
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
        fontFamily: 'RethinkSans_600SemiBold',
        fontSize: 18,
        color: Colors.textPrimary,
        textAlign: 'center',
        marginTop: 24,
        paddingHorizontal: 20,
    },
    errorMessage: {
        fontFamily: 'RethinkSans_400Regular',
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
        fontFamily: 'RethinkSans_500Medium',
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
        fontFamily: 'RethinkSans_600SemiBold',
        fontSize: 16,
        color: '#FFFFFF',
    },
});
