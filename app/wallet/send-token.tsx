import React, { useCallback, useMemo, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useThemeColors } from '../../theme/colors';
import { useWallet } from '../../hooks/useWallet';
import { useGatewayBalance, formatGatewayUsdc } from '../../hooks/useGatewayBalance';
import { useSettings } from '../../context/SettingsContext';
import IOSGlassIconButton from '../../components/ui/IOSGlassIconButton';
import { SelectorSheet } from '../../components/SelectorSheet';
import {
    detectRecipientChain,
    isValidSendChain,
    parseNumeric,
    SendChain,
    shortenAddress,
} from './sendFlow';
import { HugeiconsIcon } from '@hugeicons/react-native';
import * as HugeiconsCore from '@hugeicons/core-free-icons';

const CaretLeft = (props: any) => <HugeiconsIcon icon={(HugeiconsCore as any).ArrowLeft01Icon} {...props} />;

const USDC_ICON = require('../../assets/icons/tokens/usdc.png');
const ETH_ICON = require('../../assets/icons/tokens/eth.png');
const POL_ICON = require('../../assets/icons/networks/polygon.png');
const SOL_ICON = require('../../assets/icons/networks/solana.png');

const getTokenBalance = (entry: any, decimals: number): number => {
    const displayToken = parseNumeric(entry?.display_values?.token);
    if (displayToken > 0) return displayToken;
    const rawValue = entry?.raw_value;
    if (typeof rawValue === 'string' && rawValue.length > 0) {
        const parsedRaw = Number(rawValue);
        if (Number.isFinite(parsedRaw) && parsedRaw > 0) {
            return parsedRaw / Math.pow(10, decimals);
        }
    }
    return 0;
};

interface DisplayToken {
    id: string;
    /** Routing hint passed to send.tsx — `usdc` triggers the destination chain picker. */
    sendToken: 'usdc' | 'eth' | 'pol' | 'sol';
    /** Default chain for the send screen. For unified USDC this is just the seed value. */
    chain: SendChain;
    name: string;
    symbol: string;
    sub: string | null;
    amount: number;
    usd: number;
    icon: any;
    /** Optional small badge image (network icon) for native tokens. */
    badgeIcon?: any;
    /** When true, the row routes to the Gateway send flow with a chain picker. */
    unified?: boolean;
}

