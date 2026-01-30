import React, { useRef, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TextInput,
    TouchableOpacity,
    Animated,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
    TouchableWithoutFeedback,
    Keyboard,
} from 'react-native';
import { useThemeColors } from '../../theme/colors';
import { CalendarBlank, Flag, Signpost, DotsThree, Tray, CaretDown, Check } from 'phosphor-react-native';

interface MaterialCreationBoxProps {
    visible: boolean;
    onClose: () => void;
    inputText: string;
    onInputChange: (text: string) => void;
    onCreate: () => void;
    isLoading: boolean;
    isCreating: boolean;
    effectiveDate: Date | null;
    effectivePriority: 'low' | 'medium' | 'high' | null;
    detectedIntent: string | null;
    onDateTap: () => void;
    onPriorityTap: () => void;
    formatDateDisplay: (date: Date | null) => string;
}

// Priority colors
const PRIORITY_COLORS = {
    high: '#EF4444',
    medium: '#F59E0B',
    low: '#64748B',
};

const PRIORITY_LABELS = {
    high: 'P1',
    medium: 'P2',
    low: 'P3',
};

/**
 * Android-specific Universal Creation Box using Material Design 3
 * Features:
 * - Material Design bottom sheet
 * - Elevation and shadow animations
 * - Ripple effects
 * - Material transitions
 */
