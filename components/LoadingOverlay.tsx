import React from 'react';
import { View, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { BlurView } from 'expo-blur';

interface LoadingOverlayProps {
    visible: boolean;
}

export function LoadingOverlay({ visible }: LoadingOverlayProps) {
    if (!visible) return null;

    return (
        <View style={styles.container}>
            {Platform.OS === 'ios' ? (
                <BlurView intensity={60} tint="light" style={StyleSheet.absoluteFill} />
            ) : (
                <View style={[StyleSheet.absoluteFill, styles.androidBlur]} />
            )}
            <View style={styles.loaderContainer}>
                <ActivityIndicator size="large" color="#60A5FA" />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 9999,
    },
    androidBlur: {
        backgroundColor: 'rgba(255, 255, 255, 0.85)',
    },
    loaderContainer: {
        width: 80,
        height: 80,
        borderRadius: 16,
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 5,
    },
});
