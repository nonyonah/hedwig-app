/**
 * SwiftUI Modal Components
 * 
 * Native SwiftUI components for use inside SwiftUIBottomSheet on iOS.
 * These wrap @expo/ui/swift-ui components for modal content.
 */

import React from 'react';
import { Platform, View, Text as RNText, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Colors, useThemeColors } from '../../theme/colors';

// Conditionally import SwiftUI components only on iOS
let Text: any = null;
let Button: any = null;
let VStack: any = null;
let HStack: any = null;
let Spacer: any = null;

if (Platform.OS === 'ios') {
    try {
        const swiftUI = require('@expo/ui/swift-ui');
        Text = swiftUI.Text;
        Button = swiftUI.Button;
        VStack = swiftUI.VStack;
        HStack = swiftUI.HStack;
        Spacer = swiftUI.Spacer;
    } catch (e) {
        console.warn('Failed to load @expo/ui/swift-ui:', e);
    }
}

// ============ iOS SwiftUI Components ============

interface SwiftUIModalTitleProps {
    children: string;
}

export const SwiftUIModalTitle: React.FC<SwiftUIModalTitleProps> = ({ children }) => {
    if (Platform.OS === 'ios' && Text) {
        return <Text size={24} weight="bold">{children}</Text>;
    }
    // Android fallback
    return <RNText style={styles.title}>{children}</RNText>;
};

interface SwiftUIModalTextProps {
    children: string;
    secondary?: boolean;
    size?: number;
}

export const SwiftUIModalText: React.FC<SwiftUIModalTextProps> = ({
    children,
    secondary = false,
    size = 16
}) => {
    if (Platform.OS === 'ios' && Text) {
        return <Text size={size} color={secondary ? 'secondary' : undefined}>{children}</Text>;
    }
    // Android fallback
    return (
        <RNText style={[styles.text, secondary && styles.textSecondary, { fontSize: size }]}>
            {children}
        </RNText>
    );
};

interface SwiftUIModalButtonProps {
    children: string;
    onPress: () => void;
    variant?: 'default' | 'bordered' | 'borderedProminent' | 'borderless' | 'plain';
    disabled?: boolean;
    loading?: boolean;
    destructive?: boolean;
}

export const SwiftUIModalButton: React.FC<SwiftUIModalButtonProps> = ({
    children,
    onPress,
    variant = 'borderedProminent',
    disabled = false,
    loading = false,
    destructive = false,
}) => {
    if (Platform.OS === 'ios' && Button) {
        return (
            <Button
                variant={variant}
                onPress={onPress}
                disabled={disabled || loading}
                role={destructive ? 'destructive' : undefined}
            >
                {loading ? 'Loading...' : children}
            </Button>
        );
    }
    // Android fallback
    return (
        <TouchableOpacity
            style={[
                styles.button,
                variant === 'bordered' && styles.buttonOutline,
                destructive && styles.buttonDestructive,
                disabled && styles.buttonDisabled
            ]}
            onPress={onPress}
            disabled={disabled || loading}
        >
            {loading ? (
                <ActivityIndicator color={variant === 'bordered' ? Colors.primary : '#FFF'} />
            ) : (
                <RNText style={[
                    styles.buttonText,
                    variant === 'bordered' && styles.buttonTextOutline,
                    destructive && styles.buttonTextDestructive
                ]}>
                    {children}
                </RNText>
            )}
        </TouchableOpacity>
    );
};

interface SwiftUIModalVStackProps {
    children: React.ReactNode;
    spacing?: number;
    padding?: number;
}

export const SwiftUIModalVStack: React.FC<SwiftUIModalVStackProps> = ({
    children,
    spacing = 16,
    padding = 20
}) => {
    if (Platform.OS === 'ios' && VStack) {
        return <VStack spacing={spacing} padding={padding}>{children}</VStack>;
    }
    // Android fallback
    return (
        <View style={[styles.vstack, { gap: spacing, padding }]}>
            {children}
        </View>
    );
};

interface SwiftUIModalHStackProps {
    children: React.ReactNode;
    spacing?: number;
}

export const SwiftUIModalHStack: React.FC<SwiftUIModalHStackProps> = ({
    children,
    spacing = 12
}) => {
    if (Platform.OS === 'ios' && HStack) {
        return <HStack spacing={spacing}>{children}</HStack>;
    }
    // Android fallback
    return (
        <View style={[styles.hstack, { gap: spacing }]}>
            {children}
        </View>
    );
};

interface SwiftUIModalDetailRowProps {
    label: string;
    value: string;
}

export const SwiftUIModalDetailRow: React.FC<SwiftUIModalDetailRowProps> = ({ label, value }) => {
    if (Platform.OS === 'ios' && HStack && Text) {
        return (
            <HStack>
                <Text color="secondary">{label}</Text>
                <Spacer />
                <Text>{value}</Text>
            </HStack>
        );
    }
    // Android fallback
    const themeColors = useThemeColors();
    return (
        <View style={styles.detailRow}>
            <RNText style={[styles.detailLabel, { color: themeColors.textSecondary }]}>{label}</RNText>
            <RNText style={[styles.detailValue, { color: themeColors.textPrimary }]}>{value}</RNText>
        </View>
    );
};

interface SwiftUIModalDividerProps { }

export const SwiftUIModalDivider: React.FC<SwiftUIModalDividerProps> = () => {
    if (Platform.OS === 'ios') {
        // SwiftUI handles dividers automatically in List, but we can use a simple view
        return <View style={styles.divider} />;
    }
    return <View style={styles.divider} />;
};

// ============ Styles for Android fallback ============

const styles = StyleSheet.create({
    title: {
        fontSize: 24,
        fontFamily: 'GoogleSansFlex_700Bold',
        color: Colors.textPrimary,
        marginBottom: 8,
    },
    text: {
        fontSize: 16,
        fontFamily: 'GoogleSansFlex_400Regular',
        color: Colors.textPrimary,
    },
    textSecondary: {
        color: Colors.textSecondary,
    },
    button: {
        backgroundColor: Colors.primary,
        paddingVertical: 14,
        paddingHorizontal: 24,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 48,
    },
    buttonOutline: {
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        borderColor: Colors.primary,
    },
    buttonDestructive: {
        backgroundColor: '#EF4444',
    },
    buttonDisabled: {
        opacity: 0.5,
    },
    buttonText: {
        fontSize: 16,
        fontFamily: 'GoogleSansFlex_600SemiBold',
        color: '#FFFFFF',
    },
    buttonTextOutline: {
        color: Colors.primary,
    },
    buttonTextDestructive: {
        color: '#FFFFFF',
    },
    vstack: {
        flexDirection: 'column',
    },
    hstack: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    detailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
    },
    detailLabel: {
        fontSize: 15,
        fontFamily: 'GoogleSansFlex_500Medium',
        color: Colors.textSecondary,
    },
    detailValue: {
        fontSize: 15,
        fontFamily: 'GoogleSansFlex_500Medium',
        color: Colors.textPrimary,
        textAlign: 'right',
        flex: 1,
        marginLeft: 16,
    },
    divider: {
        height: 1,
        backgroundColor: 'rgba(0,0,0,0.1)',
        marginVertical: 4,
    },
});

export default {
    SwiftUIModalTitle,
    SwiftUIModalText,
    SwiftUIModalButton,
    SwiftUIModalVStack,
    SwiftUIModalHStack,
    SwiftUIModalDetailRow,
    SwiftUIModalDivider,
};
