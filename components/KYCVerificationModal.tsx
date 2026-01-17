import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Animated, Dimensions, ActivityIndicator, Platform, Image } from 'react-native';
import { X, ShieldCheck, Warning, ArrowRight, CheckCircle } from 'phosphor-react-native';
import { Colors, useThemeColors } from '../theme/colors';
import { Typography } from '../styles/typography';
import { ModalBackdrop, modalHaptic } from './ui/ModalStyles';
import { useKYC, KYCStatus } from '../hooks/useKYC';
import Analytics from '../services/analytics';
import SNSMobileSDK from '@sumsub/react-native-mobilesdk-module';

const { height } = Dimensions.get('window');

interface KYCVerificationModalProps {
    visible: boolean;
    onClose: () => void;
    onVerified?: () => void;
}

type ModalState = 'explanation' | 'verifying' | 'pending' | 'approved' | 'rejected';

export const KYCVerificationModal: React.FC<KYCVerificationModalProps> = ({
    visible,
    onClose,
    onVerified
}) => {
    const themeColors = useThemeColors();
    const { status, startKYC, checkStatus, refreshToken, isLoading } = useKYC();

    const [modalState, setModalState] = useState<ModalState>('explanation');
    const [isStarting, setIsStarting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const modalAnim = useRef(new Animated.Value(height)).current;
    const opacityAnim = useRef(new Animated.Value(0)).current;

    // Update modal state based on KYC status
    useEffect(() => {
        if (visible) {
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
            }
        }
    }, [visible, status]);

    // Animate modal on visibility change
    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.timing(opacityAnim, {
                    toValue: 1,
                    duration: 200,
                    useNativeDriver: true,
                }),
                Animated.spring(modalAnim, {
                    toValue: 0,
                    damping: 25,
                    stiffness: 300,
                    useNativeDriver: true,
                }),
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(opacityAnim, {
                    toValue: 0,
                    duration: 150,
                    useNativeDriver: true,
                }),
                Animated.timing(modalAnim, {
                    toValue: height,
                    duration: 200,
                    useNativeDriver: true,
                }),
            ]).start();
        }
    }, [visible]);

    const handleStartVerification = async () => {
        setIsStarting(true);
        setError(null);
        modalHaptic('medium');

        try {
            Analytics.kycStarted?.();

            const result = await startKYC();

            if (!result) {
                setError('Failed to start verification. Please try again.');
                return;
            }

            // Launch Sumsub SDK
            const launchSdk = async () => {
                try {
                    const snsMobileSDK = SNSMobileSDK.init(result.accessToken, async () => {
                        // Handle token expiration
                        const newToken = await refreshToken();
                        return newToken || '';
                    });

                    snsMobileSDK
                        .withHandlers({
                            onStatusChanged: (event: { prevStatus: string; newStatus: string }) => {
                                console.log('Sumsub status changed:', event);
                                if (event.newStatus === 'Approved') {
                                    setModalState('approved');
                                    Analytics.kycApproved?.();
                                    onVerified?.();
                                } else if (event.newStatus === 'FinallyRejected') {
                                    setModalState('rejected');
                                    Analytics.kycRejected?.();
                                }
                            },
                            onLog: (event: { message: string }) => {
                                console.log('Sumsub log:', event.message);
                            },
                        })
                        .withDebug(__DEV__)
                        .withLocale('en')
                        .build()
                        .launch();

                    // Show pending state while SDK is active
                    setModalState('pending');
                    Analytics.kycCompleted?.();
                } catch (err) {
                    console.error('Sumsub SDK error:', err);
                    setError('Verification failed. Please try again.');
                }
            };

            await launchSdk();

        } catch (err) {
            console.error('Start verification error:', err);
            setError('Failed to start verification. Please try again.');
        } finally {
            setIsStarting(false);
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
        modalHaptic('light');
        onClose();
    };

    const handleContinue = () => {
        if (modalState === 'approved') {
            onVerified?.();
        }
        handleClose();
    };

    const renderExplanation = () => (
        <>
            <View style={styles.iconContainer}>
                <ShieldCheck size={80} color={Colors.primary} weight="duotone" />
            </View>

            <Text style={[styles.title, { color: themeColors.textPrimary }]}>
                Let's get to know you.
            </Text>

            <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
                We'll use this info to verify your identity and enable bank withdrawals.
            </Text>

            <View style={styles.infoList}>
                <View style={styles.infoItem}>
                    <CheckCircle size={20} color="#10B981" weight="fill" />
                    <Text style={[styles.infoText, { color: themeColors.textSecondary }]}>
                        Government-issued ID
                    </Text>
                </View>
                <View style={styles.infoItem}>
                    <CheckCircle size={20} color="#10B981" weight="fill" />
                    <Text style={[styles.infoText, { color: themeColors.textSecondary }]}>
                        Quick selfie verification
                    </Text>
                </View>
                <View style={styles.infoItem}>
                    <CheckCircle size={20} color="#10B981" weight="fill" />
                    <Text style={[styles.infoText, { color: themeColors.textSecondary }]}>
                        Takes about 2-3 minutes
                    </Text>
                </View>
            </View>

            {error && (
                <View style={styles.errorContainer}>
                    <Warning size={16} color="#EF4444" weight="bold" />
                    <Text style={styles.errorText}>{error}</Text>
                </View>
            )}

            <TouchableOpacity
                style={[styles.primaryButton, isStarting && styles.buttonDisabled]}
                onPress={handleStartVerification}
                disabled={isStarting}
            >
                {isStarting ? (
                    <ActivityIndicator color="#FFFFFF" />
                ) : (
                    <>
                        <Text style={styles.primaryButtonText}>Continue</Text>
                        <ArrowRight size={20} color="#FFFFFF" weight="bold" />
                    </>
                )}
            </TouchableOpacity>
        </>
    );

    const renderPending = () => (
        <>
            <View style={styles.iconContainer}>
                <ActivityIndicator size="large" color={Colors.primary} />
            </View>

            <Text style={[styles.title, { color: themeColors.textPrimary }]}>
                Verification in progress
            </Text>

            <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
                We're reviewing your documents. This usually takes a few minutes.
            </Text>

            <TouchableOpacity
                style={styles.secondaryButton}
                onPress={handleCheckStatus}
            >
                <Text style={[styles.secondaryButtonText, { color: Colors.primary }]}>
                    Check Status
                </Text>
            </TouchableOpacity>

            <TouchableOpacity
                style={styles.textButton}
                onPress={handleClose}
            >
                <Text style={[styles.textButtonText, { color: themeColors.textSecondary }]}>
                    I'll come back later
                </Text>
            </TouchableOpacity>
        </>
    );

    const renderApproved = () => (
        <>
            <View style={[styles.iconContainer, styles.approvedIcon]}>
                <CheckCircle size={80} color="#10B981" weight="fill" />
            </View>

            <Text style={[styles.title, { color: themeColors.textPrimary }]}>
                You're verified!
            </Text>

            <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
                Your identity has been verified. You can now withdraw funds to your bank account.
            </Text>

            <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleContinue}
            >
                <Text style={styles.primaryButtonText}>Continue</Text>
                <ArrowRight size={20} color="#FFFFFF" weight="bold" />
            </TouchableOpacity>
        </>
    );

    const renderRejected = () => (
        <>
            <View style={styles.iconContainer}>
                <Warning size={80} color="#F59E0B" weight="duotone" />
            </View>

            <Text style={[styles.title, { color: themeColors.textPrimary }]}>
                Verification unsuccessful
            </Text>

            <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
                We couldn't verify your identity. Please try again with clearer photos of your documents.
            </Text>

            <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleStartVerification}
            >
                <Text style={styles.primaryButtonText}>Try Again</Text>
            </TouchableOpacity>

            <TouchableOpacity
                style={styles.textButton}
                onPress={handleClose}
            >
                <Text style={[styles.textButtonText, { color: themeColors.textSecondary }]}>
                    Cancel
                </Text>
            </TouchableOpacity>
        </>
    );

    const renderContent = () => {
        switch (modalState) {
            case 'pending':
            case 'verifying':
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
        <Modal
            visible={visible}
            transparent
            animationType="none"
            onRequestClose={handleClose}
        >
            <ModalBackdrop onPress={handleClose} />

            <Animated.View
                style={[
                    styles.container,
                    {
                        backgroundColor: themeColors.background,
                        transform: [{ translateY: modalAnim }],
                        opacity: opacityAnim,
                    },
                ]}
            >
                <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
                    <X size={24} color={themeColors.textSecondary} weight="bold" />
                </TouchableOpacity>

                <View style={styles.content}>
                    {renderContent()}
                </View>
            </Animated.View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingTop: 16,
        paddingHorizontal: 24,
        paddingBottom: Platform.OS === 'ios' ? 40 : 24,
        maxHeight: height * 0.85,
    },
    closeButton: {
        position: 'absolute',
        top: 16,
        right: 16,
        padding: 8,
        zIndex: 10,
    },
    content: {
        alignItems: 'center',
        paddingTop: 32,
        paddingBottom: 16,
    },
    iconContainer: {
        marginBottom: 24,
    },
    approvedIcon: {
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        padding: 20,
        borderRadius: 50,
    },
    title: {
        ...Typography.h1,
        fontSize: 24,
        fontWeight: '600',
        textAlign: 'center',
        marginBottom: 12,
    },
    subtitle: {
        ...Typography.body,
        fontSize: 16,
        textAlign: 'center',
        lineHeight: 24,
        marginBottom: 24,
        paddingHorizontal: 16,
    },
    infoList: {
        width: '100%',
        marginBottom: 24,
    },
    infoItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 16,
        backgroundColor: 'rgba(16, 185, 129, 0.05)',
        borderRadius: 12,
        marginBottom: 8,
    },
    infoText: {
        ...Typography.body,
        fontSize: 15,
    },
    errorContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        padding: 12,
        borderRadius: 12,
        marginBottom: 16,
        width: '100%',
    },
    errorText: {
        color: '#EF4444',
        fontSize: 14,
        flex: 1,
    },
    primaryButton: {
        backgroundColor: Colors.primary,
        paddingVertical: 16,
        paddingHorizontal: 32,
        borderRadius: 30,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        width: '100%',
        marginBottom: 12,
    },
    buttonDisabled: {
        opacity: 0.6,
    },
    primaryButtonText: {
        ...Typography.button,
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
    },
    secondaryButton: {
        paddingVertical: 16,
        paddingHorizontal: 32,
        borderRadius: 30,
        borderWidth: 1,
        borderColor: Colors.primary,
        width: '100%',
        alignItems: 'center',
        marginBottom: 12,
    },
    secondaryButtonText: {
        ...Typography.button,
        fontSize: 16,
        fontWeight: '600',
    },
    textButton: {
        paddingVertical: 12,
    },
    textButtonText: {
        ...Typography.body,
        fontSize: 14,
    },
});

export default KYCVerificationModal;
