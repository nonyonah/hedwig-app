import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
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
import * as Clipboard from 'expo-clipboard';
import {
    ChevronLeft as CaretLeft,
    Copy,
    CheckCircle as CheckCircleIcon,
    Clock as ClockIcon,
    TriangleAlert as TriangleAlertIcon,
} from '../../components/ui/AppIcon';
import { Colors, useThemeColors } from '../../theme/colors';
import IOSGlassIconButton from '../../components/ui/IOSGlassIconButton';
import { useOnramp, OnrampOrder, OnrampStatus, OnrampNetwork, OnrampFiat } from '../../hooks/useOnramp';

const NETWORK_META: Record<string, { name: string; icon: any }> = {
    BASE: { name: 'Base', icon: require('../../assets/icons/networks/base.png') },
    POLYGON: { name: 'Polygon', icon: require('../../assets/icons/networks/polygon.png') },
    ARBITRUM: { name: 'Arbitrum', icon: require('../../assets/icons/networks/arbitrum.png') },
    CELO: { name: 'Celo', icon: require('../../assets/icons/networks/celo.png') },
};

const COUNTRY_FLAG: Record<string, string> = {
    NGN: '🇳🇬',
    KES: '🇰🇪',
    TZS: '🇹🇿',
    MWK: '🇲🇼',
    UGX: '🇺🇬',
    BRL: '🇧🇷',
};

const USDC_ICON = require('../../assets/icons/tokens/usdc.png');

const STATUS_COPY: Record<OnrampStatus, { title: string; subtitle: string; tone: 'pending' | 'progress' | 'success' | 'danger' | 'neutral' }> = {
    PENDING: {
        title: 'Awaiting your deposit',
        subtitle: 'Send the exact amount before the window closes.',
        tone: 'pending',
    },
    PROCESSING: {
        title: 'Settling on-chain',
        subtitle: 'Funds received. USDC settling to your wallet.',
        tone: 'progress',
    },
    COMPLETED: {
        title: 'Buy USDC complete',
        subtitle: 'USDC delivered to your wallet.',
        tone: 'success',
    },
    FAILED: {
        title: 'Buy USDC failed',
        subtitle: 'Funds will be refunded to the account on file.',
        tone: 'danger',
    },
    CANCELLED: {
        title: 'Buy USDC cancelled',
        subtitle: 'No funds were moved.',
        tone: 'neutral',
    },
};

