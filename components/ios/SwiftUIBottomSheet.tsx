/**
 * SwiftUIBottomSheet - Native-style bottom sheet
 * 
 * Uses PlatformModal which provides platform-native design:
 * - iOS: Liquid Glass with blur backdrop
 * - Android: Material Expressive with scrim
 * 
 * Note: @expo/ui SwiftUI BottomSheet integration is experimental.
 * Using PlatformModal for reliable cross-platform experience.
 */

import React from 'react';
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

export default SwiftUIBottomSheet;
