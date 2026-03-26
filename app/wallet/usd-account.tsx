import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Platform, RefreshControl, ScrollView, SectionList, Share, StyleSheet, Text, ToastAndroid, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import { format, isToday, isYesterday } from 'date-fns';
import { CheckCircle, ChevronLeft as CaretLeft, ChevronRight, Copy, Landmark, X } from '../../components/ui/AppIcon';
import { useThemeColors, Colors } from '../../theme/colors';
import { useAuth } from '../../hooks/useAuth';
import { createUsdKycLink, enrollUsdAccount, getUsdAccountDetails, getUsdAccountStatus, getUsdTransfers, UsdAccountDetails, UsdAccountStatus, UsdTransfer } from './usdAccountApi';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import IOSGlassIconButton from '../../components/ui/IOSGlassIconButton';

const ICONS = {
    usdc: require('../../assets/icons/tokens/usdc.png'),
    base: require('../../assets/icons/networks/base.png'),
    solana: require('../../assets/icons/networks/solana.png'),
    receive: require('../../assets/icons/status/receive.png'),
};

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
    PENDING: { color: '#F59E0B', label: 'Pending' },
    PROCESSING: { color: '#3B82F6', label: 'Processing' },
    COMPLETED: { color: '#10B981', label: 'Completed' },
    FAILED: { color: '#EF4444', label: 'Failed' },
    CANCELLED: { color: '#6B7280', label: 'Cancelled' },
};

const normalizeTransferStatus = (status?: string | null): keyof typeof STATUS_CONFIG => {
    const key = String(status || 'PENDING').trim().toUpperCase();
    if (key in STATUS_CONFIG) return key as keyof typeof STATUS_CONFIG;
    if (key === 'SUCCESS' || key === 'SETTLED') return 'COMPLETED';
    if (key === 'ERROR') return 'FAILED';
    return 'PENDING';
};

const MOCK_USD_TRANSFERS: UsdTransfer[] = [
    {
        id: 'mock-usd-1',
        bridgeTransferId: 'br_mock_1001',
        sourceType: 'ACH',
        sourceLabel: 'ACH transfer',
        status: 'completed',
        grossUsd: 2500,
        hedwigFeeUsd: 0,
        providerFeeUsd: 1,
        netUsd: 2499,
        usdcAmountSettled: 2499,
        usdcTxHash: '0x5f1a...8c2d',
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
        completedAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    },
    {
        id: 'mock-usd-2',
        bridgeTransferId: 'br_mock_1002',
        sourceType: 'EXTERNAL_ADDRESS',
        sourceLabel: 'External address',
        status: 'processing',
        grossUsd: 420,
        hedwigFeeUsd: 0,
        providerFeeUsd: 1,
        netUsd: 419,
        usdcAmountSettled: 0,
        usdcTxHash: null,
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 28).toISOString(),
        completedAt: null,
    },
    {
        id: 'mock-usd-3',
        bridgeTransferId: 'br_mock_1003',
        sourceType: 'ACH',
        sourceLabel: 'ACH transfer',
        status: 'completed',
        grossUsd: 95.75,
        hedwigFeeUsd: 0,
        providerFeeUsd: 1,
        netUsd: 94.75,
        usdcAmountSettled: 94.75,
        usdcTxHash: '0x1a8b...90fe',
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 52).toISOString(),
        completedAt: new Date(Date.now() - 1000 * 60 * 60 * 51).toISOString(),
    },
];

