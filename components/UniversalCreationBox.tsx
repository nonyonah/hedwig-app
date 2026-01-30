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
    LayoutAnimation,
    useColorScheme
} from 'react-native';
import { useThemeColors } from '../theme/colors';
import { CalendarBlank, ArrowUp } from 'phosphor-react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../hooks/useAuth';

// Screen dimensions
const { height: SCREEN_HEIGHT } = Dimensions.get('window');

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
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';
    const router = useRouter();
    const { getAccessToken } = useAuth();

    // Input state
    const [inputText, setInputText] = useState('');

    // Parsed data from AI (Gemini)
    const [parsedData, setParsedData] = useState<ParsedData | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // Manually selected date override
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);

    // UI state
    const [isCreating, setIsCreating] = useState(false);

    // Animations
    const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const dateShakeAnim = useRef(new Animated.Value(0)).current;

    // Input ref
    const inputRef = useRef<TextInput>(null);

    // Debounce timer
    const parseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Derived intent
    const detectedIntent = parsedData?.intent || null;

    // Effective date (manual override > AI parsed)
    const effectiveDate = selectedDate || (parsedData?.dueDate ? new Date(parsedData.dueDate) : null);

    useEffect(() => {
        if (visible) {
            // Reset state
            setInputText('');
            setParsedData(null);
            setSelectedDate(null);
            setIsLoading(false);
            setIsCreating(false);

            // Animate in
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
                    duration: 200,
                    useNativeDriver: true,
                })
            ]).start();
        }
    }, [visible]);

    // Parse input with Gemini (debounced)
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

            console.log('[UniversalCreationBox] Parsing with Gemini:', text);
            const response = await fetch(`${apiUrl}/api/creation-box/parse`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text,
                    currentDate: new Date().toISOString() // Send device's current date for accurate relative date parsing
                }),
            });

            const result = await response.json();
            console.log('[UniversalCreationBox] Gemini parse result:', result);

            if (result.success && result.data) {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setParsedData(result.data);

                // Auto-update date if AI detected one and user hasn't manually set
                // This is the "smart" date detection from text like "due Friday"
                if (result.data.dueDate && !selectedDate) {
                    setSelectedDate(new Date(result.data.dueDate));
                }
            }
        } catch (error) {
            console.error('[UniversalCreationBox] Gemini parse error:', error);
        } finally {
            setIsLoading(false);
        }
    }, [getAccessToken, selectedDate]);

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

    // Handle date selection - cycle through options
    const handleDateTap = () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

        if (!effectiveDate) {
            // No date -> Today
            setSelectedDate(today);
        } else {
            const daysDiff = Math.floor((effectiveDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

            if (daysDiff === 0) {
                // Today -> Tomorrow
                const tomorrow = new Date(today);
                tomorrow.setDate(today.getDate() + 1);
                setSelectedDate(tomorrow);
            } else if (daysDiff === 1) {
                // Tomorrow -> Next Week
                const nextWeek = new Date(today);
                nextWeek.setDate(today.getDate() + 7);
                setSelectedDate(nextWeek);
            } else if (daysDiff <= 7) {
                // Next Week -> Two Weeks
                const twoWeeks = new Date(today);
                twoWeeks.setDate(today.getDate() + 14);
                setSelectedDate(twoWeeks);
            } else {
                // Two Weeks -> No date
                setSelectedDate(null);
            }
        }
    };

    // Trigger shake animation for Date chip
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
            Alert.alert("Date Required", "Please set a due date for this item.");
            return;
        }

        setIsCreating(true);

        try {
            const token = await getAccessToken();
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

            let endpoint = '/api/documents/invoice';
            let documentType = 'INVOICE';

            if (detectedIntent === 'payment_link') {
                endpoint = '/api/documents/payment-link';
                documentType = 'PAYMENT_LINK';
            } else if (detectedIntent === 'contract') {
                // Contracts might eventually have their own endpoint or default to invoice
                endpoint = '/api/documents/invoice';
                documentType = 'INVOICE';
            }

            const content: any = {
                title: parsedData?.title || inputText.substring(0, 50),
                description: inputText, // Use full text as description
                clientName: parsedData?.clientName,
                amount: parsedData?.amount,
                currency: parsedData?.currency || 'USD',
                // Add required fields for specific endpoints
                recipientEmail: parsedData?.clientEmail, // if we had it
                items: parsedData?.amount ? [{ description: inputText, amount: parsedData.amount }] : [],
                remindersEnabled: true
            };

            if (effectiveDate) {
                content.dueDate = effectiveDate.toISOString();
            }

            console.log('[UniversalCreationBox] Creating document:', { type: documentType, endpoint, content });

            const response = await fetch(`${apiUrl}${endpoint}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(content),
            });

            const result = await response.json();
            console.log('[UniversalCreationBox] Create result:', result);

            if (result.success && result.data) {
                onClose();

                // Handle nested document object (from specific endpoints) or flat object (if any)
                const docId = result.data.document?.id || result.data.id;

                if (!docId) {
                    console.error('[UniversalCreationBox] No document ID returned:', result);
                    Alert.alert('Error', 'Failed to retrieve document ID');
                    return;
                }

                switch (detectedIntent) {
                    case 'invoice':
                        router.push(`/invoice/${docId}`);
                        break;
                    case 'payment_link':
                        router.push(`/payment-link/${docId}`);
                        break;
                    case 'contract':
                        router.push(`/contracts`);
                        break;
                    default:
                        router.push(`/invoice/${docId}`);
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

    if (!visible) return null;

    // Colors based on theme
    const sheetBg = isDark ? '#1C1C1E' : '#FFFFFF';
    const textColor = isDark ? '#FFFFFF' : '#000000';
    const secondaryText = isDark ? '#8E8E93' : '#8E8E93';
    const brandColor = themeColors.primary; // Blue brand color

    return (
        <Modal
            transparent
            visible={visible}
            onRequestClose={onClose}
            animationType="none"
            statusBarTranslucent
        >
            <KeyboardAvoidingView
                style={styles.container}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
                            backgroundColor: sheetBg,
                        }
                    ]}
                >
                    {/* Text Input */}
                    <TextInput
                        ref={inputRef}
                        value={inputText}
                        onChangeText={handleTextChange}
                        placeholder="e.g., Invoice for Acme $500 due Friday"
                        placeholderTextColor={secondaryText}
                        style={[styles.input, { color: textColor }]}
                        multiline
                        autoFocus
                    />

                    {/* Bottom Row: Date Chip + Submit */}
                    <View style={styles.bottomRow}>
                        {/* Date Chip (Rounded Pill) */}
                        <Animated.View style={{ transform: [{ translateX: dateShakeAnim }] }}>
                            <TouchableOpacity
                                style={[
                                    styles.datePill,
                                    {
                                        backgroundColor: effectiveDate ? `${brandColor}15` : (isDark ? '#2C2C2E' : '#F2F2F7'),
                                        borderColor: effectiveDate ? brandColor : (isDark ? '#3A3A3C' : '#E5E5EA'),
                                    }
                                ]}
                                onPress={handleDateTap}
                            >
                                <CalendarBlank
                                    size={16}
                                    color={effectiveDate ? brandColor : secondaryText}
                                    weight="bold"
                                />
                                <Text style={[
                                    styles.datePillText,
                                    { color: effectiveDate ? brandColor : secondaryText }
                                ]}>
                                    {formatDateDisplay(effectiveDate)}
                                </Text>
                            </TouchableOpacity>
                        </Animated.View>

                        {/* Spacer */}
                        <View style={{ flex: 1 }} />

                        {/* Loading Indicator */}
                        {isLoading && (
                            <ActivityIndicator size="small" color={brandColor} style={{ marginRight: 12 }} />
                        )}

                        {/* Submit Button (Brand Color) */}
                        <TouchableOpacity
                            style={[
                                styles.submitButton,
                                {
                                    backgroundColor: inputText.trim() ? brandColor : (isDark ? '#2C2C2E' : '#F2F2F7'),
                                }
                            ]}
                            onPress={handleCreate}
                            disabled={!inputText.trim() || isCreating}
                        >
                            {isCreating ? (
                                <ActivityIndicator size="small" color="#FFFFFF" />
                            ) : (
                                <ArrowUp
                                    size={20}
                                    color={inputText.trim() ? '#FFFFFF' : secondaryText}
                                    weight="bold"
                                />
                            )}
                        </TouchableOpacity>
                    </View>

                    {/* Skirt to cover keyboard gap */}
                    <View style={[styles.skirt, { backgroundColor: sheetBg }]} />
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
        paddingTop: 20,
        paddingHorizontal: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 10,
    },
    input: {
        fontSize: 17,
        fontFamily: 'GoogleSansFlex_500Medium',
        marginBottom: 16,
        minHeight: 44,
    },
    bottomRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingBottom: 16,
    },
    datePill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 50, // Fully rounded pill
        borderWidth: 1,
    },
    datePillText: {
        fontSize: 14,
        fontFamily: 'GoogleSansFlex_500Medium',
    },
    submitButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
    },
    skirt: {
        position: 'absolute',
        bottom: -100,
        left: 0,
        right: 0,
        height: 100,
    },
});

export default UniversalCreationBox;
