/**
 * SwiftUIBottomSheet - Native iOS bottom sheet using @expo/ui/swift-ui
 * 
 * Provides native iOS sheet behavior with Liquid Glass effect.
 * Falls back to PlatformModal on Android/Web.
 */

import React from 'react';
import { Platform, useWindowDimensions, View, StyleSheet } from 'react-native';
import { useThemeColors } from '../../theme/colors';

// Only import SwiftUI components on iOS
let Host: any = null;
let BottomSheet: any = null;
let VStack: any = null;

if (Platform.OS === 'ios') {
    try {
        const SwiftUI = require('@expo/ui/swift-ui');
        Host = SwiftUI.Host;
        BottomSheet = SwiftUI.BottomSheet;
        VStack = SwiftUI.VStack;
    } catch (e) {
        console.warn('[SwiftUIBottomSheet] Failed to import @expo/ui/swift-ui:', e);
    }
}

// Fallback for non-iOS platforms
import PlatformModal from '../ui/PlatformModal';

interface SwiftUIBottomSheetProps {
    isOpen: boolean;
    onClose: () => void;
    children: React.ReactNode;
    /** Height as percentage of screen (0.5 = 50%) */
    height?: number;
}

export const SwiftUIBottomSheet: React.FC<SwiftUIBottomSheetProps> = ({
    isOpen,
    onClose,
    children,
    height = 0.7,
}) => {
    const { width } = useWindowDimensions();
    const themeColors = useThemeColors();

    // iOS: Use native SwiftUI BottomSheet
    if (Platform.OS === 'ios' && Host && BottomSheet) {
        return (
            <Host
                style={{
                    position: 'absolute',
                    width,
                    height: 0, // Host doesn't need height for sheets
                }}
            >
                <BottomSheet
                    isOpened={isOpen}
                    onIsOpenedChange={(opened: boolean) => {
                        if (!opened) onClose();
                    }}
                >
                    <View style={[
                        styles.sheetContent,
                        { backgroundColor: themeColors.modalBackground }
                    ]}>
                        {children}
                    </View>
                </BottomSheet>
            </Host>
        );
    }

    // Android/Web: Use existing PlatformModal
    return (
        <PlatformModal
            visible={isOpen}
            onClose={onClose}
            height={height}
        >
            {children}
        </PlatformModal>
    );
};

const styles = StyleSheet.create({
    sheetContent: {
        flex: 1,
        padding: 20,
    },
});

export default SwiftUIBottomSheet;
