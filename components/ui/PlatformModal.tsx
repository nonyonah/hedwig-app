/**
 * PlatformModal - Native-style modal for iOS and Android
 * 
 * iOS: Liquid Glass design with blur backdrop and translucent content
 * Android: Material Expressive with elevated surface and scrim
 * 
 * Both include haptic feedback on open/close
 */

import React, { useEffect, useRef, useCallback } from 'react';
import {
    View,
    Modal,
    StyleSheet,
    TouchableOpacity,
    Animated,
    Dimensions,
    Platform,
    StatusBar,
} from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface PlatformModalProps {
    visible: boolean;
    onClose: () => void;
    children: React.ReactNode;
    /** Height as percentage of screen (0.5 = 50%) or 'auto' for content-based */
    height?: number | 'auto';
    /** Show drag handle at top */
    showHandle?: boolean;
    /** Enable swipe to dismiss */
    swipeToDismiss?: boolean;
    /** Disable haptics */
    disableHaptics?: boolean;
}

export const PlatformModal: React.FC<PlatformModalProps> = ({
    visible,
    onClose,
    children,
    height = 0.7,
    showHandle = true,
    swipeToDismiss = true,
    disableHaptics = false,
}) => {
    const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
    const backdropOpacity = useRef(new Animated.Value(0)).current;
    const [isRendered, setIsRendered] = React.useState(false);

    // Haptic feedback
    const triggerHaptic = useCallback(async (type: 'open' | 'close') => {
        if (disableHaptics) return;
        try {
            if (type === 'open') {
                await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            } else {
                await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }
        } catch (e) {
            // Haptics not available
        }
    }, [disableHaptics]);

    // Open animation
    useEffect(() => {
        if (visible) {
            setIsRendered(true);
            triggerHaptic('open');

            Animated.parallel([
                Animated.spring(translateY, {
                    toValue: 0,
                    useNativeDriver: true,
                    damping: Platform.OS === 'ios' ? 20 : 15,
                    stiffness: Platform.OS === 'ios' ? 200 : 180,
                }),
                Animated.timing(backdropOpacity, {
                    toValue: 1,
                    duration: 250,
                    useNativeDriver: true,
                }),
            ]).start();
        } else if (isRendered) {
            triggerHaptic('close');

            Animated.parallel([
                Animated.spring(translateY, {
                    toValue: SCREEN_HEIGHT,
                    useNativeDriver: true,
                    damping: 20,
                    stiffness: 200,
                }),
                Animated.timing(backdropOpacity, {
                    toValue: 0,
                    duration: 200,
                    useNativeDriver: true,
                }),
            ]).start(() => {
                setIsRendered(false);
            });
        }
    }, [visible]);

    // Handle swipe gesture
    const panY = useRef(new Animated.Value(0)).current;
    const lastGestureY = useRef(0);

    const handlePanStart = () => {
        lastGestureY.current = 0;
    };

    const handlePanMove = (gestureY: number) => {
        if (!swipeToDismiss) return;
        const delta = gestureY - lastGestureY.current;
        if (delta > 0) { // Only allow downward swipe
            panY.setValue(delta);
        }
    };

    const handlePanEnd = (gestureY: number) => {
        if (!swipeToDismiss) return;
        if (gestureY > 100) {
            onClose();
        } else {
            Animated.spring(panY, {
                toValue: 0,
                useNativeDriver: true,
                damping: 20,
            }).start();
        }
    };

    if (!isRendered) return null;

    const modalHeight = height === 'auto' ? undefined : SCREEN_HEIGHT * height;

    // Platform-specific styles
    const isIOS = Platform.OS === 'ios';

    const contentStyle = isIOS
        ? styles.contentIOS
        : styles.contentAndroid;

    const containerStyle = [
        styles.contentContainer,
        contentStyle,
        modalHeight ? { height: modalHeight } : { maxHeight: SCREEN_HEIGHT * 0.9 },
        { transform: [{ translateY: Animated.add(translateY, panY) }] },
    ];

    return (
        <Modal
            visible={isRendered}
            transparent
            statusBarTranslucent
            onRequestClose={onClose}
            animationType="none"
        >
            <View style={styles.container}>
                {/* Backdrop */}
                <Animated.View
                    style={[
                        StyleSheet.absoluteFill,
                        { opacity: backdropOpacity }
                    ]}
                >
                    {isIOS ? (
                        // iOS: Blur backdrop with light tint
                        <BlurView
                            intensity={40}
                            tint="dark"
                            style={StyleSheet.absoluteFill}
                        />
                    ) : (
                        // Android: Scrim overlay
                        <View style={styles.androidScrim} />
                    )}
                </Animated.View>

                {/* Tap outside to close */}
                <TouchableOpacity
                    style={StyleSheet.absoluteFill}
                    activeOpacity={1}
                    onPress={onClose}
                />

                {/* Modal Content */}
                <Animated.View style={containerStyle}>
                    {isIOS ? (
                        // iOS: Frosted glass content
                        <BlurView
                            intensity={80}
                            tint="light"
                            style={styles.iosBlurContent}
                        >
                            <View style={styles.iosInnerContent}>
                                {showHandle && <View style={styles.handleIOS} />}
                                {children}
                            </View>
                        </BlurView>
                    ) : (
                        // Android: Solid elevated surface
                        <View style={styles.androidSurface}>
                            {showHandle && <View style={styles.handleAndroid} />}
                            {children}
                        </View>
                    )}
                </Animated.View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'flex-end',
    },

    // iOS Liquid Glass
    contentIOS: {
        borderTopLeftRadius: 38,
        borderTopRightRadius: 38,
        overflow: 'hidden',
        // Subtle shadow for depth
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -10 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
    },
    iosBlurContent: {
        flex: 1,
        borderTopLeftRadius: 38,
        borderTopRightRadius: 38,
        overflow: 'hidden',
    },
    iosInnerContent: {
        flex: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.7)',
        paddingTop: 8,
    },
    handleIOS: {
        width: 36,
        height: 5,
        backgroundColor: 'rgba(0, 0, 0, 0.15)',
        borderRadius: 2.5,
        alignSelf: 'center',
        marginTop: 8,
        marginBottom: 16,
    },

    // Android Material Expressive
    contentAndroid: {
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        elevation: 16,
    },
    androidScrim: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.32)',
    },
    androidSurface: {
        flex: 1,
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        paddingTop: 8,
    },
    handleAndroid: {
        width: 32,
        height: 4,
        backgroundColor: '#CAC4D0', // Material 3 outline color
        borderRadius: 2,
        alignSelf: 'center',
        marginTop: 12,
        marginBottom: 16,
    },

    // Shared
    contentContainer: {
        overflow: 'hidden',
    },
});

export default PlatformModal;