const formatCountdown = (deadlineIso: string | null): string => {
    if (!deadlineIso) return '—';
    const remaining = Math.max(0, new Date(deadlineIso).getTime() - Date.now());
    const minutes = Math.floor(remaining / 60_000);
    const seconds = Math.floor((remaining % 60_000) / 1000);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

export default function OnrampOrderScreen() {
    const router = useRouter();
    const themeColors = useThemeColors();
    const { getOrder } = useOnramp();
    const params = useLocalSearchParams<{ id?: string }>();
    const id = params.id || '';

    const [order, setOrder] = useState<OnrampOrder | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [now, setNow] = useState(Date.now());
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const refresh = useCallback(async () => {
        if (!id) return;
        try {
            const fresh = await getOrder(id);
            setOrder(fresh);
            setError(null);
        } catch (err: any) {
            setError(err?.message || 'Could not load order');
        }
    }, [getOrder, id]);

    useEffect(() => { refresh(); }, [refresh]);

    useEffect(() => {
        if (!order) return;
        if (intervalRef.current) clearInterval(intervalRef.current);
        if (order.status === 'PENDING' || order.status === 'PROCESSING') {
            intervalRef.current = setInterval(refresh, 5000);
        }
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [order?.status, refresh]);

    useEffect(() => {
        tickRef.current = setInterval(() => setNow(Date.now()), 1000);
        return () => { if (tickRef.current) clearInterval(tickRef.current); };
    }, []);

    const copyValue = useCallback(async (label: string, value: string | number | null | undefined) => {
        if (value === null || value === undefined || value === '') return;
        await Clipboard.setStringAsync(String(value));
        Alert.alert('Copied', `${label} copied to clipboard.`);
    }, []);

    const status = order?.status ?? 'PENDING';
    const statusCopy = STATUS_COPY[status];
    const expiresIn = useMemo(() => {
        void now;
        return formatCountdown(order?.validUntil ?? null);
    }, [order?.validUntil, now]);

    const networkMeta = order ? NETWORK_META[order.chain] : null;

    const StatusIcon = () => {
        if (statusCopy.tone === 'success') return <CheckCircleIcon size={28} color={Colors.success} fill={Colors.success} />;
        if (statusCopy.tone === 'danger') return <TriangleAlertIcon size={28} color={Colors.error} fill={Colors.error} />;
        if (statusCopy.tone === 'progress') return <ActivityIndicator size="small" color={themeColors.textPrimary} />;
        return <ClockIcon size={28} color={themeColors.textPrimary} />;
    };

    return (
        <View style={[styles.container, { backgroundColor: themeColors.background }]}>
            <SafeAreaView style={styles.safeArea}>
                <View style={[styles.header, { backgroundColor: themeColors.background }]}>
                    <IOSGlassIconButton
                        onPress={() => router.replace('/' as any)}
                        systemImage="chevron.left"
                        containerStyle={styles.backButton}
                        circleStyle={[styles.backButtonCircle, { backgroundColor: themeColors.surface }]}
                        icon={<CaretLeft size={20} color={themeColors.textPrimary} strokeWidth={3} />}
                    />
                    <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]}>Buy USDC order</Text>
                    <View style={styles.placeholder} />
                </View>

                <ScrollView
                    contentContainerStyle={styles.content}
                    showsVerticalScrollIndicator={false}
                    bounces={false}
                >
                    {!order && !error ? (
                        <View style={styles.loadingState}>
                            <ActivityIndicator size="small" color={themeColors.textPrimary} />
                        </View>
                    ) : null}

                    {error ? (
                        <Text style={[styles.errorText, { color: Colors.error }]}>{error}</Text>
                    ) : null}

                    {order ? (
                        <>
                            <View style={[styles.statusCard, { backgroundColor: themeColors.surface }]}>
                                <StatusIcon />
                                <Text style={[styles.statusTitle, { color: themeColors.textPrimary }]}>{statusCopy.title}</Text>
                                <Text style={[styles.statusSubtitle, { color: themeColors.textSecondary }]}>{statusCopy.subtitle}</Text>
                                {order.status === 'PENDING' && order.validUntil ? (
                                    <Text style={[styles.countdown, { color: themeColors.textPrimary }]}>Expires in {expiresIn}</Text>
                                ) : null}
                            </View>

                            {order.status === 'PENDING' && order.providerInstitution ? (
                                <View style={[styles.card, { backgroundColor: themeColors.surface }]}>
                                    <Text style={[styles.cardTitle, { color: themeColors.textPrimary }]}>Send your deposit</Text>
                                    <DetailRow
                                        label="Bank"
                                        value={order.providerInstitution || '—'}
                                        onCopy={() => copyValue('Bank', order.providerInstitution)}
                                    />
                                    <DetailRow
                                        label="Account number"
                                        value={order.providerAccountNumber || '—'}
                                        onCopy={() => copyValue('Account number', order.providerAccountNumber)}
                                    />
                                    <DetailRow
                                        label="Account name"
                                        value={order.providerAccountName || '—'}
                                        onCopy={() => copyValue('Account name', order.providerAccountName)}
                                    />
                                    <DetailRow
                                        label="Amount"
                                        value={
                                            order.providerAmountToTransfer != null
                                                ? `${order.providerAmountToTransfer.toLocaleString()} ${order.fiatCurrency}`
                                                : '—'
                                        }
                                        onCopy={() => copyValue('Amount', order.providerAmountToTransfer)}
                                        valuePrefix={<Text style={{ fontSize: 16, marginRight: 2 }}>{COUNTRY_FLAG[order.fiatCurrency] || ''}</Text>}
                                    />
                                </View>
                            ) : null}

                            <View style={[styles.card, { backgroundColor: themeColors.surface }]}>
                                <Text style={[styles.cardTitle, { color: themeColors.textPrimary }]}>Order summary</Text>
                                <DetailRow
                                    label="You pay"
                                    value={`${order.fiatAmount.toLocaleString()} ${order.fiatCurrency}`}
                                    valuePrefix={<Text style={{ fontSize: 16, marginRight: 2 }}>{COUNTRY_FLAG[order.fiatCurrency] || ''}</Text>}
                                />
                                <DetailRow
                                    label="You receive"
                                    value={`${order.token}${networkMeta ? ` on ${networkMeta.name}` : ` on ${order.chain}`}`}
                                    valuePrefix={<Image source={USDC_ICON} style={styles.iconBadge} />}
                                />
                                {networkMeta ? (
                                    <DetailRow
                                        label="Network"
                                        value={networkMeta.name}
                                        valuePrefix={<Image source={networkMeta.icon} style={styles.iconBadge} />}
                                    />
                                ) : null}
                                <DetailRow
                                    label="Wallet"
                                    value={`${order.recipientAddress.slice(0, 6)}…${order.recipientAddress.slice(-4)}`}
                                    onCopy={() => copyValue('Wallet address', order.recipientAddress)}
                                />
                                {order.txHash ? (
                                    <DetailRow
                                        label="Tx hash"
                                        value={`${order.txHash.slice(0, 8)}…${order.txHash.slice(-6)}`}
                                        onCopy={() => copyValue('Tx hash', order.txHash)}
                                    />
                                ) : null}
                            </View>
                        </>
                    ) : null}

                    <View style={{ height: 100 }} />
                </ScrollView>

                <View style={[styles.footer, { backgroundColor: themeColors.background }]}>
                    <TouchableOpacity
                        style={[styles.continueButton, { backgroundColor: themeColors.surface }]}
                        onPress={() => router.replace('/' as any)}
                    >
                        <Text style={[styles.continueButtonText, { color: themeColors.textPrimary }]}>Done</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        </View>
    );
}

