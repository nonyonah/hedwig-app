import React from 'react';
import { Platform, StyleProp, StyleSheet, TouchableOpacity, View, ViewStyle } from 'react-native';

// Load @expo/ui/swift-ui on iOS only
let SwiftUIButton: any = null;
let SwiftUIHost: any = null;
let buttonStyleModifier: any = null;
let controlSizeModifier: any = null;
let labelStyleModifier: any = null;
let frameModifier: any = null;
let clipShapeModifier: any = null;
let fontModifier: any = null;
let tintModifier: any = null;

if (Platform.OS === 'ios') {
    try {
        const swiftUI = require('@expo/ui/swift-ui');
        SwiftUIButton = swiftUI.Button;
        SwiftUIHost = swiftUI.Host;
        const m = require('@expo/ui/swift-ui/modifiers');
        buttonStyleModifier = m.buttonStyle;
        controlSizeModifier = m.controlSize;
        labelStyleModifier = m.labelStyle;
        frameModifier = m.frame;
        clipShapeModifier = m.clipShape;
        fontModifier = m.font;
        tintModifier = m.tint;
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
    useGlass?: boolean;
    forceGlassForClose?: boolean;
};

const BUTTON_SIZE = 40;

/**
 * iOS: Native SwiftUI Button with glass effect clipped to a circle — matches the
 * circular container exactly. Only back/action buttons get glass; modal close
 * buttons (xmark) are left unchanged by callers (this component treats all systemImages
 * the same — glass circle).
 * Android: TouchableOpacity with a semi-transparent circle fallback.
 */
export default function IOSGlassIconButton({
    onPress,
    icon,
    systemImage,
    disabled,
    containerStyle,
    circleStyle,
    useGlass = true,
    forceGlassForClose = false,
}: IOSGlassIconButtonProps) {
    const flatCircle = StyleSheet.flatten(circleStyle) || {};
    const w = typeof flatCircle.width === 'number' ? flatCircle.width : BUTTON_SIZE;
    const h = typeof flatCircle.height === 'number' ? flatCircle.height : BUTTON_SIZE;
    const hasExplicitSize = typeof flatCircle.width === 'number' && typeof flatCircle.height === 'number';
    const size = hasExplicitSize ? Math.max(w, h) : BUTTON_SIZE;
    const symbol = systemImage || 'chevron.left';
    const isCloseButton = symbol.includes('xmark');
    const useBackButtonPreset = forceGlassForClose;
    const shouldUseGlass = useGlass && (!isCloseButton || forceGlassForClose);

    if (Platform.OS === 'ios' && SwiftUIButton && SwiftUIHost) {
        const modifiers = [
            labelStyleModifier ? labelStyleModifier('iconOnly') : null,
            controlSizeModifier ? controlSizeModifier((isCloseButton && !useBackButtonPreset) ? 'regular' : 'large') : null,
            fontModifier ? fontModifier({ size: (isCloseButton && !useBackButtonPreset) ? 16 : 17, weight: 'bold' }) : null,
            frameModifier ? frameModifier({ width: size, height: size }) : null,
            shouldUseGlass && clipShapeModifier ? clipShapeModifier('circle') : null,
            buttonStyleModifier ? buttonStyleModifier(shouldUseGlass ? 'glass' : 'plain') : null,
            shouldUseGlass && tintModifier ? tintModifier({ red: 0.6, green: 0.75, blue: 1.0, opacity: 0.55 }) : null,
        ].filter(Boolean);
        const backgroundColor = shouldUseGlass ? 'transparent' : 'rgba(118, 118, 128, 0.20)';

        return (
            <View
                style={[
                    styles.container,
                    containerStyle,
                    { width: size, height: size, borderRadius: size / 2, backgroundColor },
                ]}
            >
                <SwiftUIHost style={StyleSheet.absoluteFill}>
                    <SwiftUIButton
                        onPress={onPress}
                        disabled={disabled}
                        systemImage={symbol}
                        label={symbol.includes('xmark') ? 'Close' : symbol.includes('plus') ? 'Add' : 'Back'}
                        modifiers={modifiers}
                    />
                </SwiftUIHost>
            </View>
        );
    }

    // Android / fallback
    return (
        <TouchableOpacity
            onPress={onPress}
            disabled={disabled}
            style={[styles.androidBtn, containerStyle, circleStyle, { width: size, height: size }]}
            activeOpacity={0.7}
        >
            {icon}
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    container: {
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
    },
    androidBtn: {
        backgroundColor: 'rgba(120,120,128,0.18)',
        borderRadius: 50,
        justifyContent: 'center',
        alignItems: 'center',
    },
});
