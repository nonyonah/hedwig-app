import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Image,
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
import { useRouter } from 'expo-router';
import { ChevronLeft as CaretLeft, ChevronDown as CaretDown } from '../../components/ui/AppIcon';
import { Colors, useThemeColors } from '../../theme/colors';
import IOSGlassIconButton from '../../components/ui/IOSGlassIconButton';
import { SelectorSheet } from '../../components/SelectorSheet';
import { useOnramp, OnrampFiat, OnrampNetwork, OnrampQuote } from '../../hooks/useOnramp';

const NETWORKS: { id: OnrampNetwork; name: string; icon: any }[] = [
    { id: 'base', name: 'Base', icon: require('../../assets/icons/networks/base.png') },
    { id: 'arbitrum', name: 'Arbitrum', icon: require('../../assets/icons/networks/arbitrum.png') },
    { id: 'polygon', name: 'Polygon', icon: require('../../assets/icons/networks/polygon.png') },
    { id: 'celo', name: 'Celo', icon: require('../../assets/icons/networks/celo.png') },
];

const TOKEN = {
    id: 'USDC',
    name: 'USDC',
    icon: require('../../assets/icons/tokens/usdc.png'),
};

const COUNTRIES: { id: string; name: string; currency: OnrampFiat; flag: string }[] = [
    { id: 'NG', name: 'Nigeria', currency: 'NGN', flag: '🇳🇬' },
    { id: 'KE', name: 'Kenya', currency: 'KES', flag: '🇰🇪' },
    { id: 'TZ', name: 'Tanzania', currency: 'TZS', flag: '🇹🇿' },
    { id: 'MW', name: 'Malawi', currency: 'MWK', flag: '🇲🇼' },
    { id: 'UG', name: 'Uganda', currency: 'UGX', flag: '🇺🇬' },
    { id: 'BR', name: 'Brazil', currency: 'BRL', flag: '🇧🇷' },
];