export default function SendTokenScreen() {
    const themeColors = useThemeColors();
    const router = useRouter();
    const { balances, fetchBalances } = useWallet();
    const gatewayBalance = useGatewayBalance();
    const settings = useSettings();
    const aggregatedEnabled = settings?.gatewayAutoDepositEnabled ?? false;
    const params = useLocalSearchParams<{ recipient?: string; chain?: string }>();
    const [chainPickerOpen, setChainPickerOpen] = useState(false);

    // Reset the chain picker open state whenever the user navigates back into
    // this screen so it doesn't reopen automatically and feel like a loop.
    useFocusEffect(
        useCallback(() => {
            setChainPickerOpen(false);
        }, [])
    );

    const recipient = typeof params.recipient === 'string' ? params.recipient.trim() : '';
    const routeChain = typeof params.chain === 'string' && isValidSendChain(params.chain) ? params.chain : null;
    const detectedChain = detectRecipientChain(recipient);
    const chain = (routeChain || detectedChain) as SendChain | null;
    const isEvmRecipient = chain !== 'solana';

    useFocusEffect(
        useCallback(() => {
            fetchBalances();
        }, [fetchBalances])
    );

    const bal = (c: string, asset: string) => balances.find((b) => b.chain === c && b.asset === asset);

    const tokens: DisplayToken[] = useMemo(() => {
        if (!chain) return [];

        const eoaUsdc = {
            base: getTokenBalance(bal('base', 'usdc'), 6),
            arbitrum: getTokenBalance(bal('arbitrum', 'usdc'), 6),
            polygon: getTokenBalance(bal('polygon', 'usdc'), 6),
            optimism: getTokenBalance(bal('optimism', 'usdc'), 6),
            solana: getTokenBalance(bal('solana', 'usdc'), 6),
        };
        const eoaUsdcTotal = Object.values(eoaUsdc).reduce((s, n) => s + n, 0);
        const gatewayUsdc = parseFloat(formatGatewayUsdc(gatewayBalance.available)) || 0;
        const aggregatedUsdc = gatewayUsdc + eoaUsdcTotal;

        const list: DisplayToken[] = [];
        // Aggregated row always sums every chain's USDC (Gateway-side plus
        // anything still at the EOA waiting to be deposited) so the user
        // sees their total spendable USDC at a glance. Whether the send
        // routes through Gateway or a direct ERC-20 transfer is decided in
        // the confirmation modal based on the auto-deposit setting and the
        // chain holding liquidity.
        const aggregatedRowAmount = aggregatedUsdc;
        list.push({
            id: 'unified-usdc',
            sendToken: 'usdc',
            chain: isEvmRecipient ? 'base' : 'solana',
            name: 'USD Coin',
            symbol: 'USDC',
            sub: 'Aggregated balance',
            amount: aggregatedRowAmount,
            usd: aggregatedRowAmount,
            icon: USDC_ICON,
            unified: true,
        });
        if (!aggregatedEnabled && isEvmRecipient) {
            // Per-chain USDC rows so users can pick which leg of their EOA
            // balance funds the send. Each routes through a direct ERC-20
            // transfer on that chain.
            list.push(
                { id: 'usdc-base',     sendToken: 'usdc', chain: 'base',     name: 'USD Coin', symbol: 'USDC', sub: 'Base',     amount: eoaUsdc.base,     usd: eoaUsdc.base,     icon: USDC_ICON, badgeIcon: require('../../assets/icons/networks/base.png') },
                { id: 'usdc-arbitrum', sendToken: 'usdc', chain: 'arbitrum', name: 'USD Coin', symbol: 'USDC', sub: 'Arbitrum', amount: eoaUsdc.arbitrum, usd: eoaUsdc.arbitrum, icon: USDC_ICON, badgeIcon: require('../../assets/icons/networks/arbitrum.png') },
                { id: 'usdc-polygon',  sendToken: 'usdc', chain: 'polygon',  name: 'USD Coin', symbol: 'USDC', sub: 'Polygon',  amount: eoaUsdc.polygon,  usd: eoaUsdc.polygon,  icon: USDC_ICON, badgeIcon: require('../../assets/icons/networks/polygon.png') },
                { id: 'usdc-optimism', sendToken: 'usdc', chain: 'optimism', name: 'USD Coin', symbol: 'USDC', sub: 'Optimism', amount: eoaUsdc.optimism, usd: eoaUsdc.optimism, icon: USDC_ICON, badgeIcon: require('../../assets/icons/networks/optimism.png') },
            );
        } else if (!aggregatedEnabled && !isEvmRecipient) {
            list.push(
                { id: 'usdc-solana', sendToken: 'usdc', chain: 'solana', name: 'USD Coin', symbol: 'USDC', sub: 'Solana', amount: eoaUsdc.solana, usd: eoaUsdc.solana, icon: USDC_ICON, badgeIcon: require('../../assets/icons/networks/solana.png') },
            );
        }

        if (isEvmRecipient) {
            list.push({
                id: 'eth-base',
                sendToken: 'eth',
                chain: 'base',
                name: 'Ethereum',
                symbol: 'ETH',
                sub: 'Base',
                amount: getTokenBalance(bal('base', 'eth'), 18),
                usd: parseNumeric(bal('base', 'eth')?.display_values?.usd),
                icon: ETH_ICON,
                badgeIcon: require('../../assets/icons/networks/base.png'),
            });
            list.push({
                id: 'eth-arbitrum',
                sendToken: 'eth',
                chain: 'arbitrum',
                name: 'Ethereum',
                symbol: 'ETH',
                sub: 'Arbitrum',
                amount: getTokenBalance(bal('arbitrum', 'eth'), 18),
                usd: parseNumeric(bal('arbitrum', 'eth')?.display_values?.usd),
                icon: ETH_ICON,
                badgeIcon: require('../../assets/icons/networks/arbitrum.png'),
            });
            list.push({
                id: 'pol-polygon',
                sendToken: 'pol',
                chain: 'polygon',
                name: 'Polygon',
                symbol: 'POL',
                sub: 'Polygon',
                amount: getTokenBalance(bal('polygon', 'pol'), 18),
                usd: parseNumeric(bal('polygon', 'pol')?.display_values?.usd),
                icon: POL_ICON,
                badgeIcon: require('../../assets/icons/networks/polygon.png'),
            });
            list.push({
                id: 'eth-optimism',
                sendToken: 'eth',
                chain: 'optimism',
                name: 'Ethereum',
                symbol: 'ETH',
                sub: 'Optimism',
                amount: getTokenBalance(bal('optimism', 'eth'), 18),
                usd: parseNumeric(bal('optimism', 'eth')?.display_values?.usd),
                icon: ETH_ICON,
                badgeIcon: require('../../assets/icons/networks/optimism.png'),
            });
        } else {
            list.push({
                id: 'sol-solana',
                sendToken: 'sol',
                chain: 'solana',
                name: 'Solana',
                symbol: 'SOL',
                sub: 'Solana',
                amount: getTokenBalance(bal('solana', 'sol'), 9),
                usd: parseNumeric(bal('solana', 'sol')?.display_values?.usd),
                icon: SOL_ICON,
                badgeIcon: require('../../assets/icons/networks/solana.png'),
            });
        }

        return list;
    }, [balances, chain, gatewayBalance.available, isEvmRecipient, aggregatedEnabled]);

    if (!recipient || !chain) {
        router.replace('/wallet/send-address');
        return null;
    }

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
            <View style={styles.header}>
                <IOSGlassIconButton
                    onPress={() => router.back()}
                    systemImage="chevron.left"
                    containerStyle={styles.backButton}
                    circleStyle={[styles.backButtonCircle, { backgroundColor: themeColors.surface }]}
                    icon={<CaretLeft size={20} color={themeColors.textPrimary} strokeWidth={3} />}
                />
                <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]}>Send</Text>
                <View style={styles.iconButtonSpacer} />
            </View>

            <TouchableOpacity
                style={[styles.toCard, { backgroundColor: themeColors.surface }]}
                onPress={() => router.back()}
            >
                <Text style={[styles.toLabel, { color: themeColors.textSecondary }]}>To</Text>
                <View style={[styles.addressPill, { backgroundColor: themeColors.background }]}>
                    <Text style={[styles.addressPillText, { color: themeColors.textPrimary }]}>{shortenAddress(recipient, 8, 5)}</Text>
                </View>
            </TouchableOpacity>

            <View style={styles.tabRow}>
                <Text style={[styles.tabActive, { color: themeColors.textPrimary }]}>Tokens</Text>
            </View>
            <View style={[styles.divider, { backgroundColor: themeColors.surface }]} />

            <ScrollView contentContainerStyle={styles.listContent}>
                {tokens.map((option) => (
                    <TouchableOpacity
                        key={option.id}
                        style={styles.tokenItem}
                        onPress={() => {
                            if (option.unified) {
                                // For unified USDC sends the destination
                                // chain is user-selectable — open the picker
                                // sheet so the user commits before the
                                // amount entry screen.
                                setChainPickerOpen(true);
                                return;
                            }
                            router.push({
                                pathname: '/wallet/send',
                                params: {
                                    recipient,
                                    chain: option.chain,
                                    token: option.sendToken,
                                    unified: '0',
                                },
                            });
                        }}
                    >
                        <View style={styles.tokenLeft}>
                            <View style={styles.tokenIconContainer}>
                                <Image source={option.icon} style={styles.tokenIconImage} />
                                {option.badgeIcon ? (
                                    <View style={styles.chainBadgeOverlay}>
                                        <Image source={option.badgeIcon} style={styles.chainBadgeIcon} />
                                    </View>
                                ) : null}
                            </View>
                            <View>
                                <Text style={[styles.tokenName, { color: themeColors.textPrimary }]}>{option.name}</Text>
                                <Text style={[styles.tokenSymbol, { color: themeColors.textSecondary }]}>
                                    {option.amount.toFixed(option.symbol === 'USDC' ? 2 : 6).replace(/\.?0+$/, '')} {option.symbol}{option.sub ? ` • ${option.sub}` : ''}
                                </Text>
                            </View>
                        </View>
                        <View style={styles.tokenRight}>
                            <Text style={[styles.tokenBalance, { color: themeColors.textPrimary }]}>${option.usd.toFixed(2)}</Text>
                        </View>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            <SelectorSheet
                visible={chainPickerOpen}
                onClose={() => setChainPickerOpen(false)}
                title="Destination network"
                options={
                    isEvmRecipient
                        ? [
                            { id: 'base',     label: 'Base',     icon: require('../../assets/icons/networks/base.png') },
                            { id: 'arbitrum', label: 'Arbitrum', icon: require('../../assets/icons/networks/arbitrum.png') },
                            { id: 'polygon',  label: 'Polygon',  icon: require('../../assets/icons/networks/polygon.png') },
                            { id: 'optimism', label: 'Optimism', icon: require('../../assets/icons/networks/optimism.png') },
                        ]
                        : [
                            { id: 'solana', label: 'Solana', icon: require('../../assets/icons/networks/solana.png') },
                        ]
                }
                selectedId={(isEvmRecipient ? 'base' : 'solana') as string}
                onSelect={(id) => {
                    if (!isValidSendChain(id)) return;
                    setChainPickerOpen(false);
                    router.push({
                        pathname: '/wallet/send',
                        params: {
                            recipient,
                            chain: id,
                            token: 'usdc',
                            unified: '1',
                        },
                    });
                }}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 8,
        paddingBottom: 14,
    },
    backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    backButtonCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    iconButtonSpacer: { width: 40, height: 40 },
    headerTitle: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 22 },
    toCard: {
        marginHorizontal: 20,
        borderRadius: 22,
        paddingHorizontal: 14,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    toLabel: { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 17 },
    addressPill: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
    addressPillText: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 17 },
    tabRow: { marginTop: 20, paddingHorizontal: 20, flexDirection: 'row', gap: 0, alignItems: 'center' },
    tabActive: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 18 },
    divider: { height: 1, marginTop: 10, marginHorizontal: 20, opacity: 0.7 },
    listContent: { paddingHorizontal: 20, paddingVertical: 10 },
    tokenItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14 },
    tokenLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    tokenIconContainer: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', position: 'relative' },
    tokenIconImage: { width: 32, height: 32, borderRadius: 16 },
    chainBadgeOverlay: { position: 'absolute', bottom: -2, right: -2, backgroundColor: '#FFFFFF', borderRadius: 8, padding: 2 },
    chainBadgeIcon: { width: 12, height: 12, borderRadius: 6 },
    tokenName: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 17 },
    tokenSymbol: { fontFamily: 'GoogleSansFlex_400Regular', fontSize: 14, marginTop: 2 },
    tokenRight: { alignItems: 'flex-end' },
    tokenBalance: { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 17 },
});
