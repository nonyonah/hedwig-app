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
    const { user } = usePrivy();
    const wallet = useEmbeddedEthereumWallet();

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

        setIsPaying(true);
        // Simulate payment process
        setTimeout(() => {
            setIsPaying(false);
            Alert.alert('Success', 'Payment processed successfully!');
        }, 2000);
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
});
