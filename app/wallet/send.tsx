import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { TrueSheet } from '@hedwig/true-sheet';
import { useThemeColors } from '../../theme/colors';
import { TransactionConfirmationModal } from '../../components/TransactionConfirmationModal';
import { useWallet } from '../../hooks/useWallet';
import Button from '../../components/Button';
import IOSGlassIconButton from '../../components/ui/IOSGlassIconButton';
import {
    detectRecipientChain,
    EVM_CHAINS,
    getTokenOptionsForChain,
    isValidSendChain,
    parseNumeric,
    SendChain,
    shortenAddress,
} from './sendFlow';
import { HugeiconsIcon } from '@hugeicons/react-native';
import * as HugeiconsCore from '@hugeicons/core-free-icons';

const CaretLeft = (props: any) => <HugeiconsIcon icon={(HugeiconsCore as any).ArrowLeft01Icon} {...props} />;
const ArrowUpDown = (props: any) => <HugeiconsIcon icon={(HugeiconsCore as any).ArrowUpDownIcon} {...props} />;
const Delete = (props: any) => <HugeiconsIcon icon={(HugeiconsCore as any).Delete02Icon} {...props} />;


const KEYS: Array<Array<string>> = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['.', '0', 'back'],
];

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

const floorToDecimals = (value: number, decimals: number): number => {
    if (!Number.isFinite(value) || value <= 0) return 0;
    const factor = Math.pow(10, decimals);
    return Math.floor(value * factor) / factor;
};

const formatAmount = (value: number, decimals: number): string => {
    const floored = floorToDecimals(value, decimals);
    return floored.toFixed(decimals).replace(/\.?0+$/, '') || '0';
};

