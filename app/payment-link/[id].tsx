import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Alert, Image } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import '@walletconnect/react-native-compat';
import { AppKitProvider, useAppKit, useAccount, useProvider } from '@reown/appkit-react-native';
import { paymentAppKit } from '../../lib/appkit';
import { ethers } from 'ethers';
import { Wallet, CheckCircle } from 'phosphor-react-native';
import { Colors } from '../../theme/colors';
import { Button } from '../../components/Button';

// Mock data for chains and tokens (replace with actual data/icons later)
const CHAINS = [
    { id: 'base', name: 'Base', icon: require('../../assets/icons/networks/base.png') },
    { id: 'celo', name: 'Celo', icon: require('../../assets/icons/networks/celo.png') },
    { id: 'solana', name: 'Solana', icon: require('../../assets/icons/networks/solana.png') },
];

const TOKENS = [
    { symbol: 'USDC', name: 'USD Coin', icon: require('../../assets/icons/tokens/usdc.png') },
    { symbol: 'USDT', name: 'Tether', icon: require('../../assets/icons/tokens/usdt.png') },
    { symbol: 'ETH', name: 'Ethereum', icon: require('../../assets/icons/tokens/eth.png') },
];

// Main component wrapped with AppKitProvider
export default function PaymentLinkViewerScreen() {
    return (
        <AppKitProvider instance={paymentAppKit}>
            <PaymentLinkContent />
        </AppKitProvider>
    );
}

