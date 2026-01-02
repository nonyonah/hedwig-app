import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, Platform, Alert, KeyboardAvoidingView } from 'react-native';
import { X, PaperPlaneTilt, Bug, Lightbulb } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import { Colors, useThemeColors } from '../theme/colors';
import { useSettings } from '../context/SettingsContext';
import { trackEvent } from '../services/analytics';

type FeedbackType = 'feature' | 'bug' | null;

interface FeedbackModalProps {
    visible: boolean;
    onClose: () => void;
}

export function FeedbackModal({ visible, onClose }: FeedbackModalProps) {
    const themeColors = useThemeColors();
    const { hapticsEnabled } = useSettings();
    const [feedbackType, setFeedbackType] = useState<FeedbackType>(null);
    const [feedback, setFeedback] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async () => {
        if (!feedback.trim()) {
            Alert.alert('Description Required', 'Please describe your feedback.');
            return;
        }

        if (!feedbackType) {
            Alert.alert('Type Required', 'Please select if this is a feature request or bug report.');
            return;
        }

        if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setIsSubmitting(true);

        try {
            // Track feedback as PostHog event
            await trackEvent('feedback_submitted', {
                type: feedbackType,
                feedback: feedback.trim(),
                feedback_length: feedback.trim().length,
            });

            // Reset and close
            setFeedbackType(null);
            setFeedback('');
            onClose();

            Alert.alert(
                'Thank You!',
                feedbackType === 'feature'
                    ? 'Your feature request has been submitted.'
                    : 'Your bug report has been submitted. We\'ll look into it.'
            );
        } catch (error) {
            console.error('Feedback submission error:', error);
            Alert.alert('Error', 'Failed to submit feedback. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleClose = () => {
        if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setFeedbackType(null);
        setFeedback('');
        onClose();
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={handleClose}
        >
            <KeyboardAvoidingView
                style={styles.overlay}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <TouchableOpacity
                    style={StyleSheet.absoluteFill}
                    activeOpacity={1}
                    onPress={handleClose}
                />
                <View style={[styles.modalContainer, { backgroundColor: themeColors.surface }]}>
                    {/* Handle Bar */}
                    <View style={styles.handleBar} />

                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={[styles.title, { color: themeColors.textPrimary }]}>
                            Give Feedback
                        </Text>
                        <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                            <X size={24} color={themeColors.textSecondary} weight="bold" />
                        </TouchableOpacity>
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
                                weight="fill"
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
                                weight="fill"
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
                            isSubmitting && { opacity: 0.7 }
                        ]}
                        onPress={handleSubmit}
                        disabled={isSubmitting}
                    >
                        <PaperPlaneTilt size={20} color="#FFFFFF" weight="bold" />
                        <Text style={styles.submitButtonText}>
                            {isSubmitting ? 'Sending...' : 'Submit Feedback'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    modalContainer: {
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 24,
        paddingBottom: 40,
    },
    handleBar: {
        width: 40,
        height: 4,
        backgroundColor: '#D1D5DB',
        borderRadius: 2,
        alignSelf: 'center',
        marginBottom: 16,
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
        padding: 4,
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
});
