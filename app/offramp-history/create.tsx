import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    ActivityIndicator,
    ScrollView,
    KeyboardAvoidingView,
    Platform,
    Alert,
    Image,
    Keyboard,
    DeviceEventEmitter,
    Modal,
    TouchableWithoutFeedback,
    LayoutAnimation,
    Animated,
    UIManager,
} from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { ChevronLeft as CaretLeft, CheckCircle, TriangleAlert as Warning, Search as MagnifyingGlass, X, ChevronDown as CaretDown, Landmark as BankIcon, ArrowUpDown as ArrowsDownUp } from '../../components/ui/AppIcon';
import { Colors, useThemeColors } from '../../theme/colors';
import { Typography } from '../../styles/typography';
import { useAuth } from '../../hooks/useAuth';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { OfframpConfirmationModal } from '../../components/OfframpConfirmationModal';
import { SafeAreaView } from 'react-native-safe-area-context';
let ContextMenu: any = null;
let ExpoButton: any = null;
let Host: any = null;
if (Platform.OS === 'ios') {
    try {
        const SwiftUI = require('@expo/ui/swift-ui');
        ContextMenu = SwiftUI.ContextMenu;
        ExpoButton = SwiftUI.Button;
        Host = SwiftUI.Host;
    } catch (e) { }
}
import { SolanaBridgeModal } from '../../components/SolanaBridgeModal';
import { useEmbeddedSolanaWallet, useEmbeddedEthereumWallet } from '@privy-io/expo';
import { useWallet } from '../../hooks/useWallet';
import AndroidDropdownMenu from '../../components/ui/AndroidDropdownMenu';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import Analytics from '../../services/analytics';
import IOSGlassIconButton from '../../components/ui/IOSGlassIconButton';

// Network options
const NETWORKS = [
    { id: 'base', name: 'Base', icon: require('../../assets/icons/networks/base.png') },
    { id: 'solana', name: 'Solana', icon: require('../../assets/icons/networks/solana.png') },
];

// Country / fiat currency options
const COUNTRIES = [
    { id: 'NG', name: 'Nigeria', currency: 'NGN', flag: '🇳🇬' },
    { id: 'GH', name: 'Ghana', currency: 'GHS', flag: '🇬🇭' },
];

interface Bank {
    code: string;
    name: string;
}

interface Beneficiary {
    id: string;
    bankCode?: string;
    bankName: string;
    accountNumber: string;
    accountName: string;
    countryId?: string;
    currency: string;
    networkId?: string;
    createdAt?: string | number;
}

