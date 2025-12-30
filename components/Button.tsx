import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle, TextStyle } from 'react-native';
import { Colors } from '../theme/colors';

interface ButtonProps {
    title: string;
    onPress: () => void;
    variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
    size?: 'small' | 'medium' | 'large';
    loading?: boolean;
    disabled?: boolean;
    icon?: React.ReactNode;
    iconPosition?: 'left' | 'right';
    style?: ViewStyle;
    textStyle?: TextStyle;
    fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
    title,
    onPress,
    variant = 'primary',
    size = 'medium',
    loading = false,
    disabled = false,
    icon,
    iconPosition = 'left',
    style,
    textStyle,
    fullWidth = true,
}) => {
    const getButtonStyle = (): ViewStyle[] => {
        const baseStyle: ViewStyle[] = [styles.button];

        // Variant styles
        switch (variant) {
            case 'primary':
                baseStyle.push(styles.primaryButton);
                break;
            case 'secondary':
                baseStyle.push(styles.secondaryButton);
                break;
            case 'outline':
                baseStyle.push(styles.outlineButton);
                break;
            case 'ghost':
                baseStyle.push(styles.ghostButton);
                break;
        }

        // Size styles
        switch (size) {
            case 'small':
                baseStyle.push(styles.smallButton);
                break;
            case 'medium':
                baseStyle.push(styles.mediumButton);
                break;
            case 'large':
                baseStyle.push(styles.largeButton);
                break;
        }

        // Full width
        if (fullWidth) {
            baseStyle.push(styles.fullWidth);
        }

        // Disabled state
        if (disabled || loading) {
            baseStyle.push(styles.disabledButton);
        }

        return baseStyle;
    };

    const getTextStyle = (): TextStyle[] => {
        const baseTextStyle: TextStyle[] = [styles.buttonText];

        // Variant text styles
        switch (variant) {
            case 'primary':
                baseTextStyle.push(styles.primaryText);
                break;
            case 'secondary':
                baseTextStyle.push(styles.secondaryText);
                break;
            case 'outline':
                baseTextStyle.push(styles.outlineText);
                break;
            case 'ghost':
                baseTextStyle.push(styles.ghostText);
                break;
        }

        // Size text styles
        switch (size) {
            case 'small':
                baseTextStyle.push(styles.smallText);
                break;
            case 'medium':
                baseTextStyle.push(styles.mediumText);
                break;
            case 'large':
                baseTextStyle.push(styles.largeText);
                break;
        }

        return baseTextStyle;
    };

    return (
        <TouchableOpacity
            style={[...getButtonStyle(), style]}
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
                    {icon && iconPosition === 'left' && icon}
                    <Text style={[...getTextStyle(), textStyle]}>{title}</Text>
                    {icon && iconPosition === 'right' && icon}
                </>
            )}
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    // Base button style
    button: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 30,
        gap: 8,
    },

    // Full width
    fullWidth: {
        width: '100%',
    },

    // Variant styles
    primaryButton: {
        backgroundColor: Colors.primary,
    },
    secondaryButton: {
        backgroundColor: '#EEF2FF',
    },
    outlineButton: {
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        borderColor: Colors.primary,
    },
    ghostButton: {
        backgroundColor: 'transparent',
    },

    // Size styles
    smallButton: {
        paddingVertical: 10,
        paddingHorizontal: 16,
    },
    mediumButton: {
        paddingVertical: 14,
        paddingHorizontal: 24,
    },
    largeButton: {
        paddingVertical: 16,
        paddingHorizontal: 32,
    },

    // Disabled state
    disabledButton: {
        opacity: 0.6,
    },

    // Base text style
    buttonText: {
        fontFamily: 'RethinkSans_600SemiBold',
        textAlign: 'center',
    },

    // Variant text styles
    primaryText: {
        color: '#FFFFFF',
    },
    secondaryText: {
        color: Colors.primary,
    },
    outlineText: {
        color: Colors.primary,
    },
    ghostText: {
        color: Colors.primary,
    },

    // Size text styles
    smallText: {
        fontSize: 14,
    },
    mediumText: {
        fontSize: 15,
    },
    largeText: {
        fontSize: 16,
    },
});

export default Button;
