import React from 'react';
import { Platform, StyleSheet, View, TouchableOpacity, Text } from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';

interface LiquidGlassTabBarProps {
    tabs: Array<{
        name: string;
        title: string;
        systemImage: string;
    }>;
    activeTab: string;
    onTabChange: (tabName: string) => void;
}

/**
 * iOS Liquid Glass Tab Bar
 * 
 * Uses BlurView for glass effect since TabView is not available in SDK 54.
 * Features:
 * - Blur background with vibrancy
 * - Haptic feedback on tab selection
 * - Smooth transitions between tabs
 */
export function LiquidGlassTabBar({ tabs, activeTab, onTabChange }: LiquidGlassTabBarProps) {
    if (Platform.OS !== 'ios') return null;

    const handleTabPress = (tabName: string) => {
        if (tabName !== activeTab) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onTabChange(tabName);
        }
    };

    return (
        <View style={styles.container}>
            <BlurView intensity={80} tint="light" style={styles.blurContainer}>
                <View style={styles.tabsRow}>
                    {tabs.map((tab) => {
                        const isActive = tab.name === activeTab;
                        return (
                            <TouchableOpacity
                                key={tab.name}
                                style={[styles.tabButton, isActive && styles.activeTab]}
                                onPress={() => handleTabPress(tab.name)}
                                activeOpacity={0.7}
                            >
                                <Text style={[styles.tabTitle, isActive && styles.activeTabTitle]}>
                                    {tab.title}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </BlurView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 90,
    },
    blurContainer: {
        flex: 1,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        overflow: 'hidden',
    },
    tabsRow: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
        paddingBottom: 20,
    },
    tabButton: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 12,
    },
    activeTab: {
        backgroundColor: 'rgba(0, 122, 255, 0.15)',
    },
    tabTitle: {
        fontSize: 12,
        fontWeight: '500',
        color: '#8E8E93',
    },
    activeTabTitle: {
        color: '#007AFF',
        fontWeight: '600',
    },
});

export default LiquidGlassTabBar;
