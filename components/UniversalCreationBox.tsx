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
} from 'react-native';
import { useThemeColors } from '../theme/colors';
import { CalendarBlank, Flag, Signpost, DotsThree, PaperPlaneRight, MagicWand, Check } from 'phosphor-react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../hooks/useAuth';

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
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [isCreating, setIsCreating] = useState(false);

    // Animations
    const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;

    // Input ref
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

            // Animate In
            Animated.parallel([
                Animated.timing(slideAnim, {
                    toValue: 0,
                    duration: 300,
                    useNativeDriver: true,
                }),
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 300,
                    useNativeDriver: true,
                })
            ]).start(() => {
                inputRef.current?.focus();
            });
        } else {
            Keyboard.dismiss();
            Animated.parallel([
                Animated.timing(slideAnim, {
                    toValue: SCREEN_HEIGHT,
                    duration: 250,
                    useNativeDriver: true,
                }),
                Animated.timing(fadeAnim, {
                    toValue: 0,
                    duration: 250,
                    useNativeDriver: true,
                })
            ]).start();
        }
    }, [visible]);

    // Parse input with debounce
    const parseInput = useCallback(async (text: string) => {
        if (text.length < 5) {
            setParsedData(null);
            return;
        }

        setIsLoading(true);
        try {
            const token = await getAccessToken();
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

            const response = await fetch(`${apiUrl}/api/creation-box/parse`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ text }),
            });

            const result = await response.json();
            if (result.success && result.data) {
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
            console.error('Parse error:', error);
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
        }, 800); // 800ms debounce
    };

    // Cycle through priorities
    const cyclePriority = () => {
        const priorities: ('low' | 'medium' | 'high')[] = ['low', 'medium', 'high'];
        const currentIndex = effectivePriority ? priorities.indexOf(effectivePriority) : -1;
        const nextIndex = (currentIndex + 1) % priorities.length;
        setSelectedPriority(priorities[nextIndex]);
    };

    // Handle date selection - simple increment for now
    const handleDateTap = () => {
        // For simplicity, cycle through: Today, Tomorrow, Next Week, +2 weeks
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (!effectiveDate) {
            // Set to tomorrow
            const tomorrow = new Date(today);
            tomorrow.setDate(today.getDate() + 1);
            setSelectedDate(tomorrow);
        } else {
            const daysDiff = Math.floor((effectiveDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

            if (daysDiff <= 1) {
                // Go to next week
                const nextWeek = new Date(today);
                nextWeek.setDate(today.getDate() + 7);
                setSelectedDate(nextWeek);
            } else if (daysDiff <= 7) {
                // Go to 2 weeks
                const twoWeeks = new Date(today);
                twoWeeks.setDate(today.getDate() + 14);
                setSelectedDate(twoWeeks);
            } else {
                // Reset to no date
                setSelectedDate(null);
            }
        }
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

        // Validate date requirement for invoice/payment_link
        if ((detectedIntent === 'invoice' || detectedIntent === 'payment_link') && !effectiveDate) {
            // Auto-set to 7 days from now as default
            const defaultDate = new Date();
            defaultDate.setDate(defaultDate.getDate() + 7);
            setSelectedDate(defaultDate);
            return; // Let user see the date and tap create again
        }

        setIsCreating(true);

        try {
            const token = await getAccessToken();
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

            // Determine document type
            let documentType = 'INVOICE';
            if (detectedIntent === 'payment_link') documentType = 'PAYMENT_LINK';
            else if (detectedIntent === 'contract') documentType = 'CONTRACT';

            // Build content
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

            if (result.success && result.data) {
                onClose();

                // Navigate to the detail/edit screen
                switch (detectedIntent) {
                    case 'invoice':
                        router.push(`/invoice/${result.data.id}`);
                        break;
                    case 'payment_link':
                        router.push(`/payment-link/${result.data.id}`);
                        break;
                    case 'contract':
                        router.push(`/contracts/${result.data.id}`);
                        break;
                    default:
                        router.push(`/invoice/${result.data.id}`);
                }
            }
        } catch (error) {
            console.error('Create error:', error);
        } finally {
            setIsCreating(false);
        }
    };

    const renderIntentBadge = () => {
        if (!detectedIntent || detectedIntent === 'unknown') return null;

        let label = '';
        let color = themeColors.primary;

        switch (detectedIntent) {
            case 'invoice': label = 'Invoice'; color = '#10B981'; break;
            case 'payment_link': label = 'Payment Link'; color = '#3B82F6'; break;
            case 'contract': label = 'Contract'; color = '#8B5CF6'; break;
        }

        return (
            <View style={[styles.intentBadge, { backgroundColor: color + '20' }]}>
                <MagicWand size={14} color={color} weight="fill" />
                <Text style={[styles.intentText, { color: color }]}>{label}</Text>
            </View>
        );
    };

    // Dynamic label for third pill
    const thirdPillLabel = detectedIntent === 'contract' ? 'Milestones' : 'Reminder';

    if (!visible) return null;

    return (
        <Modal
            transparent
            visible={visible}
            onRequestClose={onClose}
            animationType="none"
        >
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
                    {/* Header with Intent Badge */}
                    <View style={styles.sheetHeader}>
                        {renderIntentBadge()}
                        {isLoading && <ActivityIndicator size="small" color={themeColors.textSecondary} />}
                    </View>

                    {/* Main Input */}
                    <View style={styles.inputContainer}>
                        <TextInput
                            ref={inputRef}
                            style={[
                                styles.mainInput,
                                { color: themeColors.textPrimary }
                            ]}
                            placeholder="e.g., Invoice for Acme $500 due Friday"
                            placeholderTextColor={themeColors.textPlaceholder}
                            multiline
                            value={inputText}
                            onChangeText={handleTextChange}
                        />
                    </View>

                    {/* Action Pills Row */}
                    <View style={styles.actionsRow}>
                        {/* Date Pill */}
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
                            <CalendarBlank size={18} color={effectiveDate ? themeColors.primary : themeColors.textSecondary} />
                            <Text style={[
                                styles.actionText,
                                { color: effectiveDate ? themeColors.primary : themeColors.textSecondary }
                            ]}>
                                {formatDateDisplay(effectiveDate)}
                            </Text>
                        </TouchableOpacity>

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
                                size={18}
                                color={effectivePriority ? PRIORITY_COLORS[effectivePriority] : themeColors.textSecondary}
                                weight={effectivePriority ? 'fill' : 'regular'}
                            />
                            <Text style={[
                                styles.actionText,
                                { color: effectivePriority ? PRIORITY_COLORS[effectivePriority] : themeColors.textSecondary }
                            ]}>
                                {effectivePriority ? PRIORITY_LABELS[effectivePriority] : 'Priority'}
                            </Text>
                        </TouchableOpacity>

                        {/* Reminders/Milestones Pill */}
                        <TouchableOpacity style={[styles.actionPill, { borderColor: themeColors.border }]}>
                            <Signpost size={18} color={themeColors.textSecondary} />
                            <Text style={[styles.actionText, { color: themeColors.textSecondary }]}>{thirdPillLabel}</Text>
                        </TouchableOpacity>

                        {/* More Pill */}
                        <TouchableOpacity style={[styles.iconOnlyPill, { borderColor: themeColors.border }]}>
                            <DotsThree size={24} color={themeColors.textSecondary} />
                        </TouchableOpacity>

                        <View style={{ flex: 1 }} />

                        {/* Create Button */}
                        <TouchableOpacity
                            style={[
                                styles.sendButton,
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
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 10,
    },
    sheetHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
        minHeight: 24,
    },
    intentBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 12,
    },
    intentText: {
        fontSize: 13,
        fontFamily: 'GoogleSansFlex_600SemiBold',
    },
    inputContainer: {
        marginBottom: 16,
    },
    mainInput: {
        fontSize: 18,
        fontFamily: 'GoogleSansFlex_500Medium',
        minHeight: 28,
        padding: 0,
    },
    actionsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingBottom: Platform.OS === 'ios' ? 0 : 8,
    },
    actionPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        borderWidth: 1,
    },
    iconOnlyPill: {
        padding: 4,
        borderRadius: 8,
        borderWidth: 1,
        width: 34,
        height: 34,
        justifyContent: 'center',
        alignItems: 'center',
    },
    actionText: {
        fontSize: 13,
        fontFamily: 'GoogleSansFlex_500Medium',
    },
    sendButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
    }
});
