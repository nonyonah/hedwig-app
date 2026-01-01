import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Platform, ActivityIndicator } from 'react-native';
import { BlurView } from 'expo-blur';
import { X, Copy, Eye, EyeSlash, Warning, CheckCircle } from 'phosphor-react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Colors, useThemeColors } from '../theme/colors';
import { useSettings } from '../context/SettingsContext';

interface PrivateKeyModalProps {
    visible: boolean;
    onClose: () => void;
    chainType: 'ethereum' | 'solana';
    address: string | null;
    privateKey: string | null;
    isLoading: boolean;
    error: string | null;
}

export function PrivateKeyModal({
    visible,
    onClose,
    chainType,
    address,
    privateKey,
    isLoading,
    error
}: PrivateKeyModalProps) {
    const themeColors = useThemeColors();
    const { hapticsEnabled } = useSettings();
    const [isKeyVisible, setIsKeyVisible] = useState(false);
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        if (!privateKey) return;

        if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        await Clipboard.setStringAsync(privateKey);
        setCopied(true);

        setTimeout(() => setCopied(false), 2000);
    };

    const handleClose = () => {
        if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setIsKeyVisible(false);
        setCopied(false);
        onClose();
    };

    const formatAddress = (addr: string) => {
        if (!addr) return '';
        return `${addr.slice(0, 10)}...${addr.slice(-8)}`;
    };

    const maskPrivateKey = (key: string) => {
        if (!key) return '';
        return '•'.repeat(Math.min(key.length, 64));
    };

    const chainName = chainType === 'ethereum' ? 'Ethereum' : 'Solana';
    const chainColor = chainType === 'ethereum' ? '#627EEA' : '#9945FF';

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={handleClose}
        >
            <View style={styles.overlay}>
                {Platform.OS === 'ios' ? (
                    <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
                ) : (
                    <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.7)' }]} />
                )}

                <View style={[styles.modalContainer, { backgroundColor: themeColors.surface }]}>
                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={[styles.title, { color: themeColors.textPrimary }]}>
                            {chainName} Private Key
                        </Text>
                        <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                            <X size={24} color={themeColors.textSecondary} weight="bold" />
                        </TouchableOpacity>
                    </View>

                    {/* Content */}
                    {isLoading ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color={chainColor} />
                            <Text style={[styles.loadingText, { color: themeColors.textSecondary }]}>
                                Exporting private key...
                            </Text>
                        </View>
                    ) : error ? (
                        <View style={styles.errorContainer}>
                            <Warning size={48} color={Colors.error} weight="fill" />
                            <Text style={[styles.errorTitle, { color: Colors.error }]}>Export Failed</Text>
                            <Text style={[styles.errorText, { color: themeColors.textSecondary }]}>
                                {error}
                            </Text>
                        </View>
                    ) : privateKey ? (
                        <>
                            {/* Address */}
                            <View style={styles.addressContainer}>
                                <Text style={[styles.label, { color: themeColors.textSecondary }]}>Wallet Address</Text>
                                <Text style={[styles.address, { color: themeColors.textPrimary }]}>
                                    {formatAddress(address || '')}
                                </Text>
                            </View>

                            {/* Private Key */}
                            <View style={[styles.keyContainer, { backgroundColor: themeColors.background }]}>
                                <View style={styles.keyHeader}>
                                    <Text style={[styles.label, { color: themeColors.textSecondary }]}>Private Key</Text>
                                    <TouchableOpacity
                                        onPress={() => {
                                            if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                            setIsKeyVisible(!isKeyVisible);
                                        }}
                                    >
                                        {isKeyVisible ? (
                                            <EyeSlash size={20} color={themeColors.textSecondary} />
                                        ) : (
                                            <Eye size={20} color={themeColors.textSecondary} />
                                        )}
                                    </TouchableOpacity>
                                </View>
                                <Text
                                    style={[
                                        styles.privateKey,
                                        { color: themeColors.textPrimary }
                                    ]}
                                    selectable={isKeyVisible}
                                >
                                    {isKeyVisible ? privateKey : maskPrivateKey(privateKey)}
                                </Text>
                            </View>

                            {/* Copy Button */}
                            <TouchableOpacity
                                style={[styles.copyButton, { backgroundColor: chainColor }]}
                                onPress={handleCopy}
                            >
                                {copied ? (
                                    <>
                                        <CheckCircle size={20} color="#FFFFFF" weight="fill" />
                                        <Text style={styles.copyButtonText}>Copied!</Text>
                                    </>
                                ) : (
                                    <>
                                        <Copy size={20} color="#FFFFFF" weight="bold" />
                                        <Text style={styles.copyButtonText}>Copy Private Key</Text>
                                    </>
                                )}
                            </TouchableOpacity>

                            {/* Warning */}
                            <View style={[styles.warningBox, { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}>
                                <Warning size={16} color={Colors.error} weight="fill" />
                                <Text style={[styles.warningText, { color: Colors.error }]}>
                                    Never share this key. Anyone with it can access your funds.
                                </Text>
                            </View>
                        </>
                    ) : null}
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'center',
        padding: 24,
    },
    modalContainer: {
        borderRadius: 20,
        padding: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 16,
        elevation: 8,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    title: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 18,
    },
    closeButton: {
        padding: 4,
    },
    loadingContainer: {
        alignItems: 'center',
        paddingVertical: 40,
    },
    loadingText: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 14,
        marginTop: 12,
    },
    errorContainer: {
        alignItems: 'center',
        paddingVertical: 24,
    },
    errorTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 16,
        marginTop: 12,
        marginBottom: 8,
    },
    errorText: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 14,
        textAlign: 'center',
    },
    addressContainer: {
        marginBottom: 16,
    },
    label: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 12,
        marginBottom: 4,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    address: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 16,
    },
    keyContainer: {
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
    },
    keyHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    privateKey: {
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        fontSize: 12,
        lineHeight: 18,
        wordBreak: 'break-all',
    },
    copyButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 12,
        paddingVertical: 14,
        gap: 8,
        marginBottom: 16,
    },
    copyButtonText: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 14,
        color: '#FFFFFF',
    },
    warningBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        padding: 12,
        borderRadius: 8,
    },
    warningText: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 12,
        flex: 1,
    },
});
