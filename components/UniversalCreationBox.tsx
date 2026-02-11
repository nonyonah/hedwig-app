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
    Platform,
    Linking,
} from 'react-native';
import CreationSuccessModal from './CreationSuccessModal';
import * as WebBrowser from 'expo-web-browser';
import DateTimePicker from '@react-native-community/datetimepicker';
import { BottomSheetTextInput, BottomSheetBackdrop, BottomSheetView, BottomSheetModal } from '@gorhom/bottom-sheet';
import { useThemeColors } from '../theme/colors';
import { CalendarBlank, ArrowUp, Paperclip, ListPlus, XCircle, Check, Trash, Tray, CaretDown, Link as LinkIcon, FileText, PaperPlaneRight } from 'phosphor-react-native';

import { useRouter } from 'expo-router';
import { useAuth } from '../hooks/useAuth';
import * as DocumentPicker from 'expo-document-picker';

interface UniversalCreationBoxProps {
    visible: boolean;
    onClose: () => void;
    onTransfer?: (data: any) => void;
}

interface ParsedData {
    intent: 'invoice' | 'payment_link' | 'contract' | 'transfer' | 'unknown';
    clientName: string | null;
    clientEmail: string | null;
    amount: number | null;
    currency: string | null; // Token for transfers
    chain: string | null;    // Network for transfers
    dueDate: string | null;
    priority: 'low' | 'medium' | 'high' | null;
    title: string | null;
    items?: Array<{ description: string; amount: number }>;
    recipient?: string | null;
    confidence: number;
}

// Suggestion examples
// Suggestion examples - more instructional for General mode
const SUGGESTIONS = [
    "Please select an option from the dropdown to start...",
    "Choose 'Payment Link' or 'Invoice' from the menu below...",
    "Tap 'General' to switch modes..."
];



