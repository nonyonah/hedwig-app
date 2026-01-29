import React, { useState, useEffect, useRef, useCallback } from 'react';
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
    Keyboard,
    Dimensions,
    ActivityIndicator,
    Alert,
    LayoutAnimation
} from 'react-native';
import { useThemeColors } from '../theme/colors';
import { CalendarBlank, Flag, Signpost, DotsThree, Tray, CaretDown, Check } from 'phosphor-react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../hooks/useAuth';
import { SwiftUICreationBox } from './ios/SwiftUICreationBox';
import { MaterialCreationBox } from './android/MaterialCreationBox';

// Screen dimensions
const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Priority colors
const PRIORITY_COLORS = {
    high: '#EF4444',    // Red
    medium: '#F59E0B',  // Amber
    low: '#64748B',     // Gray
};

// Priority labels
const PRIORITY_LABELS = {
    high: 'P1',
    medium: 'P2',
    low: 'P3',
};

interface UniversalCreationBoxProps {
    visible: boolean;
    onClose: () => void;
}

interface ParsedData {
    intent: 'invoice' | 'payment_link' | 'contract' | 'unknown';
    clientName: string | null;
    amount: number | null;
    currency: string | null;
    dueDate: string | null;
    priority: 'low' | 'medium' | 'high' | null;
    title: string | null;
    confidence: number;
}

