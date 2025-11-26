import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Alert, Image, Modal } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePrivy, useEmbeddedEthereumWallet } from '@privy-io/expo';
import { Wallet } from 'phosphor-react-native';
import { Colors } from '../../theme/colors';
import { Typography } from '../../styles/typography';

// Mock data for chains and tokens (replace with actual data/icons later)
const CHAINS = [
    { id: 'base', name: 'Base', icon: require('../../assets/icons/networks/base.png') },
    { id: 'celo', name: 'Celo', icon: require('../../assets/icons/networks/celo.png') },
    { id: 'arbitrum', name: 'Arbitrum', icon: require('../../assets/icons/networks/arbitrum.png') },
    { id: 'optimism', name: 'Optimism', icon: require('../../assets/icons/networks/optimism.png') },
];

const TOKENS = [
    { symbol: 'USDC', name: 'USD Coin', icon: require('../../assets/icons/tokens/usdc.png') },
    { symbol: 'USDT', name: 'Tether', icon: require('../../assets/icons/tokens/usdt.png') },
    { symbol: 'ETH', name: 'Ethereum', icon: require('../../assets/icons/tokens/eth.png') },
];

export default function PaymentLinkViewerScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const { user } = usePrivy();
    const wallet = useEmbeddedEthereumWallet();

    const [document, setDocument] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedChain, setSelectedChain] = useState(CHAINS[0]);
    const [selectedToken, setSelectedToken] = useState(TOKENS[0]);
    const [isPaying, setIsPaying] = useState(false);
    const [showPaymentModal, setShowPaymentModal] = useState(false);

    useEffect(() => {
        fetchDocument();
    }, [id]);

    const fetchDocument = async () => {
        try {
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
            const url = `${apiUrl}/api/documents/${id}`;
            console.log('[PaymentLink] Fetching document from:', url);
            console.log('[PaymentLink] Document ID:', id);

            const response = await fetch(url);
            const data = await response.json();

            console.log('[PaymentLink] Response status:', response.status);
            console.log('[PaymentLink] Response data:', JSON.stringify(data, null, 2));

            if (data.success) {
                setDocument(data.data.document);
            } else {
                console.error('[PaymentLink] Document not found:', data.error);
                Alert.alert('Error', data.error?.message || 'Payment link not found');
                router.back();
            }
        } catch (error) {
            console.error('Error fetching payment link:', error);
            Alert.alert('Error', 'Failed to load payment link');
        } finally {
            setIsLoading(false);
        }
    };

    const handlePay = async () => {
        if (!user) {
            router.push('/auth/login');
            return;
        }

        setShowPaymentModal(true);
    };

    const processPayment = async () => {
        setIsPaying(true);
        setShowPaymentModal(false);

        try {
            // Simulate blockchain transaction
            await new Promise(resolve => setTimeout(resolve, 2000));

            Alert.alert('Success', `Payment processed successfully via ${selectedChain.name} using ${selectedToken.symbol}!`);
        } catch (error) {
            Alert.alert('Error', 'Payment failed. Please try again.');
        } finally {
            setIsPaying(false);
        }
    };

    if (isLoading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={Colors.primary} />
            </View>
        );
    }

    if (!document) return null;

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={styles.card}>
                    <Text style={styles.headerTitle}>Payment Link</Text>

                    <View style={styles.detailsContainer}>
                        <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>Sold by</Text>
                            <Text style={styles.detailValue}>
                                {document.user?.first_name && document.user?.last_name
                                    ? `${document.user.first_name} ${document.user.last_name}`
                                    : document.user?.email || 'Hedwig User'}
                            </Text>
                        </View>
                        <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>For</Text>
                            <Text style={styles.detailValue}>{document.title || 'Services'}</Text>
                        </View>
                        <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>Price</Text>
                            <View style={styles.priceContainer}>
                                <Text style={styles.detailValue}>{document.amount} {document.currency}</Text>
                                <Image source={selectedToken.icon} style={styles.tokenIconSmall} />
                            </View>
                        </View>
                        <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>Network</Text>
                            <View style={styles.networkContainer}>
                                <Text style={styles.detailValue}>{selectedChain.name}</Text>
                                <Image source={selectedChain.icon} style={styles.networkIconSmall} />
                            </View>
                        </View>
                    </View>

                    {/* Pay Button */}
                    <TouchableOpacity
                        style={styles.payButton}
                        onPress={handlePay}
                        disabled={isPaying}
                    >
                        {isPaying ? (
                            <ActivityIndicator color="#FFF" />
                        ) : !user ? (
                            <>
                                <Wallet size={20} color="#FFF" weight="fill" style={{ marginRight: 8 }} />
                                <Text style={styles.payButtonText}>Connect Wallet</Text>
                            </>
                        ) : (
                            <Text style={styles.payButtonText}>Pay with wallet</Text>
                        )}
                    </TouchableOpacity>
                </View>

                <View style={styles.footer}>
                    <Text style={styles.footerText}>Secured by Hedwig</Text>
                </View>
            </ScrollView>

            {/* Payment Modal */}
            <Modal
                visible={showPaymentModal}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setShowPaymentModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Select Payment Method</Text>

                        {/* Chain Selection */}
                        <Text style={styles.modalLabel}>Network</Text>
                        <View style={styles.optionsGrid}>
                            {CHAINS.map((chain) => (
                                <TouchableOpacity
                                    key={chain.id}
                                    style={[
                                        styles.optionCard,
                                        selectedChain.id === chain.id && styles.optionCardSelected
                                    ]}
                                    onPress={() => setSelectedChain(chain)}
                                >
                                    <Image source={chain.icon} style={styles.optionIcon} />
                                    <Text style={styles.optionText}>{chain.name}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* Token Selection */}
                        <Text style={styles.modalLabel}>Token</Text>
                        <View style={styles.optionsGrid}>
                            {TOKENS.map((token) => (
                                <TouchableOpacity
                                    key={token.symbol}
                                    style={[
                                        styles.optionCard,
                                        selectedToken.symbol === token.symbol && styles.optionCardSelected
                                    ]}
                                    onPress={() => setSelectedToken(token)}
                                >
                                    <Image source={token.icon} style={styles.optionIcon} />
                                    <Text style={styles.optionText}>{token.symbol}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* Buttons */}
                        <View style={styles.modalButtons}>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.modalButtonSecondary]}
                                onPress={() => setShowPaymentModal(false)}
                            >
                                <Text style={styles.modalButtonTextSecondary}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.modalButtonPrimary]}
                                onPress={processPayment}
                            >
                                <Text style={styles.modalButtonText}>Pay Now</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F3F4F6', // Light gray background
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    scrollContent: {
        flexGrow: 1,
        justifyContent: 'center',
        padding: 20,
    },
    card: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 32,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
        alignItems: 'center',
    },
    headerTitle: {
        ...Typography.h3,
        fontWeight: '700',
        marginBottom: 32,
        textAlign: 'center',
    },
    detailsContainer: {
        width: '100%',
        gap: 16,
        marginBottom: 32,
    },
    detailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    detailLabel: {
        ...Typography.body,
        color: Colors.textSecondary,
    },
    detailValue: {
        ...Typography.body,
        fontWeight: '500',
        color: Colors.textPrimary,
    },
    priceContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    tokenIconSmall: {
        width: 16,
        height: 16,
        borderRadius: 8,
    },
    networkContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    networkIconSmall: {
        width: 16,
        height: 16,
        borderRadius: 8,
    },
    payButton: {
        backgroundColor: Colors.primary,
        borderRadius: 12,
        height: 56,
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    payButtonText: {
        ...Typography.button,
        fontWeight: '600',
        fontSize: 16,
    },
    footer: {
        marginTop: 32,
        alignItems: 'center',
    },
    footerText: {
        ...Typography.caption,
        color: Colors.textSecondary,
        fontWeight: '500',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingBottom: 17,
        paddingHorizontal: 11,
    },
    modalContent: {
        width: '100%',
        maxWidth: 418,
        height: 477,
        backgroundColor: '#f5f5f5',
        borderRadius: 50,
        borderWidth: 1,
        borderColor: '#fafafa',
        padding: 24,
        paddingBottom: 40,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: '600',
        color: Colors.textPrimary,
        marginBottom: 24,
        textAlign: 'center',
    },
    modalLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: Colors.textPrimary,
        marginBottom: 12,
        marginTop: 16,
    },
    optionsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    optionCard: {
        flex: 1,
        minWidth: '45%',
        padding: 16,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: Colors.border,
        backgroundColor: Colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
    },
    optionCardSelected: {
        borderColor: Colors.primary,
        backgroundColor: `${Colors.primary}10`,
    },
    optionIcon: {
        width: 32,
        height: 32,
        borderRadius: 16,
        marginBottom: 8,
    },
    optionText: {
        fontSize: 14,
        fontWeight: '500',
        color: Colors.textPrimary,
    },
    modalButtons: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 24,
    },
    modalButton: {
        flex: 1,
        height: 48,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    modalButtonPrimary: {
        backgroundColor: Colors.primary,
    },
    modalButtonSecondary: {
        backgroundColor: Colors.surface,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    modalButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#FFF',
    },
    modalButtonTextSecondary: {
        fontSize: 16,
        fontWeight: '600',
        color: Colors.textPrimary,
    },
});
