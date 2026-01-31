import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View,
    Text,
    TextInput,
    StyleSheet,
    TouchableOpacity,
    Animated,
    Keyboard,
    ActivityIndicator,
    Alert,
    LayoutAnimation,
    useColorScheme,
} from 'react-native';
import { BottomSheetTextInput, BottomSheetBackdrop, BottomSheetView, BottomSheetModal } from '@gorhom/bottom-sheet';
import { useThemeColors } from '../theme/colors';
import { CalendarBlank, ArrowUp, Paperclip } from 'phosphor-react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../hooks/useAuth';
import * as DocumentPicker from 'expo-document-picker';

interface UniversalCreationBoxProps {
    visible: boolean;
    onClose: () => void;
}

interface ParsedData {
    intent: 'invoice' | 'payment_link' | 'contract' | 'unknown';
    clientName: string | null;
    clientEmail: string | null;
    amount: number | null;
    currency: string | null;
    dueDate: string | null;
    priority: 'low' | 'medium' | 'high' | null;
    title: string | null;
    confidence: number;
}

// Suggestion examples
const SUGGESTIONS = [
    "Invoice for Acme for $500 web design and $200 logo",
    "Create contract for Project X with 3 milestones",
    "Payment link for 50 USDC on Base",
    "Withdraw 100 USDC to GTBank",
    "Invoice John at john@email.com for $1200",
    "Contract for Sarah for Mobile App Design"
];

