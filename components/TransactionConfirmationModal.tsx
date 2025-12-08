import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Animated, Dimensions, ActivityIndicator, Alert, Platform, Image, Linking } from 'react-native';
import { useEmbeddedEthereumWallet } from '@privy-io/expo';
import { ethers } from 'ethers';
import * as LocalAuthentication from 'expo-local-authentication';
import { X, CheckCircle, Warning, Fingerprint, ArrowSquareOut, XCircle } from 'phosphor-react-native';
import { Colors } from '../theme/colors';
import { Typography } from '../styles/typography';
import LottieView from 'lottie-react-native';
import * as WebBrowser from 'expo-web-browser';

const { height } = Dimensions.get('window');

// Icons for tokens and chains
const ICONS = {
    usdc: require('../assets/icons/tokens/usdc.png'),
    base: require('../assets/icons/networks/base.png'),
    celo: require('../assets/icons/networks/celo.png'),
};

const CHAINS: Record<string, any> = {
    'base': { name: 'Base', icon: ICONS.base, explorer: 'https://sepolia.basescan.org/tx/' },
    'celo': { name: 'Celo', icon: ICONS.celo, explorer: 'https://alfajores.celoscan.io/tx/' },
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
        cUSD: '0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1'   // Celo Alfajores Testnet cUSD
    }
};

// Chain IDs for testnet
const CHAIN_IDS: Record<string, string> = {
    base: '0x14a34',    // 84532 in hex (Base Sepolia)
    celo: '0xaef3'      // 44787 in hex (Celo Alfajores)
};

// RPC URLs - using Alchemy
const RPC_URLS: Record<string, string> = {
    base: 'https://base-sepolia.g.alchemy.com/v2/f69kp28_ExLI1yBQmngVL3g16oUzv2up',
    celo: 'https://celo-sepolia.g.alchemy.com/v2/f69kp28_ExLI1yBQmngVL3g16oUzv2up'
};

interface TransactionData {
    amount: string;
    token: string;
    recipient: string;
    network: string; // 'base' | 'celo'
}

interface TransactionConfirmationModalProps {
    visible: boolean;
    onClose: () => void;
    data: TransactionData | null;
    onSuccess?: (hash: string) => void;
}

type ModalState = 'confirm' | 'processing' | 'success' | 'failed';

