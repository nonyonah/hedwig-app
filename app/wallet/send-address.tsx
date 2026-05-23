import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ChevronLeft as CaretLeft, ScanLine, Wallet, History, X } from '../../components/ui/AppIcon';
import { useThemeColors } from '../../theme/colors';
import {
    detectRecipientChain,
    SendChain,
    shortenAddress,
} from './sendFlow';
import Button from '../../components/Button';
import { useAuth } from '../../hooks/useAuth';
import IOSGlassIconButton from '../../components/ui/IOSGlassIconButton';
import {
    deleteRecipient,
    listRecipients,
    saveRecipient,
    SavedRecipient,
} from './recipientApi';

export default function SendAddressScreen() {
    const themeColors = useThemeColors();
    const router = useRouter();
    const params = useLocalSearchParams<{ recipient?: string }>();
    const { getAccessToken } = useAuth();

    const [address, setAddress] = useState(typeof params.recipient === 'string' ? params.recipient : '');
    const [recentRecipients, setRecentRecipients] = useState<SavedRecipient[]>([]);
    const [showQrScanner, setShowQrScanner] = useState(false);

    const detectedChain = useMemo(() => detectRecipientChain(address), [address]);
    const matchingRecent = useMemo(
        () => (detectedChain ? recentRecipients.filter((entry) => entry.chain === detectedChain) : recentRecipients),
        [detectedChain, recentRecipients]
    );

    const loadRecent = useCallback(async () => {
        try {
            const entries = await listRecipients(getAccessToken);
            setRecentRecipients(entries);
        } catch {
            setRecentRecipients([]);
        }
    }, [getAccessToken]);

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
        const input = candidate.trim();
        if (!input) {
            Alert.alert('Missing recipient', 'Enter a valid wallet address.');
            return;
        }

        const chain = detectRecipientChain(input);
        if (!chain) {
            Alert.alert('Unsupported recipient', 'Only direct wallet addresses are supported for now.');
            return;
        }

        try {
            const recipient = input;
            await saveRecipient(getAccessToken, recipient, chain, null);
            await loadRecent();
            router.push({ pathname: '/wallet/send-token', params: { recipient, chain } });
        } catch (error: any) {
            Alert.alert('Could not continue', error?.message || 'Use a valid EVM or Solana address.');
        }
    };

    const handleDeleteRecipient = useCallback(
        async (id: string) => {
            try {
                await deleteRecipient(getAccessToken, id);
                setRecentRecipients((prev) => prev.filter((entry) => entry.id !== id));
            } catch (error: any) {
                Alert.alert('Delete failed', error?.message || 'Unable to remove recipient.');
            }
        },
        [getAccessToken]
    );

    const hasInput = address.trim().length > 0;

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

            <View style={[styles.addressInputWrap, { backgroundColor: themeColors.surface }]}> 
                <Text style={[styles.toLabel, { color: themeColors.textSecondary }]}>To</Text>
                <TextInput
                    value={address}
                    onChangeText={setAddress}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="Wallet address"
                    placeholderTextColor={themeColors.textTertiary}
                    style={[styles.addressInput, { color: themeColors.textPrimary }]}
                />
                <TouchableOpacity style={[styles.pasteBtn, { backgroundColor: themeColors.background }]} onPress={handlePaste}>
                    <Text style={[styles.pasteBtnText, { color: themeColors.textPrimary }]}>Paste</Text>
                </TouchableOpacity>
            </View>

            <TouchableOpacity
                style={styles.scanRow}
                onPress={() => setShowQrScanner(true)}
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
                    {matchingRecent.slice(0, 6).map((entry) => (
                        <Swipeable
                            key={entry.id}
                            renderRightActions={() => (
                                <TouchableOpacity
                                    style={styles.deleteAction}
                                    onPress={() => handleDeleteRecipient(entry.id)}
                                >
                                    <Text style={styles.deleteActionText}>Delete</Text>
                                </TouchableOpacity>
                            )}
                        >
                            <TouchableOpacity
                                style={styles.recentRow}
                                onPress={() => goToTokenSelect(entry.address)}
                            >
                                <View style={[styles.recentIconWrap, { backgroundColor: themeColors.surface }]}> 
                                    <Wallet size={20} color={themeColors.textSecondary} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.recentAddress, { color: themeColors.textPrimary }]}>
                                        {entry.label ? entry.label : shortenAddress(entry.address, 8, 5)}
                                    </Text>
                                    <Text style={[styles.recentAddressMuted, { color: themeColors.textSecondary }]}>
                                        {shortenAddress(entry.address, 10, 6)}
                                    </Text>
                                </View>
                            </TouchableOpacity>
                        </Swipeable>
                    ))}
                </View>
            )}

            <View style={styles.footer}>
                <Button
                    title="Continue"
                    onPress={() => goToTokenSelect(address)}
                    size="large"
                    disabled={!hasInput}
                />
            </View>

            {/* QR Scanner Overlay */}
            {showQrScanner && <QrScannerOverlay onAddressScanned={(addr) => { setAddress(addr); setShowQrScanner(false); }} onClose={() => setShowQrScanner(false)} />}
        </SafeAreaView>
    );
}

