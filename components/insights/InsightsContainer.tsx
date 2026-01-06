import React from 'react';
import { View, StyleSheet, ScrollView, Text, ActivityIndicator } from 'react-native';
import { useInsights } from '../../hooks/useInsights';
import { InsightCard } from './InsightCard';
import { Colors } from '../../theme/colors';
import { Typography } from '../../styles/typography';

export const InsightsContainer: React.FC = () => {
    const { insights, loading } = useInsights();

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color={Colors.textTertiary} />
            </View>
        );
    }

    if (!insights || insights.length === 0) {
        return null; // Or return a "Good job, you're all caught up!" empty state
    }

    const handleInsightPress = (route?: string) => {
        if (!route) return;
        console.log(`[Insights] Navigate to ${route}`);
        // router.push(route); 
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.sectionTitle}>Insights</Text>
            </View>

            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
                decelerationRate="fast"
                snapToInterval={Dimensions.get('window').width * 0.85 + 12} // Card width + margin
                snapToAlignment="start"
            >
                {insights.map((insight) => (
                    <InsightCard
                        key={insight.id}
                        insight={insight}
                        onPress={() => handleInsightPress(insight.actionRoute)}
                    />
                ))}
            </ScrollView>
        </View>
    );
};

// Need to import Dimensions for snapToInterval logic
import { Dimensions } from 'react-native';

const styles = StyleSheet.create({
    container: {
        marginBottom: 24,
    },
    header: {
        paddingHorizontal: 20,
        marginBottom: 12,
    },
    sectionTitle: {
        ...Typography.h3,
        fontSize: 18,
        color: Colors.textPrimary,
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingBottom: 8, // Allow for shadow
    },
    loadingContainer: {
        height: 160,
        justifyContent: 'center',
        alignItems: 'center',
    },
});
