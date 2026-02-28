import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { ChevronLeft as CaretLeft, ScanLine, Wallet, History } from '../../components/ui/AppIcon';
import { useThemeColors } from '../../theme/colors';
import {
    detectRecipientChain,
    readRecentRecipients,
    saveRecentRecipient,
    SendChain,
    shortenAddress,
} from './sendFlow';
import Button from '../../components/Button';

export default function SendAddressScreen() {
    const themeColors = useThemeColors();
    const router = useRouter();
    const params = useLocalSearchParams<{ recipient?: string }>();

    const [address, setAddress] = useState(typeof params.recipient === 'string' ? params.recipient : '');
    const [recentRecipients, setRecentRecipients] = useState<{ address: string; chain: SendChain; updatedAt: number }[]>([]);

    const detectedChain = useMemo(() => detectRecipientChain(address), [address]);
    const matchingRecent = useMemo(
        () => (detectedChain ? recentRecipients.filter((entry) => entry.chain === detectedChain) : recentRecipients),
        [detectedChain, recentRecipients]
    );

    const loadRecent = useCallback(async () => {
        const entries = await readRecentRecipients();
        setRecentRecipients(entries);
    }, []);

    useEffect(() => {
        loadRecent();
    }, [loadRecent]);

    const handlePaste = async () => {
        const text = (await Clipboard.getStringAsync()).trim();
        if (!text) {
            Alert.alert('Clipboard empty', 'Copy an address first, then tap Paste.');
            return;
        }
        setAddress(text);
    };

    const goToTokenSelect = async (candidate: string) => {
        const chain = detectRecipientChain(candidate);
        if (!chain) {
            Alert.alert('Unsupported address', 'Enter a valid EVM (0x...) or Solana wallet address.');
            return;
        }

        const recipient = candidate.trim();
        await saveRecentRecipient(recipient, chain);
        router.replace({ pathname: '/wallet/send-token', params: { recipient, chain } });
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
            <View style={styles.header}>
                <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                    <View style={[styles.backButtonCircle, { backgroundColor: themeColors.surface }]}>
                        <CaretLeft size={20} color={themeColors.textPrimary} strokeWidth={3} />
                    </View>
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]}>Send</Text>
                <View style={styles.iconButtonSpacer} />
            </View>

            <View style={[styles.addressInputWrap, { backgroundColor: themeColors.surface }]}> 
                <Text style={[styles.toLabel, { color: themeColors.textSecondary }]}>To</Text>
                <TextInput
                    value={address}
                    onChangeText={setAddress}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="ENS or Address"
                    placeholderTextColor={themeColors.textTertiary}
                    style={[styles.addressInput, { color: themeColors.textPrimary }]}
                />
                <TouchableOpacity style={[styles.pasteBtn, { backgroundColor: themeColors.background }]} onPress={handlePaste}>
                    <Text style={[styles.pasteBtnText, { color: themeColors.textPrimary }]}>Paste</Text>
                </TouchableOpacity>
            </View>

            <TouchableOpacity
                style={styles.scanRow}
                onPress={() => Alert.alert('QR scanner', 'QR scanning is not enabled in this build yet. Paste or choose a recent address for now.')}
            >
                <View style={[styles.scanIconWrap, { backgroundColor: themeColors.surface }]}> 
                    <ScanLine size={24} color={themeColors.textSecondary} />
                </View>
                <View>
                    <Text style={[styles.scanTitle, { color: themeColors.textPrimary }]}>Scan QR Code</Text>
                    <Text style={[styles.scanSubtitle, { color: themeColors.textSecondary }]}>Tap to scan an address</Text>
                </View>
            </TouchableOpacity>

            {matchingRecent.length > 0 && (
                <View style={styles.matchingBlock}>
                    <View style={styles.matchingHeader}>
                        <History size={18} color={themeColors.textSecondary} />
                        <Text style={[styles.matchingTitle, { color: themeColors.textSecondary }]}>Recents</Text>
                    </View>
                    {matchingRecent.slice(0, 4).map((entry) => (
                        <TouchableOpacity
                            key={`${entry.address}-${entry.updatedAt}`}
                            style={styles.recentRow}
                            onPress={() => goToTokenSelect(entry.address)}
                        >
                            <View style={[styles.recentIconWrap, { backgroundColor: themeColors.surface }]}> 
                                <Wallet size={20} color={themeColors.textSecondary} />
                            </View>
                            <View>
                                <Text style={[styles.recentAddress, { color: themeColors.textPrimary }]}>{shortenAddress(entry.address, 8, 5)}</Text>
                                <Text style={[styles.recentAddressMuted, { color: themeColors.textSecondary }]}>{shortenAddress(entry.address, 10, 6)}</Text>
                            </View>
                        </TouchableOpacity>
                    ))}
                </View>
            )}

            <View style={styles.footer}>
                <Button
                    title="Continue"
                    onPress={() => goToTokenSelect(address)}
                    size="large"
                    disabled={!detectedChain}
                />
            </View>
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
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 22,
    },
    addressInputWrap: {
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
    addressInput: {
        flex: 1,
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 16,
        paddingVertical: 6,
    },
    pasteBtn: {
        borderRadius: 999,
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    pasteBtnText: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 14,
    },
    scanRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginTop: 22,
        marginHorizontal: 20,
    },
    scanIconWrap: {
        width: 58,
        height: 58,
        borderRadius: 29,
        alignItems: 'center',
        justifyContent: 'center',
    },
    scanTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 18,
    },
    scanSubtitle: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 16,
    },
    matchingBlock: {
        marginTop: 26,
        marginHorizontal: 20,
    },
    matchingHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
    },
    matchingTitle: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 18,
    },
    recentRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 14,
    },
    recentIconWrap: {
        width: 54,
        height: 54,
        borderRadius: 27,
        alignItems: 'center',
        justifyContent: 'center',
    },
    recentAddress: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 18,
    },
    recentAddressMuted: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 14,
        marginTop: 2,
    },
    footer: {
        marginTop: 'auto',
        paddingHorizontal: 20,
        paddingBottom: 18,
    },
});