export function MaterialCreationBox({
    visible,
    onClose,
    inputText,
    onInputChange,
    onCreate,
    isLoading,
    isCreating,
    effectiveDate,
    effectivePriority,
    detectedIntent,
    onDateTap,
    onPriorityTap,
    formatDateDisplay,
}: MaterialCreationBoxProps) {
    const themeColors = useThemeColors();
    const slideAnim = useRef(new Animated.Value(0)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const elevationAnim = useRef(new Animated.Value(0)).current;

    if (Platform.OS !== 'android') return null;

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.spring(slideAnim, {
                    toValue: 1,
                    useNativeDriver: true,
                    damping: 20,
                    stiffness: 100,
                }),
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 200,
                    useNativeDriver: true,
                }),
                Animated.timing(elevationAnim, {
                    toValue: 1,
                    duration: 300,
                    useNativeDriver: false,
                }),
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(slideAnim, {
                    toValue: 0,
                    duration: 250,
                    useNativeDriver: true,
                }),
                Animated.timing(fadeAnim, {
                    toValue: 0,
                    duration: 200,
                    useNativeDriver: true,
                }),
                Animated.timing(elevationAnim, {
                    toValue: 0,
                    duration: 200,
                    useNativeDriver: false,
                }),
            ]).start();
        }
    }, [visible]);

    const animatedElevation = elevationAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 24],
    });

    return (
        <Modal
            transparent
            visible={visible}
            onRequestClose={onClose}
            animationType="none"
            statusBarTranslucent
        >
            <TouchableWithoutFeedback onPress={onClose}>
                <View style={styles.overlay}>
                    <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]} />
                </View>
            </TouchableWithoutFeedback>

            <KeyboardAvoidingView
                behavior="padding"
                style={styles.container}
                keyboardVerticalOffset={0}
            >
                <TouchableWithoutFeedback>
                    <Animated.View
                        style={[
                            styles.sheet,
                            {
                                backgroundColor: themeColors.modalBackground,
                                transform: [
                                    {
                                        translateY: slideAnim.interpolate({
                                            inputRange: [0, 1],
                                            outputRange: [600, 0],
                                        }),
                                    },
                                ],
                                elevation: animatedElevation,
                            },
                        ]}
                    >
                        {/* Material Design 3 Handle */}
                        <View style={styles.handleBar}>
                            <View style={[styles.handle, { backgroundColor: themeColors.border }]} />
                        </View>

                        {/* Input Section */}
                        <View style={styles.inputSection}>
                            <TextInput
                                style={[styles.mainInput, { color: themeColors.textPrimary }]}
                                placeholder="e.g., Invoice for Acme $500 due Friday"
                                placeholderTextColor={themeColors.textPlaceholder}
                                multiline
                                value={inputText}
                                onChangeText={onInputChange}
                                autoFocus
                            />
                        </View>

                        {/* Action Pills Row - Material Design */}
                        <View style={[styles.actionsRow, { borderTopColor: themeColors.border }]}>
                            {/* Date Pill */}
                            <TouchableOpacity
                                style={[
                                    styles.actionPill,
                                    {
                                        borderColor: effectiveDate
                                            ? themeColors.primary
                                            : themeColors.border,
                                        backgroundColor: effectiveDate
                                            ? `${themeColors.primary}20`
                                            : 'transparent',
                                    },
                                ]}
                                onPress={onDateTap}
                                android_ripple={{ color: themeColors.primary, borderless: false }}
                            >
                                <CalendarBlank
                                    size={16}
                                    color={effectiveDate ? themeColors.primary : themeColors.textSecondary}
                                    weight="bold"
                                />
                                <Text
                                    style={[
                                        styles.actionText,
                                        {
                                            color: effectiveDate
                                                ? themeColors.primary
                                                : themeColors.textSecondary,
                                        },
                                    ]}
                                >
                                    {formatDateDisplay(effectiveDate)}
                                </Text>
                            </TouchableOpacity>

                        </View>

                        {/* Context Selector Row */}
                        <View style={styles.contextRow}>
                            {/* Inbox Selector */}
                            <TouchableOpacity
                                style={styles.contextSelector}
                                android_ripple={{ color: themeColors.border }}
                            >
                                <Tray size={18} color={themeColors.textSecondary} weight="bold" />
                                <Text style={[styles.contextText, { color: themeColors.textSecondary }]}>
                                    Inbox
                                </Text>
                                <CaretDown size={14} color={themeColors.textSecondary} weight="bold" />
                            </TouchableOpacity>

                            <View style={{ flex: 1 }} />

                            {/* Loading Indicator */}
                            {isLoading && (
                                <ActivityIndicator
                                    size="small"
                                    color={themeColors.textSecondary}
                                    style={{ marginRight: 12 }}
                                />
                            )}

                            {/* Create Button - Material FAB Style */}
                            <TouchableOpacity
                                style={[
                                    styles.createButton,
                                    {
                                        backgroundColor: inputText.trim()
                                            ? themeColors.primary
                                            : themeColors.surfaceHighlight,
                                        elevation: inputText.trim() ? 6 : 2,
                                    },
                                ]}
                                disabled={!inputText.trim() || isCreating}
                                onPress={onCreate}
                                android_ripple={{ color: '#FFFFFF50' }}
                            >
                                {isCreating ? (
                                    <ActivityIndicator size="small" color="#FFFFFF" />
                                ) : (
                                    <Check
                                        size={20}
                                        color={inputText.trim() ? '#FFFFFF' : themeColors.textPlaceholder}
                                        weight="bold"
                                    />
                                )}
                            </TouchableOpacity>
                        </View>
                    </Animated.View>
                </TouchableWithoutFeedback>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    overlay: {
        ...StyleSheet.absoluteFillObject,
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    sheet: {
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        paddingBottom: 32,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.25,
        shadowRadius: 24,
    },
    handleBar: {
        alignItems: 'center',
        paddingVertical: 12,
    },
    handle: {
        width: 32,
        height: 4,
        borderRadius: 2,
    },
    inputSection: {
        paddingHorizontal: 20,
        paddingBottom: 16,
    },
    mainInput: {
        fontSize: 17,
        fontFamily: 'GoogleSansFlex_500Medium',
        minHeight: 24,
        padding: 0,
        marginBottom: 8,
    },
    actionsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderTopWidth: 1,
        flexWrap: 'wrap',
    },
    actionPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1.5,
    },
    iconOnlyPill: {
        padding: 8,
        borderRadius: 20,
        borderWidth: 1.5,
    },
    actionText: {
        fontSize: 13,
        fontFamily: 'GoogleSansFlex_500Medium',
        fontWeight: '600',
    },
    contextRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 12,
    },
    contextSelector: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 16,
    },
    contextText: {
        fontSize: 14,
        fontFamily: 'GoogleSansFlex_500Medium',
    },
    createButton: {
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
    },
});
