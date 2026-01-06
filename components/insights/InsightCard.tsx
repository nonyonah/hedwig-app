import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { Link } from 'expo-router'; // Or use useRouter for programmatic navigation
import { CaretRight } from 'phosphor-react-native';
import { Colors } from '../../theme/colors';
import { Typography } from '../../styles/typography';
import { Insight } from '../../hooks/useInsights';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols'; // Assuming we have access or fallback

const { width } = Dimensions.get('window');
const CARD_WIDTH = width * 0.85; // Partial width for carousel effect

interface InsightCardProps {
    insight: Insight;
    onPress?: () => void;
}

export const InsightCard: React.FC<InsightCardProps> = ({ insight, onPress }) => {

    const handlePress = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (onPress) onPress();
        // If we had a router here we could push specific routes
    };

    // Helper for icons (using emoji fallback if SymbolView isn't configured for custom SF names easily)
    // For now, let's assume we pass emojis or simple icon components. 
    // The hook passed SF Symbol names like "chart.bar.fill". 
    // We can swap this with phosphor icons map if needed, or use a helper.

    // Simple icon mapping for demo:
    const renderIcon = () => {
        // You might use specific Phosphor icons based on 'insight.type' or 'insight.icon' string matching
        // Or if you are using expo-symbols for SF Symbols on iOS.
        // For simplicity in this step, let's use a generic container with the type color.
        return (
            <View style={[styles.iconContainer, { backgroundColor: insight.color + '20' }]}>
                {/* Placeholders for actual icons - ideally map insight.icon string to Phosphor */}
                <Text style={{ fontSize: 20 }}>{insight.type === 'earnings' ? '💰' : insight.type === 'invoice' ? '📄' : '⭐'}</Text>
            </View>
        );
    };

    return (
        <TouchableOpacity
            activeOpacity={0.9}
            onPress={handlePress}
            style={styles.container}
        >
            <BlurView intensity={20} tint="light" style={styles.blurContainer}>
                <View style={[styles.accentLine, { backgroundColor: insight.color }]} />

                <View style={styles.content}>
                    <View style={styles.header}>
                        {renderIcon()}
                        <View style={styles.headerText}>
                            <Text style={styles.title}>{insight.title}</Text>
                            <Text style={styles.timestamp}>Just now</Text>
                        </View>
                    </View>

                    <Text style={styles.description} numberOfLines={2}>
                        {insight.description}
                    </Text>

                    {insight.actionLabel && (
                        <View style={styles.footer}>
                            <Text style={[styles.actionText, { color: insight.color }]}>
                                {insight.actionLabel}
                            </Text>
                            <CaretRight size={14} color={insight.color} weight="bold" />
                        </View>
                    )}
                </View>
            </BlurView>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    container: {
        width: CARD_WIDTH,
        marginRight: 12,
        borderRadius: 20,
        overflow: 'hidden',
        backgroundColor: 'rgba(255, 255, 255, 0.6)',
        // Shadow for depth
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 4,
        },
        shadowOpacity: 0.05,
        shadowRadius: 12,
        elevation: 5,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.4)',
    },
    blurContainer: {
        padding: 16,
        paddingLeft: 20, // Space for accent line
        minHeight: 140,
        justifyContent: 'space-between',
    },
    accentLine: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 4,
    },
    content: {
        flex: 1,
        gap: 12,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 4,
    },
    iconContainer: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerText: {
        flex: 1,
    },
    title: {
        ...Typography.h4,
        fontSize: 16,
        color: Colors.textPrimary,
    },
    timestamp: {
        ...Typography.caption,
        color: Colors.textTertiary,
        fontSize: 11,
    },
    description: {
        ...Typography.body,
        fontSize: 14,
        color: Colors.textSecondary,
        lineHeight: 20,
    },
    footer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 4,
    },
    actionText: {
        ...Typography.caption,
        fontSize: 13,
        fontWeight: '600',
    },
});