export function UniversalCreationBox({ visible, onClose }: UniversalCreationBoxProps) {
    const themeColors = useThemeColors();
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';
    const router = useRouter();
    const { getAccessToken } = useAuth();

    // Bottom sheet ref
    const bottomSheetRef = useRef<BottomSheetModal>(null);
    const inputRef = useRef<any>(null);

    // Input state
    const [inputText, setInputText] = useState('');

    // Parsed data from AI (Gemini)
    const [parsedData, setParsedData] = useState<ParsedData | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // Manually selected date override
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [selectedFile, setSelectedFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);

    // UI state
    const [isCreating, setIsCreating] = useState(false);

    // Suggestion rotation
    const [suggestionIndex, setSuggestionIndex] = useState(0);
    const suggestionFadeAnim = useRef(new Animated.Value(1)).current;
    const dateShakeAnim = useRef(new Animated.Value(0)).current;

    // Debounce timer
    const parseTimer = useRef<any>(null);

    // Derived intent
    const detectedIntent = parsedData?.intent || null;

    // Effective date (manual override > AI parsed)
    const effectiveDate = selectedDate || (parsedData?.dueDate ? new Date(parsedData.dueDate) : null);

    // Handle sheet changes
    const handleSheetChanges = useCallback((index: number) => {
        if (index === -1) {
            onClose();
        }
    }, [onClose]);

    // Open/close sheet based on visible prop
    useEffect(() => {
        if (visible) {
            // Reset state
            setInputText('');
            setSuggestionIndex(0);
            suggestionFadeAnim.setValue(1);
            setParsedData(null);
            setSelectedDate(null);
            setSelectedFile(null);
            setIsLoading(false);
            setIsCreating(false);

            bottomSheetRef.current?.present();

            // Slightly delay focus to ensure sheet is ready, triggering keyboard animation
            setTimeout(() => {
                inputRef.current?.focus();
            }, 150);
        } else {
            inputRef.current?.blur();
            bottomSheetRef.current?.dismiss();
        }
    }, [visible]);

    // Suggestion rotation animation
    useEffect(() => {
        let rotationInterval: ReturnType<typeof setInterval>;

        if (visible && !inputText) {
            rotationInterval = setInterval(() => {
                // Fade out
                Animated.timing(suggestionFadeAnim, {
                    toValue: 0,
                    duration: 500,
                    useNativeDriver: true,
                }).start(() => {
                    // Change text
                    setSuggestionIndex((prev) => (prev + 1) % SUGGESTIONS.length);
                    // Fade in
                    Animated.timing(suggestionFadeAnim, {
                        toValue: 1,
                        duration: 500,
                        useNativeDriver: true,
                    }).start();
                });
            }, 4000);
        }

        return () => {
            if (rotationInterval) clearInterval(rotationInterval);
        };
    }, [visible, inputText]);

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
                    currentDate: new Date().toISOString()
                }),
            });

            const result = await response.json();
            console.log('[UniversalCreationBox] Gemini parse result:', result);

            if (result.success && result.data) {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setParsedData(result.data);

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
            setSelectedDate(today);
        } else {
            const daysDiff = Math.floor((effectiveDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

            if (daysDiff === 0) {
                const tomorrow = new Date(today);
                tomorrow.setDate(today.getDate() + 1);
                setSelectedDate(tomorrow);
            } else if (daysDiff === 1) {
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

    // Trigger shake animation for Date chip
    const shakeDate = () => {
        Animated.sequence([
            Animated.timing(dateShakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
            Animated.timing(dateShakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
            Animated.timing(dateShakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
            Animated.timing(dateShakeAnim, { toValue: 0, duration: 50, useNativeDriver: true })
        ]).start();
    };

    // Handle file selection
    const handleFileSelect = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: '*/*',
                copyToCacheDirectory: true,
            });

            if (!result.canceled && result.assets && result.assets.length > 0) {
                setSelectedFile(result.assets[0]);
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            }
        } catch (error) {
            console.error('[UniversalCreationBox] File selection error:', error);
            Alert.alert('Error', 'Failed to select file');
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

            if (detectedIntent === 'payment_link') {
                endpoint = '/api/documents/payment-link';
            } else if (detectedIntent === 'contract') {
                endpoint = '/api/documents/invoice';
            }

            const content: any = {
                title: parsedData?.title || inputText.substring(0, 50),
                description: inputText,
                clientName: parsedData?.clientName,
                amount: parsedData?.amount,
                currency: parsedData?.currency || 'USD',
                recipientEmail: parsedData?.clientEmail,
                items: parsedData?.amount ? [{ description: inputText, amount: parsedData.amount }] : [],
                remindersEnabled: true
            };

            if (effectiveDate) {
                content.dueDate = effectiveDate.toISOString();
            }

            console.log('[UniversalCreationBox] Creating document:', { endpoint, content });

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

    // Backdrop component
    const renderBackdrop = useCallback(
        (props: any) => (
            <BottomSheetBackdrop
                {...props}
                disappearsOnIndex={-1}
                appearsOnIndex={0}
                opacity={0.4}
            />
        ),
        []
    );

    // Colors based on theme
    const sheetBg = isDark ? '#1C1C1E' : '#FFFFFF';
    const textColor = isDark ? '#FFFFFF' : '#000000';
    const secondaryText = isDark ? '#8E8E93' : '#8E8E93';
    const brandColor = themeColors.primary;

    return (
        <BottomSheetModal
            ref={bottomSheetRef}
            index={0} // Changed from -1 to 0 (or null if we want to rely on present) but for Modal usually we rely on present()
            enableDynamicSizing={true}
            onChange={handleSheetChanges}
            backdropComponent={renderBackdrop}
            enablePanDownToClose
            keyboardBehavior="interactive"
            keyboardBlurBehavior="restore"
            android_keyboardInputMode="adjustResize"
            backgroundStyle={{
                backgroundColor: sheetBg,
                borderTopLeftRadius: 16,
                borderTopRightRadius: 16,
            }}
            handleIndicatorStyle={{
                backgroundColor: isDark ? '#3A3A3C' : '#C7C7CC',
                width: 40,
            }}
        >
            <BottomSheetView style={styles.contentContainer}>
                {/* Text Input */}
                <BottomSheetTextInput
                    ref={inputRef}
                    value={inputText}
                    onChangeText={handleTextChange}
                    placeholder="e.g., Invoice for Acme $500 due Friday"
                    placeholderTextColor={secondaryText}
                    style={[styles.input, { color: textColor }]}
                    multiline
                />

                {/* Rotating AI Suggestions (Ghost Text) */}
                {!inputText && (
                    <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => setInputText(SUGGESTIONS[suggestionIndex])}
                        style={styles.suggestionContainer}
                    >
                        <Text style={[styles.suggestionLabel, { color: brandColor }]}>Try: </Text>
                        <Animated.Text
                            style={[
                                styles.suggestionText,
                                {
                                    color: secondaryText,
                                    opacity: suggestionFadeAnim
                                }
                            ]}
                            numberOfLines={1}
                            ellipsizeMode="tail"
                        >
                            {SUGGESTIONS[suggestionIndex]}
                        </Animated.Text>
                    </TouchableOpacity>
                )}

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

                    {/* File Upload Chip */}
                    <TouchableOpacity
                        style={[
                            styles.datePill,
                            {
                                backgroundColor: selectedFile ? `${brandColor}15` : (isDark ? '#2C2C2E' : '#F2F2F7'),
                                borderColor: selectedFile ? brandColor : (isDark ? '#3A3A3C' : '#E5E5EA'),
                                marginLeft: 8
                            }
                        ]}
                        onPress={handleFileSelect}
                    >
                        <Paperclip
                            size={16}
                            color={selectedFile ? brandColor : secondaryText}
                            weight="bold"
                        />
                        {selectedFile ? (
                            <Text style={[
                                styles.datePillText,
                                { color: brandColor, maxWidth: 100 }
                            ]} numberOfLines={1} ellipsizeMode="middle">
                                {selectedFile.name}
                            </Text>
                        ) : null}
                    </TouchableOpacity>

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
            </BottomSheetView>
        </BottomSheetModal>
    );
}

const styles = StyleSheet.create({
    contentContainer: {
        flex: 1,
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 32, // Extra padding for safety
    },
    input: {
        fontSize: 17,
        fontFamily: 'GoogleSansFlex_500Medium',
        marginBottom: 16,
        minHeight: 44,
    },
    suggestionContainer: {
        marginBottom: 16,
        flexDirection: 'row',
        alignItems: 'center',
    },
    suggestionLabel: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 14,
        marginRight: 4,
    },
    suggestionText: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 14,
        flex: 1,
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
        borderRadius: 50,
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
});

export default UniversalCreationBox;
