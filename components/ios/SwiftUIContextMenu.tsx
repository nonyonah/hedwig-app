/**
 * SwiftUIContextMenu - Native iOS context menu using @expo/ui/swift-ui
 * 
 * Provides native iOS context menu with SF Symbols.
 * Falls back to Alert.alert on Android/Web.
 */

import React from 'react';
import { Platform, Alert, View, StyleSheet } from 'react-native';

// Only import SwiftUI components on iOS
let Host: any = null;
let ContextMenu: any = null;
let Button: any = null;

if (Platform.OS === 'ios') {
    try {
        const SwiftUI = require('@expo/ui/swift-ui');
        Host = SwiftUI.Host;
        ContextMenu = SwiftUI.ContextMenu;
        Button = SwiftUI.Button;
    } catch (e) {
        console.warn('[SwiftUIContextMenu] Failed to import @expo/ui/swift-ui:', e);
    }
}

interface MenuAction {
    title: string;
    icon?: string; // SF Symbol name
    destructive?: boolean;
    onPress: () => void;
}

interface SwiftUIContextMenuProps {
    children: React.ReactNode;
    actions: MenuAction[];
    /** Fallback title for Alert on Android */
    alertTitle?: string;
}

export const SwiftUIContextMenu: React.FC<SwiftUIContextMenuProps> = ({
    children,
    actions,
    alertTitle = 'Options',
}) => {
    // iOS: Use native SwiftUI ContextMenu
    if (Platform.OS === 'ios' && Host && ContextMenu && Button) {
        return (
            <Host matchContents>
                <ContextMenu>
                    <ContextMenu.Items>
                        {actions.map((action, index) => (
                            <Button
                                key={index}
                                systemImage={action.icon}
                                variant={action.destructive ? 'destructive' : 'default'}
                                onPress={action.onPress}
                            >
                                {action.title}
                            </Button>
                        ))}
                    </ContextMenu.Items>
                    <ContextMenu.Trigger>
                        {children}
                    </ContextMenu.Trigger>
                </ContextMenu>
            </Host>
        );
    }

    // Android/Web: Use Alert fallback (triggered by long press on parent)
    const showActionSheet = () => {
        Alert.alert(
            alertTitle,
            undefined,
            [
                ...actions.map(action => ({
                    text: action.title,
                    style: action.destructive ? 'destructive' as const : 'default' as const,
                    onPress: action.onPress,
                })),
                { text: 'Cancel', style: 'cancel' },
            ]
        );
    };

    // Return children with long press handler attached via parent
    return <>{children}</>;
};

/**
 * Hook to show action sheet on non-iOS platforms
 */
export const useActionSheet = (actions: MenuAction[], title?: string) => {
    return () => {
        if (Platform.OS === 'ios') return; // iOS uses native context menu

        Alert.alert(
            title || 'Options',
            undefined,
            [
                ...actions.map(action => ({
                    text: action.title,
                    style: action.destructive ? 'destructive' as const : 'default' as const,
                    onPress: action.onPress,
                })),
                { text: 'Cancel', style: 'cancel' },
            ]
        );
    };
};

export default SwiftUIContextMenu;
