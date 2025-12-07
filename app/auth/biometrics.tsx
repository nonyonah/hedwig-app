import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Fingerprint } from 'phosphor-react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { useEmbeddedEthereumWallet, useEmbeddedSolanaWallet, usePrivy } from '@privy-io/expo';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../theme/colors';

export default function BiometricsScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const ethWalletHook = useEmbeddedEthereumWallet();
    const solWalletHook = useEmbeddedSolanaWallet();
    const { user, getAccessToken } = usePrivy();

    // Store wallet addresses after creation
    const [createdWallets, setCreatedWallets] = React.useState<{ ethereum?: string, solana?: string }>({});
    const [isEnableLoading, setIsEnableLoading] = React.useState(false);
    const [isLaterLoading, setIsLaterLoading] = React.useState(false);

    const syncWalletsToBackend = async (walletsToSync?: { ethereum?: string, solana?: string }) => {
        try {
            if (!user) {
                console.log('No user object available');
                return;
            }

            const accessToken = await getAccessToken();
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

            // Get email from user object - it's in linked_accounts
            let userEmail = '';
            if ((user as any).linked_accounts) {
                const emailAccount = (user as any).linked_accounts.find((acc: any) => acc.type === 'email');
                if (emailAccount) {
                    userEmail = emailAccount.address;
                }
            }

            console.log('Syncing wallets. User:', userEmail);

            const walletAddresses: any = {};

            // 1. Use passed wallets if available (most reliable source from creation)
            if (walletsToSync) {
                if (walletsToSync.ethereum) walletAddresses.ethereum = walletsToSync.ethereum;
                if (walletsToSync.solana) walletAddresses.solana = walletsToSync.solana;
            }

            // 2. Fallback to state or hooks if not in passed wallets
            if (!walletAddresses.ethereum) {
                if (createdWallets.ethereum) {
                    walletAddresses.ethereum = createdWallets.ethereum;
                } else if (ethWalletHook.wallets && ethWalletHook.wallets.length > 0) {
                    walletAddresses.ethereum = (ethWalletHook.wallets[0] as any).address;
                }
            }

            if (!walletAddresses.solana) {
                if (createdWallets.solana) {
                    walletAddresses.solana = createdWallets.solana;
                } else if (solWalletHook.wallets && solWalletHook.wallets.length > 0) {
                    walletAddresses.solana = (solWalletHook.wallets[0] as any).address;
                }
            }

            console.log('Final wallet addresses to sync:', walletAddresses);

            if (Object.keys(walletAddresses).length === 0) {
                console.warn('No wallet addresses found to sync!');
                return;
            }

            const response = await fetch(`${apiUrl}/api/auth/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`,
                },
                body: JSON.stringify({
                    email: userEmail,
                    walletAddresses
                }),
            });

            if (response.ok) {
                console.log('Wallets synced successfully!');
            } else {
                const errorText = await response.text();
                console.warn('Failed to sync wallets to backend:', errorText);
            }
        } catch (error) {
            console.error('Error syncing wallets:', error);
        }
    };

    const createWallets = async () => {
        try {
            const newWallets: { ethereum?: string, solana?: string } = {};

            console.log('Starting wallet creation...');

            // Create EVM wallet (for Base and Celo)
            if (ethWalletHook.create && ethWalletHook.wallets.length === 0) {
                console.log('Creating EVM wallet...');
                const ethResult: any = await ethWalletHook.create();

                // Try multiple ways to find the address
                let ethAddress = '';

                // 1. Check returned user linked_accounts
                if (ethResult?.user?.linked_accounts) {
                    const walletAccount = ethResult.user.linked_accounts.find((acc: any) =>
                        acc.type === 'wallet' && acc.chain_type === 'ethereum'
                    );
                    if (walletAccount?.address) {
                        ethAddress = walletAccount.address;
                    }
                }

                // 2. Check if result itself has address
                if (!ethAddress && ethResult?.address) {
                    ethAddress = ethResult.address;
                }

                if (ethAddress) {
                    newWallets.ethereum = ethAddress;
                    console.log('Extracted ETH address:', ethAddress);
                }
            } else {
                console.log('Skipping EVM creation. Create fn exists:', !!ethWalletHook.create, 'Wallets length:', ethWalletHook.wallets.length);
                // If already exists in hook, use it
                if (ethWalletHook.wallets.length > 0) {
                    newWallets.ethereum = ethWalletHook.wallets[0].address;
                    console.log('Using existing EVM wallet from hook:', newWallets.ethereum);
                }
            }

            // Create Solana wallet
            if (solWalletHook.create && solWalletHook.wallets?.length === 0) {
                console.log('Creating Solana wallet...');
                const solResult: any = await solWalletHook.create();
                console.log('Solana Result Type:', typeof solResult);
                console.log('Solana Result Keys:', Object.keys(solResult));

                let solAddress = '';

                // 1. Check result address (Provider object usually has it)
                if (solResult?.address) {
                    solAddress = solResult.address;
                    console.log('Found SOL address in result:', solAddress);
                }

                // 2. Check public key if it exists
                if (!solAddress && solResult?.publicKey) {
                    solAddress = solResult.publicKey.toString();
                    console.log('Found SOL address from publicKey:', solAddress);
                }

                // 3. Check internal _account property (based on logs)
                if (!solAddress && (solResult as any)?._account) {
                    const account = (solResult as any)._account;
                    console.log('Solana Internal Account:', JSON.stringify(account, null, 2));

                    if (account.address) {
                        solAddress = account.address;
                        console.log('Found SOL address in _account:', solAddress);
                    } else if (account.publicKey) {
                        solAddress = account.publicKey.toString();
                        console.log('Found SOL address in _account.publicKey:', solAddress);
                    }
                }

                // 4. Check linked_accounts (it might be in the user object now)
                if (!solAddress && user?.linked_accounts) {
                    const solAccount = user.linked_accounts.find((acc: any) =>
                        acc.type === 'wallet' && acc.chain_type === 'solana'
                    );
                    if ((solAccount as any)?.address) {
                        solAddress = (solAccount as any).address;
                        console.log('Found SOL address in linked_accounts:', solAddress);
                    }
                }

                if (solAddress) {
                    newWallets.solana = solAddress;
                    console.log('Extracted SOL address:', solAddress);
                }
            } else {
                console.log('Skipping Solana creation. Create fn exists:', !!solWalletHook.create, 'Wallets length:', solWalletHook.wallets?.length);
                // If already exists in hook, use it
                if (solWalletHook.wallets && solWalletHook.wallets.length > 0) {
                    newWallets.solana = solWalletHook.wallets[0].address;
                    console.log('Using existing Solana wallet from hook:', newWallets.solana);
                }
            }

            console.log('Wallet creation complete. New wallets collected:', newWallets);

            // Store the created wallet addresses
            setCreatedWallets(newWallets);

            // Double check hook state for Solana if we missed it
            if (!newWallets.solana && solWalletHook.wallets && solWalletHook.wallets.length > 0) {
                newWallets.solana = solWalletHook.wallets[0].address;
                console.log('Found Solana in hook after creation:', newWallets.solana);
            }

            // Sync wallets to backend IMMEDIATELY with the new wallets
            await syncWalletsToBackend(newWallets);
        } catch (error) {
            console.error('Failed to create wallets:', error);
            // Still try to sync in case some wallets were created
            await syncWalletsToBackend();
        }
    };

    const handleEnable = async () => {
        if (isEnableLoading || isLaterLoading) return; // Prevent multiple submissions

        try {
            setIsEnableLoading(true);
            const hasHardware = await LocalAuthentication.hasHardwareAsync();
            if (!hasHardware) {
                Alert.alert('Error', 'Biometric hardware not available on this device.');
                return;
            }

            const isEnrolled = await LocalAuthentication.isEnrolledAsync();
            if (!isEnrolled) {
                Alert.alert('Error', 'No biometrics enrolled on this device. Please set them up in settings.');
                return;
            }

            const result = await LocalAuthentication.authenticateAsync({
                promptMessage: 'Secure your Hedwig account',
                fallbackLabel: 'Use passcode',
            });

            if (result.success) {
                // Create wallets before navigating
                await createWallets();
                router.replace('/');
            } else {
                // User cancelled or failed
            }
        } catch (error) {
            console.error('Biometrics failed', error);
            Alert.alert('Error', 'Failed to authenticate with biometrics.');
        } finally {
            setIsEnableLoading(false);
        }
    };

    const handleLater = async () => {
        if (isEnableLoading || isLaterLoading) return; // Prevent multiple submissions

        try {
            setIsLaterLoading(true);
            // Create wallets even if user skips biometrics
            await createWallets();
            router.replace('/');
        } catch (error) {
            console.error('Failed to create wallets:', error);
            Alert.alert('Error', 'Failed to create wallets. Please try again.');
        } finally {
            setIsLaterLoading(false);
        }
    };

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            <View style={styles.content}>
                <View style={styles.iconContainer}>
                    <LinearGradient
                        colors={['#60A5FA', '#3B82F6', '#2563EB']}
                        style={styles.iconGradient}
                    >
                        <Fingerprint size={48} color="#FFFFFF" weight="fill" />
                    </LinearGradient>
                </View>

                <View style={styles.textContainer}>
                    <Text style={styles.title}>Secure your account</Text>
                    <Text style={styles.subtitle}>
                        Log in faster and sign transactions securely with Hedwig using your biometrics.
                    </Text>
                </View>

                <View style={{ flex: 1 }} />

                <View style={styles.footer}>
                    <TouchableOpacity
                        style={[styles.primaryButton, (isEnableLoading || isLaterLoading) && styles.buttonDisabled]}
                        onPress={handleEnable}
                        disabled={isEnableLoading || isLaterLoading}
                    >
                        {isEnableLoading ? (
                            <ActivityIndicator color="#FFFFFF" />
                        ) : (
                            <Text style={styles.primaryButtonText}>Enable Face ID</Text>
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.secondaryButton, (isEnableLoading || isLaterLoading) && styles.buttonDisabled]}
                        onPress={handleLater}
                        disabled={isEnableLoading || isLaterLoading}
                    >
                        {isLaterLoading ? (
                            <ActivityIndicator color="#111827" />
                        ) : (
                            <Text style={styles.secondaryButtonText}>Maybe later</Text>
                        )}
                    </TouchableOpacity>
                </View>
                <View style={{ height: insets.bottom + 20 }} />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FFFFFF',
    },
    content: {
        flex: 1,
        paddingHorizontal: 24,
        alignItems: 'center',
    },
    iconContainer: {
        marginTop: 60,
        marginBottom: 32,
    },
    iconGradient: {
        width: 80,
        height: 80,
        borderRadius: 40,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#3B82F6',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
    },
    textContainer: {
        alignItems: 'center',
        gap: 12,
    },
    title: {
        fontFamily: 'Merriweather_700Bold',
        fontSize: 28,
        color: Colors.textPrimary,
        textAlign: 'center',
    },
    subtitle: {
        fontFamily: 'Merriweather_400Regular',
        fontSize: 16,
        color: Colors.textSecondary,
        textAlign: 'center',
        paddingHorizontal: 20,
        lineHeight: 24,
    },
    footer: {
        width: '100%',
        gap: 16,
    },
    primaryButton: {
        backgroundColor: Colors.primary,
        paddingVertical: 18,
        borderRadius: 30,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
    },
    primaryButtonText: {
        fontFamily: 'Merriweather_700Bold',
        fontSize: 16,
        color: '#FFFFFF',
    },
    secondaryButton: {
        paddingVertical: 16,
        borderRadius: 30,
        alignItems: 'center',
        backgroundColor: '#F3F4F6',
    },
    secondaryButtonText: {
        fontFamily: 'Merriweather_700Bold',
        fontSize: 16,
        color: '#111827',
    },
    buttonDisabled: {
        opacity: 0.7,
    },
});