function QrScannerOverlay({
    onAddressScanned,
    onClose,
}: {
    onAddressScanned: (address: string) => void;
    onClose: () => void;
}) {
    const themeColors = useThemeColors();
    const [permission, requestPermission] = useCameraPermissions();
    const [scanned, setScanned] = useState(false);

    const handleBarCodeScanned = useCallback(
        ({ data }: { type: string; data: string }) => {
            if (scanned) return;
            setScanned(true);

            // Parse address from QR data (handle ethereum:, solana: URI schemes)
            let address = data.trim();
            const lower = address.toLowerCase();
            if (lower.startsWith('ethereum:')) {
                address = address.slice('ethereum:'.length).split('?')[0];
            } else if (lower.startsWith('solana:')) {
                address = address.slice('solana:'.length).split('?')[0];
            } else if (lower.startsWith('bitcoin:')) {
                // Unsupported, show error
                Alert.alert('Unsupported chain', 'Bitcoin addresses are not supported yet.');
                setScanned(false);
                return;
            }

            const chain = detectRecipientChain(address);
            if (!chain) {
                Alert.alert('Invalid QR Code', 'Could not recognize a valid wallet address.');
                setScanned(false);
                return;
            }

            onAddressScanned(address);
        },
        [scanned, onAddressScanned]
    );

    if (!permission?.granted) {
        return (
            <View style={StyleSheet.absoluteFill}>
                <SafeAreaView style={[styles.qrContainer, { backgroundColor: themeColors.background }]}>
                    <View style={styles.qrHeader}>
                        <IOSGlassIconButton
                            onPress={onClose}
                            systemImage="xmark"
                            containerStyle={styles.qrCloseBtn}
                            circleStyle={[styles.qrCloseCircle, { backgroundColor: themeColors.surface }]}
                            icon={<X size={20} color={themeColors.textPrimary} strokeWidth={3} />}
                        />
                    </View>
                    <View style={styles.qrPermissionBody}>
                        <Text style={[styles.qrPermissionText, { color: themeColors.textPrimary }]}>
                            Camera permission is required to scan QR codes.
                        </Text>
                        <TouchableOpacity
                            style={[styles.qrPermissionButton, { backgroundColor: themeColors.primary }]}
                            onPress={requestPermission}
                            activeOpacity={0.8}
                        >
                            <Text style={styles.qrPermissionButtonText}>Grant Permission</Text>
                        </TouchableOpacity>
                    </View>
                </SafeAreaView>
            </View>
        );
    }

    return (
        <View style={StyleSheet.absoluteFill}>
            <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={handleBarCodeScanned}
            >
                <SafeAreaView style={styles.qrOverlay}>
                    <View style={styles.qrHeader}>
                        <IOSGlassIconButton
                            onPress={onClose}
                            systemImage="xmark"
                            containerStyle={styles.qrCloseBtn}
                            circleStyle={[styles.qrCloseCircle, { backgroundColor: 'rgba(255,255,255,0.2)' }]}
                            icon={<X size={20} color="#FFFFFF" strokeWidth={3} />}
                        />
                        <Text style={styles.qrHeaderTitle}>Scan QR Code</Text>
                        <View style={styles.qrHeaderSpacer} />
                    </View>

                    <View style={styles.qrFrameContainer}>
                        <View style={styles.qrFrame}>
                            <View style={[styles.qrCorner, styles.qrTopLeft]} />
                            <View style={[styles.qrCorner, styles.qrTopRight]} />
                            <View style={[styles.qrCorner, styles.qrBottomLeft]} />
                            <View style={[styles.qrCorner, styles.qrBottomRight]} />
                        </View>
                        <Text style={styles.qrHint}>
                            {scanned ? 'Processing…' : 'Point camera at a wallet QR code'}
                        </Text>
                    </View>
                </SafeAreaView>
            </CameraView>
        </View>
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
        marginBottom: 10,
        paddingVertical: 4,
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
    deleteAction: {
        justifyContent: 'center',
        alignItems: 'center',
        width: 88,
        borderRadius: 14,
        marginBottom: 10,
        backgroundColor: '#EF4444',
    },
    deleteActionText: {
        color: '#FFFFFF',
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 14,
    },
    // QR Scanner overlay styles
    qrContainer: {
        flex: 1,
    },
    qrHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        zIndex: 10,
    },
    qrCloseBtn: {
        width: 40,
        height: 40,
    },
    qrCloseCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    qrHeaderTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 17,
        color: '#FFFFFF',
    },
    qrHeaderSpacer: {
        width: 40,
    },
    qrOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.3)',
    },
    qrFrameContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    qrFrame: {
        width: 240,
        height: 240,
        position: 'relative',
    },
    qrCorner: {
        position: 'absolute',
        width: 32,
        height: 32,
        borderColor: '#FFFFFF',
    },
    qrTopLeft: {
        top: 0,
        left: 0,
        borderTopWidth: 4,
        borderLeftWidth: 4,
    },
    qrTopRight: {
        top: 0,
        right: 0,
        borderTopWidth: 4,
        borderRightWidth: 4,
    },
    qrBottomLeft: {
        bottom: 0,
        left: 0,
        borderBottomWidth: 4,
        borderLeftWidth: 4,
    },
    qrBottomRight: {
        bottom: 0,
        right: 0,
        borderBottomWidth: 4,
        borderRightWidth: 4,
    },
    qrHint: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 14,
        color: 'rgba(255,255,255,0.8)',
        marginTop: 20,
        textAlign: 'center',
        paddingHorizontal: 40,
    },
    qrPermissionBody: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 40,
        gap: 16,
    },
    qrPermissionText: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 16,
        textAlign: 'center',
    },
    qrPermissionButton: {
        paddingHorizontal: 24,
        paddingVertical: 14,
        borderRadius: 12,
    },
    qrPermissionButtonText: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 16,
        color: '#FFFFFF',
    },
});
