import React, { useEffect, useRef } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Modal,
    Animated,
    Platform,
    StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../theme/colors';
import { Metrics } from '../theme/metrics';
import type { AnchorPosition } from '../constants/tutorialSteps';

export interface TutorialCardProps {
    /** 1-based display number */
    step: number;
    totalSteps: number;
    title: string;
    body: string;
    /** Where the card is positioned relative to the screen */
    anchorPosition: AnchorPosition;
    onNext: () => void;
    onBack: () => void;
    onSkip: () => void;
}

const ANIMATION_DURATION = 220;

export function TutorialCard({
    step,
    totalSteps,
    title,
    body,
    anchorPosition,
    onNext,
    onBack,
    onSkip,
}: TutorialCardProps) {
    const themeColors = useThemeColors();
    const insets = useSafeAreaInsets();
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const translateYAnim = useRef(new Animated.Value(12)).current;

    const isFirst = step === 1;
    const isLast = step === totalSteps;

    // Mount animation: fade in + slide up
    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: ANIMATION_DURATION,
                useNativeDriver: true,
            }),
            Animated.timing(translateYAnim, {
                toValue: 0,
                duration: ANIMATION_DURATION,
                useNativeDriver: true,
            }),
        ]).start();
    }, [step]); // re-animate on step change

    const handleAction = (callback: () => void) => {
        // Animate out then call
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 0,
                duration: 160,
                useNativeDriver: true,
            }),
            Animated.timing(translateYAnim, {
                toValue: 8,
                duration: 160,
                useNativeDriver: true,
            }),
        ]).start(() => {
            fadeAnim.setValue(0);
            translateYAnim.setValue(12);
            callback();
        });
    };

    // Compute card vertical position
    const cardPositionStyle = (() => {
        switch (anchorPosition) {
            case 'top':
                return {
                    top: insets.top + 80,
                };
            case 'bottom':
                return {
                    bottom: insets.bottom + 100, // above tab bar
                };
            case 'center':
            default:
                return {
                    top: '50%' as any,
                    marginTop: -120, // offset half-card height
                };
        }
    })();

    const cardBg = themeColors.cardBackground;
    const accentColor = themeColors.primary;

    return (
        <Modal
            transparent
            visible
            animationType="none"
            statusBarTranslucent
        >
            {/* Full-screen dim — not pressable to prevent accidental dismissal */}
            <View style={styles.overlay} pointerEvents="box-none">
                {/* Card */}
                <Animated.View
                    style={[
                        styles.card,
                        cardPositionStyle,
                        {
                            backgroundColor: cardBg,
                            opacity: fadeAnim,
                            transform: [{ translateY: translateYAnim }],
                            // Elevation / shadow
                            shadowColor: '#000',
                            elevation: 14,
                        },
                    ]}
                >
                    {/* Brand accent bar at top */}
                    <View style={[styles.accentBar, { backgroundColor: accentColor }]} />

                    {/* Step indicator + Skip row */}
                    <View style={styles.topRow}>
                        <Text style={[styles.stepIndicator, { color: themeColors.textTertiary }]}>
                            {step} of {totalSteps}
                        </Text>
                        {/* Skip — 44pt touch target */}
                        <TouchableOpacity
                            onPress={() => handleAction(onSkip)}
                            hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
                            accessibilityLabel="Skip tutorial"
                            style={styles.skipButton}
                        >
                            <Text style={[styles.skipText, { color: themeColors.textSecondary }]}>
                                Skip
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {/* Title */}
                    <Text style={[styles.title, { color: themeColors.textPrimary }]}>
                        {title}
                    </Text>

                    {/* Body */}
                    <Text style={[styles.body, { color: themeColors.textSecondary }]}>
                        {body}
                    </Text>

                    {/* Navigation row */}
                    <View style={styles.navRow}>
                        {/* Back */}
                        <TouchableOpacity
                            onPress={() => handleAction(onBack)}
                            disabled={isFirst}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            style={[styles.backButton, { borderColor: themeColors.border }]}
                            accessibilityLabel="Previous step"
                        >
                            <Text
                                style={[
                                    styles.backText,
                                    { color: themeColors.textSecondary, opacity: isFirst ? 0.3 : 1 },
                                ]}
                            >
                                Back
                            </Text>
                        </TouchableOpacity>

                        {/* Next / Finish */}
                        <TouchableOpacity
                            onPress={() => handleAction(onNext)}
                            style={[styles.nextButton, { backgroundColor: accentColor }]}
                            activeOpacity={0.85}
                            accessibilityLabel={isLast ? 'Finish tutorial' : 'Next step'}
                        >
                            <Text style={styles.nextText}>
                                {isLast ? 'Done' : 'Next'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </Animated.View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.52)',
    },
    card: {
        position: 'absolute',
        left: 20,
        right: 20,
        borderRadius: 20,
        overflow: 'hidden',
        // iOS shadow
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.24,
        shadowRadius: 20,
    },
    accentBar: {
        height: 3,
        width: '100%',
    },
    topRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 4,
    },
    stepIndicator: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 12,
        letterSpacing: 0.3,
    },
    skipButton: {
        minWidth: 44,
        minHeight: 44,
        justifyContent: 'center',
        alignItems: 'flex-end',
    },
    skipText: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 14,
    },
    title: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 18,
        lineHeight: 24,
        paddingHorizontal: 20,
        marginTop: 4,
        marginBottom: 8,
    },
    body: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 15,
        lineHeight: 22,
        paddingHorizontal: 20,
        marginBottom: 24,
    },
    navRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingBottom: 20,
    },
    backButton: {
        minWidth: 72,
        minHeight: 44,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: Metrics.borderRadius.full,
        borderWidth: 1,
        paddingHorizontal: 20,
    },
    backText: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 15,
    },
    nextButton: {
        minHeight: 44,
        paddingHorizontal: 28,
        borderRadius: Metrics.borderRadius.full,
        justifyContent: 'center',
        alignItems: 'center',
    },
    nextText: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 15,
        color: '#FFFFFF',
    },
});