// Inner component with AppKit hooks
function PaymentLinkContent() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const { open } = useAppKit();
    const { address, isConnected, chainId } = useAccount();
    const provider = useProvider();

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
            // On web, default to localhost if no env var is set, to avoid IP issues
            let apiUrl = process.env.EXPO_PUBLIC_API_URL;
            if (!apiUrl && typeof window !== 'undefined') {
                apiUrl = 'http://localhost:3000';
            }
            apiUrl = apiUrl || 'http://localhost:3000';

            const url = `${apiUrl}/api/documents/${id}`;
            console.log('[PaymentLink] Fetching document from:', url);

            // No authentication needed - this is a public link for clients
            const response = await fetch(url);

            console.log('[PaymentLink] Response status:', response.status);
            const data = await response.json();
            console.log('[PaymentLink] Response data:', JSON.stringify(data, null, 2));

            if (data.success) {
                const doc = data.data.document;
                console.log('[PaymentLink] Document loaded:', doc);
                setDocument(doc);

                // Set selected chain if available
                if (doc.chain) {
                    const chain = CHAINS.find(c => c.id === doc.chain.toLowerCase());
                    if (chain) {
                        setSelectedChain(chain);
                    }
                }
            } else {
                console.error('[PaymentLink] Error response:', data.error);
                Alert.alert('Error', data.error?.message || 'Payment link not found');
                // On web, router.back() might not work if opened directly
                if (typeof window === 'undefined') {
                    router.back();
                }
            }
        } catch (error) {
            console.error('Error fetching payment link:', error);
            // Don't just alert, log it visible
            if (typeof window !== 'undefined') {
                console.error('Fetch error details:', error);
            }
            Alert.alert('Error', 'Failed to load payment link. Please check your connection.');
        } finally {
            setIsLoading(false);
        }
    };

    const handlePay = async () => {
        if (!isConnected) {
            // Open AppKit modal to connect wallet
            open();
            return;
        }

        if (!address) {
            Alert.alert('Error', 'No wallet connected');
            return;
        }

        setIsPaying(true);

        try {
            // Get ethers provider from AppKit
            const ethersProvider = new ethers.BrowserProvider(provider as any);
            const signer = await ethersProvider.getSigner();

            // Map chain IDs
            const CHAIN_IDS: Record<string, number> = {
                'base': 8453,
                'celo': 42220,
                'arbitrum': 42161,
                'optimism': 10
            };

            const targetChainId = CHAIN_IDS[selectedChain.id];

            // Check if we're on the right chain
            if (targetChainId && chainId !== targetChainId) {
                Alert.alert('Wrong Network', `Please switch to ${selectedChain.name} in your wallet`);
                setIsPaying(false);
                return;
            }

            const recipient = document?.recipient_address || address;

            if (!recipient) {
                throw new Error('No recipient address found');
            }

            // Simple ETH transfer (you can extend this for ERC20 tokens)
            const tx = await signer.sendTransaction({
                to: recipient,
                value: ethers.parseEther('0'), // Send 0 ETH for now
            });

            console.log('Transaction sent:', tx.hash);
            await tx.wait();

            Alert.alert('Success', `Payment sent! Transaction: ${tx.hash.slice(0, 10)}...`);
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
                    {/* Header */}
                    <View style={styles.headerSection}>
                        <Text style={styles.headerTitle}>Payment Request</Text>
                        <Text style={styles.headerSubtitle}>Complete your payment securely</Text>
                    </View>

                    {/* Amount Display */}
                    <View style={styles.amountContainer}>
                        <Text style={styles.amountLabel}>Amount Due</Text>
                        <Text style={styles.amountValue}>{document.amount} {document.currency}</Text>
                    </View>

                    {/* Details Section */}
                    <View style={styles.detailsContainer}>
                        <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>From</Text>
                            <Text style={styles.detailValue}>
                                {document.user?.first_name && document.user?.last_name
                                    ? `${document.user.first_name} ${document.user.last_name}`
                                    : document.user?.email || 'Hedwig User'}
                            </Text>
                        </View>
                        <View style={styles.divider} />
                        <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>For</Text>
                            <Text style={styles.detailValue}>{document.title || 'Services'}</Text>
                        </View>
                        <View style={styles.divider} />
                        <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>Network</Text>
                            <View style={styles.networkBadge}>
                                <Image source={selectedChain.icon} style={styles.networkIcon} />
                                <Text style={styles.networkText}>{selectedChain.name}</Text>
                            </View>
                        </View>
                    </View>

                    {/* Pay Button */}
                    <View style={styles.buttonContainer}>
                        <Button
                            title={isPaying ? '' : (!isConnected ? 'Connect Wallet' : `Pay ${document.amount} ${document.currency}`)}
                            onPress={handlePay}
                            variant="primary"
                            size="large"
                            loading={isPaying}
                            disabled={isPaying}
                            icon={!isConnected && !isPaying ? <Wallet size={20} color="#FFF" weight="fill" /> : undefined}
                        />
                    </View>

                    {/* Network Notice */}
                    <Text style={styles.networkNotice}>
                        Supports Base, Celo & Solana
                    </Text>
                </View>

                <View style={styles.footer}>
                    <CheckCircle size={16} color={Colors.textSecondary} weight="fill" />
                    <Text style={styles.footerText}>Secured by Hedwig</Text>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F8FAFC',
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
        borderRadius: 32,
        padding: 28,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 16,
        elevation: 4,
        width: '100%',
        maxWidth: 500,
        alignSelf: 'center',
    },
    headerSection: {
        alignItems: 'center',
        marginBottom: 24,
    },
    headerTitle: {
        fontFamily: 'RethinkSans_700Bold',
        fontSize: 22,
        color: Colors.textPrimary,
        marginBottom: 6,
    },
    headerSubtitle: {
        fontFamily: 'RethinkSans_400Regular',
        fontSize: 14,
        color: Colors.textSecondary,
    },
    amountContainer: {
        alignItems: 'center',
        backgroundColor: '#F8FAFC',
        paddingVertical: 20,
        paddingHorizontal: 24,
        borderRadius: 20,
        marginBottom: 24,
    },
    amountLabel: {
        fontFamily: 'RethinkSans_500Medium',
        fontSize: 13,
        color: Colors.textSecondary,
        marginBottom: 6,
    },
    amountValue: {
        fontFamily: 'RethinkSans_700Bold',
        fontSize: 32,
        color: Colors.textPrimary,
    },
    detailsContainer: {
        backgroundColor: '#FAFAFA',
        borderRadius: 16,
        padding: 16,
        marginBottom: 24,
    },
    detailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
    },
    divider: {
        height: 1,
        backgroundColor: '#E5E7EB',
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
        maxWidth: '60%',
        textAlign: 'right',
    },
    networkBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    networkIcon: {
        width: 18,
        height: 18,
        marginRight: 6,
        borderRadius: 9,
    },
    networkText: {
        fontFamily: 'RethinkSans_500Medium',
        fontSize: 13,
        color: Colors.textPrimary,
    },
    buttonContainer: {
        marginBottom: 16,
    },
    networkNotice: {
        fontFamily: 'RethinkSans_400Regular',
        fontSize: 12,
        color: Colors.textSecondary,
        textAlign: 'center',
    },
    footer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 24,
        gap: 6,
    },
    footerText: {
        fontFamily: 'RethinkSans_500Medium',
        fontSize: 13,
        color: Colors.textSecondary,
    },
});
