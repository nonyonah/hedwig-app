import React from 'react';
import { Platform, StyleSheet, Pressable, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

interface AnimatedListItemProps {
    onPress: () => void;
    children: React.ReactNode;
}

/**
 * Animated list item component with platform-specific animations
 * - iOS: Native spring animation with haptic feedback
 * - Android: Elevation and ripple effect
 */
export function AnimatedListItem({ onPress, children }: AnimatedListItemProps) {
    const scaleAnim = React.useRef(new Animated.Value(1)).current;

    const handlePressIn = () => {
        if (Platform.OS === 'ios') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }

        Animated.spring(scaleAnim, {
            toValue: 0.97,
            useNativeDriver: true,
            speed: 50,
            bounciness: 4,
        }).start();
    };

    const handlePressOut = () => {
        Animated.spring(scaleAnim, {
            toValue: 1,
            useNativeDriver: true,
            speed: 50,
            bounciness: 4,
        }).start();
    };

    const handlePress = () => {
        if (Platform.OS === 'ios') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
        onPress();
    };

    return (
        <Pressable
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            onPress={handlePress}
            android_ripple={{
                color: 'rgba(99, 102, 241, 0.1)',
                borderless: false,
                radius: 300,
            }}
        >
            <Animated.View
                style={[
                    styles.container,
                    {
                        transform: [{ scale: scaleAnim }],
                    },
                ]}
            >
                {children}
            </Animated.View>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    container: {
        // Container will inherit the child's styling
    },
});

export default AnimatedListItem;
