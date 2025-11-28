import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Alert, Image } from 'react-native';
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
    const { user, getAccessToken } = usePrivy();
    const { wallets } = useEmbeddedEthereumWallet();
    const wallet = wallets?.[0];

    const [document, setDocument] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedChain, setSelectedChain] = useState(CHAINS[0]);
    const [selectedToken, setSelectedToken] = useState(TOKENS[0]);
    const [isPaying, setIsPaying] = useState(false);

    useEffect(() => {
        fetchDocument();
    }, [id]);

    const fetchDocument = async () => {
        try {
            const token = await getAccessToken();
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
            const url = `${apiUrl}/api/documents/${id}`;
            console.log('[PaymentLink] Fetching document from:', url);

            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            const data = await response.json();

            if (data.success) {
                const doc = data.data.document;
                setDocument(doc);

                // Set selected chain if available
                if (doc.chain) {
                    const chain = CHAINS.find(c => c.id === doc.chain.toLowerCase());
                    if (chain) {
                        setSelectedChain(chain);
                    }
                }
            } else {
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
            router.push('/auth/login'); // Redirect to login if not logged in
            return;
        }

        if (!wallet) {
            Alert.alert('Error', 'No wallet connected');
            return;
        }

        setIsPaying(true);

        try {
            const provider = await wallet.getProvider();
            // ... use provider with ethers ...
            // For now, let's just alert since we can't easily import ethers without verifying it's installed/setup
            // But we can try to use the provider directly if it supports request

            // Map chain IDs
            const CHAIN_IDS: Record<string, string> = {
                'base': '0x2105', // 8453
                'celo': '0xa4ec', // 42220
                'arbitrum': '0xa4b1', // 42161
                'optimism': '0xa' // 10
            };

            const targetChainId = CHAIN_IDS[selectedChain.id];

            if (targetChainId) {
                try {
                    await provider.request({
                        method: 'wallet_switchEthereumChain',
                        params: [{ chainId: targetChainId }],
                    });
                } catch (error: any) {
                    // This error code indicates that the chain has not been added to MetaMask.
                    if (error.code === 4902) {
                        Alert.alert('Error', 'Please add this network to your wallet');
                    } else {
                        console.error('Switch chain error:', error);
                        // Continue anyway, maybe they are on the right chain
                    }
                }
            }

            const recipient = document?.recipient_address || wallet?.address;

            if (!recipient) {
                throw new Error('No recipient address found');
            }

            // Simple transfer
            const txHash = await provider.request({
                method: 'eth_sendTransaction',
                params: [{
                    from: wallet.address,
                    to: recipient,
                    value: '0x0', // 0 value
                    // data: ... if token transfer
                }],
            });

            console.log('Transaction sent:', txHash);
            Alert.alert('Success', `Payment sent! Tx: ${txHash}`);
        } catch (error: any) {
            console.error('Payment failed:', error);
            Alert.alert('Error', error.message || 'Payment failed');
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
                            <Text style={styles.detailValue}>{document.amount} {document.currency}</Text>
                        </View>
                        <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>Network</Text>
                            <View style={styles.selectorBadge}>
                                <Image source={selectedChain.icon} style={styles.selectorIcon} />
                                <Text style={styles.selectorText}>{selectedChain.name}</Text>
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
        width: '100%',
        maxWidth: 500,
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
    selectorBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F3F4F6',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    selectorIcon: {
        width: 20,
        height: 20,
        marginRight: 8,
        borderRadius: 10,
    },
    selectorText: {
        ...Typography.body,
        fontWeight: '500',
        color: Colors.textPrimary,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
});
