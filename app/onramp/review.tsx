import React, { useState } from 'react';
import {
    Alert,
    Image,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft as CaretLeft } from '../../components/ui/AppIcon';
import { Colors, useThemeColors } from '../../theme/colors';
import IOSGlassIconButton from '../../components/ui/IOSGlassIconButton';
import { useOnramp, OnrampFiat, OnrampNetwork } from '../../hooks/useOnramp';

const NETWORK_META: Record<OnrampNetwork, { name: string; icon: any }> = {
    base: { name: 'Base', icon: require('../../assets/icons/networks/base.png') },
    polygon: { name: 'Polygon', icon: require('../../assets/icons/networks/polygon.png') },
    arbitrum: { name: 'Arbitrum', icon: require('../../assets/icons/networks/arbitrum.png') },
    celo: { name: 'Celo', icon: require('../../assets/icons/networks/celo.png') },
};

const COUNTRY_FLAG: Record<OnrampFiat, string> = {
    NGN: '🇳🇬',
    KES: '🇰🇪',
    TZS: '🇹🇿',
    MWK: '🇲🇼',
    UGX: '🇺🇬',
    BRL: '🇧🇷',
};

const USDC_ICON = require('../../assets/icons/tokens/usdc.png');

export default function OnrampReviewScreen() {
    const router = useRouter();
    const themeColors = useThemeColors();
    const { createOrder } = useOnramp();
    const [submitting, setSubmitting] = useState(false);

    const params = useLocalSearchParams<{
        fiatAmount?: string;
        fiatCurrency?: OnrampFiat;
        network?: OnrampNetwork;
        bankCode?: string;
        bankName?: string;
        accountNumber?: string;
        accountName?: string;
    }>();

    const fiatAmount = parseFloat(params.fiatAmount || '0');
    const fiatCurrency = (params.fiatCurrency || 'NGN') as OnrampFiat;
    const network = (params.network || 'base') as OnrampNetwork;
    const networkMeta = NETWORK_META[network];
    const bankCode = params.bankCode || '';
    const bankName = params.bankName || '';
    const accountNumber = params.accountNumber || '';
    const accountName = params.accountName || '';

    const canSubmit = fiatAmount > 0 && bankCode && accountNumber && accountName && !submitting;

    const handleConfirm = async () => {
        if (!canSubmit) return;
        setSubmitting(true);
        try {
            const order = await createOrder({
                fiatAmount,
                fiatCurrency,
                token: 'USDC',
                network,
                refundAccount: { bankName: bankCode, accountNumber, accountName },
            });
            router.replace({ pathname: '/onramp/[id]' as any, params: { id: order.id } });
        } catch (err: any) {
            Alert.alert('Could not start Buy USDC', err?.message || 'Try again in a moment.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <View style={[styles.container, { backgroundColor: themeColors.background }]}>
            <SafeAreaView style={styles.safeArea}>
                <View style={[styles.header, { backgroundColor: themeColors.background }]}>
                    <IOSGlassIconButton
                        onPress={() => router.back()}
                        systemImage="chevron.left"
                        containerStyle={styles.backButton}
                        circleStyle={[styles.backButtonCircle, { backgroundColor: themeColors.surface }]}
                        icon={<CaretLeft size={20} color={themeColors.textPrimary} strokeWidth={3} />}
                    />
                    <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]}>Review</Text>
                    <View style={styles.placeholder} />
                </View>

                <ScrollView
                    contentContainerStyle={styles.content}
                    showsVerticalScrollIndicator={false}
                    bounces={false}
                >
                    <Text style={[styles.helperTextTop, { color: themeColors.textSecondary }]}>
                        Confirm your Buy USDC details before we generate a deposit account.
                    </Text>

                    <View style={[styles.summaryCard, { backgroundColor: themeColors.surface }]}>
                        <SummaryRow
                            label="You pay"
                            valuePrefix={<Text style={{ fontSize: 18, marginRight: 4 }}>{COUNTRY_FLAG[fiatCurrency]}</Text>}
                            value={`${fiatAmount.toLocaleString()} ${fiatCurrency}`}
                            divider
                        />
                        <SummaryRow
                            label="You receive"
                            valuePrefix={<Image source={USDC_ICON} style={styles.iconBadge} />}
                            value="USDC"
                            divider
                        />
                        <SummaryRow
                            label="Network"
                            valuePrefix={<Image source={networkMeta.icon} style={styles.iconBadge} />}
                            value={networkMeta.name}
                            divider
                        />
                        <SummaryRow label="Refund bank" value={bankName} divider />
                        <SummaryRow label="Refund account" value={`${accountName} • ${accountNumber}`} />
                    </View>

                    <Text style={[styles.disclaimer, { color: themeColors.textSecondary }]}>
                        On confirm, Paycrest issues a virtual bank account. Send your {fiatCurrency} payment within the deposit window so we can deliver USDC to your wallet.
                    </Text>

                    <View style={{ height: 100 }} />
                </ScrollView>

                <View style={[styles.footer, { backgroundColor: themeColors.background }]}>
                    <TouchableOpacity
                        style={[styles.continueButton, !canSubmit && styles.continueButtonDisabled]}
                        onPress={handleConfirm}
                        disabled={!canSubmit}
                    >
                        <Text style={styles.continueButtonText}>{submitting ? 'Creating order…' : 'Confirm Buy USDC'}</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        </View>
    );
}

interface SummaryRowProps {
    label: string;
    value: string;
    valuePrefix?: React.ReactNode;
    divider?: boolean;
}

const SummaryRow: React.FC<SummaryRowProps> = ({ label, value, valuePrefix, divider }) => {
    const themeColors = useThemeColors();
    return (
        <View
            style={[
                styles.summaryRow,
                divider && { borderBottomColor: themeColors.background, borderBottomWidth: StyleSheet.hairlineWidth },
            ]}
        >
            <Text style={[styles.summaryLabel, { color: themeColors.textSecondary }]}>{label}</Text>
            <View style={styles.summaryValueRow}>
                {valuePrefix}
                <Text style={[styles.summaryValue, { color: themeColors.textPrimary }]} numberOfLines={2}>
                    {value}
                </Text>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    safeArea: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 12,
        height: 56,
    },
    backButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10,
    },
    backButtonCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: Platform.OS === 'android' ? 20 : 22,
    },
    placeholder: { width: 40 },
    content: { padding: 24 },
    helperTextTop: {
        fontSize: 14,
        marginBottom: 24,
        fontFamily: 'GoogleSansFlex_400Regular',
    },
    summaryCard: {
        borderRadius: 18,
        paddingHorizontal: 16,
    },
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 14,
        gap: 12,
    },
    summaryLabel: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 13,
    },
    summaryValueRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flexShrink: 1,
    },
    summaryValue: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 14,
        flexShrink: 1,
        textAlign: 'right',
    },
    iconBadge: {
        width: 20,
        height: 20,
        borderRadius: 10,
    },
    disclaimer: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 13,
        lineHeight: 18,
        marginTop: 16,
    },
    footer: {
        padding: 20,
    },
    continueButton: {
        backgroundColor: Colors.primary,
        height: 56,
        borderRadius: 28,
        justifyContent: 'center',
        alignItems: 'center',
    },
    continueButtonDisabled: {
        opacity: 0.5,
    },
    continueButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontFamily: 'GoogleSansFlex_600SemiBold',
    },
});
