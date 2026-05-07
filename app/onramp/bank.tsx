import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
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
import {
    ChevronLeft as CaretLeft,
    ChevronDown as CaretDown,
    CheckCircle,
    TriangleAlert as Warning,
    Landmark as BankIcon,
} from '../../components/ui/AppIcon';
import { Colors, useThemeColors } from '../../theme/colors';
import IOSGlassIconButton from '../../components/ui/IOSGlassIconButton';
import { SelectorSheet, SelectorSheetOption } from '../../components/SelectorSheet';
import { useOnramp, OnrampFiat, OnrampInstitution, OnrampNetwork } from '../../hooks/useOnramp';

const ACCOUNT_LENGTHS: Record<OnrampFiat, number> = {
    NGN: 10,
    GHS: 13,
};

export default function OnrampBankScreen() {
    const router = useRouter();
    const themeColors = useThemeColors();
    const { listInstitutions, verifyAccount } = useOnramp();
    const params = useLocalSearchParams<{
        fiatAmount?: string;
        fiatCurrency?: OnrampFiat;
        network?: OnrampNetwork;
    }>();

    const fiatCurrency = (params.fiatCurrency || 'NGN') as OnrampFiat;
    const network = (params.network || 'base') as OnrampNetwork;
    const fiatAmount = parseFloat(params.fiatAmount || '0');
    const expectedAccountLength = ACCOUNT_LENGTHS[fiatCurrency] ?? 10;

    const [institutions, setInstitutions] = useState<OnrampInstitution[]>([]);
    const [institutionsLoading, setInstitutionsLoading] = useState(false);
    const [bankPickerOpen, setBankPickerOpen] = useState(false);
    const [selectedBank, setSelectedBank] = useState<OnrampInstitution | null>(null);
    const [accountNumber, setAccountNumber] = useState('');
    const [accountName, setAccountName] = useState('');
    const [accountError, setAccountError] = useState('');
    const [verifying, setVerifying] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setInstitutionsLoading(true);
        listInstitutions(fiatCurrency)
            .then((data) => {
                if (cancelled) return;
                setInstitutions(data);
            })
            .catch(() => { /* user can retry */ })
            .finally(() => { if (!cancelled) setInstitutionsLoading(false); });
        return () => { cancelled = true; };
    }, [fiatCurrency, listInstitutions]);

    useEffect(() => {
        setSelectedBank(null);
        setAccountNumber('');
        setAccountName('');
        setAccountError('');
    }, [fiatCurrency]);

    useEffect(() => {
        if (selectedBank && accountNumber.length === expectedAccountLength) {
            void runVerify();
        } else {
            setAccountName('');
            setAccountError('');
        }
    }, [selectedBank, accountNumber, expectedAccountLength]);

    const runVerify = async () => {
        if (!selectedBank || accountNumber.length !== expectedAccountLength) return;
        setVerifying(true);
        setAccountError('');
        setAccountName('');
        try {
            const result = await verifyAccount({
                bankName: selectedBank.code,
                accountNumber: accountNumber.trim(),
                currency: fiatCurrency,
            });
            if (result.verified && result.accountName) {
                setAccountName(result.accountName);
            } else {
                setAccountError('Could not verify account details');
            }
        } catch (err: any) {
            setAccountError(err?.message || 'Validation failed');
        } finally {
            setVerifying(false);
        }
    };

    const bankOptions = useMemo<SelectorSheetOption[]>(
        () => institutions.map((inst) => ({ id: inst.code, label: inst.name })),
        [institutions]
    );

    const handleContinue = () => {
        if (!selectedBank || !accountName) return;
        router.push({
            pathname: '/onramp/review' as any,
            params: {
                fiatAmount: String(fiatAmount),
                fiatCurrency,
                network,
                bankCode: selectedBank.code,
                bankName: selectedBank.name,
                accountNumber: accountNumber.trim(),
                accountName,
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
                    <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]}>Refund account</Text>
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
                            Used only if Paycrest needs to refund your deposit. We never debit this account.
                        </Text>

                        <Text style={[styles.inputLabel, { color: themeColors.textPrimary }]}>Bank Name</Text>
                        <TouchableOpacity
                            style={[styles.authInputContainer, { backgroundColor: themeColors.surface }]}
                            onPress={() => setBankPickerOpen(true)}
                            disabled={institutionsLoading}
                        >
                            <BankIcon size={18} color={themeColors.textSecondary} />
                            <Text
                                style={[
                                    styles.authInput,
                                    styles.bankInputText,
                                    { color: selectedBank ? themeColors.textPrimary : themeColors.textSecondary },
                                ]}
                                numberOfLines={1}
                            >
                                {institutionsLoading ? 'Loading banks…' : selectedBank ? selectedBank.name : 'Select Bank'}
                            </Text>
                            <CaretDown size={20} color={themeColors.textSecondary} strokeWidth={3} />
                        </TouchableOpacity>

                        <Text style={[styles.inputLabel, { color: themeColors.textPrimary }]}>Account Number</Text>
                        <View style={[styles.authInputContainer, { backgroundColor: themeColors.surface }]}>
                            <TextInput
                                style={[styles.authInput, { color: themeColors.textPrimary }]}
                                value={accountNumber}
                                onChangeText={(text) => {
                                    if (/^\d*$/.test(text) && text.length <= expectedAccountLength) {
                                        setAccountNumber(text);
                                    }
                                }}
                                placeholder={'0'.repeat(expectedAccountLength)}
                                placeholderTextColor={themeColors.textSecondary}
                                keyboardType="number-pad"
                                inputMode="numeric"
                                maxLength={expectedAccountLength}
                            />
                            {accountNumber.length === expectedAccountLength ? (
                                <CheckCircle size={20} color={Colors.success} fill={Colors.success} />
                            ) : null}
                        </View>

                        {(verifying || accountName || accountError) ? (
                            <>
                                <Text style={[styles.inputLabel, { color: themeColors.textPrimary }]}>Account Name</Text>
                                <View style={[styles.authInputContainer, { backgroundColor: themeColors.surface }]}>
                                    {verifying ? (
                                        <View style={styles.validatingContainer}>
                                            <ActivityIndicator size="small" color={Colors.primary} />
                                            <Text style={[styles.validatingText, { color: themeColors.textSecondary }]}>Verifying...</Text>
                                        </View>
                                    ) : (
                                        <View style={styles.verifiedContainer}>
                                            <TextInput
                                                style={[styles.authInput, { color: accountError ? Colors.error : themeColors.textPrimary, flex: 1 }]}
                                                value={accountError || accountName}
                                                editable={false}
                                            />
                                            {accountName && !accountError ? (
                                                <CheckCircle size={20} color={Colors.success} fill={Colors.success} />
                                            ) : null}
                                            {accountError ? (
                                                <Warning size={20} color={Colors.error} fill={Colors.error} />
                                            ) : null}
                                        </View>
                                    )}
                                </View>
                            </>
                        ) : null}

                        <Text style={[styles.helperText, { color: themeColors.textSecondary }]}>
                            We verify your account name automatically once you enter the full account number.
                        </Text>

                        <View style={{ height: 100 }} />
                    </ScrollView>

                    <View style={[styles.footer, { backgroundColor: themeColors.background }]}>
                        <TouchableOpacity
                            style={[styles.continueButton, (!accountName) && styles.continueButtonDisabled]}
                            onPress={handleContinue}
                            disabled={!accountName}
                        >
                            <Text style={styles.continueButtonText}>Continue</Text>
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </SafeAreaView>

            <SelectorSheet
                visible={bankPickerOpen}
                onClose={() => setBankPickerOpen(false)}
                title="Bank"
                options={bankOptions}
                selectedId={selectedBank?.code || ''}
                onSelect={(id) => {
                    const next = institutions.find((b) => b.code === id);
                    if (next) setSelectedBank(next);
                }}
                detentFraction={0.7}
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
    authInput: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 16,
        paddingVertical: 14,
        flex: 1,
    },
    bankInputText: {
        marginLeft: 8,
        paddingVertical: 0,
    },
    validatingContainer: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
    },
    validatingText: {
        marginLeft: 8,
        fontFamily: 'GoogleSansFlex_400Regular',
    },
    verifiedContainer: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
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
