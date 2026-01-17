/**
 * Modal Styles and Utilities
 * 
 * Provides platform-specific modal styling for iOS Liquid Glass
 * and Android Material Expressive designs.
 * 
 * Usage:
 * - Import and use the styles/components in existing modals
 * - Minimal changes required to existing modal code
 */

import React from 'react';
import { StyleSheet, View, Platform, Animated, ViewStyle, TouchableWithoutFeedback } from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';

/**
 * Trigger haptic feedback for modal interactions
 * @param type - Feedback type: 'open' | 'close' | 'success' | 'warning' | 'error' | 'medium' | 'light' | 'selection'
 * @param enabled - Whether haptics are enabled (defaults to true)
 */
export const modalHaptic = async (type: 'open' | 'close' | 'success' | 'warning' | 'error' | 'medium' | 'light' | 'selection', enabled: boolean = true) => {
    if (!enabled) return;

    try {
        switch (type) {
            case 'open':
            case 'medium':
                await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                break;
            case 'close':
            case 'light':
                await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                break;
            case 'success':
                await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                break;
            case 'warning':
                await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                break;
            case 'error':
                await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                break;
            case 'selection':
                await Haptics.selectionAsync();
                break;
        }
    } catch (e) {
        // Haptics not available
    }
};

/**
 * Modal Backdrop Component
 * Renders blur for iOS, solid scrim for Android
 */
interface ModalBackdropProps {
    opacity?: Animated.Value;
    onPress?: () => void;
}

export const ModalBackdrop: React.FC<ModalBackdropProps> = ({ opacity, onPress }) => {
    const Container = onPress ? TouchableWithoutFeedback : View;
    const containerStyle = StyleSheet.absoluteFill;

    // Default opacity if not provided (assume 1 for static, or use value)
    const opacityStyle = opacity ? { opacity } : {};

    const content = Platform.OS === 'ios' ? (
        <Animated.View style={[StyleSheet.absoluteFill, opacityStyle]}>
            <BlurView
                intensity={40}
                tint="dark"
                style={StyleSheet.absoluteFill}
            />
        </Animated.View>
    ) : (
        <Animated.View
            style={[
                StyleSheet.absoluteFill,
                {
                    backgroundColor: 'rgba(0,0,0,0.32)',
                },
                opacityStyle
            ]}
        />
    );

    if (onPress) {
        return (
            <TouchableWithoutFeedback onPress={onPress}>
                <View style={StyleSheet.absoluteFill}>
                    {content}
                </View>
            </TouchableWithoutFeedback>
        );
    }

    return (
        <View style={StyleSheet.absoluteFill}>
            {content}
        </View>
    );
};

/**
 * Modal Handle Component
 * Pill-shaped drag indicator
 */
export const ModalHandle: React.FC = () => (
    <View style={Platform.OS === 'ios' ? styles.handleIOS : styles.handleAndroid} />
);

/**
 * Get platform-specific modal container styles
 */
export const getModalContentStyle = (customHeight?: number): ViewStyle => {
    const baseStyle: ViewStyle = {
        width: '100%',
        maxWidth: 418,
        overflow: 'hidden',
    };

    if (Platform.OS === 'ios') {
        return {
            ...baseStyle,
            height: customHeight || 477,
            borderRadius: 38, // Continuous curve
            shadowColor: '#000',
            shadowOffset: { width: 0, height: -10 },
            shadowOpacity: 0.15,
            shadowRadius: 20,
        };
    }

    // Android Material Expressive
    return {
        ...baseStyle,
        height: customHeight || 477,
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        borderBottomLeftRadius: 28,
        borderBottomRightRadius: 28,
        elevation: 16,
        backgroundColor: '#FFFFFF',
    };
};

/**
 * iOS Liquid Glass Content Wrapper
 * Wraps content in blur for frosted glass effect
 */
interface LiquidGlassWrapperProps {
    children: React.ReactNode;
    showHandle?: boolean;
    style?: ViewStyle;
}

export const LiquidGlassWrapper: React.FC<LiquidGlassWrapperProps> = ({
    children,
    showHandle = true,
    style
}) => {
    if (Platform.OS !== 'ios') {
        // Android: Simple white background with handle
        return (
            <View style={[styles.androidContent, style]}>
                {showHandle && <ModalHandle />}
                {children}
            </View>
        );
    }

    // iOS: Frosted glass effect
    return (
        <BlurView intensity={80} tint="light" style={[styles.iosBlurContent, style]}>
            <View style={styles.iosInnerContent}>
                {showHandle && <ModalHandle />}
                {children}
            </View>
        </BlurView>
    );
};

/**
 * Get animation config for platform
 */
export const getModalAnimationConfig = () => ({
    damping: Platform.OS === 'ios' ? 22 : 28,
    stiffness: Platform.OS === 'ios' ? 280 : 350,
});

const styles = StyleSheet.create({
    // iOS Liquid Glass
    iosBlurContent: {
        flex: 1,
        borderRadius: 38,
        overflow: 'hidden',
    },
    iosInnerContent: {
        flex: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.75)',
    },
    handleIOS: {
        width: 36,
        height: 5,
        backgroundColor: 'rgba(0, 0, 0, 0.15)',
        borderRadius: 2.5,
        alignSelf: 'center',
        marginTop: 10,
        marginBottom: 16,
    },

    // Android Material Expressive
    androidContent: {
        flex: 1,
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
    },
    handleAndroid: {
        width: 32,
        height: 4,
        backgroundColor: '#CAC4D0', // Material 3 outline
        borderRadius: 2,
        alignSelf: 'center',
        marginTop: 12,
        marginBottom: 16,
    },
});

export default {
    ModalBackdrop,
    ModalHandle,
    LiquidGlassWrapper,
    getModalContentStyle,
    getModalAnimationConfig,
    modalHaptic,
};
