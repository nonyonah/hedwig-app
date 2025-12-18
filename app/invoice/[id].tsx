import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Alert, Image, Modal } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import '@walletconnect/react-native-compat';
import { AppKitProvider, useAppKit, useAccount, useProvider } from '@reown/appkit-react-native';
import { paymentAppKit } from '../../lib/appkit';
import { ethers } from 'ethers';
import { CheckCircle, DownloadSimple, Wallet } from 'phosphor-react-native';
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
export default function InvoiceViewerScreen() {
    return (
        <AppKitProvider instance={paymentAppKit}>
            <InvoiceContent />
        </AppKitProvider>
    );
}

// Inner component with AppKit hooks
function InvoiceContent() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const { open } = useAppKit();
    const { address, isConnected, chainId } = useAccount();
    const provider = useProvider();

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

            const recipient = invoice?.recipient_address || address;

            if (!recipient) {
                throw new Error('No recipient address found');
            }

            // Simple ETH transfer (extend this for ERC20 tokens)
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
                        <TouchableOpacity style={styles.downloadButton}>
                            <DownloadSimple size={18} color={Colors.textSecondary} />
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
                        <Text style={styles.amountLabel}>Amount Due</Text>
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
                    {/* Network & Token Display */}
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
                    <Text style={styles.networkNotice}>
                        Supports Base, Celo & Solana
                    </Text>

                    {/* Pay Button */}
                    <Button
                        title={isPaying ? '' : (!isConnected ? 'Connect Wallet' : `Pay $${total.toFixed(2)}`)}
                        onPress={handlePay}
                        variant="primary"
                        size="large"
                        loading={isPaying}
                        disabled={isPaying}
                        icon={!isConnected && !isPaying ? <Wallet size={20} color="#FFF" weight="fill" /> : undefined}
                    />
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
        padding: 20,
        paddingBottom: 40,
    },
    card: {
        backgroundColor: '#FFFFFF',
        borderRadius: 32,
        padding: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 16,
        elevation: 4,
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
        fontFamily: 'RethinkSans_600SemiBold',
        fontSize: 14,
        color: Colors.textSecondary,
    },
    downloadButton: {
        padding: 8,
        backgroundColor: '#F3F4F6',
        borderRadius: 20,
    },
    partiesContainer: {
        flexDirection: 'row',
        marginBottom: 24,
        paddingBottom: 24,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
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
        fontFamily: 'RethinkSans_500Medium',
        fontSize: 12,
        color: Colors.textSecondary,
        marginBottom: 6,
    },
    partyName: {
        fontFamily: 'RethinkSans_600SemiBold',
        fontSize: 15,
        color: Colors.textPrimary,
        marginBottom: 2,
    },
    partyEmail: {
        fontFamily: 'RethinkSans_400Regular',
        fontSize: 12,
        color: Colors.textSecondary,
    },
    amountContainer: {
        backgroundColor: '#F8FAFC',
        borderRadius: 20,
        padding: 20,
        alignItems: 'center',
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
        fontSize: 36,
        color: Colors.textPrimary,
        marginBottom: 4,
    },
    dueDate: {
        fontFamily: 'RethinkSans_400Regular',
        fontSize: 13,
        color: Colors.textSecondary,
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
        fontFamily: 'RethinkSans_600SemiBold',
        fontSize: 11,
        color: Colors.textSecondary,
        letterSpacing: 0.5,
    },
    itemRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 10,
    },
    itemName: {
        fontFamily: 'RethinkSans_500Medium',
        fontSize: 14,
        color: Colors.textPrimary,
    },
    itemPrice: {
        fontFamily: 'RethinkSans_600SemiBold',
        fontSize: 14,
        color: Colors.textPrimary,
    },
    divider: {
        height: 1,
        backgroundColor: '#E5E7EB',
        marginBottom: 20,
    },
    summaryContainer: {
        gap: 12,
    },
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    summaryLabel: {
        fontFamily: 'RethinkSans_400Regular',
        fontSize: 14,
        color: Colors.textSecondary,
    },
    summaryValue: {
        fontFamily: 'RethinkSans_400Regular',
        fontSize: 14,
        color: Colors.textSecondary,
    },
    totalRow: {
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#E5E7EB',
    },
    totalLabel: {
        fontFamily: 'RethinkSans_600SemiBold',
        fontSize: 15,
        color: Colors.textPrimary,
    },
    totalValue: {
        fontFamily: 'RethinkSans_700Bold',
        fontSize: 15,
        color: Colors.textPrimary,
    },
    paymentSection: {
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    selectorsRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 12,
    },
    selectorBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F8FAFC',
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    selectorIcon: {
        width: 18,
        height: 18,
        marginRight: 8,
        borderRadius: 9,
    },
    selectorText: {
        fontFamily: 'RethinkSans_500Medium',
        fontSize: 13,
        color: Colors.textPrimary,
    },
    networkNotice: {
        fontFamily: 'RethinkSans_400Regular',
        fontSize: 12,
        color: Colors.textSecondary,
        textAlign: 'center',
        marginBottom: 16,
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