export function UniversalCreationBox({ visible, onClose, onTransfer }: UniversalCreationBoxProps) {
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

    // Manual items state
    const [manualItems, setManualItems] = useState<Array<{ description: string; amount: number }>>([]);
    const [isAddingItem, setIsAddingItem] = useState(false);
    const [newItemDesc, setNewItemDesc] = useState('');
    const [newItemAmount, setNewItemAmount] = useState('');

    // UI state
    const [isCreating, setIsCreating] = useState(false);

    // Suggestion rotation
    const [suggestionIndex, setSuggestionIndex] = useState(0);
    const suggestionFadeAnim = useRef(new Animated.Value(1)).current;
    const dateShakeAnim = useRef(new Animated.Value(0)).current;

    // Debounce timer
    const parseTimer = useRef<any>(null);

    // Mode state
    const [selectedMode, setSelectedMode] = useState<'auto' | 'payment_link' | 'invoice' | 'transfer'>('auto');
    const [showModeDropdown, setShowModeDropdown] = useState(false);
    const modeDropdownAnimation = useRef(new Animated.Value(0)).current;
    const [showDatePicker, setShowDatePicker] = useState(false);

    // State for Success Modal
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [createdItemData, setCreatedItemData] = useState<{
        type: 'invoice' | 'payment_link' | 'contract';
        amount?: number;
        title?: string;
    } | null>(null);

    // Derived placeholder
    const getPlaceholder = () => {
        switch (selectedMode) {
            case 'payment_link': return "E.g., Design Retainer $500 for john@acme.com";
            case 'invoice': return "E.g., Web Design Project $2000 for Sarah (incl. 3 milestones)";
            case 'transfer': return "E.g., Send 100 USDC to 0x123... or bob.eth";
            default: return "Select an option from the menu or type natural language...";
        }
    };
    // Derived intent
    // CRITICAL FIX: If selectedMode is explicit, we MUST use it. parsing should only enrich data, not override intent.
    const detectedIntent = selectedMode !== 'auto' ? selectedMode : (parsedData?.intent || 'unknown');

    // Effective date (manual override > AI parsed)
    const effectiveDate = selectedDate || (parsedData?.dueDate ? new Date(parsedData.dueDate) : null);

    // Handle sheet changes
    const handleSheetChanges = useCallback((index: number) => {
        if (index === -1) {
            // Dismiss keyboard immediately when sheet closes
            Keyboard.dismiss();
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
            setManualItems([]);
            setIsAddingItem(false);
            setNewItemDesc('');
            setNewItemAmount('');
            setIsLoading(false);
            setIsCreating(false);
            setSelectedMode('auto');
            setShowModeDropdown(false);

            bottomSheetRef.current?.present();
        } else {
            // Dismiss keyboard immediately and forcefully before closing sheet
            Keyboard.dismiss();
            inputRef.current?.blur();

            // Add a small delay to ensure keyboard is dismissed before sheet closes
            setTimeout(() => {
                bottomSheetRef.current?.dismiss();
            }, 50);
        }
    }, [visible]);

    // Add keyboard listener to handle lingering keyboard
    useEffect(() => {
        const keyboardDidHideListener = Keyboard.addListener('keyboardDidHide', () => {
            if (!visible) {
                // Ensure sheet is dismissed if keyboard hides while sheet should be closed
                bottomSheetRef.current?.dismiss();
            }
        });

        return () => {
            keyboardDidHideListener.remove();
        };
    }, [visible]);

    // Suggestion rotation animation
    useEffect(() => {
        let rotationInterval: ReturnType<typeof setInterval>;

        if (visible && !inputText && selectedMode === 'auto') {
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
    }, [visible, inputText, selectedMode]);

    // Parse input with Gemini (debounced)
    const parseInput = useCallback(async (text: string) => {
        if (text.length < 3) {
            setParsedData(null);
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            return;
        }

        setIsLoading(true);
        try {
            const token = await getAccessToken();
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

            // Pass the explicit mode if set
            const mode = selectedMode !== 'auto' ? selectedMode : undefined;

            console.log('[UniversalCreationBox] Parsing with Gemini:', text, 'Mode:', mode);
            const response = await fetch(`${apiUrl}/api/creation-box/parse`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text,
                    currentDate: new Date().toISOString(),
                    mode
                }),
            });

            const result = await response.json();

            if (result.success && result.data) {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setParsedData(result.data);
            }
        } catch (error) {
            console.error('[UniversalCreationBox] Gemini parse error:', error);
        } finally {
            setIsLoading(false);
        }
    }, [getAccessToken, selectedDate, selectedMode]);

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

    // Handle date selection with picker
    const handleDateTap = () => {
        setShowDatePicker(true);
    };

    const handleDateChange = (event: any, date?: Date) => {
        setShowDatePicker(false);
        if (date) {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setSelectedDate(date);
        }
    };

    // Handle disabled contract intent
    useEffect(() => {
        if (parsedData?.intent === 'contract_disabled' as any) {
            Alert.alert(
                'Projects Only',
                'Contracts must now be created from the Projects page to ensure proper milestone setup.',
                [
                    { text: 'Go to Projects', onPress: () => router.push('/(tabs)/projects') },
                    { text: 'Cancel', style: 'cancel', onPress: () => setParsedData(null) }
                ]
            );
        }
    }, [parsedData]);

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

    const handleAddItem = () => {
        if (!newItemDesc.trim() || !newItemAmount.trim()) return;

        const amount = parseFloat(newItemAmount.replace(/[^0-9.]/g, ''));
        if (isNaN(amount) || amount <= 0) return;

        setManualItems(prev => [...prev, { description: newItemDesc.trim(), amount }]);
        setNewItemDesc('');
        setNewItemAmount('');
        setIsAddingItem(false);

        // Dismiss keyboard after adding item
        Keyboard.dismiss();
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    };

    const removeManualItem = (index: number) => {
        setManualItems(prev => prev.filter((_, i) => i !== index));
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
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

        // Special handling for transfer intent
        if (detectedIntent === 'transfer') {
            if (onTransfer) {
                onTransfer({
                    amount: parsedData?.amount,
                    token: parsedData?.currency || 'USDC',
                    recipient: parsedData?.recipient,
                    network: parsedData?.chain || 'base',
                    description: inputText // Use full text as fallback description if needed
                });
                onClose();
            } else {
                console.error('[UniversalCreationBox] onTransfer prop missing!');
                Alert.alert("Feature Not Available", "Transfer functionality is not yet connected.");
            }
            return;
        }

        const requiresDate = (detectedIntent === 'payment_link' || detectedIntent === 'invoice' || detectedIntent === 'unknown') && selectedMode !== 'transfer';

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
                endpoint = '/api/documents';
            }

            let calculatedAmount = parsedData?.amount || 0;
            let finalItems = parsedData?.items || [];

            // Helper to clean text for description
            const getCleanDescription = (text: string, clientName?: string) => {
                let clean = text;
                // Remove command prefixes (only if auto mode, or if strictly needed)
                clean = clean.replace(/^(?:create\s+)?(?:invoice|bill|pay link|payment link)\s+(?:for\s+)?/i, '');
                // Remove date/amount suffixes if possible (simple heuristic)
                clean = clean.replace(/\s+(?:due|at)\s+.*$/i, '');
                clean = clean.replace(/\s+(?:\$|USD).*$/i, '');

                clean = clean.trim();

                // If clean text is just the client name, return generic
                if (clientName && clean.toLowerCase().includes(clientName.toLowerCase())) {
                    return 'Professional Services';
                }

                return clean.length > 0 ? clean : 'Professional Services';
            };

            const cleanDesc = getCleanDescription(inputText, parsedData?.clientName || undefined);

            // Prioritize manual items if present
            if (manualItems.length > 0) {
                finalItems = manualItems;
                calculatedAmount = manualItems.reduce((sum, item) => sum + item.amount, 0);
            } else if (parsedData?.amount && (!parsedData.items || parsedData.items.length === 0)) {
                // Determine implicit item using CLEAN description
                finalItems = [{ description: cleanDesc, amount: parsedData.amount }];
            }

            // Improve title fallback - STRICT SANITIZATION
            let finalTitle = parsedData?.title;
            // If title is missing, matches input, or is just too long/messy
            const isTitleBad = !finalTitle ||
                finalTitle.trim() === inputText.trim() ||
                (finalTitle.length > 20 && inputText.includes(finalTitle)) ||
                finalTitle.length > 50;

            if (isTitleBad) {
                if (parsedData?.clientName) {
                    finalTitle = `Invoice for ${parsedData.clientName}`;
                } else if (parsedData?.clientEmail) {
                    const nameFromEmail = parsedData.clientEmail.split('@')[0];
                    finalTitle = `Invoice for ${nameFromEmail.charAt(0).toUpperCase() + nameFromEmail.slice(1)}`;
                } else {
                    // Use the clean description for title if no client
                    finalTitle = cleanDesc === 'Professional Services' ? (detectedIntent === 'payment_link' ? 'Payment Link' : 'Service Invoice') : cleanDesc;
                }
            }

            const content: any = {
                title: finalTitle,
                description: cleanDesc, // User requested clean description, not full prompt
                clientName: parsedData?.clientName,
                amount: calculatedAmount,
                currency: parsedData?.currency || 'USD',
                recipientEmail: parsedData?.clientEmail,
                items: finalItems,
                remindersEnabled: true,
                type: detectedIntent === 'contract' ? 'CONTRACT' : undefined
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
                // Success Modal Logic
                const docId = result.data.document?.id || result.data.id;
                const paymentUrl = result.data.document?.payment_link_url || result.data.document?.content?.blockradar_url;

                setCreatedItemData({
                    type: detectedIntent as any,
                    amount: calculatedAmount,
                    title: finalTitle || undefined
                });

                setShowSuccessModal(true);

                // Clear state but don't close sheet yet - modal is above
                setInputText('');
                setParsedData(null);
                setManualItems([]);

                if (paymentUrl && paymentUrl.startsWith('http')) {
                    // Optional: still open browser if it was a direct BlockRadar link creation?
                    // For now, let's stick to the modal as requested.
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

    const handleSuccessClose = () => {
        setShowSuccessModal(false);
        setCreatedItemData(null);
        onClose(); // Close the main sheet
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
        <>
            <BottomSheetModal
                ref={bottomSheetRef}
                index={0}
                onChange={handleSheetChanges}
                backdropComponent={renderBackdrop}
                enablePanDownToClose
                enableDynamicSizing={true}
                android_keyboardInputMode="adjustResize"
                keyboardBehavior="interactive"
                keyboardBlurBehavior="restore"
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
                        placeholder={getPlaceholder()}
                        placeholderTextColor={secondaryText}
                        style={[styles.input, { color: textColor }]}
                        multiline
                    />

                    {/* Manual Items List */}
                    {manualItems.length > 0 && !isAddingItem && (
                        <View style={styles.itemsList}>
                            {manualItems.map((item, index) => (
                                <View key={index} style={[styles.itemChip, { backgroundColor: isDark ? '#2C2C2E' : '#F2F2F7' }]}>
                                    <Text style={[styles.itemText, { color: textColor }]}>
                                        {item.description} (${item.amount})
                                    </Text>
                                    <TouchableOpacity onPress={() => removeManualItem(index)}>
                                        <XCircle size={16} color={secondaryText} weight="fill" />
                                    </TouchableOpacity>
                                </View>
                            ))}
                        </View>
                    )}

                    {/* Add Item Form */}
                    {isAddingItem ? (
                        <View style={styles.addItemForm}>
                            <BottomSheetTextInput
                                value={newItemDesc}
                                onChangeText={setNewItemDesc}
                                placeholder="Item description (e.g. Web Design)"
                                placeholderTextColor={secondaryText}
                                style={[styles.miniInput, { color: textColor, flex: 2 }]}
                                autoFocus
                            />
                            <BottomSheetTextInput
                                value={newItemAmount}
                                onChangeText={setNewItemAmount}
                                placeholder="$0.00"
                                placeholderTextColor={secondaryText}
                                keyboardType="numeric"
                                style={[styles.miniInput, { color: textColor, flex: 1 }]}
                            />
                            <TouchableOpacity
                                style={[styles.miniButton, { backgroundColor: brandColor }]}
                                onPress={handleAddItem}
                            >
                                <Check size={16} color="#FFFFFF" weight="bold" />
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.miniButton, { backgroundColor: isDark ? '#3A3A3C' : '#E5E5EA' }]}
                                onPress={() => {
                                    Keyboard.dismiss();
                                    setIsAddingItem(false);
                                }}
                            >
                                <XCircle size={16} color={secondaryText} weight="bold" />
                            </TouchableOpacity>
                        </View>
                    ) : null}

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

                    {/* Chips Row: Date + Add Item + File */}
                    <View style={[styles.bottomRow, { marginBottom: 12, borderTopWidth: 0, paddingTop: 0 }]}>
                        {/* Date Chip (Rounded Pill) - Hide for Transfer */}
                        {detectedIntent !== 'transfer' && (
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
                        )}

                        {/* Add Item Pill - Only for Invoice */}
                        {selectedMode === 'invoice' && (
                            <TouchableOpacity
                                style={[
                                    styles.datePill,
                                    {
                                        backgroundColor: isAddingItem ? `${brandColor}15` : (isDark ? '#2C2C2E' : '#F2F2F7'),
                                        borderColor: isAddingItem ? brandColor : (isDark ? '#3A3A3C' : '#E5E5EA'),
                                        marginLeft: 8
                                    }
                                ]}
                                onPress={() => {
                                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                    setIsAddingItem(true);
                                }}
                            >
                                <ListPlus
                                    size={16}
                                    color={isAddingItem ? brandColor : secondaryText}
                                    weight="bold"
                                />
                                <Text style={[
                                    styles.datePillText,
                                    { color: isAddingItem ? brandColor : secondaryText }
                                ]}>
                                    Add Item
                                </Text>
                            </TouchableOpacity>
                        )}

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
                    </View>

                    {/* Bottom Action Row: Inbox Selector (Left) + Submit (Right) */}
                    <View style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingTop: 12,
                        borderTopWidth: 1,
                        borderTopColor: isDark ? '#3A3A3C' : '#E5E5EA',
                        zIndex: 20
                    }}>
                        {/* Inbox Selector with Dropdown */}
                        <View>
                            <TouchableOpacity
                                style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    gap: 6,
                                    padding: 8,
                                    borderRadius: 8,
                                    backgroundColor: showModeDropdown ? (isDark ? '#2C2C2E' : '#F2F2F7') : 'transparent'
                                }}
                                onPress={() => {
                                    if (!showModeDropdown) {
                                        setShowModeDropdown(true);
                                        Animated.spring(modeDropdownAnimation, {
                                            toValue: 1,
                                            damping: 15,
                                            stiffness: 150,
                                            useNativeDriver: true,
                                        }).start();
                                    } else {
                                        Animated.timing(modeDropdownAnimation, {
                                            toValue: 0,
                                            duration: 200,
                                            useNativeDriver: true,
                                        }).start(() => setShowModeDropdown(false));
                                    }
                                }}
                                activeOpacity={0.7}
                            >
                                {/* Icon for mode - Subtle */}
                                {selectedMode === 'auto' && <Tray size={18} color={secondaryText} weight="regular" />}
                                {selectedMode === 'payment_link' && <LinkIcon size={18} color={secondaryText} weight="regular" />}
                                {selectedMode === 'invoice' && <FileText size={18} color={secondaryText} weight="regular" />}

                                {/* Text - Subtle System Font */}
                                <Text style={{ fontSize: 16, fontWeight: '500', color: secondaryText }}>
                                    {selectedMode === 'auto' ? 'General' : selectedMode === 'payment_link' ? 'Payment Link' : selectedMode === 'invoice' ? 'Invoice' : 'Transfer'}
                                </Text>
                                <CaretDown
                                    size={14}
                                    color={secondaryText}
                                    weight="bold"
                                    style={{ transform: [{ rotate: showModeDropdown ? '180deg' : '0deg' }] }}
                                />
                            </TouchableOpacity>

                            {/* Mode Dropdown (Opens Upwards) */}
                            {showModeDropdown && (
                                <Animated.View style={{
                                    position: 'absolute',
                                    bottom: '100%', // Open upwards
                                    left: 0,
                                    marginBottom: 8,
                                    backgroundColor: isDark ? '#2C2C2E' : '#FFFFFF',
                                    borderRadius: 12,
                                    width: 200,
                                    shadowColor: "#000",
                                    shadowOffset: { width: 0, height: 4 }, // Standard shadow
                                    shadowOpacity: 0.15,
                                    shadowRadius: 12,
                                    elevation: 5,
                                    borderWidth: 1,
                                    borderColor: isDark ? '#3A3A3C' : '#E5E5EA',
                                    padding: 4,
                                    opacity: modeDropdownAnimation,
                                    transform: [
                                        {
                                            scale: modeDropdownAnimation.interpolate({
                                                inputRange: [0, 1],
                                                outputRange: [0.95, 1],
                                            }),
                                        },
                                        {
                                            translateY: modeDropdownAnimation.interpolate({
                                                inputRange: [0, 1],
                                                outputRange: [10, 0],
                                            }),
                                        },
                                    ],
                                }}>


                                    {/* Payment Link Option - Refined */}
                                    <TouchableOpacity
                                        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 8, backgroundColor: selectedMode === 'payment_link' ? (isDark ? '#3A3A3C' : '#F2F2F7') : 'transparent' }}
                                        onPress={() => {
                                            setSelectedMode('payment_link');
                                            Animated.timing(modeDropdownAnimation, {
                                                toValue: 0,
                                                duration: 200,
                                                useNativeDriver: true,
                                            }).start(() => setShowModeDropdown(false));
                                        }}
                                    >
                                        <LinkIcon size={18} color={textColor} weight="regular" />
                                        <Text style={{ color: textColor, fontSize: 15, fontWeight: '500' }}>Payment Link</Text>
                                        {selectedMode === 'payment_link' && <Check size={14} color={textColor} weight="bold" style={{ marginLeft: 'auto' }} />}
                                    </TouchableOpacity>

                                    {/* Invoice Option - Refined */}
                                    <TouchableOpacity
                                        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 8, backgroundColor: selectedMode === 'invoice' ? (isDark ? '#3A3A3C' : '#F2F2F7') : 'transparent' }}
                                        onPress={() => {
                                            setSelectedMode('invoice');
                                            Animated.timing(modeDropdownAnimation, {
                                                toValue: 0,
                                                duration: 200,
                                                useNativeDriver: true,
                                            }).start(() => setShowModeDropdown(false));
                                        }}
                                    >
                                        <FileText size={18} color={textColor} weight="regular" />
                                        <Text style={{ color: textColor, fontSize: 15, fontWeight: '500' }}>Invoice</Text>
                                        {selectedMode === 'invoice' && <Check size={14} color={textColor} weight="bold" style={{ marginLeft: 'auto' }} />}
                                    </TouchableOpacity>

                                    {/* Transfer Option - Refined */}
                                    <TouchableOpacity
                                        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 8, backgroundColor: selectedMode === 'transfer' ? (isDark ? '#3A3A3C' : '#F2F2F7') : 'transparent' }}
                                        onPress={() => {
                                            setSelectedMode('transfer');
                                            Animated.timing(modeDropdownAnimation, {
                                                toValue: 0,
                                                duration: 200,
                                                useNativeDriver: true,
                                            }).start(() => setShowModeDropdown(false));
                                        }}
                                    >
                                        <PaperPlaneRight size={18} color={textColor} weight="regular" />
                                        <Text style={{ color: textColor, fontSize: 15, fontWeight: '500' }}>Transfer</Text>
                                        {selectedMode === 'transfer' && <Check size={14} color={textColor} weight="bold" style={{ marginLeft: 'auto' }} />}
                                    </TouchableOpacity>
                                </Animated.View>
                            )}
                        </View>

                        {/* Right Side: Loading or Submit */}
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
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
                    </View>

                    {/* Date Picker */}
                    {showDatePicker && (
                        <DateTimePicker
                            value={effectiveDate || new Date()}
                            mode="date"
                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            onChange={handleDateChange}
                            textColor={textColor}
                            themeVariant={isDark ? 'dark' : 'light'}
                        />
                    )}
                </BottomSheetView>
            </BottomSheetModal>

            {/* Success Modal */}
            <CreationSuccessModal
                visible={showSuccessModal}
                onClose={handleSuccessClose}
                type={createdItemData?.type || 'invoice'}
                amount={createdItemData?.amount}
                title={createdItemData?.title}
            />
        </>
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
    itemsList: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 16,
    },
    itemChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        gap: 6,
    },
    itemText: {
        fontSize: 13,
        fontFamily: 'GoogleSansFlex_500Medium',
    },
    addItemForm: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 16,
    },
    miniInput: {
        height: 36,
        borderRadius: 8,
        paddingHorizontal: 12,
        backgroundColor: 'rgba(120, 120, 128, 0.12)',
        fontSize: 14,
        fontFamily: 'GoogleSansFlex_400Regular',
    },
    miniButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
    },
});

export default UniversalCreationBox;
