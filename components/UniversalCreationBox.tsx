import React, { useState, useEffect, useRef } from 'react';
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
    Dimensions
} from 'react-native';
import { useThemeColors } from '../theme/colors';
import { CalendarBlank, Flag, Clock, DotsThree, PaperPlaneRight, MagicWand } from 'phosphor-react-native';
import { useRouter } from 'expo-router';

// Screen dimensions
const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface UniversalCreationBoxProps {
    visible: boolean;
    onClose: () => void;
}

export function UniversalCreationBox({ visible, onClose }: UniversalCreationBoxProps) {
    const themeColors = useThemeColors();
    const router = useRouter();

    const [inputText, setInputText] = useState('');
    const [description, setDescription] = useState('');
    const [detectedIntent, setDetectedIntent] = useState<'invoice' | 'payment_link' | 'contract' | null>(null);

    // Animations
    const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;

    // input ref
    const inputRef = useRef<TextInput>(null);

    useEffect(() => {
        if (visible) {
            // Reset state
            setInputText('');
            setDescription('');
            setDetectedIntent(null);

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
                // Focus input after animation
                inputRef.current?.focus();
            });
        } else {
            // Animate Out
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

    // "Invisible AI" Intent Parsing
    useEffect(() => {
        const lowerText = inputText.toLowerCase();
        if (lowerText.includes('invoice') || (lowerText.includes('client') && /\d/.test(lowerText))) {
            setDetectedIntent('invoice');
        } else if (lowerText.includes('pay') || lowerText.includes('link')) {
            setDetectedIntent('payment_link');
        } else if (lowerText.includes('contract') || lowerText.includes('agreement') || lowerText.includes('sign')) {
            setDetectedIntent('contract');
        } else {
            setDetectedIntent(null);
        }
    }, [inputText]);

    const handleCreate = () => {
        // Here we would confirm and navigate
        // For now, simple routing based on intent
        onClose();

        switch (detectedIntent) {
            case 'invoice':
                router.push('/invoice/create'); // Assuming existing route, or we pre-fill parameters
                break;
            case 'payment_link':
                router.push('/payment-link/create');
                break;
            case 'contract':
                router.push('/contracts/create'); // Assuming structure
                break;
            default:
                // Default to Invoice if unsure but they tapped create
                router.push('/invoice/create');
                break;
        }
    };

    const renderIntentBadge = () => {
        if (!detectedIntent) return null;

        let label = '';
        let color = themeColors.primary;

        switch (detectedIntent) {
            case 'invoice': label = 'New Invoice'; color = '#10B981'; break;
            case 'payment_link': label = 'New Payment Link'; color = '#3B82F6'; break;
            case 'contract': label = 'New Contract'; color = '#8B5CF6'; break;
        }

        return (
            <View style={[styles.intentBadge, { backgroundColor: color + '20' }]}>
                <MagicWand size={14} color={color} weight="fill" />
                <Text style={[styles.intentText, { color: color }]}>{label}</Text>
            </View>
        );
    };

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
                    {/* Header / Context */}
                    <View style={styles.sheetHeader}>
                        <View style={[styles.contextPill, { backgroundColor: themeColors.surfaceHighlight }]}>
                            <Text style={[styles.contextText, { color: themeColors.textSecondary }]}>Inbox</Text>
                        </View>
                        {renderIntentBadge()}
                    </View>

                    {/* Inputs */}
                    <View style={styles.inputContainer}>
                        <TextInput
                            ref={inputRef}
                            style={[
                                styles.mainInput,
                                { color: themeColors.textPrimary }
                            ]}
                            placeholder="e.g., Invoice for Web Design"
                            placeholderTextColor={themeColors.textPlaceholder}
                            multiline
                            value={inputText}
                            onChangeText={setInputText}
                        />
                        <TextInput
                            style={[
                                styles.descInput,
                                { color: themeColors.textSecondary }
                            ]}
                            placeholder="Description"
                            placeholderTextColor={themeColors.textPlaceholder}
                            value={description}
                            onChangeText={setDescription}
                        />
                    </View>

                    {/* Action Pills Row */}
                    <View style={styles.actionsRow}>
                        <TouchableOpacity style={[styles.actionPill, { borderColor: themeColors.border }]}>
                            <CalendarBlank size={18} color={themeColors.textSecondary} />
                            <Text style={[styles.actionText, { color: themeColors.textSecondary }]}>Date</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={[styles.actionPill, { borderColor: themeColors.border }]}>
                            <Flag size={18} color={themeColors.textSecondary} />
                            <Text style={[styles.actionText, { color: themeColors.textSecondary }]}>Priority</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={[styles.actionPill, { borderColor: themeColors.border }]}>
                            <Clock size={18} color={themeColors.textSecondary} />
                            <Text style={[styles.actionText, { color: themeColors.textSecondary }]}>Reminders</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={[styles.iconOnlyPill, { borderColor: themeColors.border }]}>
                            <DotsThree size={24} color={themeColors.textSecondary} />
                        </TouchableOpacity>

                        <View style={{ flex: 1 }} />

                        <TouchableOpacity
                            style={[
                                styles.sendButton,
                                { backgroundColor: inputText ? themeColors.primary : themeColors.surfaceHighlight }
                            ]}
                            disabled={!inputText}
                            onPress={handleCreate}
                        >
                            <PaperPlaneRight
                                size={20}
                                color={inputText ? '#FFFFFF' : themeColors.textPlaceholder}
                                weight="fill"
                            />
                        </TouchableOpacity>
                    </View>

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
        padding: 16,
        paddingBottom: Platform.OS === 'ios' ? 20 : 16, // Adjust for Safe Area if needed
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
    },
    contextPill: {
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 6,
    },
    contextText: {
        fontSize: 13,
        fontFamily: 'GoogleSansFlex_500Medium',
    },
    intentBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
    },
    intentText: {
        fontSize: 12,
        fontFamily: 'GoogleSansFlex_600SemiBold',
    },
    inputContainer: {
        marginBottom: 16,
        gap: 8,
    },
    mainInput: {
        fontSize: 18,
        fontFamily: 'GoogleSansFlex_500Medium',
        minHeight: 28,
        padding: 0,
    },
    descInput: {
        fontSize: 14,
        fontFamily: 'GoogleSansFlex_400Regular',
        padding: 0,
    },
    actionsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
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
