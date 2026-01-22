import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Animated, Dimensions, ActivityIndicator, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { X, ShieldCheck, Warning, ArrowRight, CheckCircle, ClockCountdown } from 'phosphor-react-native';
import { Colors, useThemeColors } from '../theme/colors';
import { useKYC, KYCStatus } from '../hooks/useKYC';
import Analytics from '../services/analytics';

const { height } = Dimensions.get('window');

interface KYCVerificationModalProps {
    visible: boolean;
    onClose: () => void;
    onVerified?: () => void;
}

type ModalState = 'explanation' | 'webview' | 'pending' | 'approved' | 'rejected';

export const KYCVerificationModal: React.FC<KYCVerificationModalProps> = ({
    visible,
    onClose,
    onVerified
}) => {
    const themeColors = useThemeColors();
    const { status, startKYC, checkStatus, isLoading } = useKYC();

    const [modalState, setModalState] = useState<ModalState>('explanation');
    const [verificationUrl, setVerificationUrl] = useState<string | null>(null);
    const [isStarting, setIsStarting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const modalAnim = useRef(new Animated.Value(height)).current;
    const opacityAnim = useRef(new Animated.Value(0)).current;
    const isMounted = useRef(true);

    useEffect(() => {
        return () => {
            isMounted.current = false;
        };
    }, []);

    // Update modal state based on KYC status when modal opens
    useEffect(() => {
        if (visible && isMounted.current) {
            switch (status) {
                case 'approved':
                    setModalState('approved');
                    break;
                case 'pending':
                    setModalState('pending');
                    break;
                case 'rejected':
                case 'retry_required':
                    setModalState('rejected');
                    break;
                default:
                    setModalState('explanation');
                    setVerificationUrl(null);
            }
        }
    }, [visible, status]);

    // Animate modal on visibility change
    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.timing(opacityAnim, {
                    toValue: 1,
                    duration: 120,
                    useNativeDriver: true,
                }),
                Animated.spring(modalAnim, {
                    toValue: 0,
                    damping: 28,
                    stiffness: 350,
                    useNativeDriver: true,
                }),
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(opacityAnim, {
                    toValue: 0,
                    duration: 80,
                    useNativeDriver: true,
                }),
                Animated.spring(modalAnim, {
                    toValue: height,
                    damping: 28,
                    stiffness: 350,
                    useNativeDriver: true,
                }),
            ]).start();
        }
    }, [visible]);

    const handleStartVerification = async () => {
        setIsStarting(true);
        setError(null);

        try {
            Analytics.kycStarted?.();

            const result = await startKYC();

            if (!result || !result.url) {
                if (isMounted.current) setError('Failed to start verification. Please try again.');
                return;
            }

            // Open WebView with Didit verification URL
            setVerificationUrl(result.url);
            setModalState('webview');

        } catch (err) {
            console.error('Start verification error:', err);
            if (isMounted.current) {
                setError('Failed to start verification. Please try again.');
            }
        } finally {
            if (isMounted.current) setIsStarting(false);
        }
    };

    const handleWebViewNavigation = async (navState: any) => {
        const { url } = navState;
        // Check for success/completion based on URL redirects
        if (url.includes('/success') || url.includes('/callback') || url.includes('status=complete') || url.includes('verified=true')) {
            // Check status
            const newStatus = await checkStatus();
            if (newStatus === 'approved') {
                setModalState('approved');
                Analytics.kycApproved?.();
                onVerified?.();
            } else if (newStatus === 'pending') {
                setModalState('pending');
            }
        }
    };

    const handleCheckStatus = async () => {
        const newStatus = await checkStatus();
        if (newStatus === 'approved') {
            setModalState('approved');
            onVerified?.();
        }
    };

    const handleClose = () => {
        // Check status one more time before closing if in webview
        if (modalState === 'webview') {
            checkStatus().then((newStatus) => {
                if (newStatus === 'approved') {
                    onVerified?.();
                } else if (newStatus === 'pending') {
                    setModalState('pending');
                    return; // Don't close, show pending state
                }
                onClose();
            });
        } else {
            onClose();
        }
    };

    const renderExplanation = () => (
        <View style={[styles.contentCard, { backgroundColor: themeColors.surface }]}>
            <View style={styles.iconContainer}>
                <ShieldCheck size={64} color={Colors.primary} weight="fill" />
            </View>
            <Text style={[styles.title, { color: themeColors.textPrimary }]}>
                Identity Verification
            </Text>
            <Text style={[styles.description, { color: themeColors.textSecondary }]}>
                To process withdrawals and off-ramps, we need to verify your identity. This helps keep your account secure and complies with regulations.
            </Text>

            <View style={styles.bulletPoints}>
                <View style={styles.bulletRow}>
                    <View style={[styles.bullet, { backgroundColor: Colors.primary }]} />
                    <Text style={[styles.bulletText, { color: themeColors.textSecondary }]}>
                        Takes about 2-3 minutes
                    </Text>
                </View>
                <View style={styles.bulletRow}>
                    <View style={[styles.bullet, { backgroundColor: Colors.primary }]} />
                    <Text style={[styles.bulletText, { color: themeColors.textSecondary }]}>
                        Have your ID ready
                    </Text>
                </View>
                <View style={styles.bulletRow}>
                    <View style={[styles.bullet, { backgroundColor: Colors.primary }]} />
                    <Text style={[styles.bulletText, { color: themeColors.textSecondary }]}>
                        Results usually instant
                    </Text>
                </View>
            </View>

            {error && <Text style={styles.errorText}>{error}</Text>}

            <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: Colors.primary }]}
                onPress={handleStartVerification}
                disabled={isStarting}
            >
                {isStarting ? (
                    <ActivityIndicator color="#fff" />
                ) : (
                    <>
                        <Text style={styles.primaryButtonText}>Start Verification</Text>
                        <ArrowRight size={20} color="#fff" weight="bold" />
                    </>
                )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.secondaryButton} onPress={onClose}>
                <Text style={[styles.secondaryButtonText, { color: themeColors.textSecondary }]}>
                    Do this later
                </Text>
            </TouchableOpacity>
        </View>
    );

    const renderWebView = () => (
        <View style={[styles.webviewContainer, { backgroundColor: themeColors.background }]}>
            <View style={[styles.webviewHeader, { borderBottomColor: themeColors.border }]}>
                <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                    <X size={24} color={themeColors.textPrimary} />
                </TouchableOpacity>
                <Text style={[styles.webviewTitle, { color: themeColors.textPrimary }]}>
                    Verify Identity
                </Text>
                <View style={{ width: 40 }} />
            </View>
            {verificationUrl && (
                <WebView
                    source={{ uri: verificationUrl }}
                    style={{ flex: 1 }}
                    onNavigationStateChange={handleWebViewNavigation}
                    startInLoadingState
                    renderLoading={() => (
                        <View style={styles.webviewLoading}>
                            <ActivityIndicator size="large" color={Colors.primary} />
                        </View>
                    )}
                />
            )}
        </View>
    );

    const renderPending = () => (
        <View style={[styles.contentCard, { backgroundColor: themeColors.surface }]}>
            <View style={styles.iconContainer}>
                <ClockCountdown size={64} color={Colors.warning} weight="fill" />
            </View>
            <Text style={[styles.title, { color: themeColors.textPrimary }]}>
                Verification In Progress
            </Text>
            <Text style={[styles.description, { color: themeColors.textSecondary }]}>
                Your documents are being reviewed. This usually takes just a few minutes. We'll notify you once it's complete.
            </Text>

            <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: Colors.primary }]}
                onPress={handleCheckStatus}
            >
                <Text style={styles.primaryButtonText}>Check Status</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.secondaryButton} onPress={onClose}>
                <Text style={[styles.secondaryButtonText, { color: themeColors.textSecondary }]}>
                    Close
                </Text>
            </TouchableOpacity>
        </View>
    );

    const renderApproved = () => (
        <View style={[styles.contentCard, { backgroundColor: themeColors.surface }]}>
            <View style={styles.iconContainer}>
                <CheckCircle size={64} color={Colors.success} weight="fill" />
            </View>
            <Text style={[styles.title, { color: themeColors.textPrimary }]}>
                Verification Complete!
            </Text>
            <Text style={[styles.description, { color: themeColors.textSecondary }]}>
                Your identity has been verified. You can now use all features including withdrawals and off-ramps.
            </Text>

            <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: Colors.success }]}
                onPress={() => {
                    onVerified?.();
                    onClose();
                }}
            >
                <Text style={styles.primaryButtonText}>Continue</Text>
            </TouchableOpacity>
        </View>
    );

    const renderRejected = () => (
        <View style={[styles.contentCard, { backgroundColor: themeColors.surface }]}>
            <View style={styles.iconContainer}>
                <Warning size={64} color={Colors.error} weight="fill" />
            </View>
            <Text style={[styles.title, { color: themeColors.textPrimary }]}>
                Verification Failed
            </Text>
            <Text style={[styles.description, { color: themeColors.textSecondary }]}>
                We couldn't verify your identity. Please try again with clear photos of your documents.
            </Text>

            <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: Colors.primary }]}
                onPress={handleStartVerification}
                disabled={isStarting}
            >
                {isStarting ? (
                    <ActivityIndicator color="#fff" />
                ) : (
                    <Text style={styles.primaryButtonText}>Try Again</Text>
                )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.secondaryButton} onPress={onClose}>
                <Text style={[styles.secondaryButtonText, { color: themeColors.textSecondary }]}>
                    Close
                </Text>
            </TouchableOpacity>
        </View>
    );

    const renderContent = () => {
        switch (modalState) {
            case 'webview':
                return renderWebView();
            case 'pending':
                return renderPending();
            case 'approved':
                return renderApproved();
            case 'rejected':
                return renderRejected();
            default:
                return renderExplanation();
        }
    };

    return (
        <Modal visible={visible} animationType="none" transparent>
            <Animated.View style={[styles.overlay, { opacity: opacityAnim }]}>
                <TouchableOpacity
                    style={styles.backdrop}
                    activeOpacity={1}
                    onPress={modalState === 'webview' ? undefined : handleClose}
                />
                <Animated.View
                    style={[
                        modalState === 'webview' ? styles.fullScreenModal : styles.modalContainer,
                        { transform: [{ translateY: modalAnim }] }
                    ]}
                >
                    {renderContent()}
                </Animated.View>
            </Animated.View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
    },
    modalContainer: {
        paddingHorizontal: 16,
        paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    },
    fullScreenModal: {
        flex: 1,
        marginTop: Platform.OS === 'ios' ? 50 : 30,
    },
    contentCard: {
        borderRadius: 24,
        padding: 24,
        alignItems: 'center',
    },
    iconContainer: {
        marginBottom: 20,
    },
    title: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 24,
        marginBottom: 12,
        textAlign: 'center',
    },
    description: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 16,
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 24,
    },
    bulletPoints: {
        alignSelf: 'stretch',
        marginBottom: 24,
    },
    bulletRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    bullet: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 12,
    },
    bulletText: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 15,
    },
    primaryButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: 56,
        borderRadius: 16,
        marginBottom: 12,
        gap: 8,
    },
    primaryButtonText: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        color: '#fff',
        fontSize: 17,
    },
    secondaryButton: {
        padding: 12,
    },
    secondaryButtonText: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 15,
    },
    errorText: {
        fontFamily: 'GoogleSansFlex_400Regular',
        color: '#ff4444',
        marginBottom: 16,
        textAlign: 'center',
    },
    webviewContainer: {
        flex: 1,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        overflow: 'hidden',
    },
    webviewHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 16,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
    },
    webviewTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 18,
    },
    closeButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    webviewLoading: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'white',
    },
});

export default KYCVerificationModal;
