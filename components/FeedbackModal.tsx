import React, { useState, forwardRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Platform } from 'react-native';
import { TrueSheet } from '@hedwig/true-sheet';
import { X, Send as PaperPlaneTilt, Bug, Lightbulb } from './ui/AppIcon';
import * as Haptics from 'expo-haptics';
import { Colors, useThemeColors } from '../theme/colors';
import { useSettings } from '../context/SettingsContext';
import { useAuth } from '../hooks/useAuth';
import IOSGlassIconButton from './ui/IOSGlassIconButton';

type FeedbackType = 'feature' | 'bug' | null;

interface FeedbackModalProps {
    onClose?: () => void;
}

export const FeedbackModal = forwardRef<TrueSheet, FeedbackModalProps>(({ onClose }, ref) => {
    const themeColors = useThemeColors();
    const { hapticsEnabled } = useSettings();
    const { getAccessToken } = useAuth();
    const [feedbackType, setFeedbackType] = useState<FeedbackType>(null);
    const [feedback, setFeedback] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    const handleSubmit = async () => {
        if (!feedback.trim()) {
            setSubmitError('Please enter your feedback before submitting.');
            return;
        }

        if (!feedbackType) {
            setSubmitError('Please choose Bug Report or Feature Request.');
            return;
        }

        if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setSubmitError(null);
        setIsSubmitting(true);

        try {
            const token = await getAccessToken();
            if (!token) {
                throw new Error('You need to be signed in to send feedback.');
            }

            const apiUrl = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000').replace(/\/+$/, '');
            const response = await fetch(`${apiUrl}/api/feedback`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    type: feedbackType,
                    message: feedback.trim(),
                    pageUrl: `hedwig://mobile/${Platform.OS}/feedback-modal`,
                }),
            });

            const payload = await response.json().catch(() => null);
            if (!response.ok || !payload?.success) {
                const message = String(payload?.error?.message || '').trim();
                if (response.status === 404 && message.includes('Route /api/feedback not found')) {
                    throw new Error('Backend route /api/feedback is missing. Deploy/restart the latest backend first.');
                }
                throw new Error(message || 'Unable to submit feedback right now.');
            }

            // Reset and close
            setFeedbackType(null);
            setFeedback('');

            if (typeof ref !== 'function') {
                void ref?.current?.dismiss().catch(() => {});
            }

        } catch (error) {
            console.error('Feedback submission error:', error);
            setSubmitError(error instanceof Error ? error.message : 'Unable to submit feedback right now.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleClose = () => {
        if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setFeedbackType(null);
        setFeedback('');
        setSubmitError(null);
        if (typeof ref !== 'function') {
            void ref?.current?.dismiss().catch(() => {});
        }
    };

    return (
        <TrueSheet
            ref={ref}
            detents={['auto']}
            cornerRadius={Platform.OS === 'ios' ? 50 : 24}
            backgroundBlur="regular"
            grabber={true}
            onDidDismiss={onClose}
        >
            <View style={[styles.contentContainer, { paddingBottom: 40 }]}>
                {/* Header */}
                <View style={styles.header}>
                    <Text style={[styles.title, { color: themeColors.textPrimary }]}>
                        Give Feedback
                    </Text>
                    <IOSGlassIconButton
                        onPress={handleClose}
                        systemImage="xmark"
                        circleStyle={[styles.closeButton, { backgroundColor: themeColors.surface }]}
                        icon={<X size={22} color={themeColors.textSecondary} strokeWidth={3.5} />}
                    />
                </View>

                {/* Feedback Type Selection */}
                <Text style={[styles.label, { color: themeColors.textSecondary }]}>
                    What type of feedback?
                </Text>
                <View style={styles.typeContainer}>
                    <TouchableOpacity
                        style={[
                            styles.typeButton,
                            {
                                backgroundColor: feedbackType === 'feature' ? Colors.primary : themeColors.background,
                                borderColor: feedbackType === 'feature' ? Colors.primary : themeColors.border,
                            }
                        ]}
                        onPress={() => {
                            if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setFeedbackType('feature');
                        }}
                    >
                        <Lightbulb
                            size={24}
                            color={feedbackType === 'feature' ? '#FFFFFF' : themeColors.textPrimary}
                            fill={feedbackType === 'feature' ? '#FFFFFF' : themeColors.textPrimary}
                        />
                        <Text style={[
                            styles.typeText,
                            { color: feedbackType === 'feature' ? '#FFFFFF' : themeColors.textPrimary }
                        ]}>
                            Feature Request
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[
                            styles.typeButton,
                            {
                                backgroundColor: feedbackType === 'bug' ? '#EF4444' : themeColors.background,
                                borderColor: feedbackType === 'bug' ? '#EF4444' : themeColors.border,
                            }
                        ]}
                        onPress={() => {
                            if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setFeedbackType('bug');
                        }}
                    >
                        <Bug
                            size={24}
                            color={feedbackType === 'bug' ? '#FFFFFF' : themeColors.textPrimary}
                            fill={feedbackType === 'bug' ? '#FFFFFF' : themeColors.textPrimary}
                        />
                        <Text style={[
                            styles.typeText,
                            { color: feedbackType === 'bug' ? '#FFFFFF' : themeColors.textPrimary }
                        ]}>
                            Bug Report
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* Feedback Input */}
                <Text style={[styles.label, { color: themeColors.textSecondary, marginTop: 20 }]}>
                    {feedbackType === 'feature'
                        ? 'Describe the feature you\'d like to see'
                        : feedbackType === 'bug'
                            ? 'Describe the bug and steps to reproduce'
                            : 'Describe your feedback'}
                </Text>
                <TextInput
                    style={[
                        styles.textInput,
                        {
                            backgroundColor: themeColors.background,
                            color: themeColors.textPrimary,
                            borderColor: themeColors.border,
                        }
                    ]}
                    placeholder={
                        feedbackType === 'feature'
                            ? "I'd love to see..."
                            : feedbackType === 'bug'
                                ? "When I do X, Y happens instead of Z..."
                                : "Tell us what's on your mind..."
                    }
                    placeholderTextColor={themeColors.textSecondary}
                    value={feedback}
                    onChangeText={setFeedback}
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                />

                {/* Submit Button */}
                <TouchableOpacity
                    style={[
                        styles.submitButton,
                        { backgroundColor: Colors.primary },
                        (isSubmitting || !feedbackType || !feedback.trim()) && { opacity: 0.7 }
                    ]}
                    onPress={handleSubmit}
                    disabled={isSubmitting || !feedbackType || !feedback.trim()}
                >
                    <PaperPlaneTilt size={20} color="#FFFFFF" strokeWidth={3} />
                    <Text style={styles.submitButtonText}>
                        {isSubmitting ? 'Sending...' : 'Submit Feedback'}
                    </Text>
                </TouchableOpacity>

                {submitError ? (
                    <Text style={[styles.statusText, styles.errorText]}>
                        {submitError}
                    </Text>
                ) : null}

            </View>
        </TrueSheet>
    );
});

const styles = StyleSheet.create({
    contentContainer: {
        padding: 24,
        paddingTop: Platform.OS === 'ios' ? 28 : 24,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    title: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 20,
    },
    closeButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
    },
    label: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 14,
        marginBottom: 12,
    },
    typeContainer: {
        flexDirection: 'row',
        gap: 12,
    },
    typeButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        borderRadius: 12,
        borderWidth: 1,
        gap: 8,
    },
    typeText: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 14,
    },
    textInput: {
        borderRadius: 12,
        padding: 16,
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 16,
        minHeight: 120,
        borderWidth: 1,
    },
    submitButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 30,
        paddingVertical: 16,
        marginTop: 20,
        gap: 8,
    },
    submitButtonText: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 16,
        color: '#FFFFFF',
    },
    statusText: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 13,
        marginTop: 12,
    },
    errorText: {
        color: '#EF4444',
    },
});
