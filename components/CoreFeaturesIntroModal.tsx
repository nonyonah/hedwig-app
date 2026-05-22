import React, { useEffect } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import {
    default as Animated,
    Easing,
    FadeIn,
    FadeInDown,
    FadeOut,
    FadeOutDown,
    SlideInRight,
    SlideOutLeft,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemeColors } from '../theme/colors';
import {
    ArrowRight,
    Landmark,
    Wallet,
    X,
} from './ui/AppIcon';

const INTRO_STEPS = [
    {
        title: 'Receive stablecoins',
        description: 'Get paid in USDC from clients, friends, or anywhere. Just share your wallet address or QR code.',
        label: 'Receive',
        Icon: Wallet,
        color: '#2563EB',
        bg: '#EFF4FF',
    },
    {
        title: 'Send to bank account',
        description: 'Cash out your stablecoins directly to your bank account whenever you need them.',
        label: 'Bank',
        Icon: Landmark,
        color: '#7C3AED',
        bg: '#F4F3FF',
    },
    {
        title: 'Your wallet, your control',
        description: 'Track every transaction, manage your tokens, and always know your balance — all in one place.',
        label: 'Wallet',
        Icon: ArrowRight,
        color: '#067647',
        bg: '#ECFDF3',
    },
];

type CoreFeaturesIntroModalProps = {
    visible: boolean;
    activeStep: number;
    onStepChange: (step: number) => void;
    onDismiss: () => void;
    onStart: () => void;
};

