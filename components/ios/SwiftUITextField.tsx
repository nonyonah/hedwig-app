import React, { useState } from 'react';
import { Platform, TextInput, StyleSheet, View, Text, TextInputProps } from 'react-native';
import { Colors, useThemeColors } from '../../theme/colors';

// Try to import TextField from @expo/ui/swift-ui
let TextField: any = null;
if (Platform.OS === 'ios') {
    try {
        const swiftUI = require('@expo/ui/swift-ui');
        TextField = swiftUI.TextField;
    } catch (e) {
        // Ignore
    }
}

interface SwiftUITextFieldProps extends TextInputProps {
    label?: string;
    error?: string;
}

export const SwiftUITextField: React.FC<SwiftUITextFieldProps> = ({
    label,
    error,
    style,
    ...props
}) => {
    const themeColors = useThemeColors();

    return (
        <View style={styles.container}>
            {label && <Text style={[styles.label, { color: themeColors.textSecondary }]}>{label}</Text>}
            <TextInput
                style={[
                    styles.input,
                    {
                        backgroundColor: 'rgba(128, 128, 128, 0.08)',
                        color: themeColors.textPrimary
                    },
                    props.multiline && styles.textArea,
                    error && styles.inputError,
                    style
                ]}
                placeholderTextColor={themeColors.textTertiary || '#8E8E93'}
                {...props}
            />
            {error && <Text style={styles.errorText}>{error}</Text>}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginBottom: 16,
        width: '100%',
    },
    label: {
        fontSize: 13,
        fontFamily: 'GoogleSansFlex_600SemiBold',
        color: Colors.textSecondary,
        marginBottom: 8,
        marginLeft: 4,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    input: {
        backgroundColor: 'rgba(128, 128, 128, 0.08)',
        borderRadius: 10,
        paddingHorizontal: 16,
        paddingVertical: 12,
        fontSize: 17,
        fontFamily: 'GoogleSansFlex_400Regular',
        color: Colors.textPrimary,
        borderWidth: 0,
    },
    inputError: {
        borderWidth: 1,
        borderColor: '#FF3B30',
        backgroundColor: 'rgba(255, 59, 48, 0.1)',
    },
    textArea: {
        minHeight: 100,
        textAlignVertical: 'top',
    },
    errorText: {
        marginTop: 4,
        marginLeft: 4,
        fontSize: 13,
        color: '#FF3B30',
    },
});

export default SwiftUITextField;

