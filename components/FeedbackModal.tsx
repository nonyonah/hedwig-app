import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, Platform, Alert, KeyboardAvoidingView } from 'react-native';
import { BlurView } from 'expo-blur';
import { X, PaperPlaneTilt, Star } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import { Colors, useThemeColors } from '../theme/colors';
import { useSettings } from '../context/SettingsContext';
import Analytics from '../services/analytics';

interface FeedbackModalProps {
    visible: boolean;
    onClose: () => void;
}

export function FeedbackModal({ visible, onClose }: FeedbackModalProps) {
    const themeColors = useThemeColors();
    const { hapticsEnabled } = useSettings();
    const [rating, setRating] = useState<number>(0);
    const [feedback, setFeedback] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async () => {
        if (!feedback.trim() && rating === 0) {
            Alert.alert('Feedback Required', 'Please provide a rating or write some feedback.');
            return;
        }

        if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setIsSubmitting(true);

        try {
            // Track feedback as PostHog event
            Analytics.trackEvent('feedback_submitted', {
                rating,
                feedback: feedback.trim(),
                feedback_length: feedback.trim().length,
            });

            // Reset and close
            setRating(0);
            setFeedback('');
            onClose();

            Alert.alert('Thank You!', 'Your feedback helps us improve Hedwig.');
        } catch (error) {
            console.error('Feedback submission error:', error);
            Alert.alert('Error', 'Failed to submit feedback. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleClose = () => {
        if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setRating(0);
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

                    {/* Rating */}
                    <Text style={[styles.label, { color: themeColors.textSecondary }]}>
                        How's your experience?
                    </Text>
                    <View style={styles.ratingContainer}>
                        {[1, 2, 3, 4, 5].map((star) => (
                            <TouchableOpacity
                                key={star}
                                onPress={() => {
                                    if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                    setRating(star);
                                }}
                            >
                                <Star
                                    size={36}
                                    color={star <= rating ? '#FFB800' : themeColors.border}
                                    weight={star <= rating ? 'fill' : 'regular'}
                                />
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* Feedback Input */}
                    <Text style={[styles.label, { color: themeColors.textSecondary, marginTop: 16 }]}>
                        Tell us more (optional)
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
                        placeholder="What can we improve?"
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
    ratingContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 12,
    },
    textInput: {
        borderRadius: 12,
        padding: 16,
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 16,
        minHeight: 100,
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
