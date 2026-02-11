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
    SafeAreaView,
    Image,
    Keyboard,
    DeviceEventEmitter,
    Modal,
    TouchableWithoutFeedback,
    LayoutAnimation,
    Animated,
    UIManager,
} from 'react-native';
import { useRouter } from 'expo-router';
import { CaretLeft, CheckCircle, Warning, MagnifyingGlass, X, CaretDown, Bank as BankIcon, ArrowsDownUp } from 'phosphor-react-native';
import { Colors, useThemeColors } from '../../theme/colors';
import { Typography } from '../../styles/typography';
import { useAuth } from '../../hooks/useAuth';
import { BottomSheetModal, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { OfframpConfirmationModal } from '../../components/OfframpConfirmationModal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SolanaBridgeModal } from '../../components/SolanaBridgeModal';
import { useEmbeddedSolanaWallet, useEmbeddedEthereumWallet } from '@privy-io/expo';
import { useWallet } from '../../hooks/useWallet';

// Network options
const NETWORKS = [
    { id: 'base', name: 'Base', icon: require('../../assets/icons/networks/base.png') },
    { id: 'solana', name: 'Solana', icon: require('../../assets/icons/networks/solana.png') },
];

interface Bank {
    code: string;
    name: string;
}

export default function CreateWithdrawalScreen() {
    const router = useRouter();
    const themeColors = useThemeColors();
    const { getAccessToken } = useAuth();
    const insets = useSafeAreaInsets();

    // Form State
    const [amount, setAmount] = useState('');
    const [selectedNetwork, setSelectedNetwork] = useState(NETWORKS[0]);
    const [selectedBank, setSelectedBank] = useState<Bank | null>(null);
    const [accountNumber, setAccountNumber] = useState('');
    const [accountName, setAccountName] = useState('');
    const [isValidatingAccount, setIsValidatingAccount] = useState(false);
    const [accountError, setAccountError] = useState('');

    // Bank Selection State
    // Removed local bank fetching state

    // Bottom Sheet Refs
    // bankSheetRef removed
    // chainSheetRef removed
    const confirmModalRef = useRef<BottomSheetModal>(null);
    const bridgeModalRef = useRef<BottomSheetModal>(null);

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
        console.log('CreateWithdrawalScreen mounted - Version: 3.0 (Native Modal)');

        // Listen for bank selection
        const subscription = DeviceEventEmitter.addListener('onBankSelected', (bank: Bank) => {
            setSelectedBank(bank);
        });

        return () => {
            subscription.remove();
        };
    }, []);

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
                    accountNumber
                })
            });

            const data = await response.json();

            if (data.success && data.data?.verified) {
                setAccountName(data.data.accountName);
            } else {
                setAccountError('Could not verify account details');
            }
        } catch (error) {
            console.error('Validation error:', error);
            setAccountError('Validation failed');
        } finally {
            setIsValidatingAccount(false);
        }
    };

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

        if (!amount || !selectedBank || !accountNumber || !accountName) {
            Alert.alert('Missing Fields', 'Please fill in all fields and ensure account is verified.');
            return;
        }

        const numAmount = parseFloat(amount);
        if (isNaN(numAmount) || numAmount <= 0) {
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
                console.log('[CreateWithdrawal] No Solana address - showing alert');
                Alert.alert('No Solana Wallet', 'Please create a Solana wallet to bridge funds.');
                return;
            }
            if (!evmAddress) {
                console.log('[CreateWithdrawal] No EVM address - showing alert');
                Alert.alert('No Base Address', 'Could not determine your Base address. Please try again.');
                return;
            }

            console.log('[CreateWithdrawal] Opening bridge modal...');
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
        setIsConfirmModalVisible(true);
        confirmModalRef.current?.present();
    };

    const handleSuccess = (orderId: string) => {
        setTimeout(() => {
            router.replace('/offramp-history');
        }, 2000);
    };



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
        router.push('/offramp-history/bank-selection');
    }, []);

    return (
        <View style={[styles.container, { backgroundColor: themeColors.background }]}>
            <SafeAreaView style={styles.safeArea}>
                {/* Header */}
                <View style={[styles.header, { backgroundColor: themeColors.background }]}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                        <View style={[styles.backButtonCircle, { backgroundColor: themeColors.surface }]}>
                            <CaretLeft size={20} color={themeColors.textPrimary} weight="bold" />
                        </View>
                    </TouchableOpacity>
                    <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]}>New Withdrawal</Text>
                    <View style={styles.placeholder} />
                </View>

                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={{ flex: 1 }}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
                >
                    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

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
                            {/* Interactive Chain Badge */}
                            <TouchableOpacity
                                style={[styles.chainBadge, { backgroundColor: themeColors.background }]}
                                onPress={handleOpenChainSheet}
                                activeOpacity={0.7}
                            >
                                <View style={styles.chainIconContainer}>
                                    <Image source={selectedNetwork.icon} style={styles.chainIcon} />
                                </View>
                                <Text style={[styles.chainBadgeText, { color: themeColors.textPrimary }]}>
                                    {selectedNetwork.name}
                                </Text>
                                <CaretDown size={14} weight="bold" color={themeColors.textSecondary} style={{ marginLeft: 6 }} />
                            </TouchableOpacity>
                        </View>

                        {/* Network Selection Action Menu */}
                        {isNetworkSelectorVisible && (
                            <>
                                {/* Backdrop to dismiss menu */}
                                <TouchableOpacity
                                    style={styles.menuBackdrop}
                                    activeOpacity={1}
                                    onPress={() => {
                                        Animated.timing(networkDropdownAnimation, {
                                            toValue: 0,
                                            duration: 200,
                                            useNativeDriver: true,
                                        }).start(() => setIsNetworkSelectorVisible(false));
                                    }}
                                />
                                <Animated.View
                                    style={[
                                        styles.pullDownMenu,
                                        { backgroundColor: themeColors.surface, borderColor: themeColors.border },
                                        {
                                            opacity: networkDropdownAnimation,
                                            transform: [
                                                {
                                                    scale: networkDropdownAnimation.interpolate({
                                                        inputRange: [0, 1],
                                                        outputRange: [0.95, 1],
                                                    }),
                                                },
                                                {
                                                    translateY: networkDropdownAnimation.interpolate({
                                                        inputRange: [0, 1],
                                                        outputRange: [-10, 0],
                                                    }),
                                                },
                                            ],
                                        }
                                    ]}
                                >
                                    <Text style={[styles.menuTitle, { color: themeColors.textSecondary }]}>Select Network</Text>
                                    {NETWORKS.map((network, index) => (
                                        <React.Fragment key={network.id}>
                                            {index > 0 && <View style={[styles.pullDownMenuDivider, { backgroundColor: themeColors.border }]} />}
                                            <TouchableOpacity
                                                style={styles.pullDownMenuItem}
                                                onPress={() => {
                                                    setSelectedNetwork(network);
                                                    Animated.timing(networkDropdownAnimation, {
                                                        toValue: 0,
                                                        duration: 200,
                                                        useNativeDriver: true,
                                                    }).start(() => setIsNetworkSelectorVisible(false));
                                                }}
                                            >
                                                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>

                                                    <View style={[styles.menuNetworkIconContainer, { backgroundColor: themeColors.background }]}>
                                                        <Image source={network.icon} style={styles.menuNetworkIcon} />
                                                    </View>
                                                    <Text style={[styles.pullDownMenuText, { color: themeColors.textPrimary }]}>
                                                        {network.name}
                                                    </Text>
                                                </View>
                                                {selectedNetwork.id === network.id && (
                                                    <CheckCircle size={18} color={Colors.primary} weight="fill" />
                                                )}
                                            </TouchableOpacity>
                                        </React.Fragment>
                                    ))}
                                </Animated.View>
                            </>
                        )}

                        {/* Solana Bridge Disclaimer */}
                        {selectedNetwork.id === 'solana' && (
                            <View style={[styles.disclaimerBox, { backgroundColor: themeColors.surface, borderColor: Colors.primary }]}>
                                <View style={styles.disclaimerIconContainer}>
                                    <ArrowsDownUp size={20} color={Colors.primary} weight="bold" />
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
                            <CaretDown size={20} color={themeColors.textSecondary} weight="bold" />
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
                                <CheckCircle size={20} color={Colors.success} weight="fill" />
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
                                                <CheckCircle size={20} color={Colors.success} weight="fill" />
                                            )}
                                            {accountError && (
                                                <Warning size={20} color={Colors.error} weight="fill" />
                                            )}
                                        </View>
                                    )}
                                </View>
                            </>
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
                    fiatCurrency: 'NGN',
                    bankName: selectedBank.name,
                    accountNumber,
                    accountName
                } : null}
                onSuccess={handleSuccess}
            />

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
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 17,
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
    chainBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 20,
        marginLeft: 8,
    },
    chainIconContainer: {
        marginRight: 6,
    },
    chainIcon: {
        width: 16,
        height: 16,
        borderRadius: 8,
    },
    chainBadgeText: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 13,
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
    // Sheet Styles (Removed - using action menu instead)
});
