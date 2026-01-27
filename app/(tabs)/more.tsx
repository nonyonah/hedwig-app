
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useThemeColors } from '../../theme/colors';

export default function PlaceholderScreen() {
    const themeColors = useThemeColors();
    return (
        <View style={[styles.container, { backgroundColor: themeColors.background }]}>
            <Text style={[styles.text, { color: themeColors.textPrimary }]}>Coming Soon</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    text: {
        fontSize: 18,
        fontWeight: '600',
    },
});
