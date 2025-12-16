import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Animated, Dimensions, ActivityIndicator, Alert, Platform, Image } from 'react-native';
import { useEmbeddedEthereumWallet } from '@privy-io/expo';
import { ethers } from 'ethers';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Clipboard from 'expo-clipboard';
import { X, CheckCircle, Warning, Fingerprint, ArrowSquareOut, XCircle, Bank, Copy, CurrencyNgn, ArrowsDownUp } from 'phosphor-react-native';
import { Colors } from '../theme/colors';
import { Typography } from '../styles/typography';
import LottieView from 'lottie-react-native';
import * as WebBrowser from 'expo-web-browser';
import { useAuth } from '../hooks/useAuth';

const { height } = Dimensions.get('window');

// Icons for tokens and chains
const ICONS = {
    usdc: require('../assets/icons/tokens/usdc.png'),
    base: require('../assets/icons/networks/base.png'),
    celo: require('../assets/icons/networks/celo.png'),
};

// Chain configurations
const CHAINS: Record<string, any> = {
    'base': { name: 'Base Sepolia', icon: ICONS.base, type: 'evm' },
    'celo': { name: 'Celo Sepolia', icon: ICONS.celo, type: 'evm' },
};

// RPC URLs
const RPC_URLS: Record<string, string> = {
    base: 'https://base-sepolia.g.alchemy.com/v2/f69kp28_ExLI1yBQmngVL3g16oUzv2up',
    celo: 'https://forno.celo-sepolia.celo-testnet.org'
};

// Token Addresses - TESTNET
const TOKEN_ADDRESSES: Record<string, Record<string, string>> = {
    base: {
        USDC: '0x036CbD53842c5426634e7929541eC2318f3dCF7e'  // Base Sepolia Testnet USDC
    },
    celo: {
        USDC: '0x01C5C0122039549AD1493B8220cABEdD739BC44E'   // Celo Sepolia USDC
    }
};

// Chain IDs for testnet
const CHAIN_IDS: Record<string, string> = {
    base: '0x14a34',     // 84532 in hex (Base Sepolia)
    celo: '0xaa056c'     // 11142220 in hex (Celo Sepolia)
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
    const ethereumWallet = useEmbeddedEthereumWallet();
    const { getAccessToken } = useAuth();
    const evmWallets = (ethereumWallet as any)?.wallets || [];

    const [modalState, setModalState] = useState<ModalState>('confirm');
    const [orderId, setOrderId] = useState<string | null>(null);
    const [receiveAddress, setReceiveAddress] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState('');
    const [isRendered, setIsRendered] = useState(false);
    const [currentRate, setCurrentRate] = useState<string>('');
    const [estimatedFiat, setEstimatedFiat] = useState<string>('');
    const [isLoadingRate, setIsLoadingRate] = useState(false);

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

    const handleConfirm = async () => {
        if (!data) return;

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
            setModalState('awaiting_transfer');

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
                        <Text style={styles.statusTitle}>Offramp failed. Don't worry, no funds were moved.</Text>
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
                            <Text style={styles.title}>Confirm Offramp</Text>
                            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                                <X size={24} color={Colors.textSecondary} />
                            </TouchableOpacity>
                        </View>

                        {/* Amount */}
                        <View style={styles.amountContainer}>
                            <Text style={styles.amountLabel}>You're converting</Text>
                            <Text style={styles.amount}>{data.amount} {data.token}</Text>
                            <View style={styles.fiatEstimate}>
                                <CurrencyNgn size={18} color={Colors.textSecondary} />
                                <Text style={styles.fiatAmount}>
                                    {isLoadingRate ? 'Calculating...' : `≈ ${data.fiatCurrency} ${estimatedFiat || data.estimatedFiat || '...'}`}
                                </Text>
                            </View>
                        </View>

                        {/* Details */}
                        <View style={styles.detailsContainer}>
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Network</Text>
                                <View style={styles.chainBadge}>
                                    {chain?.icon && <Image source={chain.icon} style={styles.chainIcon} />}
                                    <Text style={styles.chainName}>{chain?.name || data.network}</Text>
                                </View>
                            </View>
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Exchange Rate</Text>
                                <Text style={styles.detailValue}>
                                    1 {data.token} = {isLoadingRate ? '...' : `${data.fiatCurrency} ${currentRate || data.rate || '...'}`}
                                </Text>
                            </View>
                            <View style={styles.divider} />
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Bank</Text>
                                <Text style={styles.detailValue}>{data.bankName}</Text>
                            </View>
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Account</Text>
                                <Text style={styles.detailValue}>{data.accountNumber}</Text>
                            </View>
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Name</Text>
                                <Text style={styles.detailValue}>{data.accountName}</Text>
                            </View>
                        </View>

                        {/* Biometric Warning */}
                        <View style={styles.warningContainer}>
                            <Fingerprint size={24} color={Colors.primary} />
                            <Text style={styles.warningText}>
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
        marginBottom: 24,
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
    fiatEstimate: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 8,
        gap: 4,
    },
    fiatAmount: {
        fontFamily: 'RethinkSans_500Medium',
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
        paddingVertical: 32,
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
        marginTop: 16,
        paddingHorizontal: 20,
    },
    statusSubtitle: {
        fontFamily: 'RethinkSans_400Regular',
        fontSize: 14,
        color: Colors.textSecondary,
        textAlign: 'center',
        marginTop: 8,
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
    addressContainer: {
        width: '100%',
        marginTop: 24,
        paddingHorizontal: 16,
    },
    addressLabel: {
        fontFamily: 'RethinkSans_500Medium',
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
        fontFamily: 'RethinkSans_400Regular',
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
        fontFamily: 'RethinkSans_400Regular',
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
        fontFamily: 'RethinkSans_600SemiBold',
        fontSize: 16,
        color: '#FFFFFF',
    },
});

export default OfframpConfirmationModal;
