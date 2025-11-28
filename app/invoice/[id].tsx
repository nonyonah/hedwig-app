import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Alert, Image, Modal } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePrivy, useEmbeddedEthereumWallet } from '@privy-io/expo';
import { ArrowLeft, CheckCircle, Copy, DownloadSimple, Wallet } from 'phosphor-react-native';
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

export default function InvoiceViewerScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const { user } = usePrivy();
    const { wallets } = useEmbeddedEthereumWallet();
    const wallet = wallets?.[0];

    const [invoice, setInvoice] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedChain, setSelectedChain] = useState(CHAINS[0]);
    const [selectedToken, setSelectedToken] = useState(TOKENS[0]);
    const [isPaying, setIsPaying] = useState(false);

    useEffect(() => {
        fetchInvoice();
    }, [id]);

    const fetchInvoice = async () => {
        try {
            // On web, default to localhost if no env var is set
            let apiUrl = process.env.EXPO_PUBLIC_API_URL;
            if (!apiUrl && typeof window !== 'undefined') {
                apiUrl = 'http://localhost:3000';
            }
            apiUrl = apiUrl || 'http://localhost:3000';

            console.log('[Invoice] Fetching invoice from:', `${apiUrl}/api/documents/${id}`);

            // No authentication needed - this is public for clients to pay
            const response = await fetch(`${apiUrl}/api/documents/${id}`);
            const data = await response.json();
            console.log('[Invoice] Response:', data);

            if (data.success) {
                const doc = data.data.document;
                setInvoice(doc);

                // Set selected chain if available
                if (doc.chain) {
                    const chain = CHAINS.find(c => c.id === doc.chain.toLowerCase());
                    if (chain) {
                        setSelectedChain(chain);
                    }
                }
            } else {
                Alert.alert('Error', 'Invoice not found');
                if (typeof window === 'undefined') {
                    router.back();
                }
            }
        } catch (error) {
            console.error('[Invoice] Error fetching:', error);
            Alert.alert('Error', 'Failed to load invoice');
        } finally {
            setIsLoading(false);
        }
    };

    const handlePay = async () => {
        if (!user) {
            router.push('/auth/login');
            return;
        }

        if (!wallet) {
            Alert.alert('Error', 'No wallet connected');
            return;
        }

        setIsPaying(true);

        try {
            const provider = await wallet.getProvider();

            const CHAIN_IDS: Record<string, string> = {
                'base': '0x2105',
                'celo': '0xa4ec',
                'arbitrum': '0xa4b1',
                'optimism': '0xa'
            };

            const targetChainId = CHAIN_IDS[selectedChain.id];

            if (targetChainId) {
                try {
                    await provider.request({
                        method: 'wallet_switchEthereumChain',
                        params: [{ chainId: targetChainId }],
                    });
                } catch (error: any) {
                    if (error.code === 4902) {
                        Alert.alert('Error', 'Please add this network to your wallet');
                    } else {
                        console.error('Switch chain error:', error);
                    }
                }
            }

            const recipient = invoice?.recipient_address || wallet?.address;

            if (!recipient) {
                throw new Error('No recipient address found');
            }

            const txHash = await provider.request({
                method: 'eth_sendTransaction',
                params: [{
                    from: wallet.address,
                    to: recipient,
                    value: '0x0',
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

    if (!invoice) return null;

    const content = invoice.content || {};
    const items = content.items || [];
    const subtotal = invoice.amount;
    const platformFee = 2.00; // Example fixed fee
    const total = subtotal; // Assuming fee is included or handled separately

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={styles.card}>
                    {/* Header */}
                    <View style={styles.cardHeader}>
                        <Text style={styles.invoiceNumber}>INV-{invoice.id.slice(0, 8).toUpperCase()}</Text>
                        <TouchableOpacity>
                            <DownloadSimple size={20} color={Colors.textSecondary} />
                        </TouchableOpacity>
                    </View>

                    {/* From / To */}
                    <View style={styles.partiesContainer}>
                        <View style={styles.partyColumn}>
                            <Text style={styles.partyLabel}>From</Text>
                            <Text style={styles.partyName}>
                                {invoice.user?.first_name && invoice.user?.last_name
                                    ? `${invoice.user.first_name} ${invoice.user.last_name}`
                                    : invoice.user?.email || 'Hedwig User'}
                            </Text>
                            <Text style={styles.partyEmail}>{invoice.user?.email}</Text>
                        </View>
                        <View style={styles.dividerVertical} />
                        <View style={styles.partyColumn}>
                            <Text style={styles.partyLabel}>To</Text>
                            <Text style={styles.partyName}>{content.client_name || 'Client'}</Text>
                            <Text style={styles.partyEmail}>{content.recipient_email}</Text>
                        </View>
                    </View>

                    {/* Amount */}
                    <View style={styles.amountContainer}>
                        <Text style={styles.amountLabel}>Amount</Text>
                        <Text style={styles.amountValue}>${invoice.amount.toFixed(2)}</Text>
                        {content.due_date && (
                            <Text style={styles.dueDate}>Due {content.due_date}</Text>
                        )}
                    </View>

                    {/* Items */}
                    <View style={styles.itemsContainer}>
                        <View style={styles.itemsHeader}>
                            <Text style={styles.itemsHeaderLabel}>ITEM</Text>
                            <Text style={styles.itemsHeaderLabel}>AMOUNT</Text>
                        </View>
                        {items.length > 0 ? (
                            items.map((item: any, index: number) => (
                                <View key={index} style={styles.itemRow}>
                                    <Text style={styles.itemName}>{item.description}</Text>
                                    <Text style={styles.itemPrice}>${item.amount.toFixed(2)}</Text>
                                </View>
                            ))
                        ) : (
                            <View style={styles.itemRow}>
                                <Text style={styles.itemName}>{invoice.description}</Text>
                                <Text style={styles.itemPrice}>${invoice.amount.toFixed(2)}</Text>
                            </View>
                        )}
                    </View>

                    <View style={styles.divider} />

                    {/* Summary */}
                    <View style={styles.summaryContainer}>
                        <View style={styles.summaryRow}>
                            <Text style={styles.summaryLabel}>Subtotal</Text>
                            <Text style={styles.summaryValue}>${subtotal.toFixed(2)}</Text>
                        </View>
                        <View style={styles.summaryRow}>
                            <Text style={styles.summaryLabel}>Platform fee</Text>
                            <Text style={styles.summaryValue}>-${platformFee.toFixed(2)}</Text>
                        </View>
                        <View style={styles.summaryRow}>
                            <Text style={styles.summaryLabel}>Freelancer receives</Text>
                            <Text style={styles.summaryValue}>${(subtotal - platformFee).toFixed(2)}</Text>
                        </View>
                        <View style={[styles.summaryRow, styles.totalRow]}>
                            <Text style={styles.totalLabel}>Total</Text>
                            <Text style={styles.totalValue}>${total.toFixed(2)}</Text>
                        </View>
                    </View>
                </View>

                {/* Payment Section */}
                <View style={styles.paymentSection}>
                    {/* Chain & Token Display (Read-only) */}
                    <View style={styles.selectorsRow}>
                        <View style={styles.selectorBadge}>
                            <Image source={selectedChain.icon} style={styles.selectorIcon} />
                            <Text style={styles.selectorText}>{selectedChain.name}</Text>
                        </View>
                        <View style={styles.selectorBadge}>
                            <Image source={selectedToken.icon} style={styles.selectorIcon} />
                            <Text style={styles.selectorText}>{selectedToken.symbol}</Text>
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
                            <Text style={styles.payButtonText}>Pay ${total.toFixed(2)}</Text>
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
        backgroundColor: '#F3F4F6', // Light gray background like the image
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    scrollContent: {
        padding: 20,
        paddingBottom: 40,
    },
    card: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
        marginBottom: 24,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    invoiceNumber: {
        ...Typography.h4,
        color: Colors.textSecondary,
        fontSize: 14,
        fontWeight: '600',
    },
    partiesContainer: {
        flexDirection: 'row',
        marginBottom: 32,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
        paddingBottom: 24,
    },
    partyColumn: {
        flex: 1,
    },
    dividerVertical: {
        width: 1,
        backgroundColor: '#F3F4F6',
        marginHorizontal: 16,
    },
    partyLabel: {
        ...Typography.caption,
        marginBottom: 4,
    },
    partyName: {
        ...Typography.body,
        fontWeight: '600',
        marginBottom: 2,
    },
    partyEmail: {
        ...Typography.caption,
        fontSize: 12,
    },
    amountContainer: {
        marginBottom: 32,
    },
    amountLabel: {
        ...Typography.caption,
        marginBottom: 4,
    },
    amountValue: {
        ...Typography.h3,
        fontSize: 32,
        fontWeight: '700',
        marginBottom: 4,
    },
    dueDate: {
        ...Typography.caption,
    },
    itemsContainer: {
        marginBottom: 24,
    },
    itemsHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    itemsHeaderLabel: {
        ...Typography.caption,
        fontWeight: '600',
        letterSpacing: 0.5,
    },
    itemRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    itemName: {
        ...Typography.body,
        fontWeight: '500',
    },
    itemPrice: {
        ...Typography.body,
        fontWeight: '600',
    },
    divider: {
        height: 1,
        backgroundColor: '#F3F4F6',
        marginBottom: 24,
    },
    summaryContainer: {
        gap: 12,
    },
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    summaryLabel: {
        ...Typography.body,
        color: Colors.textSecondary,
    },
    summaryValue: {
        ...Typography.body,
        color: Colors.textSecondary,
    },
    totalRow: {
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#F3F4F6',
    },
    totalLabel: {
        ...Typography.body,
        fontWeight: '600',
    },
    totalValue: {
        ...Typography.body,
        fontWeight: '600',
    },
    paymentSection: {
        gap: 16,
    },
    selectorsRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 24,
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
    payButton: {
        backgroundColor: Colors.primary,
        borderRadius: 12,
        height: 56,
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
        fontSize: 18,
    },
    footer: {
        marginTop: 32,
        alignItems: 'center',
    },
    footerText: {
        ...Typography.caption,
        color: Colors.textSecondary,
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