export default function OnrampAmountScreen() {
    const router = useRouter();
    const themeColors = useThemeColors();
    const { quote } = useOnramp();

    const [amount, setAmount] = useState('');
    const [selectedNetwork, setSelectedNetwork] = useState(NETWORKS[0]);
    const [selectedCountry, setSelectedCountry] = useState(COUNTRIES[0]);
    const [openSheet, setOpenSheet] = useState<'network' | 'token' | 'country' | null>(null);

    const [quoteData, setQuoteData] = useState<OnrampQuote | null>(null);
    const [quoteLoading, setQuoteLoading] = useState(false);
    const [quoteError, setQuoteError] = useState<string | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const fiatAmount = useMemo(() => parseFloat(amount), [amount]);
    const isAmountValid = Number.isFinite(fiatAmount) && fiatAmount > 0;

    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (!isAmountValid) {
            setQuoteData(null);
            setQuoteError(null);
            setQuoteLoading(false);
            return;
        }
        setQuoteLoading(true);
        setQuoteError(null);
        debounceRef.current = setTimeout(async () => {
            try {
                const result = await quote({
                    fiatAmount,
                    fiatCurrency: selectedCountry.currency,
                    token: 'USDC',
                    network: selectedNetwork.id,
                });
                setQuoteData(result);
            } catch (err: any) {
                setQuoteData(null);
                setQuoteError(err?.message || 'Failed to fetch rate');
            } finally {
                setQuoteLoading(false);
            }
        }, 300);
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [fiatAmount, selectedCountry.currency, selectedNetwork.id, isAmountValid, quote]);

    const handleContinue = () => {
        if (!isAmountValid) return;
        router.push({
            pathname: '/onramp/bank' as any,
            params: {
                fiatAmount: String(fiatAmount),
                fiatCurrency: selectedCountry.currency,
                network: selectedNetwork.id,
            },
        });
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
                    <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]}>Buy USDC</Text>
                    <View style={styles.placeholder} />
                </View>

                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={{ flex: 1 }}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
                >
                    <ScrollView
                        contentContainerStyle={styles.content}
                        showsVerticalScrollIndicator={false}
                        bounces={false}
                        overScrollMode="never"
                    >
                        <Text style={[styles.helperTextTop, { color: themeColors.textSecondary }]}>
                            Pay with bank transfer, receive USDC.
                        </Text>

                        <Text style={[styles.inputLabel, { color: themeColors.textPrimary }]}>Network</Text>
                        <TouchableOpacity onPress={() => setOpenSheet('network')}>
                            <View style={[styles.authInputContainer, styles.selectorContainer, { backgroundColor: themeColors.surface }]}>
                                <Image source={selectedNetwork.icon} style={[styles.chainBadgeIcon, { marginRight: 8 }]} />
                                <Text style={[styles.authInput, { color: themeColors.textPrimary, paddingVertical: 0, flex: 1 }]}>
                                    {selectedNetwork.name}
                                </Text>
                                <CaretDown size={20} color={themeColors.textSecondary} strokeWidth={3} />
                            </View>
                        </TouchableOpacity>

                        <Text style={[styles.inputLabel, { color: themeColors.textPrimary }]}>Token</Text>
                        <TouchableOpacity onPress={() => setOpenSheet('token')}>
                            <View style={[styles.authInputContainer, styles.selectorContainer, { backgroundColor: themeColors.surface }]}>
                                <Image source={TOKEN.icon} style={[styles.chainBadgeIcon, { marginRight: 8 }]} />
                                <Text style={[styles.authInput, { color: themeColors.textPrimary, paddingVertical: 0, flex: 1 }]}>
                                    {TOKEN.name}
                                </Text>
                                <CaretDown size={20} color={themeColors.textSecondary} strokeWidth={3} />
                            </View>
                        </TouchableOpacity>

                        <Text style={[styles.inputLabel, { color: themeColors.textPrimary }]}>You pay</Text>
                        <View style={[styles.authInputContainer, { backgroundColor: themeColors.surface }]}>
                            <TextInput
                                style={[styles.authInput, { color: themeColors.textPrimary, flex: 1, fontSize: 24, paddingVertical: 12 }]}
                                value={amount}
                                onChangeText={setAmount}
                                placeholder="0.00"
                                placeholderTextColor={themeColors.textSecondary}
                                keyboardType="decimal-pad"
                                inputMode="decimal"
                            />
                            <Text style={[styles.amountCurrency, { color: themeColors.textSecondary }]}>{selectedCountry.currency}</Text>
                        </View>

                        {(quoteLoading || quoteData) ? (
                            <Text style={[styles.fiatEquivalentText, { color: themeColors.textSecondary }]}>
                                {quoteLoading
                                    ? `Calculating ${TOKEN.name} estimate...`
                                    : quoteData
                                        ? `≈ ${quoteData.netCryptoAmount.toFixed(4)} USDC after 1% fee`
                                        : ''}
                            </Text>
                        ) : null}
                        {quoteError ? (
                            <Text style={[styles.fiatEquivalentText, { color: Colors.error }]}>{quoteError}</Text>
                        ) : null}

                        <Text style={[styles.inputLabel, { color: themeColors.textPrimary }]}>Country</Text>
                        <TouchableOpacity onPress={() => setOpenSheet('country')}>
                            <View style={[styles.authInputContainer, styles.selectorContainer, { backgroundColor: themeColors.surface, marginBottom: 16 }]}>
                                <Text style={{ fontSize: 18, lineHeight: 22, marginRight: 4 }}>{selectedCountry.flag}</Text>
                                <Text style={[styles.authInput, { color: themeColors.textPrimary, paddingVertical: 0 }]}>
                                    {selectedCountry.name} ({selectedCountry.currency})
                                </Text>
                                <CaretDown size={20} color={themeColors.textSecondary} strokeWidth={3} />
                            </View>
                        </TouchableOpacity>

                        <Text style={[styles.helperText, { color: themeColors.textSecondary }]}>
                            Funds settle to your primary {selectedNetwork.name} wallet. Refund details collected next.
                        </Text>

                        <View style={{ height: 100 }} />
                    </ScrollView>

                    <View style={[styles.footer, { backgroundColor: themeColors.background }]}>
                        <TouchableOpacity
                            style={[styles.continueButton, (!isAmountValid || !quoteData) && styles.continueButtonDisabled]}
                            onPress={handleContinue}
                            disabled={!isAmountValid || !quoteData}
                        >
                            <Text style={styles.continueButtonText}>Continue</Text>
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </SafeAreaView>

            <SelectorSheet
                visible={openSheet === 'network'}
                onClose={() => setOpenSheet(null)}
                title="Network"
                options={NETWORKS.map((n) => ({ id: n.id, label: n.name, icon: n.icon }))}
                selectedId={selectedNetwork.id}
                onSelect={(id) => {
                    const next = NETWORKS.find((n) => n.id === id);
                    if (next) setSelectedNetwork(next);
                }}
            />
            <SelectorSheet
                visible={openSheet === 'token'}
                onClose={() => setOpenSheet(null)}
                title="Token"
                options={[{ id: TOKEN.id, label: TOKEN.name, icon: TOKEN.icon }]}
                selectedId={TOKEN.id}
                onSelect={() => { /* USDC only for now */ }}
            />
            <SelectorSheet
                visible={openSheet === 'country'}
                onClose={() => setOpenSheet(null)}
                title="Country"
                options={COUNTRIES.map((c) => ({ id: c.id, label: `${c.name} (${c.currency})`, flagEmoji: c.flag }))}
                selectedId={selectedCountry.id}
                onSelect={(id) => {
                    const next = COUNTRIES.find((c) => c.id === id);
                    if (next) setSelectedCountry(next);
                }}
            />
        </View>
    );
}

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
    inputLabel: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 14,
        marginBottom: 8,
        marginLeft: 4,
    },
    authInputContainer: {
        borderRadius: 16,
        marginBottom: 16,
        paddingHorizontal: 16,
        paddingVertical: 4,
        flexDirection: 'row',
        alignItems: 'center',
    },
    selectorContainer: {
        minHeight: 56,
        justifyContent: 'center',
    },
    authInput: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 16,
        paddingVertical: 14,
        flex: 1,
    },
    amountCurrency: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 14,
        marginLeft: 8,
    },
    fiatEquivalentText: {
        fontSize: 13,
        marginTop: -8,
        marginBottom: 14,
        marginLeft: 4,
        fontFamily: 'GoogleSansFlex_500Medium',
    },
    chainBadgeIcon: {
        width: 20,
        height: 20,
        borderRadius: 10,
    },
    helperText: {
        fontSize: 13,
        textAlign: 'center',
        marginTop: 16,
        fontFamily: 'GoogleSansFlex_400Regular',
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
