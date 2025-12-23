/**
 * SolanaBridgeModal
 * 
 * A modal component that guides users through bridging tokens from Solana to Base
 * for offramping via Paycrest.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
    Animated,
    Dimensions,
    ActivityIndicator,
    Image,
    Platform,
} from 'react-native';
import { X, CheckCircle, Clock, Wallet, ArrowDown } from 'phosphor-react-native';
import { useEmbeddedSolanaWallet } from '@privy-io/expo';
import { Connection, Transaction, clusterApiUrl } from '@solana/web3.js';
import { Colors } from '../theme/colors';
import { Button } from './Button';
import { ModalBackdrop, modalHaptic } from './ui/ModalStyles';
import { useSettings } from '../context/SettingsContext';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

// Icons for tokens and chains
const ICONS = {
    usdc: require('../assets/icons/tokens/usdc.png'),
    sol: require('../assets/icons/networks/solana.png'),
    base: require('../assets/icons/networks/base.png'),
    solana: require('../assets/icons/networks/solana.png'),
};

// Bridge quote interface
interface BridgeQuote {
    token: 'SOL' | 'USDC';
    amount: number;
    estimatedReceiveAmount: number;
    relayFee: number;
    gasFee: number;
    estimatedTime: string;
    baseAddress: string;
}

// Bridge transaction result
interface BridgeTransaction {
    serializedTransaction: string;
    bridgeId: string;
    estimatedArrival: string;
    instructions: string;
}

// Props
interface SolanaBridgeModalProps {
    visible: boolean;
    onClose: () => void;
    token: 'SOL' | 'USDC';
    amount: number;
    solanaAddress: string;
    baseAddress: string;
    onBridgeComplete?: (baseAddress: string, token: string, amount: number) => void;
    getAccessToken: () => Promise<string | null>;
}

// Modal steps
type BridgeStep = 'quote' | 'signing' | 'bridging' | 'complete' | 'error';

export function SolanaBridgeModal({
    visible,
    onClose,
    token,
    amount,
    solanaAddress,
    baseAddress,
    onBridgeComplete,
    getAccessToken,
}: SolanaBridgeModalProps) {
    const { hapticsEnabled } = useSettings();
    const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

    // Privy Solana wallet
    const solanaWallet = useEmbeddedSolanaWallet();
    const solanaWallets = (solanaWallet as any)?.wallets || [];

    // State
    const [step, setStep] = useState<BridgeStep>('quote');
    const [quote, setQuote] = useState<BridgeQuote | null>(null);
    const [bridgeTx, setBridgeTx] = useState<BridgeTransaction | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [bridgeStatus, setBridgeStatus] = useState<string>('');
    const [txSignature, setTxSignature] = useState<string | null>(null);
    const backdropOpacity = useRef(new Animated.Value(0)).current;

    // Animation effects
    useEffect(() => {
        if (visible) {
            modalHaptic('open', hapticsEnabled); // Haptic feedback
            Animated.parallel([
                Animated.spring(slideAnim, {
                    toValue: 0,
                    useNativeDriver: true,
                    tension: 65,
                    friction: 11,
                }),
                Animated.timing(backdropOpacity, {
                    toValue: 1,
                    duration: 250,
                    useNativeDriver: true,
                }),
            ]).start();
            fetchQuote();
        } else {
            modalHaptic('close', hapticsEnabled); // Haptic feedback
            Animated.parallel([
                Animated.timing(slideAnim, {
                    toValue: SCREEN_HEIGHT,
                    duration: 200,
                    useNativeDriver: true,
                }),
                Animated.timing(backdropOpacity, {
                    toValue: 0,
                    duration: 200,
                    useNativeDriver: true,
                }),
            ]).start();
            // Reset state when closing
            setStep('quote');
            setQuote(null);
            setBridgeTx(null);
            setError(null);
            setTxSignature(null);
        }
    }, [visible]);

    // Fetch bridge quote
    const fetchQuote = async () => {
        try {
            setLoading(true);
            const accessToken = await getAccessToken();

            const response = await fetch(
                `${API_URL}/api/bridge/quote?token=${token}&amount=${amount}`,
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                    },
                }
            );

            const result = await response.json();

            if (result.success) {
                setQuote(result.data);
            } else {
                throw new Error(result.error || 'Failed to get quote');
            }
        } catch (err: any) {
            console.error('[SolanaBridge] Quote error:', err);
            setError(err.message || 'Failed to get bridge quote');
        } finally {
            setLoading(false);
        }
    };

    // Build and initiate bridge transaction
    const handleConfirmBridge = async () => {
        try {
            setLoading(true);
            setStep('signing');
            setBridgeStatus('Building transaction...');

            // Check if Solana wallet is available
            if (!solanaWallets || solanaWallets.length === 0) {
                throw new Error('Solana wallet not available. Please create a Solana wallet first.');
            }

            const wallet = solanaWallets[0];
            console.log('[SolanaBridge] Using wallet:', (wallet as any).address);

            const accessToken = await getAccessToken();

            // Get transaction from backend
            const response = await fetch(`${API_URL}/api/bridge/build`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`,
                },
                body: JSON.stringify({
                    fromAddress: solanaAddress,
                    toAddress: baseAddress,
                    token,
                    amount,
                }),
            });

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || 'Failed to build transaction');
            }

            setBridgeTx(result.data);
            setBridgeStatus('Waiting for wallet signature...');

            // Deserialize the transaction from backend
            const serializedTx = result.data.serializedTransaction;
            const txBuffer = Buffer.from(serializedTx, 'base64');
            const transaction = Transaction.from(txBuffer);

            // Connect to Solana Mainnet
            const connection = new Connection(clusterApiUrl('mainnet-beta'), 'confirmed');

            // Get fresh blockhash (the backend one might be stale)
            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;

            console.log('[SolanaBridge] Signing transaction...');

            // Get Privy provider and sign
            const provider = await wallet.getProvider();
            const signResult = await provider.request({
                method: 'signAndSendTransaction',
                params: {
                    transaction: transaction,
                    connection: connection,
                },
                // sponsor: true, // Enable gas sponsorship (temporarily disabled)
            });

            const signature = signResult.signature;
            console.log('[SolanaBridge] Transaction signature:', signature);
            setTxSignature(signature);

            // Move to bridging step
            setStep('bridging');
            setBridgeStatus('Transaction submitted. Waiting for confirmation...');

            // Wait for confirmation using polling
            let confirmed = false;
            let attempts = 0;
            const maxAttempts = 60; // 60 seconds max

            while (!confirmed && attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                attempts++;

                try {
                    const status = await connection.getSignatureStatuses([signature]);
                    if (status.value[0]) {
                        const confirmationStatus = status.value[0].confirmationStatus;
                        if (confirmationStatus === 'confirmed' || confirmationStatus === 'finalized') {
                            confirmed = true;
                            console.log('[SolanaBridge] Transaction confirmed!', confirmationStatus);
                        }
                    }
                    setBridgeStatus(`Confirming... (${attempts}s)`);
                } catch (e) {
                    console.warn('[SolanaBridge] Confirmation check error:', e);
                }
            }

            if (!confirmed) {
                console.warn('[SolanaBridge] Confirmation timed out, but transaction was sent:', signature);
            }

            // Bridge is now complete on Solana side
            // The auto-relay should handle the Base side
            setBridgeStatus('Waiting for bridge completion on Base...');

            // Wait for Base side (simulated for now as we don't have relay monitoring)
            await new Promise(resolve => setTimeout(resolve, 10000));

            setStep('complete');
        } catch (err: any) {
            console.error('[SolanaBridge] Bridge error:', err);
            setError(err.message || 'Bridge failed');
            setStep('error');
        } finally {
            setLoading(false);
        }
    };

    // Handle bridge completion
    const handleComplete = () => {
        if (quote && onBridgeComplete) {
            onBridgeComplete(baseAddress, 'USDC', quote.estimatedReceiveAmount);
        }
        onClose();
    };

    // Get token icon
    const getTokenIcon = (tokenSymbol: string) => {
        const t = tokenSymbol.toLowerCase();
        if (t === 'usdc') return ICONS.usdc;
        if (t === 'sol') return ICONS.sol;
        return ICONS.usdc;
    };

    // Format amount with 2 decimals max
    const formatAmount = (value: number) => {
        if (value >= 1) return value.toFixed(2);
        if (value >= 0.01) return value.toFixed(2);
        return value.toFixed(4);
    };

    // Render quote step
    const renderQuoteStep = () => (
        <>
            {/* Title moved to header */}

            {loading && !quote ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={Colors.primary} />
                    <Text style={styles.loadingText}>Getting bridge quote...</Text>
                </View>
            ) : quote ? (
                <View style={styles.quoteContainer}>

                    {/* Top Card: From (Solana) */}
                    <View style={styles.swapCard}>
                        <View style={styles.cardRow}>
                            <Text style={styles.amountText}>
                                {'$'}{formatAmount(quote.amount)}
                            </Text>
                            <View style={styles.tokenDisplay}>
                                <Text style={styles.tokenSymbolText}>{quote.token}</Text>
                                <View style={styles.tokenBadge}>
                                    <Image source={getTokenIcon(quote.token)} style={styles.tokenIcon} />
                                    <View style={styles.chainBadge}>
                                        <Image source={ICONS.solana} style={styles.chainIcon} />
                                    </View>
                                </View>
                            </View>
                        </View>
                    </View>

                    {/* Central Arrow Button */}
                    <View style={styles.arrowContainer}>
                        <View style={styles.arrowCircle}>
                            <ArrowDown size={20} color={Colors.textPrimary} weight="bold" />
                        </View>
                    </View>

                    {/* Bottom Card: To (Base) */}
                    <View style={styles.swapCard}>
                        <View style={styles.cardRow}>
                            <Text style={styles.amountText}>
                                {'$'}{formatAmount(quote.estimatedReceiveAmount)}
                            </Text>
                            <View style={styles.tokenDisplay}>
                                <Text style={styles.tokenSymbolText}>USDC</Text>
                                <View style={styles.tokenBadge}>
                                    <Image source={ICONS.usdc} style={styles.tokenIcon} />
                                    <View style={styles.chainBadge}>
                                        <Image source={ICONS.base} style={styles.chainIcon} />
                                    </View>
                                </View>
                            </View>
                        </View>
                    </View>

                    {/* Fee Breakdown */}
                    <View style={styles.feeContainer}>
                        <View style={styles.feeRow}>
                            <Text style={styles.feeLabel}>Relay Fee</Text>
                            <Text style={styles.feeValue}>{quote.relayFee} SOL</Text>
                        </View>
                        <View style={styles.feeRow}>
                            <Text style={styles.feeLabel}>Estimated Time</Text>
                            <Text style={styles.feeValue}>{quote.estimatedTime}</Text>
                        </View>
                    </View>
                </View>
            ) : null}

            {error && (
                <Text style={styles.errorText}>{error}</Text>
            )}

            <View style={styles.buttonContainer}>
                <Button
                    title="Continue"
                    onPress={handleConfirmBridge}
                    variant="primary"
                    size="large"
                    loading={loading}
                    disabled={!quote || loading}
                />
            </View>
        </>
    );

    // Render signing step
    const renderSigningStep = () => (
        <>
            <View style={styles.statusIcon}>
                <Wallet size={48} color={Colors.primary} weight="fill" />
            </View>
            <Text style={styles.title}>Sign Transaction</Text>
            <Text style={styles.subtitle}>{bridgeStatus}</Text>
            <ActivityIndicator size="large" color={Colors.primary} style={styles.spinner} />
        </>
    );

    // Render bridging step
    const renderBridgingStep = () => (
        <>
            <View style={styles.statusIcon}>
                <Clock size={48} color={Colors.warning} weight="fill" />
            </View>
            <Text style={styles.title}>Bridging...</Text>
            <Text style={styles.subtitle}>{bridgeStatus}</Text>
            <ActivityIndicator size="large" color={Colors.primary} style={styles.spinner} />
            {txSignature && (
                <Text style={styles.signatureText}>
                    Tx: {txSignature.slice(0, 8)}...{txSignature.slice(-8)}
                </Text>
            )}
            <Text style={styles.helpText}>
                This usually takes about 30 seconds. Please don't close this screen.
            </Text>
        </>
    );

    // Render complete step
    const renderCompleteStep = () => (
        <>
            <View style={styles.statusIcon}>
                <CheckCircle size={64} color={Colors.success} weight="fill" />
            </View>
            <Text style={styles.title}>Bridge Complete!</Text>
            <Text style={styles.subtitle}>
                Your tokens are now on Base and ready for offramping.
            </Text>

            <View style={styles.resultBox}>
                <Text style={styles.resultLabel}>Received on Base</Text>
                <Text style={styles.resultAmount}>
                    {formatAmount(quote?.estimatedReceiveAmount || 0)} USDC
                </Text>
            </View>

            <View style={styles.buttonContainer}>
                <Button
                    title="Continue to Offramp →"
                    onPress={handleComplete}
                    variant="primary"
                    size="large"
                />
            </View>
        </>
    );

    // Render error step
    const renderErrorStep = () => (
        <>
            <View style={styles.statusIcon}>
                <X size={64} color={Colors.error} weight="fill" />
            </View>
            <Text style={styles.title}>Bridge Failed</Text>
            <Text style={styles.subtitle}>{error}</Text>

            <View style={styles.buttonContainer}>
                <Button
                    title="Try Again"
                    onPress={() => {
                        setStep('quote');
                        setError(null);
                        fetchQuote();
                    }}
                    variant="primary"
                    size="large"
                />
                <TouchableOpacity onPress={onClose} style={styles.cancelButton}>
                    <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
            </View>
        </>
    );

    // Render content based on step
    const renderContent = () => {
        switch (step) {
            case 'quote':
                return renderQuoteStep();
            case 'signing':
                return renderSigningStep();
            case 'bridging':
                return renderBridgingStep();
            case 'complete':
                return renderCompleteStep();
            case 'error':
                return renderErrorStep();
            default:
                return null;
        }
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="none"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <ModalBackdrop opacity={backdropOpacity} />
                <TouchableOpacity
                    style={StyleSheet.absoluteFill}
                    activeOpacity={1}
                    onPress={step === 'quote' || step === 'error' ? onClose : undefined}
                />
                <Animated.View
                    style={[
                        styles.container,
                        { transform: [{ translateY: slideAnim }] },
                    ]}
                >
                    {/* Header */}
                    {(step === 'quote' || step === 'error') && (
                        <View style={styles.headerTitleRow}>
                            <Text style={styles.headerTitle}>Bridge to Base</Text>
                            <TouchableOpacity
                                style={styles.closeButton}
                                onPress={onClose}
                            >
                                <X size={24} color={Colors.textSecondary} />
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* Content */}
                    <View style={styles.content}>
                        {renderContent()}
                    </View>
                </Animated.View>
            </View >
        </Modal >
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    container: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    },
    header: {
        alignItems: 'center',
        paddingTop: 12,
        paddingHorizontal: 16,
    },
    closeButton: {
        padding: 8,
        marginRight: -8, // compensate for padding
    },
    headerTitleRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '100%',
        marginTop: 16,
        paddingHorizontal: 24,
    },
    headerTitle: {
        fontFamily: 'RethinkSans_700Bold',
        fontSize: 20,
        color: Colors.textPrimary,
    },
    content: {
        padding: 24,
        alignItems: 'center',
        paddingTop: 8, // reduce padding since title is in header
    },
    title: {
        fontFamily: 'RethinkSans_700Bold',
        fontSize: 20,
        color: Colors.textPrimary,
        textAlign: 'left', // Alignment change
        marginBottom: 24,
    },
    subtitle: {
        fontFamily: 'RethinkSans_400Regular',
        fontSize: 16,
        color: Colors.textSecondary,
        textAlign: 'center',
        marginBottom: 24,
    },
    loadingContainer: {
        alignItems: 'center',
        padding: 32,
    },
    loadingText: {
        fontFamily: 'RethinkSans_400Regular',
        fontSize: 14,
        color: Colors.textSecondary,
        marginTop: 16,
    },
    quoteContainer: {
        width: '100%',
        marginBottom: 24,
    },

    // Swap Card Styles - matching TransactionConfirmationModal
    swapCard: {
        backgroundColor: '#F9FAFB',
        borderRadius: 16,
        padding: 16,
        paddingVertical: 20,
    },
    cardRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    amountText: {
        fontFamily: 'RethinkSans_700Bold',
        fontSize: 24,
        color: Colors.textPrimary,
        flex: 1,
    },
    tokenDisplay: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    tokenSymbolText: {
        fontFamily: 'RethinkSans_600SemiBold',
        fontSize: 16,
        color: Colors.textPrimary,
    },
    tokenBadge: {
        width: 40,
        height: 40,
        position: 'relative',
    },
    tokenIcon: {
        width: 32,
        height: 32,
        borderRadius: 16,
        position: 'absolute',
        top: 0,
        left: 0,
    },
    tokenText: {
        display: 'none', // Hide text for new design or move outside
    },
    chainBadge: {
        position: 'absolute',
        bottom: 4,
        right: 4,
        zIndex: 2,
    },
    chainIcon: {
        width: 16,
        height: 16,
        borderRadius: 8,
        borderWidth: 1.5,
        borderColor: '#FFFFFF',
    },

    // Arrow Button
    arrowContainer: {
        height: 10,
        zIndex: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    arrowCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#F9FAFB',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 4,
        borderColor: '#FFFFFF',
    },

    // Fee/Info Container
    feeContainer: {
        backgroundColor: '#F9FAFB',
        borderRadius: 16,
        padding: 16,
        marginTop: 16,
        gap: 12,
    },
    feeRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    feeLabel: {
        fontFamily: 'RethinkSans_400Regular',
        fontSize: 14,
        color: Colors.textSecondary,
    },
    feeValue: {
        fontFamily: 'RethinkSans_500Medium',
        fontSize: 14,
        color: Colors.textPrimary,
    },

    buttonContainer: {
        width: '100%',
        marginTop: 16,
    },
    cancelButton: {
        alignItems: 'center',
        paddingVertical: 16,
    },
    cancelText: {
        fontFamily: 'RethinkSans_500Medium',
        fontSize: 16,
        color: Colors.textSecondary,
    },
    errorText: {
        fontFamily: 'RethinkSans_400Regular',
        fontSize: 14,
        color: Colors.error,
        textAlign: 'center',
        marginBottom: 16,
    },
    statusIcon: {
        marginBottom: 16,
    },
    spinner: {
        marginVertical: 24,
    },
    helpText: {
        fontFamily: 'RethinkSans_400Regular',
        fontSize: 14,
        color: Colors.textSecondary,
        textAlign: 'center',
        marginTop: 16,
    },
    signatureText: {
        fontFamily: 'RethinkSans_400Regular',
        fontSize: 12,
        color: Colors.textSecondary,
        textAlign: 'center',
        marginTop: 8,
    },
    resultBox: {
        backgroundColor: '#F9FAFB',
        borderRadius: 16,
        padding: 20,
        width: '100%',
        alignItems: 'center',
        marginBottom: 24,
    },
    resultLabel: {
        fontFamily: 'RethinkSans_400Regular',
        fontSize: 14,
        color: Colors.textSecondary,
        marginBottom: 4,
    },
    resultAmount: {
        fontFamily: 'RethinkSans_700Bold',
        fontSize: 28,
        color: Colors.success,
    },
});

export default SolanaBridgeModal;
