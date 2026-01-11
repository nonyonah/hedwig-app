/**
 * Modal UI Components
 * 
 * Reusable styled components for modals that match PlatformModal design:
 * - iOS: Liquid Glass styling with proper theming
 * - Android: Material Expressive with elevation
 */

import React from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Platform,
    ActivityIndicator,
    ViewStyle,
    TextStyle
} from 'react-native';
import { X } from 'phosphor-react-native';
import { Colors, useThemeColors } from '../../theme/colors';

/**
 * Modal Header with title and close button
 */
interface ModalHeaderProps {
    title: string;
    onClose: () => void;
    showCloseButton?: boolean;
}

export const ModalHeader: React.FC<ModalHeaderProps> = ({
    title,
    onClose,
    showCloseButton = true
}) => {
    const themeColors = useThemeColors();

    return (
        <View style={styles.header}>
            <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]}>
                {title}
            </Text>
            {showCloseButton && (
                <TouchableOpacity
                    style={[styles.closeButton, { backgroundColor: themeColors.surface }]}
                    onPress={onClose}
                >
                    <X size={20} color={themeColors.textSecondary} weight="bold" />
                </TouchableOpacity>
            )}
        </View>
    );
};

/**
 * Modal Card for grouping content
 */
interface ModalCardProps {
    children: React.ReactNode;
    style?: ViewStyle;
}

export const ModalCard: React.FC<ModalCardProps> = ({ children, style }) => {
    const themeColors = useThemeColors();

    return (
        <View style={[styles.card, { backgroundColor: themeColors.surface }, style]}>
            {children}
        </View>
    );
};

/**
 * Modal Detail Row (label + value)
 */
interface ModalDetailRowProps {
    label: string;
    value: string | React.ReactNode;
    style?: ViewStyle;
}

export const ModalDetailRow: React.FC<ModalDetailRowProps> = ({ label, value, style }) => {
    const themeColors = useThemeColors();

    return (
        <View style={[styles.detailRow, style]}>
            <Text style={[styles.detailLabel, { color: themeColors.textSecondary }]}>
                {label}
            </Text>
            {typeof value === 'string' ? (
                <Text style={[styles.detailValue, { color: themeColors.textPrimary }]}>
                    {value}
                </Text>
            ) : (
                value
            )}
        </View>
    );
};

/**
 * Modal Button - Primary and Secondary variants
 */
interface ModalButtonProps {
    title: string;
    onPress: () => void;
    variant?: 'primary' | 'secondary' | 'outline';
    loading?: boolean;
    disabled?: boolean;
    icon?: React.ReactNode;
    style?: ViewStyle;
}

export const ModalButton: React.FC<ModalButtonProps> = ({
    title,
    onPress,
    variant = 'primary',
    loading = false,
    disabled = false,
    icon,
    style
}) => {
    const themeColors = useThemeColors();

    const buttonStyles: ViewStyle[] = [styles.button];
    const textStyles: TextStyle[] = [styles.buttonText];

    switch (variant) {
        case 'primary':
            buttonStyles.push(styles.buttonPrimary);
            textStyles.push(styles.buttonTextPrimary);
            break;
        case 'secondary':
            buttonStyles.push(styles.buttonSecondary, { backgroundColor: themeColors.surface });
            textStyles.push(styles.buttonTextSecondary);
            break;
        case 'outline':
            buttonStyles.push(styles.buttonOutline, { borderColor: themeColors.border });
            textStyles.push(styles.buttonTextOutline, { color: themeColors.textPrimary });
            break;
    }

    if (disabled) {
        buttonStyles.push(styles.buttonDisabled);
    }

    return (
        <TouchableOpacity
            style={[...buttonStyles, style]}
            onPress={onPress}
            disabled={disabled || loading}
            activeOpacity={0.8}
        >
            {loading ? (
                <ActivityIndicator
                    color={variant === 'primary' ? '#FFFFFF' : Colors.primary}
                    size="small"
                />
            ) : (
                <>
                    {icon && <View style={styles.buttonIcon}>{icon}</View>}
                    <Text style={textStyles}>{title}</Text>
                </>
            )}
        </TouchableOpacity>
    );
};

/**
 * Modal Divider
 */
export const ModalDivider: React.FC = () => {
    const themeColors = useThemeColors();
    return <View style={[styles.divider, { backgroundColor: themeColors.border }]} />;
};

/**
 * Modal Content Container - provides standard padding
 */
interface ModalContentProps {
    children: React.ReactNode;
    style?: ViewStyle;
}

export const ModalContent: React.FC<ModalContentProps> = ({ children, style }) => {
    return (
        <View style={[styles.content, style]}>
            {children}
        </View>
    );
};

const styles = StyleSheet.create({
    // Header
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 16,
    },
    headerTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 20,
        color: Colors.textPrimary,
    },
    closeButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#F3F4F6',
        justifyContent: 'center',
        alignItems: 'center',
    },

    // Card
    card: {
        backgroundColor: '#F9FAFB',
        borderRadius: 16,
        padding: 16,
    },

    // Detail Row
    detailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 8,
    },
    detailLabel: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 14,
        color: Colors.textSecondary,
    },
    detailValue: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 14,
        color: Colors.textPrimary,
        maxWidth: '60%',
        textAlign: 'right',
    },

    // Button
    button: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 16,
        borderRadius: 30,
        gap: 8,
    },
    buttonPrimary: {
        backgroundColor: Colors.primary,
    },
    buttonSecondary: {
        backgroundColor: '#F3F4F6',
    },
    buttonOutline: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    buttonDisabled: {
        opacity: 0.5,
    },
    buttonText: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 16,
    },
    buttonTextPrimary: {
        color: '#FFFFFF',
    },
    buttonTextSecondary: {
        color: Colors.primary,
    },
    buttonTextOutline: {
        color: Colors.textPrimary,
    },
    buttonIcon: {
        marginRight: 4,
    },

    // Divider
    divider: {
        height: 1,
        backgroundColor: '#E5E7EB',
        marginVertical: 16,
    },

    // Content
    content: {
        flex: 1,
        paddingHorizontal: 20,
        paddingBottom: Platform.OS === 'ios' ? 24 : 20,
    },
});

export default {
    ModalHeader,
    ModalCard,
    ModalDetailRow,
    ModalButton,
    ModalDivider,
    ModalContent,
};