export const TransactionConfirmationModal: React.FC<TransactionConfirmationModalProps> = ({ visible, onClose, data, onSuccess }) => {
    const { wallets } = useEmbeddedEthereumWallet();
    const [modalState, setModalState] = useState<ModalState>('confirm');
    const [txHash, setTxHash] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState('');
    const [isRendered, setIsRendered] = useState(false);
    const [estimatedGas, setEstimatedGas] = useState<string | null>(null);
    const [gasError, setGasError] = useState<string | null>(null);

    const modalAnim = useRef(new Animated.Value(height)).current;
    const opacityAnim = useRef(new Animated.Value(0)).current;

    // Estimate gas when modal becomes visible
    useEffect(() => {
        const estimateGasFee = async () => {
            if (!visible || !data || modalState !== 'confirm') return;

            try {
                setGasError(null);
                const network = data.network.toLowerCase();
                const rpcUrl = RPC_URLS[network];
                if (!rpcUrl) return;

                const rpcProvider = new ethers.JsonRpcProvider(rpcUrl);
                const tokenSymbol = data.token.toUpperCase();

                const isNative =
                    (network === 'base' && tokenSymbol === 'ETH') ||
                    (network === 'celo' && tokenSymbol === 'CELO');

                // Get wallet address
                if (wallets && wallets.length > 0) {
                    const wallet = wallets[0];
                    const provider = await wallet.getProvider();
                    const accounts = await provider.request({ method: 'eth_accounts' }) as string[];
                    const fromAddress = accounts[0];

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
                        const tokenAddress = chainTokens ? chainTokens[tokenSymbol as keyof typeof chainTokens] : null;
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

                    // Get gas price
                    const feeData = await rpcProvider.getFeeData();
                    const gasPrice = feeData.gasPrice || 0n;
                    const gasCost = gasEstimate * gasPrice;
                    const gasCostEth = ethers.formatEther(gasCost);

                    // Format to reasonable decimal places
                    const formatted = parseFloat(gasCostEth).toFixed(8);
                    setEstimatedGas(`~${formatted} ETH`);
                }
            } catch (err: any) {
                console.log('Gas estimation error:', err);
                setGasError('Unable to estimate');
            }
        };

        estimateGasFee();
    }, [visible, data, wallets, modalState]);

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

            // Get provider from the embedded wallet hook per Privy docs
            if (!wallets || wallets.length === 0) {
                throw new Error('No wallet available. Please ensure you are logged in.');
            }

            const wallet = wallets[0];
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
                    throw new Error(`Please switch to ${network === 'base' ? 'Base Sepolia' : 'Celo'} testnet manually.`);
                }
            }

            // Get sender address
            const accounts = await provider.request({ method: 'eth_accounts' }) as string[];
            const fromAddress = accounts[0];
            if (!fromAddress) {
                throw new Error('No wallet address found');
            }

            console.log('=== Transaction Debug ===');
            console.log('From Address:', fromAddress);
            console.log('Network:', network);
            console.log('Token:', tokenSymbol);

            // Use Alchemy RPC for proper gas estimation
            const rpcUrl = RPC_URLS[network];
            if (!rpcUrl) {
                throw new Error(`No RPC URL configured for ${network}`);
            }
            const rpcProvider = new ethers.JsonRpcProvider(rpcUrl);

            // Get the current nonce from Alchemy RPC
            const nonce = await rpcProvider.getTransactionCount(fromAddress, 'pending');
            const nonceHex = '0x' + nonce.toString(16);
            console.log('Nonce:', nonce, 'Hex:', nonceHex);

            // Get current gas prices from Alchemy
            const feeData = await rpcProvider.getFeeData();
            const maxFeePerGas = feeData.maxFeePerGas || feeData.gasPrice || 1000000000n;
            const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || 1000000n;
            console.log('Max Fee Per Gas:', maxFeePerGas.toString());
            console.log('Max Priority Fee:', maxPriorityFeePerGas.toString());

            let transactionHash: string;

            const isNative =
                (network === 'base' && tokenSymbol === 'ETH') ||
                (network === 'celo' && tokenSymbol === 'CELO');

            if (isNative) {
                const value = ethers.parseEther(data.amount);

                // Get gas estimate from Alchemy RPC
                const gasEstimate = await rpcProvider.estimateGas({
                    from: fromAddress,
                    to: data.recipient,
                    value: value
                });

                // Add 50% buffer to be safe
                const gasLimit = '0x' + (gasEstimate * 150n / 100n).toString(16);
                const valueHex = '0x' + value.toString(16);
                console.log('Estimated Gas (Native):', gasEstimate.toString(), 'Limit:', gasLimit);

                // Build complete transaction parameters
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

                console.log('=== Full Transaction Params (Native) ===');
                console.log(JSON.stringify(txParams, null, 2));

                // Send using provider.request
                transactionHash = await provider.request({
                    method: 'eth_sendTransaction',
                    params: [txParams]
                }) as string;

            } else {
                // ERC20 Transfer
                const chainTokens = TOKEN_ADDRESSES[network as keyof typeof TOKEN_ADDRESSES];
                const tokenAddress = chainTokens ? chainTokens[tokenSymbol as keyof typeof chainTokens] : null;

                if (!tokenAddress) {
                    throw new Error(`Token ${tokenSymbol} not supported on ${network}`);
                }

                const decimals = 6;
                const amountWei = BigInt(Math.floor(parseFloat(data.amount) * Math.pow(10, decimals)));
                const recipientPadded = data.recipient.slice(2).toLowerCase().padStart(64, '0');
                const amountPadded = amountWei.toString(16).padStart(64, '0');
                const txData = '0xa9059cbb' + recipientPadded + amountPadded;

                // Get gas estimate from Alchemy RPC
                const gasEstimate = await rpcProvider.estimateGas({
                    from: fromAddress,
                    to: tokenAddress,
                    data: txData
                });

                // Add 50% buffer
                const gasLimit = '0x' + (gasEstimate * 150n / 100n).toString(16);
                console.log('Estimated Gas (ERC20):', gasEstimate.toString(), 'Limit:', gasLimit);

                // Build complete transaction parameters
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

                console.log('=== Full Transaction Params ===');
                console.log(JSON.stringify(txParams, null, 2));

                // Send using provider.request
                transactionHash = await provider.request({
                    method: 'eth_sendTransaction',
                    params: [txParams]
                }) as string;
            }

            console.log('Transaction Hash:', transactionHash);
            setTxHash(transactionHash);

            // Wait for transaction confirmation using Alchemy RPC
            // We'll trust the hash is valid and move to success, but let's wait min 1 confirmation logic
            // Actually user image says "Expect funds within 2-5 minutes" after "Swap completed successfully".
            // So we can show success immediately after broadcast?
            // "We're doing the thing..." -> Success.
            // Let's at least wait for broadcast confirmation or maybe just a short delay to simulate "doing the thing" nicely if RPC is fast.
            // But real reliability needs wait. Let's wait for 1 confirmation.

            const receipt = await rpcProvider.waitForTransaction(transactionHash);

            if (receipt && receipt.status === 1) {
                setModalState('success');
                if (onSuccess) onSuccess(transactionHash);
            } else {
                throw new Error('Transaction failed on-chain');
            }

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
            await WebBrowser.openBrowserAsync(chainInfo.explorer + txHash);
        }
    };

    if (!isRendered || !data) return null;

    const chain = CHAINS[data.network.toLowerCase()];

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
                        <Text style={styles.statusTitle}>We’re doing the thing...</Text>
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
                        <Text style={styles.statusTitle}>Swap failed. Don't worry your funds will be refunded to your wallet.</Text>
                        <TouchableOpacity style={styles.closeButtonMain} onPress={onClose}>
                            <Text style={styles.closeButtonText}>Close Page</Text>
                        </TouchableOpacity>
                    </View>
                );
            case 'confirm':
            default:
                return (
                    <>
                        <View style={styles.header}>
                            <Text style={styles.title}>Confirm Transaction</Text>
                            <TouchableOpacity onPress={onClose} style={styles.closeIcon}>
                                <X size={24} color={Colors.textSecondary} />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.detailsContainer}>
                            <View style={styles.amountContainer}>
                                <Text style={styles.amountValue}>{data.amount}</Text>
                                <View style={styles.tokenBadge}>
                                    <Image source={ICONS.usdc} style={styles.tokenIcon} />
                                    <Text style={styles.amountToken}>{data.token}</Text>
                                </View>
                            </View>

                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>To</Text>
                                <Text style={styles.detailValue} numberOfLines={1} ellipsizeMode="middle">
                                    {data.recipient}
                                </Text>
                            </View>

                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Network</Text>
                                <View style={styles.networkValueContainer}>
                                    {chain && <Image source={chain.icon} style={styles.networkIcon} />}
                                    <Text style={[styles.detailValue, { textTransform: 'capitalize' }]}>
                                        {data.network}
                                    </Text>
                                </View>
                            </View>

                            <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
                                <Text style={styles.detailLabel}>Estimated Gas</Text>
                                <Text style={[styles.detailValue, gasError && { color: Colors.error || '#EF4444' }]}>
                                    {gasError ? gasError : (estimatedGas || 'Estimating...')}
                                </Text>
                            </View>
                        </View>

                        <View style={styles.warningContainer}>
                            <Fingerprint size={20} color={Colors.primary} />
                            <Text style={styles.warningText}>Biometric authentication required</Text>
                        </View>

                        <TouchableOpacity
                            style={styles.confirmButton}
                            onPress={handleConfirm}
                        >
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
            onRequestClose={onClose}
        >
            <View style={styles.modalOverlay}>
                <Animated.View
                    style={[
                        styles.modalContent,
                        modalState !== 'confirm' && styles.modalContentCenter,
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
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: 'white',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 24,
        paddingBottom: 40,
        minHeight: 450,
    },
    modalContentCenter: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 32,
    },
    title: {
        fontSize: 20,
        fontWeight: '700',
        color: Colors.textPrimary,
        fontFamily: 'InterTight_700Bold',
    },
    closeIcon: {
        padding: 4,
    },
    detailsContainer: {
        backgroundColor: '#F9FAFB',
        borderRadius: 16,
        padding: 20,
        marginBottom: 24,
    },
    amountContainer: {
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
        gap: 8,
    },
    amountValue: {
        fontSize: 40,
        fontWeight: '700',
        color: Colors.textPrimary,
        fontFamily: 'InterTight_700Bold',
    },
    tokenBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        gap: 6,
    },
    tokenIcon: {
        width: 20,
        height: 20,
        borderRadius: 10,
    },
    amountToken: {
        fontSize: 16,
        fontWeight: '600',
        color: Colors.textPrimary,
        fontFamily: 'InterTight_600SemiBold',
    },
    detailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
    },
    detailLabel: {
        fontSize: 14,
        color: Colors.textSecondary,
        fontFamily: 'InterTight_400Regular',
    },
    detailValue: {
        fontSize: 14,
        fontWeight: '600',
        color: Colors.textPrimary,
        maxWidth: '70%',
        fontFamily: 'InterTight_600SemiBold',
    },
    networkValueContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    networkIcon: {
        width: 20,
        height: 20,
        borderRadius: 10,
    },
    warningContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginBottom: 24,
    },
    warningText: {
        fontSize: 12,
        color: Colors.textSecondary,
        fontFamily: 'InterTight_400Regular',
    },
    confirmButton: {
        backgroundColor: Colors.primary,
        padding: 18,
        borderRadius: 16,
        alignItems: 'center',
    },
    confirmButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: 'white',
        fontFamily: 'InterTight_600SemiBold',
    },
    // Status Styles
    statusContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        paddingVertical: 32,
    },
    lottie: {
        width: 150,
        height: 150,
        marginBottom: 24,
    },
    statusTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: Colors.textPrimary,
        textAlign: 'center',
        marginBottom: 32,
        lineHeight: 26,
        fontFamily: 'InterTight_600SemiBold',
        paddingHorizontal: 20,
    },
    actionButtonsContainer: {
        width: '100%',
        gap: 16,
    },
    closeButtonMain: {
        backgroundColor: Colors.primary,
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
        width: '100%',
    },
    closeButtonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '600',
        fontFamily: 'InterTight_600SemiBold',
    },
    explorerButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        gap: 8,
    },
    explorerButtonText: {
        color: Colors.primary,
        fontSize: 16,
        fontWeight: '600',
        fontFamily: 'InterTight_600SemiBold',
    }
});
