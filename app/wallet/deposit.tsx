import React, { useEffect, useMemo, useState } from 'react';
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEmbeddedEthereumWallet, useEmbeddedSolanaWallet } from '@privy-io/expo';
import { ChevronLeft as CaretLeft } from '../../components/ui/AppIcon';
import { Colors, useThemeColors } from '../../theme/colors';
import IOSGlassIconButton from '../../components/ui/IOSGlassIconButton';
import { SelectorSheet } from '../../components/SelectorSheet';
import {
    GATEWAY_EVM_CHAINS,
    type GatewayChainKey,
    type GatewayEvmChainKey,
} from '../../lib/gateway/constants';
import { depositSolanaToGateway, depositToGateway } from '../../lib/gateway';
import { useGatewayBalance } from '../../hooks/useGatewayBalance';

const NETWORK_OPTIONS: GatewayChainKey[] = ['base', 'arbitrum', 'polygon', 'solana'];

const getChainLabel = (chain: GatewayChainKey): string =>
    chain === 'solana' ? 'Solana Devnet' : GATEWAY_EVM_CHAINS[chain].name;

export default function DepositToGatewayScreen() {
    const router = useRouter();
    const themeColors = useThemeColors();
    const params = useLocalSearchParams<{ amount?: string; network?: string }>();
    const ethereumWallet = useEmbeddedEthereumWallet();
    const solanaWallet = useEmbeddedSolanaWallet();
    const evmWallets = (ethereumWallet as any)?.wallets || [];
    const solanaWallets = (solanaWallet as any)?.wallets || [];
    const gatewayBalance = useGatewayBalance();

    const [chainKey, setChainKey] = useState<GatewayChainKey>(
        (params.network as GatewayChainKey) || 'base'
    );
    const [amount, setAmount] = useState<string>(params.amount ?? '');
    const [submitting, setSubmitting] = useState(false);
    const [picker, setPicker] = useState(false);
    const chainLabel = getChainLabel(chainKey);

    useEffect(() => {
        gatewayBalance.refresh();
    }, []);

    const numericAmount = useMemo(() => parseFloat(amount), [amount]);
    const hasWallet = chainKey === 'solana' ? solanaWallets.length > 0 : evmWallets.length > 0;
    const canSubmit = !submitting && Number.isFinite(numericAmount) && numericAmount > 0 && hasWallet;

    const handleDeposit = async () => {
        if (!canSubmit) return;
        setSubmitting(true);
        try {
            const subunits = BigInt(Math.floor(numericAmount * 1_000_000));
            if (chainKey === 'solana') {
                const solWallet = solanaWallets[0];
                if (!solWallet) throw new Error('Solana wallet unavailable');
                await depositSolanaToGateway({
                    wallet: solWallet,
                    amountSubunits: subunits,
                });
            } else {
                const wallet = evmWallets[0];
                if (!wallet) throw new Error('Wallet unavailable');
                const provider = await wallet.getProvider();
                if (!provider) throw new Error('Wallet provider unavailable');
                await depositToGateway({
                    chainKey,
                    eip1193Provider: provider,
                    amountSubunits: subunits,
                });
            }

            Alert.alert(
                'Deposit submitted',
                `Your deposit on ${chainLabel} will appear in your unified balance after the chain reaches finality.`,
                [{ text: 'OK', onPress: () => router.back() }]
            );
        } catch (err: any) {
            Alert.alert('Deposit failed', err?.message || 'Unable to deposit right now.');
        } finally {
            setSubmitting(false);
            gatewayBalance.refresh();
        }
    };

    return (
        <View style={[styles.container, { backgroundColor: themeColors.background }]}>
            <SafeAreaView style={{ flex: 1 }}>
                <View style={[styles.header, { backgroundColor: themeColors.background }]}>
                    <IOSGlassIconButton
                        onPress={() => router.back()}
                        systemImage="chevron.left"
                        containerStyle={styles.backButton}
                        circleStyle={[styles.backButtonCircle, { backgroundColor: themeColors.surface }]}
                        icon={<CaretLeft size={20} color={themeColors.textPrimary} strokeWidth={3} />}
                    />
                    <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]}>Add to balance</Text>
                    <View style={styles.placeholder} />
                </View>

                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={{ flex: 1 }}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
                >
                    <ScrollView contentContainerStyle={styles.content} bounces={false}>
                        <Text style={[styles.helper, { color: themeColors.textSecondary }]}>
                            Move USDC from your wallet on a specific chain into your unified Gateway balance. Once finality is reached, you can spend it from any chain instantly.
                        </Text>

                        <Text style={[styles.label, { color: themeColors.textPrimary }]}>Chain</Text>
                        <TouchableOpacity onPress={() => setPicker(true)}>
                            <View style={[styles.field, { backgroundColor: themeColors.surface }]}>
                                <Text style={[styles.fieldText, { color: themeColors.textPrimary }]}>{chainLabel}</Text>
                            </View>
                        </TouchableOpacity>

                        <Text style={[styles.label, { color: themeColors.textPrimary }]}>Amount (USDC)</Text>
                        <View style={[styles.field, { backgroundColor: themeColors.surface }]}>
                            <TextInput
                                style={[styles.input, { color: themeColors.textPrimary }]}
                                value={amount}
                                onChangeText={setAmount}
                                placeholder="0.00"
                                placeholderTextColor={themeColors.textSecondary}
                                keyboardType="decimal-pad"
                                inputMode="decimal"
                            />
                        </View>

                        <Text style={[styles.notice, { color: themeColors.textSecondary }]}>
                            {chainKey === 'solana'
                                ? `One Solana transaction is required. It runs on ${chainLabel} and requires a small SOL gas payment.`
                                : `Two transactions are required: approve and deposit. Both run on ${chainLabel} and require a small native gas payment on that chain.`}
                        </Text>
                    </ScrollView>

                    <View style={[styles.footer, { backgroundColor: themeColors.background }]}>
                        <TouchableOpacity
                            style={[styles.continueButton, !canSubmit && styles.continueButtonDisabled]}
                            onPress={handleDeposit}
                            disabled={!canSubmit}
                        >
                            <Text style={styles.continueButtonText}>{submitting ? 'Depositing…' : 'Deposit'}</Text>
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </SafeAreaView>

            <SelectorSheet
                visible={picker}
                onClose={() => setPicker(false)}
                title="Chain"
                options={NETWORK_OPTIONS.map((id) => ({ id, label: getChainLabel(id) }))}
                selectedId={chainKey}
                onSelect={(id) => setChainKey(id as GatewayChainKey)}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 12,
        height: 56,
    },
    backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
    backButtonCircle: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
    headerTitle: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: Platform.OS === 'android' ? 20 : 22 },
    placeholder: { width: 40 },
    content: { padding: 24, gap: 8 },
    helper: { fontSize: 14, marginBottom: 16, fontFamily: 'GoogleSansFlex_400Regular', lineHeight: 20 },
    label: { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 14, marginBottom: 8, marginLeft: 4 },
    field: {
        borderRadius: 16,
        marginBottom: 16,
        paddingHorizontal: 16,
        paddingVertical: 14,
        flexDirection: 'row',
        alignItems: 'center',
    },
    fieldText: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 16 },
    input: { flex: 1, fontFamily: 'GoogleSansFlex_400Regular', fontSize: 18, paddingVertical: 0 },
    notice: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 13, lineHeight: 18, marginTop: 16 },
    footer: { padding: 20 },
    continueButton: { backgroundColor: Colors.primary, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
    continueButtonDisabled: { opacity: 0.5 },
    continueButtonText: { color: '#FFFFFF', fontSize: 16, fontFamily: 'GoogleSansFlex_600SemiBold' },
});
