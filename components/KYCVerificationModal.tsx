import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Animated, Dimensions, ActivityIndicator, Platform, Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { ShieldCheck, Warning, ArrowRight, CheckCircle, ClockCountdown } from 'phosphor-react-native';
import { Colors, useThemeColors } from '../theme/colors';
import { useKYC } from '../hooks/useKYC';
import Analytics from '../services/analytics';
import Button from './Button';

const { height } = Dimensions.get('window');

interface KYCVerificationModalProps {
    visible: boolean;
    onClose: () => void;
    onVerified?: () => void;
}

type ModalState = 'explanation' | 'pending' | 'approved' | 'rejected';

export const KYCVerificationModal: React.FC<KYCVerificationModalProps> = ({
    visible,
    onClose,
    onVerified
}) => {
    const themeColors = useThemeColors();
    const { status, startKYC, checkStatus, isLoading } = useKYC();

    const [modalState, setModalState] = useState<ModalState>('explanation');
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
                    setModalState(prev => prev === 'pending' ? 'pending' : 'pending'); // Force pending check if status is pending
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

            // Open Native Browser (SFSafariViewController / Chrome Custom Tabs)
            // This ensures camera permissions and cookies are handled correctly for liveness checks
            await WebBrowser.openBrowserAsync(result.url);

            // When browser closes, check status
            if (isMounted.current) {
                setModalState('pending');
                handleCheckStatus();
            }

        } catch (err) {
            console.error('Start verification error:', err);
            if (isMounted.current) {
                setError('Failed to start verification. Please try again.');
            }
        } finally {
            if (isMounted.current) setIsStarting(false);
        }
    };

    const handleCheckStatus = async () => {
        const newStatus = await checkStatus();
        if (newStatus === 'approved') {
            setModalState('approved');
            Analytics.kycApproved?.();
            onVerified?.();
        } else if (newStatus === 'pending') {
            setModalState('pending');
        } else if (newStatus === 'rejected') {
            setModalState('rejected');
        }
    };

    const handleClose = () => {
        onClose();
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

            <Button
                title="Start Verification"
                onPress={handleStartVerification}
                loading={isStarting}
                size="large"
                style={{ marginBottom: 12 }}
                icon={<ArrowRight size={20} color="#fff" weight="bold" />}
                iconPosition="right"
            />

            <Button
                title="Do this later"
                onPress={onClose}
                variant="ghost"
                size="medium"
            />
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

            <Button
                title="Check Status"
                onPress={handleCheckStatus}
                size="large"
                style={{ marginBottom: 12 }}
            />

            <Button
                title={isStarting ? 'Starting...' : 'Restart Verification'}
                onPress={handleStartVerification}
                disabled={isStarting}
                variant="ghost"
                size="medium"
                textStyle={{ color: Colors.primary }}
            />

            <Button
                title="Close"
                onPress={onClose}
                variant="ghost"
                size="medium"
            />
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

            <Button
                title="Continue"
                onPress={() => {
                    onVerified?.();
                    onClose();
                }}
                size="large"
                style={{ backgroundColor: Colors.success }}
            />
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

            <Button
                title="Try Again"
                onPress={handleStartVerification}
                loading={isStarting}
                size="large"
                style={{ marginBottom: 12 }}
            />

            <Button
                title="Close"
                onPress={onClose}
                variant="ghost"
                size="medium"
            />
        </View>
    );

    const renderContent = () => {
        switch (modalState) {
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
                    onPress={handleClose}
                />
                <Animated.View
                    style={[
                        styles.modalContainer,
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
    errorText: {
        fontFamily: 'GoogleSansFlex_400Regular',
        color: '#ff4444',
        marginBottom: 16,
        textAlign: 'center',
    },
});

export default KYCVerificationModal;
