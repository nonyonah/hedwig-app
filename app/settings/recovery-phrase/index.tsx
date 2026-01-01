import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { CaretLeft, Wallet, CurrencyEth } from 'phosphor-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, useThemeColors } from '../../../theme/colors';
import { usePrivy } from '@privy-io/expo';
import * as Haptics from 'expo-haptics';
import { useSettings } from '../../../context/SettingsContext';
import { useAnalyticsScreen } from '../../../hooks/useAnalyticsScreen';
import { PrivateKeyModal } from '../../../components/PrivateKeyModal';

// Solana icon component
const SolanaIcon = ({ size = 24, color = '#FFFFFF' }: { size?: number; color?: string }) => (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ fontSize: size * 0.6, color }}>◎</Text>
    </View>
);

export default function RecoveryPhraseScreen() {
    useAnalyticsScreen('RecoveryPhrase');

    const router = useRouter();
    const insets = useSafeAreaInsets();
    const themeColors = useThemeColors();
    const { hapticsEnabled } = useSettings();

    // Privy hooks
    const { user, getAccessToken } = usePrivy();

    // Modal state
    const [modalVisible, setModalVisible] = useState(false);
    const [modalChainType, setModalChainType] = useState<'ethereum' | 'solana'>('ethereum');
    const [isExporting, setIsExporting] = useState(false);
    const [exportError, setExportError] = useState<string | null>(null);
    const [exportedKey, setExportedKey] = useState<string | null>(null);
    const [exportedAddress, setExportedAddress] = useState<string | null>(null);

    // Get wallet addresses from user's linked accounts
    const walletInfo = useMemo(() => {
        if (!user) return { evmAddress: null, solanaAddress: null };

        const linkedAccounts = (user as any).linkedAccounts || [];

        const evmAccount = linkedAccounts.find(
            (account: any) => account.type === 'wallet' &&
                account.walletClientType === 'privy' &&
                account.chainType === 'ethereum'
        );

        const solanaAccount = linkedAccounts.find(
            (account: any) => account.type === 'wallet' &&
                account.walletClientType === 'privy' &&
                account.chainType === 'solana'
        );

        return {
            evmAddress: evmAccount?.address || null,
            solanaAddress: solanaAccount?.address || null
        };
    }, [user]);

    const handleExport = async (chainType: 'ethereum' | 'solana') => {
        if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        // Reset state and open modal
        setModalChainType(chainType);
        setExportedKey(null);
        setExportError(null);
        setExportedAddress(chainType === 'ethereum' ? walletInfo.evmAddress : walletInfo.solanaAddress);
        setModalVisible(true);
        setIsExporting(true);

        try {
            const token = await getAccessToken();
            if (!token) {
                throw new Error('Not authenticated');
            }

            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
            const response = await fetch(`${apiUrl}/api/wallet/export`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ chainType })
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.error || 'Failed to export wallet');
            }

            setExportedKey(data.data.privateKey);
            setExportedAddress(data.data.address);
        } catch (error: any) {
            console.error('Export error:', error);
            setExportError(error.message || 'Failed to export private key');
        } finally {
            setIsExporting(false);
        }
    };

    const handleCloseModal = () => {
        setModalVisible(false);
        setExportedKey(null);
        setExportError(null);
    };

    const formatAddress = (address: string | null) => {
        if (!address) return 'Not available';
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    };

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: themeColors.background }]}>
            {/* Header */}
            <View style={[styles.header, { backgroundColor: themeColors.background }]}>
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => {
                        if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        router.back();
                    }}
                >
                    <CaretLeft size={24} color={themeColors.textPrimary} weight="bold" />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]}>Recovery Phrase</Text>
                <View style={styles.headerSpacer} />
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
                {/* Info Text */}
                <Text style={[styles.infoText, { color: themeColors.textSecondary }]}>
                    Export your wallet's private key to back it up or use it in another wallet app.
                </Text>

                {/* Ethereum Wallet Card */}
                <View style={[styles.walletCard, { backgroundColor: themeColors.surface }]}>
                    <View style={styles.walletHeader}>
                        <View style={[styles.walletIconContainer, { backgroundColor: '#627EEA' }]}>
                            <CurrencyEth size={24} color="#FFFFFF" weight="fill" />
                        </View>
                        <View style={styles.walletInfo}>
                            <Text style={[styles.walletName, { color: themeColors.textPrimary }]}>Ethereum Wallet</Text>
                            <Text style={[styles.walletAddress, { color: themeColors.textSecondary }]}>
                                {formatAddress(walletInfo.evmAddress)}
                            </Text>
                        </View>
                    </View>
                    <TouchableOpacity
                        style={[
                            styles.exportButton,
                            { backgroundColor: walletInfo.evmAddress ? Colors.primary : themeColors.border }
                        ]}
                        onPress={() => handleExport('ethereum')}
                        disabled={!walletInfo.evmAddress}
                    >
                        <Wallet size={20} color="#FFFFFF" weight="bold" />
                        <Text style={styles.exportButtonText}>Export Private Key</Text>
                    </TouchableOpacity>
                </View>

                {/* Solana Wallet Card */}
                <View style={[styles.walletCard, { backgroundColor: themeColors.surface }]}>
                    <View style={styles.walletHeader}>
                        <View style={[styles.walletIconContainer, { backgroundColor: '#9945FF' }]}>
                            <SolanaIcon size={24} color="#FFFFFF" />
                        </View>
                        <View style={styles.walletInfo}>
                            <Text style={[styles.walletName, { color: themeColors.textPrimary }]}>Solana Wallet</Text>
                            <Text style={[styles.walletAddress, { color: themeColors.textSecondary }]}>
                                {formatAddress(walletInfo.solanaAddress)}
                            </Text>
                        </View>
                    </View>
                    <TouchableOpacity
                        style={[
                            styles.exportButton,
                            { backgroundColor: walletInfo.solanaAddress ? '#9945FF' : themeColors.border }
                        ]}
                        onPress={() => handleExport('solana')}
                        disabled={!walletInfo.solanaAddress}
                    >
                        <Wallet size={20} color="#FFFFFF" weight="bold" />
                        <Text style={styles.exportButtonText}>Export Private Key</Text>
                    </TouchableOpacity>
                </View>

                {/* Warning */}
                <View style={[styles.warningContainer, { backgroundColor: themeColors.surface }]}>
                    <Text style={[styles.warningTitle, { color: Colors.error }]}>⚠️ Security Warning</Text>
                    <Text style={[styles.warningText, { color: themeColors.textSecondary }]}>
                        Your private key gives full access to your wallet. Never share it with anyone or enter it on untrusted websites.
                    </Text>
                </View>
            </ScrollView>

            {/* Private Key Modal */}
            <PrivateKeyModal
                visible={modalVisible}
                onClose={handleCloseModal}
                chainType={modalChainType}
                address={exportedAddress}
                privateKey={exportedKey}
                isLoading={isExporting}
                error={exportError}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 12,
        height: 60,
    },
    backButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'flex-start',
    },
    headerTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 18,
    },
    headerSpacer: {
        width: 40,
    },
    content: {
        padding: 20,
        paddingBottom: 40,
    },
    infoText: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 14,
        lineHeight: 20,
        marginBottom: 24,
        textAlign: 'center',
    },
    walletCard: {
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
    },
    walletHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    walletIconContainer: {
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    walletInfo: {
        flex: 1,
    },
    walletName: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 16,
        marginBottom: 4,
    },
    walletAddress: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 14,
    },
    exportButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 12,
        paddingVertical: 14,
        gap: 8,
    },
    exportButtonText: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 14,
        color: '#FFFFFF',
    },
    warningContainer: {
        borderRadius: 16,
        padding: 16,
        marginTop: 8,
    },
    warningTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 14,
        marginBottom: 8,
    },
    warningText: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 13,
        lineHeight: 18,
    },
});
