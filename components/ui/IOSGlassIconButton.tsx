import React from 'react';
import { Platform, StyleProp, StyleSheet, TouchableOpacity, View, ViewStyle } from 'react-native';

// Load @expo/ui/swift-ui on iOS only
let SwiftUIButton: any = null;
let SwiftUIHost: any = null;
let glassEffectModifier: any = null;
let foregroundStyleModifier: any = null;

if (Platform.OS === 'ios') {
    try {
        const swiftUI = require('@expo/ui/swift-ui');
        SwiftUIButton = swiftUI.Button;
        SwiftUIHost = swiftUI.Host;
        const mods = require('@expo/ui/swift-ui/modifiers');
        glassEffectModifier = mods.glassEffect;
        foregroundStyleModifier = mods.foregroundStyle;
    } catch {}
}

type IOSGlassIconButtonProps = {
    onPress?: () => void;
    /** Shown on Android as the button icon */
    icon: React.ReactNode;
    /** SF Symbol name used for the iOS SwiftUI glass button */
    systemImage?: string;
    disabled?: boolean;
    containerStyle?: StyleProp<ViewStyle>;
    circleStyle?: StyleProp<ViewStyle>;
};

/**
 * iOS: Native SwiftUI Button with liquid-glass effect via @expo/ui/swift-ui.
 * Android: TouchableOpacity with a semi-transparent circle fallback.
 */
export default function IOSGlassIconButton({
    onPress,
    icon,
    systemImage,
    disabled,
    containerStyle,
    circleStyle,
}: IOSGlassIconButtonProps) {
    const flatCircle = StyleSheet.flatten(circleStyle) || {};
    const requestedWidth = typeof flatCircle.width === 'number' ? flatCircle.width : 40;
    const requestedHeight = typeof flatCircle.height === 'number' ? flatCircle.height : 40;
    const requestedRadius = typeof flatCircle.borderRadius === 'number' ? flatCircle.borderRadius : Math.min(requestedWidth, requestedHeight) / 2;
    const isCloseButton = systemImage === 'xmark';
    const liquidSize = Math.max(requestedWidth, requestedHeight, 50);
    const combinedStyle = [containerStyle, circleStyle];

    if (Platform.OS === 'ios' && SwiftUIButton && SwiftUIHost) {
        if (isCloseButton) {
            const closeSize = Math.min(requestedWidth, requestedHeight, 32);
            return (
                <TouchableOpacity
                    onPress={onPress}
                    disabled={disabled}
                    activeOpacity={0.8}
                    style={[
                        styles.host,
                        containerStyle,
                        styles.iosCloseButton,
                        {
                            width: closeSize,
                            height: closeSize,
                            borderRadius: closeSize / 2,
                        },
                    ]}
                >
                    <View pointerEvents="none" style={styles.closeIconOverlay}>
                        {icon}
                    </View>
                </TouchableOpacity>
            );
        }

        const modifiers = [
            glassEffectModifier ? glassEffectModifier({ shape: 'circle' }) : null,
            foregroundStyleModifier ? foregroundStyleModifier('clear') : null,
        ].filter(Boolean);

        return (
            <View
                style={[
                    styles.host,
                    containerStyle,
                    {
                        width: liquidSize,
                        height: liquidSize,
                        borderRadius: Math.max(requestedRadius, liquidSize / 2),
                        backgroundColor: 'transparent',
                    },
                ]}
            >
                <SwiftUIHost style={StyleSheet.absoluteFill}>
                    <SwiftUIButton
                        variant="glass"
                        onPress={onPress}
                        disabled={disabled}
                        systemImage={systemImage || 'xmark'}
                        controlSize="large"
                        modifiers={modifiers}
                    />
                </SwiftUIHost>
                <View pointerEvents="none" style={styles.glassIconOverlay}>
                    {icon}
                </View>
            </View>
        );
    }

    // Android fallback
    return (
        <TouchableOpacity
            onPress={onPress}
            disabled={disabled}
            style={[styles.androidBtn, ...combinedStyle]}
            activeOpacity={0.7}
        >
            {icon}
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    host: {
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
    },
    glassIconOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'transparent',
    },
    iosCloseButton: {
        backgroundColor: 'rgba(142, 142, 147, 0.24)',
    },
    closeIconOverlay: {
        justifyContent: 'center',
        alignItems: 'center',
        transform: [{ scale: 0.86 }],
    },
    androidBtn: {
        backgroundColor: 'rgba(120,120,128,0.18)',
        borderRadius: 50,
        justifyContent: 'center',
        alignItems: 'center',
    },
});
