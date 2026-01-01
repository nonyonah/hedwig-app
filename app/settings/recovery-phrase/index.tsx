import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { CaretLeft, Wallet, CurrencyEth } from 'phosphor-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, useThemeColors } from '../../../theme/colors';
import { usePrivy, useEmbeddedEthereumWallet, useEmbeddedSolanaWallet } from '@privy-io/expo';
import * as Haptics from 'expo-haptics';
import { useSettings } from '../../../context/SettingsContext';
import { useAnalyticsScreen } from '../../../hooks/useAnalyticsScreen';

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

    // Privy hooks for wallet access and export
    const { user } = usePrivy();
    const evmWallet = useEmbeddedEthereumWallet();
    const solanaWallet = useEmbeddedSolanaWallet();

    const handleExportEvm = async () => {
        if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        try {
            if (!evmWallet.wallet) {
                Alert.alert('No Wallet', 'No Ethereum wallet found to export.');
                return;
            }
            // Privy will show its modal to export the wallet
            await evmWallet.wallet.exportWallet();
        } catch (error: any) {
            console.error('EVM export error:', error);
            Alert.alert('Export Failed', error.message || 'Failed to export Ethereum wallet.');
        }
    };

    const handleExportSolana = async () => {
        if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        try {
            if (!solanaWallet.wallet) {
                Alert.alert('No Wallet', 'No Solana wallet found to export.');
                return;
            }
            // Privy will show its modal to export the wallet
            await solanaWallet.wallet.exportWallet();
        } catch (error: any) {
            console.error('Solana export error:', error);
            Alert.alert('Export Failed', error.message || 'Failed to export Solana wallet.');
        }
    };

    const formatAddress = (address: string) => {
        if (!address) return '';
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    };

    const evmAddress = evmWallet.wallet?.address;
    const solanaAddress = solanaWallet.wallet?.address;

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
                                {evmAddress ? formatAddress(evmAddress) : 'Not available'}
                            </Text>
                        </View>
                    </View>
                    <TouchableOpacity
                        style={[styles.exportButton, { backgroundColor: Colors.primary }]}
                        onPress={handleExportEvm}
                        disabled={!evmWallet.wallet}
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
                                {solanaAddress ? formatAddress(solanaAddress) : 'Not available'}
                            </Text>
                        </View>
                    </View>
                    <TouchableOpacity
                        style={[styles.exportButton, { backgroundColor: '#9945FF' }]}
                        onPress={handleExportSolana}
                        disabled={!solanaWallet.wallet}
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
