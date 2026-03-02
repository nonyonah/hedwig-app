import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Platform, RefreshControl, ScrollView, Share, StyleSheet, Text, ToastAndroid, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import { CheckCircle, ChevronLeft as CaretLeft, ChevronRight, Copy } from '../../components/ui/AppIcon';
import { useThemeColors, Colors } from '../../theme/colors';
import { useAuth } from '../../hooks/useAuth';
import { createUsdKycLink, enrollUsdAccount, getUsdAccountDetails, getUsdAccountStatus, UsdAccountDetails, UsdAccountStatus } from './usdAccountApi';
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';

const USE_MOCK_USD_DATA = true;

const MOCK_USD_STATUS: UsdAccountStatus = {
    diditKycStatus: 'approved',
    bridgeKycStatus: 'approved',
    accountStatus: 'active',
    featureEnabled: true,
    settlementChain: 'BASE',
    settlementToken: 'USDC',
    feeConfig: {
        feePercent: 1,
        feeMin: 0.25,
        feeMax: 10,
    },
};

const MOCK_USD_DETAILS: UsdAccountDetails = {
    bridgeCustomerId: 'cus_bridge_demo_01',
    bridgeVirtualAccountId: 'va_bridge_demo_01',
    diditKycStatus: 'approved',
    bridgeKycStatus: 'approved',
    accountStatus: 'active',
    featureEnabled: true,
    ach: {
        bankName: 'Lead Bank',
        accountName: 'CHINONSO ONAH',
        accountNumber: '216741374992',
        accountNumberMasked: '216741374992',
        routingNumber: '101019644',
        routingNumberMasked: '101019644',
        rail: 'ACH',
        currency: 'USD',
        bankAddress: '1801 Main St., Kansas City, MO 64108',
    },
    settlement: {
        chain: 'BASE',
        token: 'USDC',
        destination: '0x5802Ae8A6BD51e98cA8770a97946ECF886500c67',
    },
    feeConfig: {
        feePercent: 1,
        feeMin: 0.25,
        feeMax: 10,
    },
};

