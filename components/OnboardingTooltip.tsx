import React, { useEffect, useRef } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Animated,
    Dimensions,
    Modal,
} from 'react-native';
import { X } from 'phosphor-react-native';
import { Colors } from '../theme/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface OnboardingTooltipProps {
    visible: boolean;
    title: string;
    description: string;
    onDismiss: () => void;
    position?: 'top' | 'center' | 'bottom';
    showArrow?: boolean;
    arrowDirection?: 'up' | 'down';
}

export function OnboardingTooltip({
    visible,
    title,
    description,
    onDismiss,
    position = 'center',
    showArrow = false,
    arrowDirection = 'up',
}: OnboardingTooltipProps) {
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(20)).current;

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 300,
                    useNativeDriver: true,
                }),
                Animated.spring(slideAnim, {
                    toValue: 0,
                    tension: 100,
                    friction: 10,
                    useNativeDriver: true,
                }),
            ]).start();
        } else {
            fadeAnim.setValue(0);
            slideAnim.setValue(20);
        }
    }, [visible, fadeAnim, slideAnim]);

    if (!visible) return null;

    const getPositionStyle = (): { top?: number; bottom?: number } => {
        switch (position) {
            case 'top':
                return { top: 100 };
            case 'bottom':
                return { bottom: 150 };
            case 'center':
            default:
                return { top: 250 };
        }
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="none"
            onRequestClose={onDismiss}
        >
            <TouchableOpacity
                style={styles.overlay}
                activeOpacity={1}
                onPress={onDismiss}
            >
                <Animated.View
                    style={[
                        styles.container,
                        getPositionStyle(),
                        {
                            opacity: fadeAnim,
                            transform: [{ translateY: slideAnim }],
                        },
                    ]}
                >
                    {showArrow && arrowDirection === 'up' && (
                        <View style={styles.arrowUp} />
                    )}

                    <View style={styles.content}>
                        <View style={styles.header}>
                            <Text style={styles.title}>{title}</Text>
                            <TouchableOpacity
                                onPress={onDismiss}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            >
                                <X size={20} color={Colors.textSecondary} />
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.description}>{description}</Text>

                        <TouchableOpacity
                            style={styles.button}
                            onPress={onDismiss}
                        >
                            <Text style={styles.buttonText}>Got it!</Text>
                        </TouchableOpacity>
                    </View>

                    {showArrow && arrowDirection === 'down' && (
                        <View style={styles.arrowDown} />
                    )}
                </Animated.View>
            </TouchableOpacity>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    container: {
        position: 'absolute',
        alignSelf: 'center',
        width: SCREEN_WIDTH - 48,
        maxWidth: 340,
    },
    content: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 8,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 8,
    },
    title: {
        fontFamily: 'GoogleSans_700Bold',
        fontSize: 18,
        color: Colors.textPrimary,
        flex: 1,
        marginRight: 12,
    },
    description: {
        fontFamily: 'GoogleSans_400Regular',
        fontSize: 14,
        color: Colors.textSecondary,
        lineHeight: 20,
        marginBottom: 16,
    },
    button: {
        backgroundColor: Colors.textPrimary,
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 20,
        alignItems: 'center',
    },
    buttonText: {
        fontFamily: 'GoogleSans_600SemiBold',
        fontSize: 14,
        color: '#FFFFFF',
    },
    arrowUp: {
        width: 0,
        height: 0,
        borderLeftWidth: 10,
        borderRightWidth: 10,
        borderBottomWidth: 10,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderBottomColor: '#FFFFFF',
        alignSelf: 'center',
        marginBottom: -1,
    },
    arrowDown: {
        width: 0,
        height: 0,
        borderLeftWidth: 10,
        borderRightWidth: 10,
        borderTopWidth: 10,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderTopColor: '#FFFFFF',
        alignSelf: 'center',
        marginTop: -1,
    },
});