export function UniversalCreationBox({ visible, onClose }: UniversalCreationBoxProps) {
    const themeColors = useThemeColors();
    const router = useRouter();
    const { getAccessToken } = useAuth();

    // Input state
    const [inputText, setInputText] = useState('');

    // Parsed data from AI
    const [parsedData, setParsedData] = useState<ParsedData | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // Manually selected overrides
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [selectedPriority, setSelectedPriority] = useState<'low' | 'medium' | 'high' | null>(null);

    // UI state
    const [isCreating, setIsCreating] = useState(false);

    // Animations (for fallback web view)
    const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const dateShakeAnim = useRef(new Animated.Value(0)).current;

    // Input ref (for fallback web view)
    const inputRef = useRef<TextInput>(null);

    // Debounce timer
    const parseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Derived intent
    const detectedIntent = parsedData?.intent || null;

    // Effective values (manual override > AI parsed)
    const effectiveDate = selectedDate || (parsedData?.dueDate ? new Date(parsedData.dueDate) : null);
    const effectivePriority = selectedPriority || parsedData?.priority || null;

    useEffect(() => {
        if (visible) {
            // Reset state
            setInputText('');
            setParsedData(null);
            setSelectedDate(null);
            setSelectedPriority(null);
            setIsLoading(false);
            setIsCreating(false);

            // Only animate for web fallback
            if (Platform.OS === 'web') {
                Animated.parallel([
                    Animated.spring(slideAnim, {
                        toValue: 0,
                        useNativeDriver: true,
                        damping: 20,
                        stiffness: 90,
                        mass: 0.5,
                    }),
                    Animated.timing(fadeAnim, {
                        toValue: 1,
                        duration: 200,
                        useNativeDriver: true,
                    })
                ]).start(() => {
                    inputRef.current?.focus();
                });
            }
        } else {
            Keyboard.dismiss();
            if (Platform.OS === 'web') {
                Animated.parallel([
                    Animated.timing(slideAnim, {
                        toValue: SCREEN_HEIGHT,
                        duration: 250,
                        useNativeDriver: true,
                    }),
                    Animated.timing(fadeAnim, {
                        toValue: 0,
                        duration: 200,
                        useNativeDriver: true,
                    })
                ]).start();
            }
        }
    }, [visible]);

    // Parse input with debounce
    const parseInput = useCallback(async (text: string) => {
        if (text.length < 5) {
            setParsedData(null);
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            return;
        }

        setIsLoading(true);
        try {
            const token = await getAccessToken();
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

            console.log('[UniversalCreationBox] Parsing text:', text);
            const response = await fetch(`${apiUrl}/api/creation-box/parse`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ text }),
            });

            const result = await response.json();
            console.log('[UniversalCreationBox] Parse result:', result);

            if (result.success && result.data) {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setParsedData(result.data);

                // Auto-update date if AI detected one and user hasn't manually set
                if (result.data.dueDate && !selectedDate) {
                    setSelectedDate(new Date(result.data.dueDate));
                }

                // Auto-update priority if AI detected one and user hasn't manually set
                if (result.data.priority && !selectedPriority) {
                    setSelectedPriority(result.data.priority);
                }
            }
        } catch (error) {
            console.error('[UniversalCreationBox] Parse error:', error);
            Alert.alert('Error', 'Failed to parse input. Please try again.');
        } finally {
            setIsLoading(false);
        }
    }, [getAccessToken, selectedDate, selectedPriority]);

    // Handle text change with debounce
    const handleTextChange = (text: string) => {
        setInputText(text);

        if (parseTimer.current) {
            clearTimeout(parseTimer.current);
        }

        parseTimer.current = setTimeout(() => {
            parseInput(text);
        }, 800);
    };

    // Cycle through priorities
    const cyclePriority = () => {
        const priorities: ('low' | 'medium' | 'high')[] = ['low', 'medium', 'high'];
        const currentIndex = effectivePriority ? priorities.indexOf(effectivePriority) : -1;
        const nextIndex = (currentIndex + 1) % priorities.length;

        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setSelectedPriority(priorities[nextIndex]);
    };

    // Handle date selection - cycle through refined options
    const handleDateTap = () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Feedback for tap
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

        if (!effectiveDate) {
            const tomorrow = new Date(today);
            tomorrow.setDate(today.getDate() + 1);
            setSelectedDate(tomorrow);
        } else {
            const daysDiff = Math.floor((effectiveDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

            if (daysDiff <= 1) {
                const nextWeek = new Date(today);
                nextWeek.setDate(today.getDate() + 7);
                setSelectedDate(nextWeek);
            } else if (daysDiff <= 7) {
                const twoWeeks = new Date(today);
                twoWeeks.setDate(today.getDate() + 14);
                setSelectedDate(twoWeeks);
            } else {
                setSelectedDate(null);
            }
        }
    };

    // Trigger shake animation for Date pill
    const shakeDate = () => {
        Animated.sequence([
            Animated.timing(dateShakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
            Animated.timing(dateShakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
            Animated.timing(dateShakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
            Animated.timing(dateShakeAnim, { toValue: 0, duration: 50, useNativeDriver: true })
        ]).start();
    };

    // Format date for display
    const formatDateDisplay = (date: Date | null): string => {
        if (!date) return 'Date';

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dateNormalized = new Date(date);
        dateNormalized.setHours(0, 0, 0, 0);

        const daysDiff = Math.floor((dateNormalized.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        if (daysDiff === 0) return 'Today';
        if (daysDiff === 1) return 'Tomorrow';
        if (daysDiff <= 7) return date.toLocaleDateString('en-US', { weekday: 'short' });
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    // Handle create
    const handleCreate = async () => {
        if (!inputText.trim()) return;

        // Mandatory Date Check for Payment Links and Invoices
        const requiresDate = detectedIntent === 'payment_link' || detectedIntent === 'invoice' || detectedIntent === 'unknown';

        if (requiresDate && !effectiveDate) {
            shakeDate();
            Alert.alert("Date Required", "Please set a due date or expiry date for this item.");
            return;
        }

        setIsCreating(true);

        try {
            const token = await getAccessToken();
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

            let documentType = 'INVOICE';
            if (detectedIntent === 'payment_link') documentType = 'PAYMENT_LINK';
            else if (detectedIntent === 'contract') documentType = 'CONTRACT';

            const content: any = {
                title: parsedData?.title || inputText.substring(0, 50),
                clientName: parsedData?.clientName,
                amount: parsedData?.amount,
                currency: parsedData?.currency || 'USD',
                priority: effectivePriority,
            };

            if (effectiveDate) {
                content.dueDate = effectiveDate.toISOString();
            }

            console.log('[UniversalCreationBox] Creating document:', { type: documentType, content });

            const response = await fetch(`${apiUrl}/api/documents`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    type: documentType,
                    title: content.title,
                    content,
                    status: 'DRAFT',
                }),
            });

            const result = await response.json();
            console.log('[UniversalCreationBox] Create result:', result);

            if (result.success && result.data) {
                onClose();

                switch (detectedIntent) {
                    case 'invoice':
                        router.push(`/invoice/${result.data.id}`);
                        break;
                    case 'payment_link':
                        router.push(`/payment-link/${result.data.id}`);
                        break;
                    case 'contract':
                        router.push(`/contracts`);
                        break;
                    default:
                        router.push(`/invoice/${result.data.id}`);
                }
            } else {
                throw new Error(result.error?.message || 'Failed to create document');
            }
        } catch (error: any) {
            console.error('[UniversalCreationBox] Create error:', error);
            Alert.alert('Error', error?.message || 'Failed to create document. Please try again.');
        } finally {
            setIsCreating(false);
        }
    };

    // Render platform-specific implementation
    // iOS: Uses native Modal with BlurView and Haptics
    // Android: Uses Material Design bottom sheet
    // Web: Uses fallback Modal

    // iOS specific implementation
    if (Platform.OS === 'ios') {
        return (
            <SwiftUICreationBox
                visible={visible}
                onClose={onClose}
                inputText={inputText}
                onInputChange={handleTextChange}
                onCreate={handleCreate}
                isLoading={isLoading}
                isCreating={isCreating}
                effectiveDate={effectiveDate}
                effectivePriority={effectivePriority}
                onDateTap={handleDateTap}
                onPriorityTap={cyclePriority}
                formatDateDisplay={formatDateDisplay}
            />
        );
    }

    // Android specific implementation
    if (Platform.OS === 'android') {
        return (
            <MaterialCreationBox
                visible={visible}
                onClose={onClose}
                inputText={inputText}
                onInputChange={handleTextChange}
                onCreate={handleCreate}
                isLoading={isLoading}
                isCreating={isCreating}
                effectiveDate={effectiveDate}
                effectivePriority={effectivePriority}
                detectedIntent={detectedIntent}
                onDateTap={handleDateTap}
                onPriorityTap={cyclePriority}
                formatDateDisplay={formatDateDisplay}
            />
        );
    }

    // Web fallback (also used for iOS when @expo/ui not available)
    if (!visible) return null;

    return (
        <Modal
            transparent
            visible={visible}
            onRequestClose={onClose}
            animationType="none"
        >
            <KeyboardAvoidingView
                style={styles.container}
                keyboardVerticalOffset={0}
            >
                {/* Backdrop */}
                <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
                    <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
                </Animated.View>

                {/* Bottom Sheet */}
                <Animated.View
                    style={[
                        styles.sheet,
                        {
                            transform: [{ translateY: slideAnim }],
                            backgroundColor: themeColors.modalBackground
                        }
                    ]}
                >
                    {/* Input Section */}
                    <View style={styles.inputSection}>
                        <TextInput
                            ref={inputRef}
                            style={[styles.mainInput, { color: themeColors.textPrimary }]}
                            placeholder="e.g., Invoice for Acme $500 due Friday"
                            placeholderTextColor={themeColors.textPlaceholder}
                            multiline
                            value={inputText}
                            onChangeText={handleTextChange}
                        />
                    </View>

                    {/* Action Pills Row */}
                    <View style={[styles.actionsRow, { borderTopColor: themeColors.border }]}>
                        {/* Date Pill (Shakeable) */}
                        <Animated.View style={{ transform: [{ translateX: dateShakeAnim }] }}>
                            <TouchableOpacity
                                style={[
                                    styles.actionPill,
                                    {
                                        borderColor: effectiveDate ? themeColors.primary : themeColors.border,
                                        backgroundColor: effectiveDate ? themeColors.primaryLight : 'transparent',
                                    }
                                ]}
                                onPress={handleDateTap}
                            >
                                <CalendarBlank size={16} color={effectiveDate ? themeColors.primary : themeColors.textSecondary} weight="bold" />
                                <Text style={[styles.actionText, { color: effectiveDate ? themeColors.primary : themeColors.textSecondary }]}>
                                    {formatDateDisplay(effectiveDate)}
                                </Text>
                            </TouchableOpacity>
                        </Animated.View>

                        {/* Priority Pill */}
                        <TouchableOpacity
                            style={[
                                styles.actionPill,
                                {
                                    borderColor: effectivePriority ? PRIORITY_COLORS[effectivePriority] : themeColors.border,
                                    backgroundColor: effectivePriority ? PRIORITY_COLORS[effectivePriority] + '20' : 'transparent',
                                }
                            ]}
                            onPress={cyclePriority}
                        >
                            <Flag
                                size={16}
                                color={effectivePriority ? PRIORITY_COLORS[effectivePriority] : themeColors.textSecondary}
                                weight={effectivePriority ? 'fill' : 'regular'}
                            />
                            <Text style={[styles.actionText, { color: effectivePriority ? PRIORITY_COLORS[effectivePriority] : themeColors.textSecondary }]}>
                                {effectivePriority ? PRIORITY_LABELS[effectivePriority] : 'Priority'}
                            </Text>
                        </TouchableOpacity>

                        {/* Milestones Pill (Exclusive for Contracts) */}
                        {(detectedIntent === 'contract' || detectedIntent === 'unknown') && (
                            <TouchableOpacity style={[styles.actionPill, { borderColor: themeColors.border }]}>
                                <Signpost size={16} color={themeColors.textSecondary} weight="bold" />
                                <Text style={[styles.actionText, { color: themeColors.textSecondary }]}>Milestones</Text>
                            </TouchableOpacity>
                        )}

                        {/* More Pill */}
                        <TouchableOpacity style={[styles.iconOnlyPill, { borderColor: themeColors.border }]}>
                            <DotsThree size={20} color={themeColors.textSecondary} weight="bold" />
                        </TouchableOpacity>
                    </View>

                    {/* Context Selector Row */}
                    <View style={styles.contextRow}>
                        {/* Inbox Selector */}
                        <TouchableOpacity style={styles.contextSelector}>
                            <Tray size={18} color={themeColors.textSecondary} weight="bold" />
                            <Text style={[styles.contextText, { color: themeColors.textSecondary }]}>Inbox</Text>
                            <CaretDown size={14} color={themeColors.textSecondary} weight="bold" />
                        </TouchableOpacity>

                        <View style={{ flex: 1 }} />

                        {/* Loading Indicator */}
                        {isLoading && (
                            <ActivityIndicator size="small" color={themeColors.textSecondary} style={{ marginRight: 12 }} />
                        )}

                        {/* Create Button */}
                        <TouchableOpacity
                            style={[
                                styles.createButton,
                                { backgroundColor: inputText.trim() ? themeColors.primary : themeColors.surfaceHighlight }
                            ]}
                            disabled={!inputText.trim() || isCreating}
                            onPress={handleCreate}
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

                    {/* Skirt to cover keyboard gap */}
                    <View style={{
                        position: 'absolute',
                        bottom: -100,
                        left: 0,
                        right: 0,
                        height: 100,
                        backgroundColor: themeColors.modalBackground
                    }} />
                </Animated.View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.4)',
    },
    sheet: {
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        paddingTop: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 10,
    },
    inputSection: {
        paddingHorizontal: 16,
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
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderTopWidth: 1,
    },
    actionPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 6,
        borderWidth: 1,
    },
    iconOnlyPill: {
        padding: 6,
        borderRadius: 6,
        borderWidth: 1,
    },
    actionText: {
        fontSize: 13,
        fontFamily: 'GoogleSansFlex_500Medium',
    },
    contextRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 16,
    },
    contextSelector: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    contextText: {
        fontSize: 14,
        fontFamily: 'GoogleSansFlex_500Medium',
    },
    createButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
    }
});