export default function UsdAccountScreen() {
    const themeColors = useThemeColors();
    const router = useRouter();
    const { getAccessToken } = useAuth();
    const params = useLocalSearchParams<{ view?: string }>();
    const isTransactionsView = params?.view === 'transactions';

    const [status, setStatus] = useState<UsdAccountStatus | null>(null);
    const [details, setDetails] = useState<UsdAccountDetails | null>(null);
    const [transfers, setTransfers] = useState<UsdTransfer[]>([]);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [isContinuing, setIsContinuing] = useState(false);
    const [selectedTransfer, setSelectedTransfer] = useState<UsdTransfer | null>(null);
    const guidelinesSheetRef = useRef<TrueSheet>(null);
    const transferSheetRef = useRef<TrueSheet>(null);

    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            const statusData = await getUsdAccountStatus(getAccessToken);
            if (__DEV__) {
                console.log('[USD Account Screen] statusData', statusData);
            }
            setStatus(statusData);

            try {
                const detailsData = await getUsdAccountDetails(getAccessToken);
                if (__DEV__) {
                    console.log('[USD Account Screen] detailsData', detailsData);
                }
                setDetails(detailsData);
            } catch {
                setDetails(null);
            }

            try {
                const transfersData = await getUsdTransfers(getAccessToken);
                setTransfers(transfersData);
            } catch {
                setTransfers([]);
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

    const openBridgeKycFlow = async () => {
        const result = await createUsdKycLink(getAccessToken);
        if (!result.url) {
            Alert.alert('Unavailable', 'KYC link is not available right now.');
            return;
        }

        await WebBrowser.openBrowserAsync(result.url);
        await loadData();
        Alert.alert('Under review', 'Your Bridge KYC has been submitted. We will notify you once your USD account is ready.');
    };

    const handleEnroll = async () => {
        try {
            setIsContinuing(true);
            await enrollUsdAccount(getAccessToken);
            await openBridgeKycFlow();
        } catch (error: any) {
            await loadData();
            Alert.alert('Could not start enrollment', error?.message || 'Please try again.');
        } finally {
            setIsContinuing(false);
        }
    };

    const handleBridgeKyc = async () => {
        try {
            await openBridgeKycFlow();
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
            'Account Type: USD Account',
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
    const isNewUserState = !loading && !showAccountDetails && (status?.accountStatus === 'not_started' || !status?.accountStatus);
    const normalizedAccountStatus = String(status?.accountStatus || '').toLowerCase();
    const normalizedBridgeKyc = String(status?.bridgeKycStatus || '').toLowerCase();
    const isKycReviewState =
        !showAccountDetails &&
        !isNewUserState &&
        (normalizedAccountStatus.includes('pending') || normalizedBridgeKyc.includes('pending') || normalizedBridgeKyc.includes('review'));
    const isCreationPendingState = !showAccountDetails && !isNewUserState && !isKycReviewState && (loading || isContinuing);
    const accountName = details?.ach?.accountName || 'CHINONSO ONAH';
    const accountNumber = resolvedAccountNumber || '216741374992';
    const routingNumber = resolvedRoutingNumber || '101019644';
    const bankName = details?.ach?.bankName || 'Lead Bank';
    const bankAddress = details?.ach?.bankAddress || achAny?.bank_address || '1801 Main St., Kansas City, MO 64108';
    const accountRows: Array<{ label: string; value: string; copyLabel: string }> = [
        { label: 'Account name', value: accountName, copyLabel: 'Account name' },
        { label: 'Account number', value: accountNumber, copyLabel: 'Account number' },
        { label: 'Account type', value: 'USD Account', copyLabel: 'Account type' },
        { label: 'Routing number', value: routingNumber, copyLabel: 'Routing number' },
        { label: 'Bank name', value: bankName, copyLabel: 'Bank name' },
        { label: 'Bank address', value: bankAddress, copyLabel: 'Bank address' },
    ];

    const displayTransfers = transfers.length > 0 ? transfers : MOCK_USD_TRANSFERS;
    const settlementChain = String(details?.settlement?.chain || status?.settlementChain || 'BASE').toUpperCase();
    const chainIcon = settlementChain === 'SOLANA' ? ICONS.solana : ICONS.base;

    const groupedTransfers = useMemo(() => {
        return displayTransfers.reduce((acc: Array<{ title: string; data: UsdTransfer[] }>, transfer) => {
            const date = new Date(transfer.createdAt);
            let title = format(date, 'MMM d');
            if (isToday(date)) title = 'Today';
            if (isYesterday(date)) title = 'Yesterday';

            const existing = acc.find((s) => s.title === title);
            if (existing) {
                existing.data.push(transfer);
            } else {
                acc.push({ title, data: [transfer] });
            }
            return acc;
        }, []);
    }, [displayTransfers]);

    const openTransferDetails = (transfer: UsdTransfer) => {
        setSelectedTransfer(transfer);
        transferSheetRef.current?.present();
    };

    const closeTransferDetails = () => {
        transferSheetRef.current?.dismiss();
    };

    const openTransferExplorer = async (transfer: UsdTransfer) => {
        if (!transfer.usdcTxHash) {
            Alert.alert('Unavailable', 'Transaction hash is not available yet.');
            return;
        }
        const url = settlementChain === 'SOLANA'
            ? `https://explorer.solana.com/tx/${transfer.usdcTxHash}`
            : `https://basescan.org/tx/${transfer.usdcTxHash}`;
        try {
            await WebBrowser.openBrowserAsync(url);
        } catch {
            Alert.alert('Could not open explorer', 'Please try again.');
        }
    };

    const renderTransferItem = ({ item }: { item: UsdTransfer }) => {
        const statusLabel = STATUS_CONFIG[normalizeTransferStatus(item.status)].label;
        const sourceLabel = item.sourceLabel || (item.sourceType === 'EXTERNAL_ADDRESS' ? 'External address' : item.sourceType === 'ACH' ? 'ACH transfer' : 'Unknown source');
        const amount = Number(item.grossUsd || 0);
        return (
            <TouchableOpacity
                style={[styles.txItem, { borderBottomColor: themeColors.border }]}
                onPress={() => openTransferDetails(item)}
                activeOpacity={0.85}
            >
                <View style={styles.txIconContainer}>
                    <Image source={ICONS.usdc} style={styles.txTokenIcon} />
                    <View style={[styles.chainBadge, { backgroundColor: themeColors.background, borderColor: themeColors.background }]}>
                        <Image source={chainIcon} style={styles.chainBadgeIcon} />
                    </View>
                </View>
                <View style={styles.txContent}>
                    <Text style={[styles.txTitle, { color: themeColors.textPrimary }]}>USD Deposit</Text>
                    <Text style={[styles.txSubtitle, { color: themeColors.textSecondary }]}>
                        {statusLabel} • {sourceLabel}
                    </Text>
                </View>
                <View style={styles.txAmountContainer}>
                    <Text style={[styles.txAmount, { color: themeColors.textPrimary }]}>+${amount.toFixed(2)}</Text>
                    <Text style={[styles.txFiatAmount, { color: themeColors.textSecondary }]}>
                        Net ${Number(item.netUsd || 0).toFixed(2)}
                    </Text>
                </View>
            </TouchableOpacity>
        );
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
                <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]}>
                    {isTransactionsView ? 'Recent transactions' : 'USD Account'}
                </Text>
                <View style={styles.headerSpacer} />
            </View>

            {!isTransactionsView ? (
                <ScrollView
                    style={styles.content}
                    contentContainerStyle={[styles.contentContainer, (isNewUserState || isKycReviewState || isCreationPendingState) ? styles.contentContainerEmpty : null]}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
                    showsVerticalScrollIndicator={false}
                >
                {isNewUserState ? (
                    <View style={styles.emptyStateContainer}>
                        <View style={[styles.emptyStateIconWrap, { backgroundColor: themeColors.surface }]}>
                            <Landmark size={36} color={Colors.primary} />
                        </View>
                        <Text style={[styles.emptyStateTitle, { color: themeColors.textPrimary }]}>No USD account yet</Text>
                        <Text style={[styles.emptyStateBody, { color: themeColors.textSecondary }]}>
                            Create your USD account details to start receiving bank transfers.
                        </Text>
                    </View>
                ) : isKycReviewState ? (
                    <View style={styles.emptyStateContainer}>
                        <View style={[styles.emptyStateIconWrap, { backgroundColor: themeColors.surface }]}>
                            <Landmark size={36} color={Colors.primary} />
                        </View>
                        <Text style={[styles.emptyStateTitle, { color: themeColors.textPrimary }]}>We&apos;re reviewing your request</Text>
                        <Text style={[styles.emptyStateBody, { color: themeColors.textSecondary }]}>
                            We&apos;re reviewing your request and will notify you once it&apos;s approved and account has been created.
                        </Text>
                    </View>
                ) : isCreationPendingState ? (
                    <View style={styles.emptyStateContainer}>
                        <View style={[styles.emptyStateIconWrap, { backgroundColor: themeColors.surface }]}>
                            <Landmark size={36} color={Colors.primary} />
                        </View>
                        <Text style={[styles.emptyStateTitle, { color: themeColors.textPrimary }]}>
                            {isContinuing ? 'Please wait...' : 'Fetching your USD account'}
                        </Text>
                        <Text style={[styles.emptyStateBody, { color: themeColors.textSecondary }]}>
                            {isContinuing
                                ? 'We&apos;re creating your USD account details.'
                                : 'We&apos;re fetching your account details. This can take a moment.'}
                        </Text>
                    </View>
                ) : (
                    <>
                        <View style={styles.sectionHeader}>
                            <Text style={[styles.sectionTitle, { color: themeColors.textSecondary }]}>USD bank details</Text>
                            {showAccountDetails ? (
                                <TouchableOpacity onPress={shareBankDetails}>
                                    <Text style={styles.shareText}>Share</Text>
                                </TouchableOpacity>
                            ) : null}
                        </View>

                        <View style={[styles.card, { backgroundColor: themeColors.surface }]}>
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
                                    {status?.accountStatus === 'not_started' || status?.sandboxMode ? (
                                        <TouchableOpacity
                                            style={[styles.primaryButton, { backgroundColor: Colors.primary }]}
                                            onPress={handleEnroll}
                                            disabled={isContinuing}
                                            activeOpacity={isContinuing ? 1 : 0.9}
                                        >
                                            {isContinuing ? (
                                                <ActivityIndicator size="small" color="#FFFFFF" />
                                            ) : (
                                                <Text style={styles.primaryButtonText}>Continue</Text>
                                            )}
                                        </TouchableOpacity>
                                    ) : (
                                        <TouchableOpacity style={[styles.primaryButton, { backgroundColor: Colors.primary }]} onPress={handleBridgeKyc}>
                                            <Text style={styles.primaryButtonText}>Complete Bridge KYC</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            )}
                        </View>
                        {showAccountDetails ? (
                            <TouchableOpacity
                                style={[styles.aboutAccountRow, { backgroundColor: themeColors.surface }]}
                                onPress={() => guidelinesSheetRef.current?.present()}
                            >
                                <Text style={[styles.aboutAccountText, { color: themeColors.textPrimary }]}>About this account</Text>
                                <ChevronRight size={18} color={Colors.primary} />
                            </TouchableOpacity>
                        ) : null}
                    </>
                )}
                </ScrollView>
            ) : (
                <SectionList
                    sections={groupedTransfers}
                    keyExtractor={(item) => item.id}
                    renderItem={renderTransferItem}
                    renderSectionHeader={({ section: { title } }) => (
                        <View style={[styles.sectionHeaderContainer, { backgroundColor: themeColors.background }]}>
                            <Text style={[styles.sectionHeaderText, { color: themeColors.textPrimary }]}>{title}</Text>
                        </View>
                    )}
                    contentContainerStyle={styles.transactionListContent}
                    showsVerticalScrollIndicator={false}
                    stickySectionHeadersEnabled={true}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
                    ListEmptyComponent={() => (
                        <View style={styles.emptyState}>
                            <Text style={[styles.emptyTitle, { color: themeColors.textPrimary }]}>No transactions yet</Text>
                            <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>Your USD account transactions will appear here.</Text>
                        </View>
                    )}
                />
            )}

            {isNewUserState ? (
                <View style={[styles.emptyStateFooter, { backgroundColor: themeColors.background }]}>
                    <TouchableOpacity
                        style={[styles.emptyStateContinueButton, { backgroundColor: Colors.primary }]}
                        onPress={handleEnroll}
                        disabled={isContinuing}
                        activeOpacity={isContinuing ? 1 : 0.9}
                    >
                        {isContinuing ? (
                            <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                            <Text style={styles.emptyStateContinueText}>Continue</Text>
                        )}
                    </TouchableOpacity>
                </View>
            ) : null}

            <TrueSheet
                ref={guidelinesSheetRef}
                detents={[0.86]}
                cornerRadius={Platform.OS === 'ios' ? 50 : 24}
                backgroundBlur="regular"
                grabber={true}
                scrollable={true}
            >
                <View style={[styles.guidelinesSheetContainer, { backgroundColor: 'transparent' }]}>
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
                </View>
            </TrueSheet>

            <TrueSheet
                ref={transferSheetRef}
                detents={['auto']}
                cornerRadius={Platform.OS === 'ios' ? 50 : 24}
                backgroundBlur="regular"
                grabber={true}
                onDismiss={() => setSelectedTransfer(null)}
            >
                <View style={{ paddingTop: 28, paddingBottom: 26, paddingHorizontal: 24 }}>
                    <View style={styles.modalHeader}>
                        <View style={styles.modalHeaderLeft}>
                            <View style={styles.modalIconContainer}>
                                <Image source={ICONS.usdc} style={styles.modalTokenIcon} />
                                <Image source={ICONS.receive} style={styles.modalStatusBadge} />
                            </View>
                            <View>
                                <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>USD Deposit</Text>
                                <Text style={[styles.modalSubtitle, { color: themeColors.textSecondary }]}>
                                    {selectedTransfer?.createdAt ? format(new Date(selectedTransfer.createdAt), 'MMM d, yyyy • h:mm a') : ''}
                                </Text>
                            </View>
                        </View>
                        <IOSGlassIconButton
                            onPress={closeTransferDetails}
                            systemImage="xmark"
                            circleStyle={[styles.closeButton, { backgroundColor: themeColors.surface }]}
                            icon={<X size={20} color={themeColors.textSecondary} strokeWidth={3} />}
                        />
                    </View>

                    {selectedTransfer ? (
                        <>
                            <View style={[styles.amountCard, { backgroundColor: themeColors.surface }]}>
                                <Text style={[styles.amountCardValue, { color: themeColors.textPrimary }]}>
                                    +${Number(selectedTransfer.grossUsd || 0).toFixed(2)}
                                </Text>
                                <View style={styles.amountCardSub}>
                                    <Image source={ICONS.usdc} style={styles.smallIcon} />
                                    <Text style={[styles.amountCardSubText, { color: themeColors.textSecondary }]}>
                                        Net ${Number(selectedTransfer.netUsd || 0).toFixed(2)} settled
                                    </Text>
                                </View>
                            </View>

                            <View style={[styles.detailsCard, { backgroundColor: themeColors.surface }]}>
                                <View style={styles.detailRow}>
                                    <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Transfer ID</Text>
                                    <TouchableOpacity onPress={() => copyValue('Transfer ID', selectedTransfer.bridgeTransferId)} style={styles.detailValueRow}>
                                        <Text style={[styles.detailValue, { color: themeColors.textPrimary }]} numberOfLines={1} ellipsizeMode="middle">
                                            {selectedTransfer.bridgeTransferId}
                                        </Text>
                                        <Copy size={14} color={themeColors.textSecondary} strokeWidth={3} style={{ marginLeft: 6 }} />
                                    </TouchableOpacity>
                                </View>
                                <View style={[styles.detailDivider, { backgroundColor: themeColors.border }]} />
                                <View style={styles.detailRow}>
                                    <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Status</Text>
                                    {(() => {
                                        const status = STATUS_CONFIG[normalizeTransferStatus(selectedTransfer.status)];
                                        return (
                                            <View style={[styles.statusBadge, { backgroundColor: `${status.color}20` }]}>
                                                <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
                                            </View>
                                        );
                                    })()}
                                </View>
                                <View style={[styles.detailDivider, { backgroundColor: themeColors.border }]} />
                                <View style={styles.detailRow}>
                                    <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Source</Text>
                                    <Text style={[styles.detailValue, { color: themeColors.textPrimary }]}>
                                        {selectedTransfer.sourceLabel ||
                                            (selectedTransfer.sourceType === 'EXTERNAL_ADDRESS'
                                                ? 'External address'
                                                : selectedTransfer.sourceType === 'ACH'
                                                    ? 'ACH transfer'
                                                    : 'Unknown source')}
                                    </Text>
                                </View>
                                <View style={[styles.detailDivider, { backgroundColor: themeColors.border }]} />
                                <View style={styles.detailRow}>
                                    <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>Chain</Text>
                                    <View style={styles.chainValue}>
                                        <Image source={chainIcon} style={styles.smallIcon} />
                                        <Text style={[styles.detailValue, { color: themeColors.textPrimary }]}>{settlementChain}</Text>
                                    </View>
                                </View>
                            </View>

                            <TouchableOpacity style={styles.viewButton} onPress={() => openTransferExplorer(selectedTransfer)}>
                                <Text style={styles.viewButtonText}>View on Explorer</Text>
                            </TouchableOpacity>
                        </>
                    ) : null}
                </View>
            </TrueSheet>
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
    contentContainerEmpty: { flexGrow: 1, paddingBottom: 120 },
    transactionListContent: { paddingHorizontal: 20, paddingBottom: 40 },
    sectionHeaderContainer: {
        marginHorizontal: -20,
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 8,
    },
    sectionHeaderText: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 16,
    },
    txItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        borderBottomWidth: 1,
    },
    txIconContainer: {
        position: 'relative',
        marginRight: 16,
    },
    txTokenIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
    },
    chainBadge: {
        position: 'absolute',
        bottom: -2,
        right: -2,
        width: 20,
        height: 20,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
    },
    chainBadgeIcon: {
        width: 16,
        height: 16,
        borderRadius: 8,
    },
    txContent: { flex: 1 },
    txTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 16,
        marginBottom: 2,
    },
    txSubtitle: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 13,
    },
    txAmountContainer: { alignItems: 'flex-end' },
    txAmount: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 15,
    },
    txFiatAmount: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 13,
        marginTop: 2,
    },
    emptyState: {
        paddingTop: 80,
        paddingHorizontal: 16,
        alignItems: 'center',
    },
    emptyTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 18,
        marginTop: 16,
        marginBottom: 8,
    },
    emptyText: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 15,
        textAlign: 'center',
    },
    emptyStateContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 28,
    },
    emptyStateIconWrap: {
        width: 84,
        height: 84,
        borderRadius: 42,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 18,
    },
    emptyStateTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 20,
        marginBottom: 8,
        textAlign: 'center',
    },
    emptyStateBody: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 14,
        lineHeight: 21,
        textAlign: 'center',
    },
    emptyStateFooter: {
        paddingHorizontal: 20,
        paddingTop: 8,
        paddingBottom: 18,
    },
    emptyStateContinueButton: {
        minHeight: 54,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyStateContinueText: {
        color: '#FFFFFF',
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 16,
    },
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
        paddingHorizontal: 20,
        paddingTop: 28,
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
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 16,
    },
    modalHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    modalIconContainer: {
        position: 'relative',
        marginRight: 12,
    },
    modalTokenIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
    },
    modalStatusBadge: {
        position: 'absolute',
        bottom: -2,
        right: -2,
        width: 18,
        height: 18,
        borderRadius: 9,
    },
    modalTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 18,
    },
    modalSubtitle: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 13,
        marginTop: 2,
    },
    closeButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    amountCard: {
        borderRadius: 16,
        padding: 24,
        alignItems: 'center',
        marginBottom: 20,
    },
    amountCardValue: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 32,
        marginBottom: 8,
    },
    amountCardSub: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    amountCardSubText: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 15,
        marginLeft: 6,
    },
    smallIcon: {
        width: 20,
        height: 20,
        borderRadius: 10,
    },
    detailsCard: {
        borderRadius: 16,
        padding: 16,
        marginBottom: 20,
    },
    detailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
    },
    detailDivider: {
        height: 1,
    },
    detailLabel: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 15,
    },
    detailValue: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 15,
    },
    detailValueRow: {
        flexDirection: 'row',
        alignItems: 'center',
        maxWidth: '60%',
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
    },
    statusText: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 11,
    },
    chainValue: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    viewButton: {
        backgroundColor: Colors.primary,
        borderRadius: 30,
        paddingVertical: 16,
        alignItems: 'center',
    },
    viewButtonText: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 16,
        color: '#FFFFFF',
    },
});
