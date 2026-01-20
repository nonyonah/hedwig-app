import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { Colors, useThemeColors } from '../theme/colors';
import { X, ShieldCheck, CheckCircle } from 'phosphor-react-native';
import { useKYC } from '../hooks/useKYC';

interface KYCVerificationModalProps {
    visible: boolean;
    onClose: () => void;
    onVerified?: () => void;
}

const KYCVerificationModal: React.FC<KYCVerificationModalProps> = ({ visible, onClose, onVerified }) => {
    const themeColors = useThemeColors();
    const { startKYC, checkStatus, isApproved } = useKYC();

    // State
    const [verificationUrl, setVerificationUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [viewState, setViewState] = useState<'intro' | 'webview' | 'success'>('intro');
    const [error, setError] = useState<string | null>(null);

    // Reset when modal opens
    useEffect(() => {
        if (visible) {
            setViewState(isApproved ? 'success' : 'intro');
            setError(null);
            setVerificationUrl(null);
        }
    }, [visible, isApproved]);

    const handleStartVerification = async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await startKYC();
            if (result && result.url) {
                setVerificationUrl(result.url);
                setViewState('webview');
            } else {
                setError('Failed to start verification. Please try again.');
            }
        } catch (err) {
            console.error('KYC Start Error:', err);
            setError('An error occurred. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleWebViewNavigation = (navState: any) => {
        const { url } = navState;
        // Check for success/completion based on URL redirects
        if (url.includes('/verification/success') || url.includes('/callback') || url.includes('success=true')) {
            // Poll for status update
            checkStatus().then((newStatus) => {
                if (newStatus === 'approved' || newStatus === 'pending') {
                    setViewState('success');
                    if (onVerified && newStatus === 'approved') {
                        onVerified();
                    }
                }
            });
        }
    };

    const renderIntro = () => (
        <View style={[styles.content, { backgroundColor: themeColors.surface }]}>
            <View style={styles.iconContainer}>
                <ShieldCheck size={64} color={Colors.primary} weight="fill" />
            </View>
            <Text style={[styles.title, { color: themeColors.textPrimary }]}>Identity Verification</Text>
            <Text style={[styles.description, { color: themeColors.textSecondary }]}>
                To process withdrawals and off-ramps, we need to verify your identity. This helps keep your account secure and complies with regulations.
            </Text>

            {error && <Text style={styles.errorText}>{error}</Text>}

            <TouchableOpacity
                style={[styles.button, { backgroundColor: Colors.primary }]}
                onPress={handleStartVerification}
                disabled={loading}
            >
                {loading ? (
                    <ActivityIndicator color="#fff" />
                ) : (
                    <Text style={styles.buttonText}>Start Verification</Text>
                )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                <Text style={[styles.closeText, { color: themeColors.textSecondary }]}>Do this later</Text>
            </TouchableOpacity>
        </View>
    );

    const renderSuccess = () => (
        <View style={[styles.content, { backgroundColor: themeColors.surface }]}>
            <View style={styles.iconContainer}>
                <CheckCircle size={64} color={Colors.success} weight="fill" />
            </View>
            <Text style={[styles.title, { color: themeColors.textPrimary }]}>Verification Submitted</Text>
            <Text style={[styles.description, { color: themeColors.textSecondary }]}>
                Your documents are being reviewed. We'll notify you once verification is complete (usually within minutes).
            </Text>

            <TouchableOpacity
                style={[styles.button, { backgroundColor: Colors.primary }]}
                onPress={() => {
                    if (onVerified) onVerified();
                    onClose();
                }}
            >
                <Text style={styles.buttonText}>Done</Text>
            </TouchableOpacity>
        </View>
    );

    return (
        <Modal visible={visible} animationType="slide" transparent>
            <View style={styles.container}>
                <View style={styles.backdrop} onTouchEnd={onClose} />

                {viewState === 'webview' && verificationUrl ? (
                    <View style={[styles.webviewContainer, { backgroundColor: themeColors.background }]}>
                        <View style={styles.webviewHeader}>
                            <TouchableOpacity onPress={() => setViewState('intro')}>
                                <X size={24} color={themeColors.textPrimary} />
                            </TouchableOpacity>
                            <Text style={[styles.webviewTitle, { color: themeColors.textPrimary }]}>Verify Identity</Text>
                            <View style={{ width: 24 }} />
                        </View>
                        <WebView
                            source={{ uri: verificationUrl }}
                            style={{ flex: 1 }}
                            onNavigationStateChange={handleWebViewNavigation}
                            startInLoadingState
                            renderLoading={() => <ActivityIndicator style={StyleSheet.absoluteFill} color={Colors.primary} />}
                        />
                    </View>
                ) : viewState === 'success' ? (
                    renderSuccess()
                ) : (
                    renderIntro()
                )}
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    content: {
        width: '100%',
        maxWidth: 400,
        padding: 24,
        borderRadius: 20,
        alignItems: 'center',
    },
    iconContainer: {
        marginBottom: 20,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 12,
        textAlign: 'center',
    },
    description: {
        fontSize: 16,
        textAlign: 'center',
        marginBottom: 30,
        lineHeight: 24,
    },
    button: {
        width: '100%',
        height: 50,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    buttonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    closeButton: {
        padding: 8,
    },
    closeText: {
        fontSize: 14,
        fontWeight: '500',
    },
    errorText: {
        color: '#ff4444',
        marginBottom: 16,
        textAlign: 'center',
    },
    webviewContainer: {
        width: '100%',
        height: '90%',
        borderRadius: 20,
        overflow: 'hidden',
    },
    webviewHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0,0,0,0.1)',
    },
    webviewTitle: {
        fontSize: 18,
        fontWeight: '600',
    },
});

export default KYCVerificationModal;