export default function SendCryptoScreen() {
    const themeColors = useThemeColors();
    const router = useRouter();
    const { address: evmAddress, solanaAddress, balances, fetchBalances } = useWallet();

    const params = useLocalSearchParams<{ recipient?: string; chain?: string; token?: string }>();
    const recipient = typeof params.recipient === 'string' ? params.recipient.trim() : '';
    const routeChain = typeof params.chain === 'string' && isValidSendChain(params.chain) ? params.chain : null;
    const detectedChain = detectRecipientChain(recipient);
    const chain = (routeChain || detectedChain) as SendChain | null;
    const tokenAsset = typeof params.token === 'string' ? params.token.toLowerCase() : '';

    const [amount, setAmount] = useState('0');
    const [amountMode, setAmountMode] = useState<'crypto' | 'fiat'>('crypto');
    const [txData, setTxData] = useState<any>(null);
    const [showTxModal, setShowTxModal] = useState(false);
    const txModalRef = useRef<TrueSheet>(null);

    useFocusEffect(
        useCallback(() => {
            fetchBalances();
        }, [fetchBalances])
    );

    const tokenOptions = useMemo(() => (chain ? getTokenOptionsForChain(chain) : []), [chain]);
    const selectedOption = useMemo(
        () => tokenOptions.find((option) => option.asset === tokenAsset) || tokenOptions[0],
        [tokenAsset, tokenOptions]
    );

    const selectedBalanceEntry = useMemo(
        () =>
            balances.find(
                (entry) =>
                    entry.chain === selectedOption?.chain &&
                    entry.asset === selectedOption?.asset
            ),
        [balances, selectedOption]
    );

    const selectedTokenBalance = selectedOption ? getTokenBalance(selectedBalanceEntry, selectedOption.decimals) : 0;
    const selectedUsdBalance = parseNumeric(selectedBalanceEntry?.display_values?.usd);

    const unitUsd = useMemo(() => {
        if (!selectedOption) return 0;
        if (selectedOption.asset === 'usdc') return 1;
        if (selectedTokenBalance > 0) return selectedUsdBalance / selectedTokenBalance;
        return 0;
    }, [selectedOption, selectedTokenBalance, selectedUsdBalance]);
    const inputDecimals = selectedOption?.asset === 'usdc' ? 6 : 6;

    const amountNumber = amount === '' || amount === '.' ? 0 : parseFloat(amount);
    const cryptoAmount = amountMode === 'crypto' ? amountNumber : (unitUsd > 0 ? amountNumber / unitUsd : 0);
    const fiatAmount = amountMode === 'fiat' ? amountNumber : amountNumber * unitUsd;
    const amountDisplay = amount === '' ? '0' : amount;
    const canContinue = !!recipient && !!selectedOption && cryptoAmount > 0;

    useEffect(() => {
        if (!recipient || !chain) {
            router.replace('/wallet/send-address');
            return;
        }
        if (!selectedOption) {
            router.replace({ pathname: '/wallet/send-token', params: { recipient, chain } });
        }
    }, [chain, recipient, router, selectedOption]);

    if (!recipient || !chain || !selectedOption) return null;

    const handleNumberKey = (key: string) => {
        if (key === 'back') {
            const next = amount.length > 1 ? amount.slice(0, -1) : '0';
            setAmount(next);
            return;
        }

        if (key === '.') {
            if (amount.includes('.')) return;
            setAmount((prev) => `${prev}.`);
            return;
        }

        setAmount((prev) => {
            if (prev === '0') return key;
            return `${prev}${key}`;
        });
    };

    const handleUseMax = () => {
        if (amountMode === 'fiat') {
            setAmount(formatAmount(selectedUsdBalance, 2));
            return;
        }
        setAmount(formatAmount(selectedTokenBalance, inputDecimals));
    };

    const handleSwapAmounts = () => {
        if (amountMode === 'crypto') {
            const nextFiat = formatAmount(fiatAmount, 2);
            setAmount(nextFiat);
            setAmountMode('fiat');
            return;
        }
        const nextCrypto = formatAmount(cryptoAmount, inputDecimals);
        setAmount(nextCrypto);
        setAmountMode('crypto');
    };

    const handleContinue = () => {
        if (!canContinue) {
            Alert.alert('Invalid details', 'Please enter a valid amount.');
            return;
        }
        const maxAllowed = floorToDecimals(selectedTokenBalance, selectedOption.decimals);
        const requested = floorToDecimals(cryptoAmount, selectedOption.decimals);

        if (requested > maxAllowed) {
            Alert.alert(
                'Insufficient balance',
                `You can send up to ${formatAmount(maxAllowed, selectedOption.decimals)} ${selectedOption.token}.`
            );
            return;
        }

        if (EVM_CHAINS.has(selectedOption.chain) && !evmAddress) {
            Alert.alert('Wallet unavailable', 'No EVM wallet found for this account.');
            return;
        }

        if (selectedOption.chain === 'solana' && !solanaAddress) {
            Alert.alert('Wallet unavailable', 'No Solana wallet found for this account.');
            return;
        }

        setTxData({
            amount: formatAmount(requested, selectedOption.decimals),
            token: selectedOption.token,
            recipient,
            network: selectedOption.chain,
        });
        setShowTxModal(true);
        setTimeout(() => txModalRef.current?.present(), 100);
    };

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
                onPress={() => router.replace({ pathname: '/wallet/send-address', params: { recipient } })}
            >
                <Text style={[styles.toLabel, { color: themeColors.textSecondary }]}>To</Text>
                <View style={[styles.addressPill, { backgroundColor: themeColors.background }]}>
                    <Text style={[styles.addressPillText, { color: themeColors.textPrimary }]}>{shortenAddress(recipient, 8, 5)}</Text>
                </View>
            </TouchableOpacity>

            <View style={styles.amountSection}>
                <Text style={[styles.amountText, { color: themeColors.textPrimary }]}>
                    {amountMode === 'fiat' ? `$${amountDisplay}` : amountDisplay}
                </Text>
                <TouchableOpacity style={styles.amountSwapRow} onPress={handleSwapAmounts} activeOpacity={0.8}>
                    <View style={[styles.swapIconBadge, { backgroundColor: themeColors.surface }]}>
                        <ArrowUpDown size={14} color={themeColors.textSecondary} />
                    </View>
                    <Text style={[styles.amountSubText, { color: themeColors.textSecondary }]}>
                        {amountMode === 'fiat'
                            ? `${cryptoAmount.toFixed(selectedOption.asset === 'usdc' ? 2 : 6).replace(/\.?0+$/, '')} ${selectedOption.token}`
                            : `$${fiatAmount.toFixed(2)}`}
                    </Text>
                </TouchableOpacity>
            </View>

            <TouchableOpacity
                style={[styles.assetCard, { backgroundColor: themeColors.surface }]}
                onPress={() => router.replace({ pathname: '/wallet/send-token', params: { recipient, chain } })}
                activeOpacity={0.9}
            >
                <View style={styles.assetLeft}>
                    <View style={styles.tokenIconContainer}>
                        <Image source={selectedOption.tokenIcon} style={styles.tokenIconImage} />
                        <View style={styles.chainBadgeOverlay}>
                            <Image source={selectedOption.chainIcon} style={styles.chainBadgeIcon} />
                        </View>
                    </View>
                    <View>
                        <Text style={[styles.assetTitle, { color: themeColors.textPrimary }]}>{selectedOption.token}</Text>
                        <Text style={[styles.assetSubtitle, { color: themeColors.textSecondary }]}> 
                            {selectedTokenBalance.toFixed(selectedOption.asset === 'usdc' ? 3 : 6).replace(/\.0+$/, '')} {selectedOption.token}
                        </Text>
                    </View>
                </View>
                <View style={styles.assetRight}>
                    <TouchableOpacity style={[styles.useMaxButton, { backgroundColor: themeColors.background }]} onPress={handleUseMax}>
                        <Text style={[styles.useMaxText, { color: themeColors.textPrimary }]}>Use Max</Text>
                    </TouchableOpacity>
                </View>
            </TouchableOpacity>

            <View style={styles.keypadWrap}>
                {KEYS.map((row, rowIndex) => (
                    <View key={`row-${rowIndex}`} style={styles.keypadRow}>
                        {row.map((key) => (
                            <TouchableOpacity
                                key={key}
                                style={styles.keypadButton}
                                onPress={() => handleNumberKey(key)}
                            >
                                {key === 'back' ? (
                                    <Delete size={26} color={themeColors.textPrimary} />
                                ) : (
                                    <Text style={[styles.keypadText, { color: themeColors.textPrimary }]}>{key}</Text>
                                )}
                            </TouchableOpacity>
                        ))}
                    </View>
                ))}
            </View>

            <View style={styles.footer}>
                <Button title="Continue" onPress={handleContinue} size="large" disabled={!canContinue} />
            </View>

            {txData ? (
                <TransactionConfirmationModal
                    ref={txModalRef}
                    visible={showTxModal}
                    onClose={() => setShowTxModal(false)}
                    data={txData}
                    onSuccess={() => {
                        setShowTxModal(false);
                        router.back();
                    }}
                />
            ) : null}
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
        paddingBottom: 12,
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
        flex: 1,
        borderRadius: 999,
        paddingHorizontal: 14,
        paddingVertical: 6,
    },
    addressPillText: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 17,
    },
    amountSection: {
        alignItems: 'center',
        marginTop: 40,
        marginBottom: 24,
    },
    amountText: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 74,
        lineHeight: 82,
    },
    amountSubText: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 22,
    },
    amountSwapRow: {
        marginTop: 4,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    swapIconBadge: {
        width: 20,
        height: 20,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    assetCard: {
        marginHorizontal: 20,
        borderRadius: 22,
        paddingHorizontal: 14,
        paddingVertical: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 14,
    },
    assetLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
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
    assetTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 18,
    },
    assetSubtitle: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 14,
    },
    assetRight: {
        alignItems: 'flex-end',
        justifyContent: 'center',
        minWidth: 88,
    },
    useMaxButton: {
        borderRadius: 999,
        paddingHorizontal: 14,
        paddingVertical: 8,
    },
    useMaxText: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 13,
    },
    keypadWrap: {
        marginHorizontal: 20,
        marginTop: 6,
        gap: 8,
    },
    keypadRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    keypadButton: {
        width: '33%',
        height: 72,
        alignItems: 'center',
        justifyContent: 'center',
    },
    keypadText: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 44,
        lineHeight: 50,
    },
    footer: {
        marginTop: 'auto',
        paddingHorizontal: 20,
        paddingBottom: 18,
        paddingTop: 8,
    },
});
