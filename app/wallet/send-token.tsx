import React, { useCallback, useEffect, useMemo } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useThemeColors } from '../../theme/colors';
import { useWallet } from '../../hooks/useWallet';
import IOSGlassIconButton from '../../components/ui/IOSGlassIconButton';
import {
    detectRecipientChain,
    getTokenOptionsForChain,
    isValidSendChain,
    parseNumeric,
    SendChain,
    shortenAddress,
} from './sendFlow';
import { HugeiconsIcon } from '@hugeicons/react-native';
import * as HugeiconsCore from '@hugeicons/core-free-icons';

const CaretLeft = (props: any) => <HugeiconsIcon icon={(HugeiconsCore as any).ArrowLeft01Icon} {...props} />;


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

export default function SendTokenScreen() {
    const themeColors = useThemeColors();
    const router = useRouter();
    const { balances, fetchBalances } = useWallet();
    const params = useLocalSearchParams<{ recipient?: string; chain?: string }>();

    const recipient = typeof params.recipient === 'string' ? params.recipient.trim() : '';
    const routeChain = typeof params.chain === 'string' && isValidSendChain(params.chain) ? params.chain : null;
    const detectedChain = detectRecipientChain(recipient);
    const chain = (routeChain || detectedChain) as SendChain | null;

    useFocusEffect(
        useCallback(() => {
            fetchBalances();
        }, [fetchBalances])
    );

    const tokenOptions = useMemo(() => {
        if (!chain) return [];
        return getTokenOptionsForChain(chain).map((option) => {
            const entry = balances.find((balance) => balance.chain === option.chain && balance.asset === option.asset);
            const amount = getTokenBalance(entry, option.decimals);
            const usd = parseNumeric(entry?.display_values?.usd);
            return { ...option, amount, usd };
        });
    }, [balances, chain]);

    useEffect(() => {
        if (!recipient || !chain) {
            router.replace('/wallet/send-address');
        }
    }, [chain, recipient, router]);

    if (!recipient || !chain) return null;

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}> 
            <View style={styles.header}>
                <IOSGlassIconButton
                    onPress={() => router.replace({ pathname: '/wallet/send-address', params: { recipient } })}
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
                onPress={() => router.replace({ pathname: '/wallet/send-address', params: { recipient } })}
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
                {tokenOptions.map((option) => (
                    <TouchableOpacity
                        key={option.id}
                        style={styles.tokenItem}
                        onPress={() =>
                            router.replace({
                                pathname: '/wallet/send',
                                params: {
                                    recipient,
                                    chain: option.chain, // use the token's actual chain, not the detected chain
                                    token: option.asset,
                                },
                            })
                        }
                    >
                        <View style={styles.tokenLeft}>
                            <View style={styles.tokenIconContainer}>
                                <Image source={option.tokenIcon} style={styles.tokenIconImage} />
                                <View style={styles.chainBadgeOverlay}>
                                    <Image source={option.chainIcon} style={styles.chainBadgeIcon} />
                                </View>
                            </View>
                            <View>
                                <Text style={[styles.tokenName, { color: themeColors.textPrimary }]}>{option.name}</Text>
                                <Text style={[styles.tokenSymbol, { color: themeColors.textSecondary }]}>
                                    {option.amount.toFixed(option.asset === 'usdc' ? 3 : 6).replace(/\.0+$/, '')} {option.token}
                                </Text>
                            </View>
                        </View>
                        <View style={styles.tokenRight}>
                            <Text style={[styles.tokenBalance, { color: themeColors.textPrimary }]}>${option.usd.toFixed(2)}</Text>
                        </View>
                    </TouchableOpacity>
                ))}
            </ScrollView>
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
    backButton: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    backButtonCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    iconButtonSpacer: {
        width: 40,
        height: 40,
    },
    headerTitle: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 22,
    },
    toCard: {
        marginHorizontal: 20,
        borderRadius: 22,
        paddingHorizontal: 14,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    toLabel: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 17,
    },
    addressPill: {
        borderRadius: 999,
        paddingHorizontal: 14,
        paddingVertical: 6,
    },
    addressPillText: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 17,
    },
    tabRow: {
        marginTop: 20,
        paddingHorizontal: 20,
        flexDirection: 'row',
        gap: 0,
        alignItems: 'center',
    },
    tabActive: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 18,
    },
    divider: {
        height: 1,
        marginTop: 10,
        marginHorizontal: 20,
        opacity: 0.7,
    },
    listContent: {
        paddingHorizontal: 20,
        paddingVertical: 10,
    },
    tokenItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 14,
    },
    tokenLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    tokenIconContainer: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
    },
    tokenIconImage: {
        width: 32,
        height: 32,
        borderRadius: 16,
    },
    chainBadgeOverlay: {
        position: 'absolute',
        bottom: -2,
        right: -2,
        backgroundColor: '#FFFFFF',
        borderRadius: 8,
        padding: 2,
    },
    chainBadgeIcon: {
        width: 12,
        height: 12,
        borderRadius: 6,
    },
    tokenName: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 17,
    },
    tokenSymbol: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 14,
        marginTop: 2,
    },
    tokenRight: {
        alignItems: 'flex-end',
    },
    tokenBalance: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 17,
    },
});
