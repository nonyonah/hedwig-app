import React from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
} from 'react-native';
import { Colors } from '../theme/colors';
import type { Suggestion } from '../hooks/useUserActions';

interface SuggestionChipsProps {
    suggestions: Suggestion[];
    onSuggestionPress: (suggestion: Suggestion) => void;
}

export function SuggestionChips({ suggestions, onSuggestionPress }: SuggestionChipsProps) {
    if (!suggestions || suggestions.length === 0) return null;

    return (
        <View style={styles.container}>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
            >
                {suggestions.map((suggestion) => (
                    <TouchableOpacity
                        key={suggestion.id}
                        style={styles.chip}
                        onPress={() => onSuggestionPress(suggestion)}
                        activeOpacity={0.7}
                    >
                        {suggestion.icon && (
                            <Text style={styles.chipIcon}>{suggestion.icon}</Text>
                        )}
                        <Text style={styles.chipText}>{suggestion.label}</Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginBottom: 8,
    },
    scrollContent: {
        paddingHorizontal: 4,
        gap: 8,
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f5f5f5',
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 20,
        gap: 6,
    },
    chipIcon: {
        fontSize: 14,
    },
    chipText: {
        fontFamily: 'RethinkSans_500Medium',
        fontSize: 13,
        color: Colors.textPrimary,
    },
});