export default function CoreFeaturesIntroModal({
    visible,
    activeStep,
    onStepChange,
    onDismiss,
    onStart,
}: CoreFeaturesIntroModalProps) {
    const insets = useSafeAreaInsets();
    const themeColors = useThemeColors();
    const step = INTRO_STEPS[activeStep] ?? INTRO_STEPS[0];
    const isLast = activeStep >= INTRO_STEPS.length - 1;
    const StepIcon = step.Icon;
    const floatProgress = useSharedValue(0);

    useEffect(() => {
        floatProgress.value = withRepeat(
            withTiming(1, {
                duration: 2400,
                easing: Easing.inOut(Easing.quad),
            }),
            -1,
            true
        );
    }, [floatProgress]);

    const floatingCardStyle = useAnimatedStyle(() => ({
        transform: [
            { translateY: -5 * floatProgress.value },
            { scale: 1 + (0.012 * floatProgress.value) },
        ],
    }));

    const floatingGlowStyle = useAnimatedStyle(() => ({
        opacity: 0.64 + (0.18 * floatProgress.value),
        transform: [
            { translateX: -72 + (10 * floatProgress.value) },
            { translateY: -80 + (6 * floatProgress.value) },
            { scale: 1 + (0.04 * floatProgress.value) },
        ],
    }));

    const goNext = () => {
        if (isLast) {
            onStart();
            return;
        }
        onStepChange(activeStep + 1);
    };

    return (
        <Modal transparent visible={visible} animationType="none" statusBarTranslucent>
            <Animated.View
                entering={FadeIn.duration(180)}
                exiting={FadeOut.duration(140)}
                style={styles.overlay}
            >
                <BlurView intensity={Platform.OS === 'ios' ? 18 : 10} tint="dark" style={StyleSheet.absoluteFill} />
                <View style={[styles.center, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
                    <Animated.View
                        entering={FadeInDown.duration(240).easing(Easing.out(Easing.cubic))}
                        exiting={FadeOutDown.duration(160).easing(Easing.in(Easing.cubic))}
                        style={[styles.card, { backgroundColor: themeColors.cardBackground, borderColor: themeColors.border }]}
                    >
                        <Pressable
                            onPress={onDismiss}
                            accessibilityRole="button"
                            accessibilityLabel="Close intro"
                            hitSlop={10}
                            style={[styles.closeButton, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}
                        >
                            <X size={14} color={themeColors.textSecondary} strokeWidth={3} />
                        </Pressable>

                        <Animated.View
                            key={`preview-${step.title}`}
                            entering={SlideInRight.duration(240).easing(Easing.out(Easing.cubic))}
                            exiting={SlideOutLeft.duration(160).easing(Easing.in(Easing.cubic))}
                        >
                            <View style={[styles.preview, { backgroundColor: themeColors.surface }]}>
                                <Animated.View style={[styles.previewGlow, { backgroundColor: step.bg }, floatingGlowStyle]} />
                                <Animated.View style={floatingCardStyle}>
                                    <View style={[styles.previewCard, { backgroundColor: themeColors.cardBackground, borderColor: themeColors.border }]}>
                                        <View style={styles.previewTopRow}>
                                            <View style={[styles.pill, { backgroundColor: step.bg }]}>
                                                <StepIcon size={15} color={step.color} strokeWidth={2.6} />
                                                <Text style={[styles.pillText, { color: step.color }]}>{step.label}</Text>
                                            </View>
                                            <View style={[styles.liveDot, { backgroundColor: step.color }]} />
                                        </View>

                                        <View style={styles.skeletonGroup}>
                                            <View style={[styles.skeletonStrong, { backgroundColor: themeColors.textPrimary }]} />
                                            <View style={[styles.skeletonLine, { backgroundColor: themeColors.border }]} />
                                            <View style={[styles.skeletonLineShort, { backgroundColor: themeColors.border }]} />
                                        </View>

                                        <View style={styles.miniStats}>
                                            <View style={[styles.miniStat, { backgroundColor: themeColors.surface }]}>
                                                <View style={[styles.miniLabel, { backgroundColor: themeColors.textSecondary }]} />
                                                <View style={[styles.miniValue, { backgroundColor: themeColors.textPrimary }]} />
                                            </View>
                                            <View style={[styles.miniStat, { backgroundColor: step.bg }]}>
                                                <View style={[styles.miniLabel, { backgroundColor: step.color, opacity: 0.35 }]} />
                                                <View style={[styles.miniValueAccent, { backgroundColor: step.color }]} />
                                            </View>
                                        </View>
                                    </View>
                                </Animated.View>
                            </View>
                        </Animated.View>

                        <Animated.View
                            key={`copy-${step.title}`}
                            entering={SlideInRight.duration(220).delay(35).easing(Easing.out(Easing.cubic))}
                            exiting={SlideOutLeft.duration(140).easing(Easing.in(Easing.cubic))}
                            style={styles.copy}
                        >
                            <Text style={[styles.title, { color: themeColors.textPrimary }]}>{step.title}</Text>
                            <Text style={[styles.description, { color: themeColors.textSecondary }]}>{step.description}</Text>
                        </Animated.View>

                        <View style={styles.dots}>
                            {INTRO_STEPS.map((item, index) => (
                                <Pressable
                                    key={item.title}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Go to intro step ${index + 1}`}
                                    onPress={() => onStepChange(index)}
                                    style={[
                                        styles.dot,
                                        {
                                            width: index === activeStep ? 24 : 9,
                                            backgroundColor: index === activeStep ? themeColors.textSecondary : themeColors.border,
                                        },
                                    ]}
                                />
                            ))}
                        </View>

                        <Pressable
                            onPress={goNext}
                            accessibilityRole="button"
                            accessibilityLabel={isLast ? 'Continue' : 'Next intro step'}
                        >
                            <Text style={styles.primaryText}>{isLast ? 'Continue' : 'Next'}</Text>
                            {isLast ? <ArrowRight size={17} color="#FFFFFF" strokeWidth={3} /> : null}
                        </Pressable>
                    </Animated.View>
                </View>
            </Animated.View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(24,29,39,0.32)',
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        paddingHorizontal: 18,
    },
    card: {
        overflow: 'hidden',
        borderRadius: 28,
        borderWidth: StyleSheet.hairlineWidth,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 18 },
        shadowOpacity: 0.24,
        shadowRadius: 40,
        elevation: 18,
    },
    closeButton: {
        position: 'absolute',
        right: 16,
        top: 16,
        zIndex: 5,
        width: 34,
        height: 34,
        borderRadius: 17,
        borderWidth: StyleSheet.hairlineWidth,
        alignItems: 'center',
        justifyContent: 'center',
    },
    preview: {
        height: 238,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    previewGlow: {
        position: 'absolute',
        width: 280,
        height: 280,
        borderRadius: 140,
        opacity: 0.8,
        transform: [{ translateX: -72 }, { translateY: -80 }],
    },
    previewCard: {
        width: 260,
        borderRadius: 22,
        borderWidth: StyleSheet.hairlineWidth,
        padding: 18,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.14,
        shadowRadius: 28,
        elevation: 8,
    },
    previewTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 18,
    },
    pill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        borderRadius: 999,
        paddingHorizontal: 11,
        paddingVertical: 6,
    },
    pillText: {
        fontFamily: 'GoogleSansFlex_700Bold',
        fontSize: 12,
    },
    liveDot: {
        width: 9,
        height: 9,
        borderRadius: 5,
    },
    skeletonGroup: {
        gap: 9,
    },
    skeletonStrong: {
        width: 136,
        height: 10,
        borderRadius: 999,
    },
    skeletonLine: {
        width: 196,
        height: 8,
        borderRadius: 999,
    },
    skeletonLineShort: {
        width: 154,
        height: 8,
        borderRadius: 999,
    },
    miniStats: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 22,
    },
    miniStat: {
        flex: 1,
        borderRadius: 14,
        padding: 12,
        gap: 8,
    },
    miniLabel: {
        width: 42,
        height: 7,
        borderRadius: 999,
        opacity: 0.45,
    },
    miniValue: {
        width: 58,
        height: 15,
        borderRadius: 999,
    },
    miniValueAccent: {
        width: 54,
        height: 15,
        borderRadius: 999,
    },
    copy: {
        alignItems: 'center',
        paddingHorizontal: 28,
        paddingTop: 28,
    },
    title: {
        fontFamily: 'GoogleSansFlex_700Bold',
        fontSize: 23,
        textAlign: 'center',
        letterSpacing: -0.4,
    },
    description: {
        marginTop: 9,
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 15,
        lineHeight: 22,
        textAlign: 'center',
    },
    dots: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginTop: 24,
    },
    dot: {
        height: 9,
        borderRadius: 999,
    },
    primaryButton: {
        margin: 24,
        height: 48,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 8,
    },
    primaryText: {
        color: '#FFFFFF',
        fontFamily: 'GoogleSansFlex_700Bold',
        fontSize: 15,
    },
});