export default function UsdAccountScreen() {
    const themeColors = useThemeColors();
    const router = useRouter();
    const { getAccessToken } = useAuth();

    const [status, setStatus] = useState<UsdAccountStatus | null>(null);
    const [details, setDetails] = useState<UsdAccountDetails | null>(null);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const guidelinesSheetRef = useRef<BottomSheetModal>(null);
    const guidelinesSnapPoints = useMemo(() => ['86%'], []);
    const renderBackdrop = useCallback(
        (props: any) => (
            <BottomSheetBackdrop
                {...props}
                disappearsOnIndex={-1}
                appearsOnIndex={0}
                opacity={0.5}
            />
        ),
        []
    );

    const loadData = useCallback(async () => {
        if (USE_MOCK_USD_DATA) {
            setLoading(true);
            setStatus(MOCK_USD_STATUS);
            setDetails(MOCK_USD_DETAILS);
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            const statusData = await getUsdAccountStatus(getAccessToken);
            setStatus(statusData);

            try {
                const detailsData = await getUsdAccountDetails(getAccessToken);
                setDetails(detailsData);
            } catch {
                setDetails(null);
            }

        } finally {
            setLoading(false);
        }
    }, [getAccessToken]);

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [loadData])
    );

    const onRefresh = async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    };

    const handleEnroll = async () => {
        try {
            await enrollUsdAccount(getAccessToken);
            await loadData();
            Alert.alert('Enrollment started', 'Complete Bridge KYC to activate your USD account details.');
        } catch (error: any) {
            Alert.alert('Could not start enrollment', error?.message || 'Please try again.');
        }
    };

    const handleBridgeKyc = async () => {
        try {
            const result = await createUsdKycLink(getAccessToken);
            if (!result.url) {
                Alert.alert('Unavailable', 'KYC link is not available right now.');
                return;
            }
            await WebBrowser.openBrowserAsync(result.url);
        } catch (error: any) {
            Alert.alert('Could not open KYC', error?.message || 'Please try again.');
        }
    };

    const copyValue = async (label: string, value: string | null | undefined) => {
        if (!value) return;
        await Clipboard.setStringAsync(value);
        if (Platform.OS === 'android') {
            ToastAndroid.show(`${label} copied`, ToastAndroid.SHORT);
            return;
        }
        Alert.alert('Copied', `${label} copied`);
    };

    const shareBankDetails = async () => {
        const accountName = details?.ach?.accountName || 'N/A';
        const achAny = details?.ach as any;
        const accountNumber = details?.ach?.accountNumber || achAny?.account_number || details?.ach?.accountNumberMasked || 'N/A';
        const routing = details?.ach?.routingNumber || achAny?.routing_number || details?.ach?.routingNumberMasked || 'N/A';
        const bankName = details?.ach?.bankName || 'N/A';
        const bankAddress = details?.ach?.bankAddress || achAny?.bank_address || '1801 Main St., Kansas City, MO 64108';

        const message = [
            'USD Bank Details',
            `Account Name: ${accountName}`,
            `Account Number: ${accountNumber}`,
            'Account Type: Checking',
            `Routing Number: ${routing}`,
            `Bank Name: ${bankName}`,
            `Bank Address: ${bankAddress}`,
        ].join('\n');

        try {
            await Share.share({ message });
        } catch {
            Alert.alert('Share unavailable', 'Could not open share sheet right now.');
        }
    };

    const achAny = details?.ach as any;
    const resolvedAccountNumber = details?.ach?.accountNumber || achAny?.account_number || details?.ach?.accountNumberMasked || null;
    const resolvedRoutingNumber = details?.ach?.routingNumber || achAny?.routing_number || details?.ach?.routingNumberMasked || null;
    const showAccountDetails = !!resolvedAccountNumber;
    const accountName = details?.ach?.accountName || 'CHINONSO ONAH';
    const accountNumber = resolvedAccountNumber || '216741374992';
    const routingNumber = resolvedRoutingNumber || '101019644';
    const bankName = details?.ach?.bankName || 'Lead Bank';
    const bankAddress = details?.ach?.bankAddress || achAny?.bank_address || '1801 Main St., Kansas City, MO 64108';
    const accountRows: Array<{ label: string; value: string; copyLabel: string }> = [
        { label: 'Account name', value: accountName, copyLabel: 'Account name' },
        { label: 'Account number', value: accountNumber, copyLabel: 'Account number' },
        { label: 'Account type', value: 'Checking', copyLabel: 'Account type' },
        { label: 'Routing number', value: routingNumber, copyLabel: 'Routing number' },
        { label: 'Bank name', value: bankName, copyLabel: 'Bank name' },
        { label: 'Bank address', value: bankAddress, copyLabel: 'Bank address' },
    ];

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
            <View style={styles.header}>
                <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                    <View style={[styles.backButtonCircle, { backgroundColor: themeColors.surface }]}>
                        <CaretLeft size={20} color={themeColors.textPrimary} strokeWidth={3} />
                    </View>
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]}>USD Account</Text>
                <View style={styles.headerSpacer} />
            </View>

            <ScrollView
                style={styles.content}
                contentContainerStyle={styles.contentContainer}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.sectionHeader}>
                    <Text style={[styles.sectionTitle, { color: themeColors.textSecondary }]}>USD bank details</Text>
                    {showAccountDetails ? (
                        <TouchableOpacity onPress={shareBankDetails}>
                            <Text style={styles.shareText}>Share</Text>
                        </TouchableOpacity>
                    ) : null}
                </View>

                <View style={[styles.card, { backgroundColor: themeColors.surface }]}>
                    {loading ? (
                        <Text style={[styles.mutedText, { color: themeColors.textSecondary }]}>Loading account info...</Text>
                    ) : (
                        <>
                            {showAccountDetails ? (
                                <View style={styles.detailsList}>
                                    {accountRows.map((row) => (
                                        <View key={row.label} style={styles.accountDetailRow}>
                                            <View style={styles.accountDetailTextWrap}>
                                                <Text style={[styles.accountDetailLabel, { color: themeColors.textSecondary }]}>{row.label}</Text>
                                                <Text style={[styles.accountDetailValue, { color: themeColors.textPrimary }]}>{row.value}</Text>
                                            </View>
                                            <TouchableOpacity
                                                style={styles.copyCircle}
                                                onPress={() => copyValue(row.copyLabel, row.value)}
                                            >
                                                <Copy size={16} color={Colors.primary} />
                                            </TouchableOpacity>
                                        </View>
                                    ))}
                                </View>
                            ) : (
                                <View style={styles.actionBlock}>
                                    {status?.diditKycStatus !== 'approved' ? (
                                        <Text style={[styles.mutedText, { color: themeColors.textSecondary }]}>
                                            You need approved Didit KYC before USD account setup.
                                        </Text>
                                    ) : status?.accountStatus === 'not_started' ? (
                                        <TouchableOpacity style={[styles.primaryButton, { backgroundColor: Colors.primary }]} onPress={handleEnroll}>
                                            <Text style={styles.primaryButtonText}>Start USD Account Setup</Text>
                                        </TouchableOpacity>
                                    ) : (
                                        <TouchableOpacity style={[styles.primaryButton, { backgroundColor: Colors.primary }]} onPress={handleBridgeKyc}>
                                            <Text style={styles.primaryButtonText}>Complete Bridge KYC</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            )}
                        </>
                    )}
                </View>
                <TouchableOpacity
                    style={[styles.aboutAccountRow, { backgroundColor: themeColors.surface }]}
                    onPress={() => guidelinesSheetRef.current?.present()}
                >
                    <Text style={[styles.aboutAccountText, { color: themeColors.textPrimary }]}>About this account</Text>
                    <ChevronRight size={18} color={Colors.primary} />
                </TouchableOpacity>
            </ScrollView>

            <BottomSheetModal
                ref={guidelinesSheetRef}
                snapPoints={guidelinesSnapPoints}
                backdropComponent={renderBackdrop}
                backgroundStyle={{ backgroundColor: themeColors.background }}
                handleIndicatorStyle={{ backgroundColor: themeColors.textSecondary, width: 40 }}
            >
                <BottomSheetView style={[styles.guidelinesSheetContainer, { backgroundColor: themeColors.background }]}>
                    <Text style={[styles.sheetTitle, { color: themeColors.textPrimary }]}>Guidelines</Text>

                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.guidelinesContent}>
                        <View style={[styles.card, { backgroundColor: themeColors.surface }]}>
                            <Text style={[styles.cardTitle, { color: themeColors.textPrimary }]}>Payment methods & fees</Text>
                            <View style={styles.divider} />
                            <View style={styles.infoRow}>
                                <Text style={[styles.infoLabel, { color: themeColors.textPrimary }]}>ACH</Text>
                                <Text style={[styles.infoValue, { color: themeColors.textPrimary }]}>0% + $1.00</Text>
                            </View>
                            <View style={styles.infoRow}>
                                <Text style={[styles.infoLabel, { color: themeColors.textPrimary }]}>WIRE</Text>
                                <Text style={[styles.infoValue, { color: themeColors.textPrimary }]}>0% + $20.00</Text>
                            </View>
                            <View style={styles.infoRow}>
                                <Text style={[styles.infoLabel, { color: themeColors.textPrimary }]}>SWIFT</Text>
                                <Text style={[styles.infoValue, { color: themeColors.textPrimary }]}>Not supported</Text>
                            </View>

                            <Text style={[styles.blockTitle, { color: themeColors.textPrimary }]}>Processing time</Text>
                            <View style={styles.divider} />
                            <Text style={[styles.mutedText, { color: themeColors.textPrimary }]}>
                                Incoming deposits take 1-3 business days to arrive, depending on the payment method used
                            </Text>

                            <Text style={[styles.blockTitle, { color: themeColors.textPrimary }]}>Limits</Text>
                            <View style={styles.infoRow}>
                                <Text style={[styles.infoSmallLabel, { color: themeColors.textSecondary }]}>1st party deposits</Text>
                                <Text style={[styles.infoSmallValue, { color: themeColors.textPrimary }]}>$100,000 max/deposit</Text>
                            </View>
                            <View style={styles.infoRow}>
                                <Text style={[styles.infoSmallLabel, { color: themeColors.textSecondary }]}>3rd party deposits</Text>
                                <Text style={[styles.infoSmallValue, { color: themeColors.textPrimary }]}>$2,000 max/deposit</Text>
                            </View>

                            <Text style={[styles.blockTitle, { color: themeColors.textPrimary }]}>Accepted payments</Text>
                            <View style={styles.divider} />
                            <View style={styles.acceptedRow}>
                                <CheckCircle size={20} color="#B9F603" />
                                <Text style={[styles.acceptedText, { color: themeColors.textPrimary }]}>
                                    Receive unlimited deposit from accounts in your name, from registered business entities or from family members who share your surname.
                                </Text>
                            </View>
                            <View style={styles.acceptedRow}>
                                <CheckCircle size={20} color="#B9F603" />
                                <Text style={[styles.acceptedText, { color: themeColors.textPrimary }]}>
                                    Payments from sources other than those listed above (3rd party deposits) are also accepted, subject to limits.
                                </Text>
                            </View>

                            <TouchableOpacity
                                style={[styles.learnMoreButton, { backgroundColor: themeColors.background }]}
                                onPress={() => WebBrowser.openBrowserAsync('https://apidocs.bridge.xyz/')}
                            >
                                <Text style={[styles.learnMoreText, { color: themeColors.textPrimary }]}>Learn more</Text>
                                <ChevronRight size={18} color={themeColors.textPrimary} />
                            </TouchableOpacity>
                        </View>
                    </ScrollView>
                </BottomSheetView>
            </BottomSheetModal>
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
        paddingVertical: 8,
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
    headerTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 20,
    },
    headerSpacer: {
        width: 40,
        height: 40,
    },
    content: { flex: 1 },
    contentContainer: { paddingHorizontal: 20, paddingBottom: 36, gap: 16 },
    aboutAccountRow: {
        marginTop: 4,
        borderRadius: 14,
        minHeight: 54,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    aboutAccountText: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 15,
    },
    guidelinesSheetContainer: {
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 8,
        paddingBottom: 20,
    },
    sheetTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 18,
        marginBottom: 12,
    },
    guidelinesContent: {
        paddingBottom: 40,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    sectionTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 16,
    },
    shareText: {
        color: Colors.primary,
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 14,
    },
    card: {
        borderRadius: 22,
        padding: 18,
    },
    cardTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 16,
        marginBottom: 10,
    },
    mutedText: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 13,
        lineHeight: 20,
    },
    detailsList: { gap: 18 },
    accountDetailRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
    },
    accountDetailTextWrap: {
        flex: 1,
        paddingRight: 12,
    },
    accountDetailLabel: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 14,
        marginBottom: 4,
    },
    accountDetailValue: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 15,
    },
    copyCircle: {
        width: 46,
        height: 46,
        borderRadius: 23,
        backgroundColor: 'rgba(37, 99, 235, 0.18)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    actionBlock: {
        marginTop: 12,
    },
    primaryButton: {
        borderRadius: 12,
        paddingVertical: 11,
        alignItems: 'center',
    },
    primaryButtonText: {
        color: '#FFFFFF',
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 13,
    },
    divider: {
        borderTopWidth: 1,
        borderTopColor: 'rgba(148,163,184,0.12)',
        marginBottom: 14,
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 14,
    },
    infoLabel: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 15,
    },
    infoValue: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 15,
    },
    blockTitle: {
        marginTop: 12,
        marginBottom: 10,
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 16,
    },
    infoSmallLabel: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 14,
    },
    infoSmallValue: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 14,
    },
    acceptedRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        marginBottom: 14,
    },
    acceptedText: {
        flex: 1,
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 14,
        lineHeight: 23,
    },
    learnMoreButton: {
        marginTop: 10,
        borderRadius: 16,
        minHeight: 58,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 8,
    },
    learnMoreText: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 16,
    },
});
