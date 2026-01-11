/**
 * SwiftUITouchable - Cross-platform touchable component
 * 
 * Uses native SwiftUI Button on iOS (works inside SwiftUIBottomSheet)
 * Falls back to TouchableOpacity on Android and web
 * 
 * SwiftUI Button is confirmed to work inside BottomSheet per Expo documentation.
 */

import React from 'react';
import { Platform, TouchableOpacity, TouchableOpacityProps, View, StyleSheet } from 'react-native';

// Conditionally import SwiftUI Button only on iOS
let SwiftUIButton: any = null;

if (Platform.OS === 'ios') {
    try {
        const swiftUI = require('@expo/ui/swift-ui');
        SwiftUIButton = swiftUI.Button;
    } catch (e) {
        console.warn('Failed to load @expo/ui/swift-ui Button:', e);
    }
}

interface SwiftUITouchableProps extends Omit<TouchableOpacityProps, 'children'> {
    children: React.ReactNode;
    /** Optional SF Symbol name for icon button (e.g., 'xmark', 'chevron.left') */
    systemImage?: string;
    /** Text label for the button (used on iOS with SwiftUI Button) */
    label?: string;
}

/**
 * A touchable component that uses native SwiftUI Button on iOS for proper
 * touch handling inside SwiftUIBottomSheet, and TouchableOpacity elsewhere.
 * 
 * For iOS: The button uses 'plain' variant to avoid system styling.
 * The children are rendered but the actual touch is handled by SwiftUI Button.
 */
export const SwiftUITouchable: React.FC<SwiftUITouchableProps> = ({
    children,
    onPress,
    style,
    disabled,
    systemImage,
    label,
    activeOpacity = 0.7,
    ...props
}) => {
    // iOS: Use native SwiftUI Button with plain variant
    if (Platform.OS === 'ios' && SwiftUIButton) {
        return (
            <SwiftUIButton
                variant="plain"
                onPress={onPress}
                disabled={disabled}
                systemImage={systemImage}
            >
                {/* 
                  SwiftUI Button requires string children for the label.
                  We wrap RN children in a View positioned over the button area.
                  The button handles touch, children handle display.
                */}
                <View style={[styles.wrapper, style]} pointerEvents="none">
                    {children}
                </View>
            </SwiftUIButton>
        );
    }

    // Android/Web: Use TouchableOpacity
    return (
        <TouchableOpacity
            style={style}
            onPress={onPress}
            disabled={disabled}
            activeOpacity={activeOpacity}
            {...props}
        >
            {children}
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    wrapper: {
        // Default wrapper styles - allows children to render normally
    },
});

export default SwiftUITouchable;

