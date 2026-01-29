import React from 'react';
import { Platform, View, StyleSheet, TextInput, TouchableOpacity, Text } from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';

interface SwiftUICreationBoxProps {
    visible: boolean;
    onClose: () => void;
    inputText: string;
    onInputChange: (text: string) => void;
    onCreate: () => void;
    isLoading: boolean;
    isCreating: boolean;
    effectiveDate: Date | null;
    effectivePriority: 'low' | 'medium' | 'high' | null;
    onDateTap: () => void;
    onPriorityTap: () => void;
    formatDateDisplay: (date: Date | null) => string;
}

/**
 * iOS-specific Universal Creation Box
 * Uses React Native components with iOS styling for SDK 54 compatibility.
 * Features:
 * - Blur background effect
 * - Haptic feedback
 * - iOS-native styling
 */
export function SwiftUICreationBox({
    visible,
    onClose,
    inputText,
    onInputChange,
    onCreate,
    isLoading,
    isCreating,
    effectiveDate,
    effectivePriority,
    onDateTap,
    onPriorityTap,
    formatDateDisplay,
}: SwiftUICreationBoxProps) {
    if (Platform.OS !== 'ios' || !visible) return null;

    const handleDateTapWithHaptics = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onDateTap();
    };

    const handlePriorityTapWithHaptics = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPriorityTap();
    };

    const handleCreateWithHaptics = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onCreate();
    };

    const handleClose = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onClose();
    };

    return (
        <View style={styles.overlay}>
            <TouchableOpacity style={styles.backdrop} onPress={handleClose} activeOpacity={1} />
            <View style={styles.sheetContainer}>
                <BlurView intensity={90} tint="light" style={styles.blurView}>
                    <View style={styles.content}>
                        {/* Handle bar */}
                        <View style={styles.handleBar} />

                        {/* Input Field */}
                        <TextInput
                            value={inputText}
                            onChangeText={onInputChange}
                            placeholder="e.g., Invoice for Acme $500 due Friday"
                            placeholderTextColor="#8E8E93"
                            multiline
                            autoFocus
                            style={styles.textInput}
                        />

                        {/* Action Pills Row */}
                        <View style={styles.pillsRow}>
                            {/* Date Pill */}
                            <TouchableOpacity
                                style={[styles.pill, effectiveDate && styles.pillActive]}
                                onPress={handleDateTapWithHaptics}
                            >
                                <Text style={[styles.pillText, effectiveDate && styles.pillTextActive]}>
                                    📅 {formatDateDisplay(effectiveDate)}
                                </Text>
                            </TouchableOpacity>

                            {/* Priority Pill */}
                            <TouchableOpacity
                                style={[styles.pill, effectivePriority && styles.pillActive]}
                                onPress={handlePriorityTapWithHaptics}
                            >
                                <Text style={[styles.pillText, effectivePriority && styles.pillTextActive]}>
                                    🚩 {effectivePriority
                                        ? effectivePriority === 'high'
                                            ? 'P1'
                                            : effectivePriority === 'medium'
                                                ? 'P2'
                                                : 'P3'
                                        : 'Priority'}
                                </Text>
                            </TouchableOpacity>
                        </View>

                        {/* Create Button */}
                        <TouchableOpacity
                            style={[
                                styles.createButton,
                                (!inputText.trim() || isCreating) && styles.createButtonDisabled
                            ]}
                            onPress={handleCreateWithHaptics}
                            disabled={!inputText.trim() || isCreating}
                        >
                            <Text style={styles.createButtonText}>
                                {isCreating ? 'Creating...' : '✓ Create'}
                            </Text>
                        </TouchableOpacity>

                        {/* Loading Indicator */}
                        {isLoading && (
                            <Text style={styles.loadingText}>Analyzing...</Text>
                        )}
                    </View>
                </BlurView>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    overlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1000,
        justifyContent: 'flex-end',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
    },
    sheetContainer: {
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        overflow: 'hidden',
    },
    blurView: {
        paddingTop: 12,
        paddingBottom: 40,
        paddingHorizontal: 20,
    },
    content: {
        gap: 16,
    },
    handleBar: {
        width: 36,
        height: 5,
        backgroundColor: 'rgba(0, 0, 0, 0.2)',
        borderRadius: 3,
        alignSelf: 'center',
        marginBottom: 8,
    },
    textInput: {
        minHeight: 44,
        fontSize: 17,
        color: '#000',
        backgroundColor: 'rgba(0, 0, 0, 0.05)',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    pillsRow: {
        flexDirection: 'row',
        gap: 8,
        flexWrap: 'wrap',
    },
    pill: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: 'rgba(0, 0, 0, 0.05)',
        borderWidth: 1,
        borderColor: 'rgba(0, 0, 0, 0.1)',
    },
    pillActive: {
        backgroundColor: 'rgba(0, 122, 255, 0.15)',
        borderColor: '#007AFF',
    },
    pillText: {
        fontSize: 14,
        color: '#8E8E93',
    },
    pillTextActive: {
        color: '#007AFF',
        fontWeight: '600',
    },
    createButton: {
        backgroundColor: '#007AFF',
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
    },
    createButtonDisabled: {
        backgroundColor: 'rgba(0, 122, 255, 0.5)',
    },
    createButtonText: {
        color: '#fff',
        fontSize: 17,
        fontWeight: '600',
    },
    loadingText: {
        textAlign: 'center',
        color: '#8E8E93',
        fontSize: 14,
    },
});

export default SwiftUICreationBox;
