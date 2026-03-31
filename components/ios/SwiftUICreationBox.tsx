import { useThemeColors } from '../../theme/colors';
import React, { useRef, useEffect } from 'react';
import { Platform, View, StyleSheet, TextInput, TouchableOpacity, Text } from 'react-native';
import { TrueSheet } from '@hedwig/true-sheet';
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
    const themeColors = useThemeColors();
    const sheetRef = useRef<TrueSheet>(null);

    useEffect(() => {
        if (visible) {
            sheetRef.current?.present();
        } else {
            sheetRef.current?.dismiss();
        }
    }, [visible]);

    if (Platform.OS !== 'ios') return null;

    const handleDateTapWithHaptics = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onDateTap();
    };

    const handleCreateWithHaptics = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onCreate();
    };

    return (
        <TrueSheet
            ref={sheetRef}
            detents={['auto']}
            cornerRadius={50}
            backgroundBlur="regular"
            grabber={true}
            keyboardMode="pan"
            onDidDismiss={onClose}
        >
            <View style={styles.content}>
                <TextInput
                    value={inputText}
                    onChangeText={onInputChange}
                    placeholder="e.g., Invoice for Acme $500 due Friday"
                    placeholderTextColor="#8E8E93"
                    multiline
                    autoFocus
                    style={[
                        styles.textInput,
                        { color: themeColors.textPrimary }
                    ]}
                />

                <View style={styles.pillsRow}>
                    <TouchableOpacity
                        style={[styles.pill, effectiveDate && styles.pillActive]}
                        onPress={handleDateTapWithHaptics}
                    >
                        <Text style={[styles.pillText, effectiveDate && styles.pillTextActive]}>
                            📅 {formatDateDisplay(effectiveDate)}
                        </Text>
                    </TouchableOpacity>
                </View>

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

                {isLoading && (
                    <Text style={styles.loadingText}>Analyzing...</Text>
                )}
            </View>
        </TrueSheet>
    );
}

const styles = StyleSheet.create({
    content: {
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 20,
        gap: 16,
    },
    textInput: {
        minHeight: 44,
        fontSize: 19,
        fontWeight: '500',
        backgroundColor: 'rgba(120,120,128,0.12)',
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