export default function CreateWithdrawalScreen() {
    const router = useRouter();
    const navigation = useNavigation();
    const themeColors = useThemeColors();
    const { getAccessToken } = useAuth();

    // Form State
    const [amount, setAmount] = useState('');
    const [selectedNetwork, setSelectedNetwork] = useState(NETWORKS[0]);
    const [selectedCountry, setSelectedCountry] = useState(COUNTRIES[0]);
    const [selectedBank, setSelectedBank] = useState<Bank | null>(null);
    const [accountNumber, setAccountNumber] = useState('');
    const [accountName, setAccountName] = useState('');
    const [isValidatingAccount, setIsValidatingAccount] = useState(false);
    const [accountError, setAccountError] = useState('');
    const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
    const [fiatEquivalent, setFiatEquivalent] = useState('');
    const [isFetchingFiatEquivalent, setIsFetchingFiatEquivalent] = useState(false);

    // Bank Selection State
    // Removed local bank fetching state

    // Bottom Sheet Refs
    // bankSheetRef removed
    // chainSheetRef removed
    const confirmModalRef = useRef<TrueSheet>(null);
    const bridgeModalRef = useRef<TrueSheet>(null);
    const beneficiariesSheetRef = useRef<TrueSheet>(null);

    // Wallets & Address
    const { address: baseAddress } = useWallet();
    const ethereumWallet = useEmbeddedEthereumWallet();
    const evmWallets = (ethereumWallet as any)?.wallets || [];
    const evmAddress = evmWallets[0]?.address || baseAddress || ''; // Use Privy EVM wallet address first

    const solanaWalletHook = useEmbeddedSolanaWallet();
    const solanaAddress = (solanaWalletHook as any)?.wallets?.[0]?.address || '';

    // Modal States
    const [isNetworkSelectorVisible, setIsNetworkSelectorVisible] = useState(false);
    const [isBridgeModalVisible, setIsBridgeModalVisible] = useState(false);
    const [isConfirmModalVisible, setIsConfirmModalVisible] = useState(false);
    const networkDropdownAnimation = useState(new Animated.Value(0))[0];

    // Enable LayoutAnimation on Android
    if (Platform.OS === 'android' && (UIManager as any).setLayoutAnimationEnabledExperimental) {
        (UIManager as any).setLayoutAnimationEnabledExperimental(true);
    }

    // Snap points - fixed to be higher as requested
    const snapPoints = useMemo(() => ['90%'], []);
    const chainSnapPoints = useMemo(() => ['40%'], []);

    // Load supported banks
    useEffect(() => {
        console.log('CreateWithdrawalScreen mounted - Version: 4.0 (Multi-currency)');
        Analytics.withdrawalFlowStarted(selectedNetwork.id, selectedCountry.currency);
        Analytics.withdrawalFlowStep('screen_opened', {
            network: selectedNetwork.id,
            fiat_currency: selectedCountry.currency,
        });

        // Listen for bank selection
        const subscription = DeviceEventEmitter.addListener('onBankSelected', (bank: Bank) => {
            setSelectedBank(bank);
        });

        return () => {
            subscription.remove();
        };
    }, []);

    useEffect(() => {
        Analytics.withdrawalFlowStep('network_selected', {
            network: selectedNetwork.id,
        });
    }, [selectedNetwork.id]);

    useEffect(() => {
        Analytics.withdrawalFlowStep('country_selected', {
            country: selectedCountry.id,
            fiat_currency: selectedCountry.currency,
        });
    }, [selectedCountry.id, selectedCountry.currency]);

    useEffect(() => {
        if (!selectedBank) return;
        Analytics.withdrawalFlowStep('bank_selected', {
            bank_name: selectedBank.name,
            currency: selectedCountry.currency,
        });
    }, [selectedBank, selectedCountry.currency]);

    useEffect(() => {
        if (accountNumber.length !== 10) return;
        Analytics.withdrawalFlowStep('account_number_entered', {
            currency: selectedCountry.currency,
        });
    }, [accountNumber, selectedCountry.currency]);

    const loadBeneficiaries = useCallback(async () => {
        try {
            const token = await getAccessToken();
            if (!token) {
                setBeneficiaries([]);
                return;
            }

            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
            const response = await fetch(`${apiUrl}/api/beneficiaries`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await response.json();

            if (response.ok && data?.success) {
                const items = Array.isArray(data?.data?.beneficiaries) ? data.data.beneficiaries : [];
                setBeneficiaries(items);
                return;
            }
            setBeneficiaries([]);
        } catch (error) {
            console.log('[Beneficiaries] Failed to load:', error);
            setBeneficiaries([]);
        }
    }, [getAccessToken]);

    useEffect(() => {
        loadBeneficiaries();
    }, [loadBeneficiaries]);

    // Reset bank when country changes
    useEffect(() => {
        setSelectedBank(null);
        setAccountNumber('');
        setAccountName('');
        setAccountError('');
    }, [selectedCountry]);

    useEffect(() => {
        const parsedAmount = parseFloat(amount);
        if (!amount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
            setFiatEquivalent('');
            setIsFetchingFiatEquivalent(false);
            return;
        }

        let isCancelled = false;
        const timeout = setTimeout(async () => {
            try {
                setIsFetchingFiatEquivalent(true);
                const token = await getAccessToken();
                if (!token) {
                    if (!isCancelled) setFiatEquivalent('');
                    return;
                }

                const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
                const rateNetwork = selectedNetwork.id === 'solana' ? 'base' : selectedNetwork.id;
                const response = await fetch(
                    `${apiUrl}/api/offramp/rates?token=USDC&amount=${parsedAmount}&currency=${selectedCountry.currency}&network=${rateNetwork}`,
                    {
                        headers: {
                            Authorization: `Bearer ${token}`,
                            'Content-Type': 'application/json',
                        },
                    }
                );
                const result = await response.json();
                const estimate = Number(result?.data?.fiatEstimate);

                if (!isCancelled) {
                    if (response.ok && Number.isFinite(estimate) && estimate > 0) {
                        setFiatEquivalent(estimate.toFixed(2));
                    } else {
                        setFiatEquivalent('');
                    }
                }
            } catch {
                if (!isCancelled) setFiatEquivalent('');
            } finally {
                if (!isCancelled) setIsFetchingFiatEquivalent(false);
            }
        }, 300);

        return () => {
            isCancelled = true;
            clearTimeout(timeout);
        };
    }, [amount, selectedCountry.currency, selectedNetwork.id, getAccessToken]);

    // Validate account when bank and number are present
    useEffect(() => {
        if (selectedBank && accountNumber.length === 10) {
            verifyAccount();
        } else {
            setAccountName('');
            setAccountError('');
        }
    }, [selectedBank, accountNumber, selectedNetwork]);



    const verifyAccount = async () => {
        if (!selectedBank || accountNumber.length !== 10) return;

        try {
            setIsValidatingAccount(true);
            setAccountError('');
            setAccountName('');

            const token = await getAccessToken();
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

            const response = await fetch(`${apiUrl}/api/offramp/verify-account`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    bankName: selectedBank.name, // Sending name as backend expects this currently
                    accountNumber,
                    currency: selectedCountry.currency,
                })
            });

            const data = await response.json();

            if (data.success && data.data?.verified) {
                setAccountName(data.data.accountName);
                Analytics.withdrawalFlowStep('account_verified', {
                    bank_name: selectedBank.name,
                    currency: selectedCountry.currency,
                });
            } else {
                setAccountError('Could not verify account details');
                Analytics.withdrawalFlowFailed('account_verification', 'verification_failed', {
                    bank_name: selectedBank.name,
                    currency: selectedCountry.currency,
                });
            }
        } catch (error) {
            console.error('Validation error:', error);
            setAccountError('Validation failed');
            Analytics.withdrawalFlowFailed('account_verification', 'validation_error', {
                bank_name: selectedBank?.name,
                currency: selectedCountry.currency,
            });
        } finally {
            setIsValidatingAccount(false);
        }
    };

    const saveCurrentAsBeneficiary = useCallback(async (silent = false) => {
        if (!selectedBank || !accountNumber || !accountName) {
            if (!silent) {
                Alert.alert('Missing details', 'Verify bank details first before saving beneficiary.');
            }
            return false;
        }

        try {
            const token = await getAccessToken();
            if (!token) {
                if (!silent) Alert.alert('Session expired', 'Please sign in again.');
                return false;
            }

            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
            const response = await fetch(`${apiUrl}/api/beneficiaries`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    bankCode: selectedBank.code,
                    bankName: selectedBank.name,
                    accountNumber,
                    accountName,
                    currency: selectedCountry.currency,
                    countryId: selectedCountry.id,
                    networkId: selectedNetwork.id,
                }),
            });
            const data = await response.json();

            if (!response.ok || !data?.success) {
                throw new Error(data?.error?.message || 'Could not save beneficiary');
            }

            const beneficiary = data?.data?.beneficiary as Beneficiary | undefined;
            if (beneficiary) {
                setBeneficiaries((prev) => {
                    const deduped = prev.filter((item) => item.id !== beneficiary.id);
                    return [beneficiary, ...deduped].slice(0, 20);
                });
            } else {
                await loadBeneficiaries();
            }
            if (!silent) {
                Alert.alert('Saved', 'Beneficiary added successfully.');
            }
            return true;
        } catch (error) {
            console.log('[Beneficiaries] Save error:', error);
            if (!silent) {
                Alert.alert('Save failed', 'Could not save beneficiary. Please try again.');
            }
            return false;
        }
    }, [selectedBank, accountNumber, accountName, selectedCountry.id, selectedCountry.currency, selectedNetwork.id, getAccessToken, loadBeneficiaries]);

    const applyBeneficiary = useCallback((beneficiary: Beneficiary) => {
        const country = COUNTRIES.find((c) => c.id === beneficiary.countryId || c.currency === beneficiary.currency) || COUNTRIES[0];
        const network = NETWORKS.find((n) => n.id === beneficiary.networkId) || selectedNetwork;

        setSelectedCountry(country);
        setSelectedNetwork(network);
        setSelectedBank({ code: beneficiary.bankCode || '', name: beneficiary.bankName });
        setAccountNumber(beneficiary.accountNumber);
        setAccountName(beneficiary.accountName);
        setAccountError('');
        Analytics.withdrawalFlowStep('beneficiary_selected', {
            beneficiary_id: beneficiary.id,
            network: network.id,
            fiat_currency: country.currency,
        });
    }, [selectedNetwork]);

    const handleDeleteBeneficiary = useCallback(async (beneficiaryId: string) => {
        try {
            const token = await getAccessToken();
            if (!token) {
                Alert.alert('Session expired', 'Please sign in again.');
                return;
            }
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
            const response = await fetch(`${apiUrl}/api/beneficiaries/${beneficiaryId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await response.json();
            if (!response.ok || !data?.success) {
                throw new Error(data?.error?.message || 'Could not delete beneficiary');
            }
            setBeneficiaries((prev) => prev.filter((item) => item.id !== beneficiaryId));
        } catch (error: any) {
            Alert.alert('Delete failed', error?.message || 'Unable to delete beneficiary');
        }
    }, [getAccessToken]);

    const handleReview = () => {
        console.log('[CreateWithdrawal] handleReview called', {
            amount,
            selectedBank: selectedBank?.name,
            accountNumber,
            accountName,
            selectedNetwork: selectedNetwork.id,
            solanaAddress,
            evmAddress,
            bridgeModalRef: !!bridgeModalRef.current,
            confirmModalRef: !!confirmModalRef.current
        });
        Analytics.withdrawalFlowStep('review_tapped', {
            network: selectedNetwork.id,
            fiat_currency: selectedCountry.currency,
            has_amount: Boolean(amount),
            has_bank: Boolean(selectedBank),
            has_account_number: Boolean(accountNumber),
            has_account_name: Boolean(accountName),
        });

        if (!amount || !selectedBank || !accountNumber || !accountName) {
            Analytics.withdrawalFlowFailed('review', 'missing_fields', {
                has_amount: Boolean(amount),
                has_bank: Boolean(selectedBank),
                has_account_number: Boolean(accountNumber),
                has_account_name: Boolean(accountName),
            });
            Alert.alert('Missing Fields', 'Please fill in all fields and ensure account is verified.');
            return;
        }

        const numAmount = parseFloat(amount);
        if (isNaN(numAmount) || numAmount <= 0) {
            Analytics.withdrawalFlowFailed('review', 'invalid_amount', {
                amount,
            });
            Alert.alert('Invalid Amount', 'Please enter a valid amount greater than 0.');
            return;
        }

        if (selectedNetwork.id === 'solana') {
            console.log('[CreateWithdrawal] Solana network detected, checking wallets...', {
                solanaAddress,
                evmAddress,
                hasSolanaAddress: !!solanaAddress,
                hasEvmAddress: !!evmAddress
            });

            if (!solanaAddress) {
                Analytics.withdrawalFlowFailed('bridge_prerequisite', 'missing_solana_wallet');
                console.log('[CreateWithdrawal] No Solana address - showing alert');
                Alert.alert('No Solana Wallet', 'Please create a Solana wallet to bridge funds.');
                return;
            }
            if (!evmAddress) {
                Analytics.withdrawalFlowFailed('bridge_prerequisite', 'missing_base_wallet');
                console.log('[CreateWithdrawal] No EVM address - showing alert');
                Alert.alert('No Base Address', 'Could not determine your Base address. Please try again.');
                return;
            }

            console.log('[CreateWithdrawal] Opening bridge modal...');
            Analytics.withdrawalFlowStep('bridge_modal_opened', {
                network: selectedNetwork.id,
                amount: numAmount,
            });
            console.log('[CreateWithdrawal] Bridge modal ref exists:', !!bridgeModalRef.current);
            setIsBridgeModalVisible(true);

            // Try to present the modal
            try {
                bridgeModalRef.current?.present();
                console.log('[CreateWithdrawal] Bridge modal present() called');
            } catch (error) {
                console.error('[CreateWithdrawal] Error presenting bridge modal:', error);
            }
            return;
        }

        console.log('[CreateWithdrawal] Opening offramp confirmation modal...');
        Analytics.withdrawalFlowStep('review_opened', {
            network: selectedNetwork.id,
            fiat_currency: selectedCountry.currency,
            amount: numAmount,
        });
        setIsConfirmModalVisible(true);
        confirmModalRef.current?.present();
    };

    const handleSuccess = (orderId: string) => {
        Analytics.withdrawalFlowStep('review_success_closed', {
            order_id: orderId,
            network: selectedNetwork.id,
            fiat_currency: selectedCountry.currency,
        });
        void saveCurrentAsBeneficiary(true);
        if (navigation.canGoBack()) {
            router.back();
            return;
        }
        router.replace('/offramp-history');
    };




    // Render item for bank list


    const handleOpenChainSheet = useCallback(() => {
        Keyboard.dismiss();
        if (!isNetworkSelectorVisible) {
            setIsNetworkSelectorVisible(true);
            Animated.spring(networkDropdownAnimation, {
                toValue: 1,
                damping: 15,
                stiffness: 150,
                useNativeDriver: true,
            }).start();
        } else {
            Animated.timing(networkDropdownAnimation, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true,
            }).start(() => setIsNetworkSelectorVisible(false));
        }
    }, [isNetworkSelectorVisible, networkDropdownAnimation]);

    const handleOpenBankSheet = useCallback(() => {
        Analytics.withdrawalFlowStep('bank_selector_opened', {
            currency: selectedCountry.currency,
        });
        router.push({ pathname: '/offramp-history/bank-selection', params: { currency: selectedCountry.currency } });
    }, [selectedCountry]);

    const handleOpenBeneficiariesSheet = useCallback(() => {
        if (!beneficiaries.length) {
            Alert.alert('No beneficiaries yet', 'Add a beneficiary after verifying account details.');
            return;
        }
        beneficiariesSheetRef.current?.present();
    }, [beneficiaries.length]);

    return (
        <View style={[styles.container, { backgroundColor: themeColors.background }]}>
            <SafeAreaView style={styles.safeArea}>
                {/* Header */}
                <View style={[styles.header, { backgroundColor: themeColors.background }]}>
                    <IOSGlassIconButton
                        onPress={() => router.back()}
                        systemImage="chevron.left"
                        containerStyle={styles.backButton}
                        circleStyle={[styles.backButtonCircle, { backgroundColor: themeColors.surface }]}
                        icon={<CaretLeft size={20} color={themeColors.textPrimary} strokeWidth={3} />}
                    />
                    <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]}>New Withdrawal</Text>
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
                        contentInsetAdjustmentBehavior="never"
                    >

                        <Text style={[styles.helperTextTop, { color: themeColors.textSecondary }]}>
                            Enter withdrawal details
                        </Text>

                        {/* Amount Input with Chain Selector */}
                        <Text style={[styles.inputLabel, { color: themeColors.textPrimary }]}>Amount</Text>
                        <View style={[styles.authInputContainer, { backgroundColor: themeColors.surface }]}>
                            <TextInput
                                style={[styles.authInput, { color: themeColors.textPrimary, flex: 1, fontSize: 24, paddingVertical: 12 }]}
                                value={amount}
                                onChangeText={setAmount}
                                placeholder="0.00"
                                placeholderTextColor={themeColors.textSecondary}
                                keyboardType="decimal-pad"
                            />
                            {/* Chain Badge - using wallet page ContextMenu pattern */}
                            {Platform.OS === 'ios' && Host ? (
                                <Host>
                                    <ContextMenu>
                                        <ContextMenu.Trigger>
                                            <View style={[styles.chainBadge, { backgroundColor: themeColors.background }]}>
                                                <Image source={selectedNetwork.icon} style={styles.chainBadgeIcon} />
                                                <Text style={[styles.chainBadgeName, { color: themeColors.textPrimary }]}>
                                                    {selectedNetwork.name}
                                                </Text>
                                                <CaretDown size={12} color={themeColors.textSecondary} strokeWidth={3} />
                                            </View>
                                        </ContextMenu.Trigger>
                                        <ContextMenu.Items>
                                            {NETWORKS.map((network) => (
                                                <ExpoButton
                                                    key={network.id}
                                                    label={network.name}
                                                    onPress={() => setSelectedNetwork(network)}
                                                />
                                            ))}
                                        </ContextMenu.Items>
                                    </ContextMenu>
                                </Host>
                            ) : (
                                <AndroidDropdownMenu
                                    options={NETWORKS.map((network) => ({
                                        label: network.name,
                                        onPress: () => setSelectedNetwork(network),
                                        icon: <Image source={network.icon} style={styles.chainBadgeIcon} />,
                                    }))}
                                    trigger={
                                        <View style={[styles.chainBadge, { backgroundColor: themeColors.background }]}>
                                            <Image source={selectedNetwork.icon} style={styles.chainBadgeIcon} />
                                            <Text style={[styles.chainBadgeName, { color: themeColors.textPrimary }]}>
                                                {selectedNetwork.name}
                                            </Text>
                                            <CaretDown size={12} color={themeColors.textSecondary} strokeWidth={3} />
                                        </View>
                                    }
                                />
                            )}
                        </View>
                        {(isFetchingFiatEquivalent || fiatEquivalent) ? (
                            <Text style={[styles.fiatEquivalentText, { color: themeColors.textSecondary }]}>
                                {isFetchingFiatEquivalent
                                    ? `Calculating ${selectedCountry.currency} equivalent...`
                                    : `≈ ${selectedCountry.currency} ${fiatEquivalent}`}
                            </Text>
                        ) : null}


                        {/* Solana Bridge Disclaimer */}
                        {selectedNetwork.id === 'solana' && (
                            <View style={[styles.disclaimerBox, { backgroundColor: themeColors.surface, borderColor: Colors.primary }]}>
                                <View style={styles.disclaimerIconContainer}>
                                    <ArrowsDownUp size={20} color={Colors.primary} strokeWidth={3} />
                                </View>
                                <View style={styles.disclaimerTextContainer}>
                                    <Text style={[styles.disclaimerTitle, { color: themeColors.textPrimary }]}>
                                        Bridge Required
                                    </Text>
                                    <Text style={[styles.disclaimerText, { color: themeColors.textSecondary }]}>
                                        Solana funds will be automatically bridged to Base before withdrawal. Bridge fees apply.
                                    </Text>
                                </View>
                            </View>
                        )}

                        {/* Country / Currency Selector - using wallet page ContextMenu pattern */}
                        <Text style={[styles.inputLabel, { color: themeColors.textPrimary }]}>Country</Text>
                        {Platform.OS === 'ios' && Host ? (
                            <Host style={{ marginBottom: 16 }}>
                                <ContextMenu>
                                    <ContextMenu.Trigger>
                                        <View style={[styles.authInputContainer, { backgroundColor: themeColors.surface, height: 43, marginBottom: 0 }]}>
                                            <Text style={{ fontSize: 18, lineHeight: 22, marginRight: 4 }}>{selectedCountry.flag}</Text>
                                            <Text style={[styles.authInput, { color: themeColors.textPrimary, paddingVertical: 0 }]}>
                                                {selectedCountry.name} ({selectedCountry.currency})
                                            </Text>
                                            <CaretDown size={20} color={themeColors.textSecondary} strokeWidth={3} />
                                        </View>
                                    </ContextMenu.Trigger>
                                    <ContextMenu.Items>
                                        {COUNTRIES.map((country) => (
                                            <ExpoButton
                                                key={country.id}
                                                label={`${country.flag} ${country.name} (${country.currency})`}
                                                onPress={() => setSelectedCountry(country)}
                                            />
                                        ))}
                                    </ContextMenu.Items>
                                </ContextMenu>
                            </Host>
                        ) : (
                            <AndroidDropdownMenu
                                options={COUNTRIES.map((country) => ({
                                    label: `${country.flag} ${country.name} (${country.currency})`,
                                    onPress: () => setSelectedCountry(country),
                                }))}
                                trigger={
                                    <View style={[styles.authInputContainer, { backgroundColor: themeColors.surface, height: 43, marginBottom: 16 }]}>
                                        <Text style={{ fontSize: 18, lineHeight: 22, marginRight: 4 }}>{selectedCountry.flag}</Text>
                                        <Text style={[styles.authInput, { color: themeColors.textPrimary, paddingVertical: 0 }]}>
                                            {selectedCountry.name} ({selectedCountry.currency})
                                        </Text>
                                        <CaretDown size={20} color={themeColors.textSecondary} strokeWidth={3} />
                                    </View>
                                }
                            />
                        )}

                        <Text style={[styles.inputLabel, { color: themeColors.textPrimary }]}>Beneficiaries</Text>
                        <TouchableOpacity
                            style={[styles.authInputContainer, { backgroundColor: themeColors.surface }]}
                            onPress={handleOpenBeneficiariesSheet}
                        >
                            <BankIcon size={18} color={themeColors.textSecondary} />
                            <Text
                                style={[styles.authInput, styles.beneficiaryInputText, { color: beneficiaries.length ? themeColors.textPrimary : themeColors.textSecondary }]}
                                numberOfLines={1}
                            >
                                {beneficiaries.length
                                    ? 'Choose beneficiary'
                                    : 'No beneficiaries yet'}
                            </Text>
                            <CaretDown size={20} color={themeColors.textSecondary} strokeWidth={3} />
                        </TouchableOpacity>

                        {/* Bank Selection */}
                        <Text style={[styles.inputLabel, { color: themeColors.textPrimary }]}>Bank Name</Text>
                        <TouchableOpacity
                            style={[styles.authInputContainer, { backgroundColor: themeColors.surface }]}
                            onPress={handleOpenBankSheet}
                        >
                            <TextInput
                                style={[styles.authInput, { color: themeColors.textPrimary }]}
                                value={selectedBank?.name || ''}
                                placeholder="Select Bank"
                                placeholderTextColor={themeColors.textSecondary}
                                editable={false}
                                pointerEvents="none"
                            />
                            <CaretDown size={20} color={themeColors.textSecondary} strokeWidth={3} />
                        </TouchableOpacity>

                        {/* Account Number */}
                        <Text style={[styles.inputLabel, { color: themeColors.textPrimary }]}>Account Number</Text>
                        <View style={[styles.authInputContainer, { backgroundColor: themeColors.surface }]}>
                            <TextInput
                                style={[styles.authInput, { color: themeColors.textPrimary }]}
                                value={accountNumber}
                                onChangeText={(text) => {
                                    if (/^\d*$/.test(text) && text.length <= 10) {
                                        setAccountNumber(text);
                                    }
                                }}
                                placeholder="0123456789"
                                placeholderTextColor={themeColors.textSecondary}
                                keyboardType="number-pad"
                                maxLength={10}
                            />
                            {accountNumber.length === 10 && (
                                <CheckCircle size={20} color={Colors.success} fill={Colors.success} />
                            )}
                        </View>

                        {/* Account Name (Auto-verified) */}
                        {(isValidatingAccount || accountName || accountError) && (
                            <>
                                <Text style={[styles.inputLabel, { color: themeColors.textPrimary }]}>Account Name</Text>
                                <View style={[styles.authInputContainer, { backgroundColor: themeColors.surface }]}>
                                    {isValidatingAccount ? (
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
                                            {accountName && !accountError && (
                                                <CheckCircle size={20} color={Colors.success} fill={Colors.success} />
                                            )}
                                            {accountError && (
                                                <Warning size={20} color={Colors.error} fill={Colors.error} />
                                            )}
                                        </View>
                                    )}
                                </View>
                            </>
                        )}

                        {!!accountName && !accountError && !!selectedBank && (
                            <TouchableOpacity
                                style={[styles.saveBeneficiaryButton, { backgroundColor: themeColors.surface }]}
                                onPress={() => {
                                    void saveCurrentAsBeneficiary();
                                }}
                            >
                                <Text style={[styles.saveBeneficiaryText, { color: themeColors.textPrimary }]}>
                                    Add beneficiary
                                </Text>
                            </TouchableOpacity>
                        )}

                        <Text style={[styles.helperText, { color: themeColors.textSecondary }]}>
                            Withdrawals are processed instantly.
                        </Text>

                        <View style={{ height: 100 }} />
                    </ScrollView>

                    {/* Footer Button */}
                    <View style={[styles.footer, { backgroundColor: themeColors.background, borderTopColor: themeColors.border }]}>
                        <TouchableOpacity
                            style={[
                                styles.continueButton,
                                (!amount || !selectedBank || !accountName) && styles.continueButtonDisabled
                            ]}
                            onPress={handleReview}
                            disabled={!amount || !selectedBank || !accountName}
                        >
                            <Text style={styles.continueButtonText}>Review Withdrawal</Text>
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </SafeAreaView>

            {/* Bank Selection Sheet Removed (Using Native Modal) */}

            <OfframpConfirmationModal
                ref={confirmModalRef}
                visible={isConfirmModalVisible}
                onClose={() => setIsConfirmModalVisible(false)}
                data={amount && selectedBank ? {
                    amount,
                    token: 'USDC',
                    network: selectedNetwork.id, // This will be 'base' after bridge completes
                    fiatCurrency: selectedCountry.currency,
                    bankName: selectedBank.name,
                    accountNumber,
                    accountName
                } : null}
                onSuccess={handleSuccess}
            />

            <TrueSheet
                ref={beneficiariesSheetRef}
                detents={['auto']}
                cornerRadius={Platform.OS === 'ios' ? 50 : 24}
                backgroundBlur="regular"
                grabber={true}
                scrollable={true}
            >
                <View style={styles.beneficiariesSheet}>
                    <Text style={[styles.beneficiariesSheetTitle, { color: themeColors.textPrimary }]}>Beneficiaries</Text>
                    <ScrollView
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={styles.beneficiariesList}
                    >
                        {beneficiaries.map((beneficiary) => (
                            <Swipeable
                                key={beneficiary.id}
                                renderRightActions={() => (
                                    <TouchableOpacity
                                        style={styles.beneficiaryDeleteAction}
                                        onPress={() => handleDeleteBeneficiary(beneficiary.id)}
                                    >
                                        <Text style={styles.beneficiaryDeleteActionText}>Delete</Text>
                                    </TouchableOpacity>
                                )}
                            >
                                <TouchableOpacity
                                    style={[styles.beneficiaryItem, { backgroundColor: themeColors.surface }]}
                                    onPress={() => {
                                        applyBeneficiary(beneficiary);
                                        beneficiariesSheetRef.current?.dismiss();
                                    }}
                                >
                                    <View style={styles.beneficiaryItemIcon}>
                                        <BankIcon size={16} color={themeColors.textSecondary} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.beneficiaryItemTitle, { color: themeColors.textPrimary }]}>
                                            {beneficiary.accountName}
                                        </Text>
                                        <Text style={[styles.beneficiaryItemSubtitle, { color: themeColors.textSecondary }]}>
                                            {beneficiary.bankName} • {beneficiary.accountNumber}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            </Swipeable>
                        ))}
                    </ScrollView>
                </View>
            </TrueSheet>

            {/* Solana Bridge Modal */}
            <SolanaBridgeModal
                ref={bridgeModalRef}
                visible={isBridgeModalVisible}
                onClose={() => setIsBridgeModalVisible(false)}
                token={'SOL'} // Default to SOL for now, logic could be enhanced to detect token
                amount={parseFloat(amount) || 0}
                solanaAddress={solanaAddress}
                baseAddress={evmAddress}
                getAccessToken={getAccessToken}
                onBridgeComplete={(toAddress, token, bridgedAmount) => {
                    Analytics.withdrawalFlowStep('bridge_completed', {
                        from_network: 'solana',
                        to_network: 'base',
                        token,
                        bridged_amount: bridgedAmount,
                    });
                    // Close bridge modal first
                    setIsBridgeModalVisible(false);
                    bridgeModalRef.current?.dismiss();

                    // Switch to Base and update amount
                    const baseNetwork = NETWORKS.find(n => n.id === 'base');

                    // Use setTimeout to ensure state updates are processed
                    setTimeout(() => {
                        if (baseNetwork) {
                            setSelectedNetwork(baseNetwork);
                        }
                        setAmount(bridgedAmount.toString());

                        // Wait a bit more for state to update, then show alert and open modal
                        setTimeout(() => {
                            Alert.alert(
                                'Bridge Complete',
                                'Your funds have been bridged to Base. Proceeding with withdrawal...',
                                [
                                    {
                                        text: 'Continue',
                                        onPress: () => {
                                            // Open offramp confirmation modal
                                            console.log('[Bridge] Opening offramp modal with Base network');
                                            Analytics.withdrawalFlowStep('review_opened_after_bridge', {
                                                network: 'base',
                                                fiat_currency: selectedCountry.currency,
                                                amount: bridgedAmount,
                                            });
                                            setIsConfirmModalVisible(true);
                                            confirmModalRef.current?.present();
                                        }
                                    }
                                ]
                            );
                        }, 300);
                    }, 100);
                }}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    safeArea: {
        flex: 1,
    },
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
    placeholder: {
        width: 40,
    },
    content: {
        padding: 24,
    },
    helperTextTop: {
        fontSize: 14,
        marginBottom: 24,
        fontFamily: 'GoogleSansFlex_400Regular',
    },
    fiatEquivalentText: {
        fontSize: 13,
        marginTop: -8,
        marginBottom: 14,
        marginLeft: 4,
        fontFamily: 'GoogleSansFlex_500Medium',
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
    validatingContainer: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14
    },
    validatingText: {
        marginLeft: 8,
        fontFamily: 'GoogleSansFlex_400Regular'
    },
    verifiedContainer: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between'
    },
    // Action Menu Styles (iOS Pull-Down Style)
    menuBackdrop: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'transparent',
        zIndex: 998,
    },
    pullDownMenu: {
        position: 'absolute',
        top: 180, // Position below the amount input
        right: 24,
        backgroundColor: 'rgba(255, 255, 255, 0.98)',
        borderRadius: 14,
        paddingVertical: 6,
        minWidth: 200,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 20,
        elevation: 10,
        zIndex: 999,
    },
    menuTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 12,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    pullDownMenuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
        paddingHorizontal: 16,
    },
    pullDownMenuText: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 16,
    },
    pullDownMenuDivider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: 'rgba(0, 0, 0, 0.1)',
        marginHorizontal: 0,
    },
    menuNetworkIconContainer: {
        width: 28,
        height: 28,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
        borderRadius: 14,
    },
    menuNetworkIcon: {
        width: 18,
        height: 18,
    },
    // Disclaimer Box Styles
    disclaimerBox: {
        flexDirection: 'row',
        padding: 16,
        borderRadius: 12,
        marginBottom: 16,
        borderWidth: 1,
    },
    disclaimerIconContainer: {
        marginRight: 12,
        marginTop: 2,
    },
    disclaimerTextContainer: {
        flex: 1,
    },
    disclaimerTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 14,
        marginBottom: 4,
    },
    disclaimerText: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 13,
        lineHeight: 18,
    },
    // Chain badge - matches OfframpConfirmationModal.chainBadge exactly
    chainBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        gap: 8,
    },
    chainBadgeIcon: {
        width: 20,
        height: 20,
        borderRadius: 10,
    },
    chainBadgeName: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 14,
    },
    beneficiariesSheet: {
        paddingHorizontal: 20,
        paddingTop: 28,
        paddingBottom: 20,
    },
    beneficiariesSheetTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 22,
        marginBottom: 12,
    },
    beneficiariesList: {
        gap: 10,
        paddingBottom: 8,
    },
    beneficiaryItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderRadius: 16,
    },
    beneficiaryItemIcon: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    beneficiaryItemTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 15,
    },
    beneficiaryItemSubtitle: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 13,
        marginTop: 2,
    },
    beneficiaryDeleteAction: {
        width: 88,
        marginBottom: 10,
        borderRadius: 12,
        backgroundColor: '#EF4444',
        alignItems: 'center',
        justifyContent: 'center',
    },
    beneficiaryDeleteActionText: {
        color: '#FFFFFF',
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 14,
    },
    saveBeneficiaryButton: {
        borderRadius: 12,
        paddingVertical: 12,
        alignItems: 'center',
        marginTop: 4,
        marginBottom: 8,
    },
    saveBeneficiaryText: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 14,
    },
    beneficiaryInputText: {
        marginLeft: 8,
        paddingVertical: 0,
    },
});