interface DetailRowProps {
    label: string;
    value: string;
    onCopy?: () => void;
    valuePrefix?: React.ReactNode;
}

const DetailRow: React.FC<DetailRowProps> = ({ label, value, onCopy, valuePrefix }) => {
    const themeColors = useThemeColors();
    return (
        <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>{label}</Text>
            <View style={styles.detailValueRow}>
                {valuePrefix}
                <Text style={[styles.detailValue, { color: themeColors.textPrimary }]} numberOfLines={1}>{value}</Text>
                {onCopy ? (
                    <TouchableOpacity onPress={onCopy} hitSlop={8} style={styles.copyButton}>
                        <Copy size={16} color={themeColors.textSecondary} />
                    </TouchableOpacity>
                ) : null}
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
    content: { padding: 24, gap: 16 },
    loadingState: {
        paddingVertical: 36,
        alignItems: 'center',
    },
    errorText: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 13,
        textAlign: 'center',
    },
    statusCard: {
        borderRadius: 20,
        padding: 20,
        alignItems: 'center',
        gap: 8,
    },
    statusTitle: {
        fontFamily: 'GoogleSansFlex_700Bold',
        fontSize: 18,
        textAlign: 'center',
    },
    statusSubtitle: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 14,
        textAlign: 'center',
    },
    countdown: {
        fontFamily: 'GoogleSansFlex_700Bold',
        fontSize: 16,
        marginTop: 6,
    },
    card: {
        borderRadius: 18,
        padding: 16,
        gap: 12,
    },
    cardTitle: {
        fontFamily: 'GoogleSansFlex_700Bold',
        fontSize: 16,
        marginBottom: 4,
    },
    detailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
    },
    detailLabel: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 13,
    },
    detailValueRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flexShrink: 1,
    },
    detailValue: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 14,
        flexShrink: 1,
        textAlign: 'right',
    },
    iconBadge: {
        width: 18,
        height: 18,
        borderRadius: 9,
    },
    copyButton: {
        padding: 4,
    },
    footer: {
        padding: 20,
    },
    continueButton: {
        height: 56,
        borderRadius: 28,
        justifyContent: 'center',
        alignItems: 'center',
    },
    continueButtonText: {
        fontSize: 16,
        fontFamily: 'GoogleSansFlex_600SemiBold',
    },
});
