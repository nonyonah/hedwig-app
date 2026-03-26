import React, { useState, useEffect, useRef, forwardRef, useCallback, useImperativeHandle } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import * as WebBrowser from 'expo-web-browser';
import { ShieldCheck, TriangleAlert as Warning, ArrowRight, CheckCircle, Timer as ClockCountdown } from './ui/AppIcon';
import { Colors, useThemeColors } from '../theme/colors';
import { useKYC } from '../hooks/useKYC';
import Analytics from '../services/analytics';
import Button from './Button';

interface KYCVerificationModalProps {
    onClose?: () => void;
    onVerified?: () => void;
}

type ModalState = 'explanation' | 'pending' | 'approved' | 'rejected';

export const KYCVerificationModal = forwardRef<TrueSheet, KYCVerificationModalProps>(({
    onClose,
    onVerified
}, ref) => {
    const themeColors = useThemeColors();
    const { status, startKYC, checkStatus } = useKYC();

    const [modalState, setModalState] = useState<ModalState>('explanation');
    const [isStarting, setIsStarting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const isMounted = useRef(true);
    const isOpenRef = useRef(false);
    const trueSheetRef = useRef<TrueSheet>(null);

    useEffect(() => {
        return () => {
            isMounted.current = false;
        };
    }, []);

    const syncModalStateFromStatus = useCallback(() => {
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
    }, [status]);

    const presentSheet = useCallback(async () => {
        syncModalStateFromStatus();
        isOpenRef.current = true;
        await trueSheetRef.current?.present().catch(() => {});
    }, [syncModalStateFromStatus]);

    const dismissSheet = useCallback(async () => {
        isOpenRef.current = false;
        await trueSheetRef.current?.dismiss().catch(() => {});
    }, []);

    useImperativeHandle(
        ref,
        () =>
            ({
                present: async () => {
                    await presentSheet();
                },
                dismiss: async () => {
                    await dismissSheet();
                },
            } as unknown as TrueSheet),
        [presentSheet, dismissSheet]
    );

    useEffect(() => {
        if (isOpenRef.current) {
            syncModalStateFromStatus();
        }
    }, [status, syncModalStateFromStatus]);

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

    const handleClose = async () => {
        await dismissSheet();
        onClose?.();
    };

    const renderExplanation = () => (
        <View style={[styles.contentCard, { backgroundColor: themeColors.surface }]}>
            <View style={styles.iconContainer}>
                <ShieldCheck size={64} color="white" fill={Colors.primary} />
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
                icon={<ArrowRight size={20} color="#fff" strokeWidth={3} />}
                iconPosition="right"
            />

            <Button
                title="Do this later"
                onPress={handleClose}
                variant="ghost"
                size="medium"
            />
        </View>
    );

    const renderPending = () => (
        <View style={[styles.contentCard, { backgroundColor: themeColors.surface }]}>
            <View style={styles.iconContainer}>
                <ClockCountdown size={64} color="white" fill={Colors.warning} />
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
                onPress={handleClose}
                variant="ghost"
                size="medium"
            />
        </View>
    );

    const renderApproved = () => (
        <View style={[styles.contentCard, { backgroundColor: themeColors.surface }]}>
            <View style={styles.iconContainer}>
                <CheckCircle size={64} color="white" fill={Colors.success} />
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
                    handleClose();
                }}
                size="large"
                style={{ backgroundColor: Colors.success }}
            />
        </View>
    );

    const renderRejected = () => (
        <View style={[styles.contentCard, { backgroundColor: themeColors.surface }]}>
            <View style={styles.iconContainer}>
                <Warning size={64} color="white" fill={Colors.error} />
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
                onPress={handleClose}
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
        <TrueSheet
            ref={trueSheetRef}
            detents={['auto']}
            cornerRadius={Platform.OS === 'ios' ? 50 : 24}
            backgroundColor={themeColors.surface}
            onDidPresent={syncModalStateFromStatus}
            onDidDismiss={() => {
                isOpenRef.current = false;
            }}
        >
            <View style={{ paddingTop: Platform.OS === 'ios' ? 12 : 0, paddingBottom: 40 }}>
                {renderContent()}
            </View>
        </TrueSheet>
    );
});

const styles = StyleSheet.create({
    // Removed overlay and backdrop styles
    // modalContainer removed in favor of BottomSheetView style
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
