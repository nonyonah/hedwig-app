import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Minus, Plus, CaretLeft } from 'phosphor-react-native';
import { Colors, useThemeColors } from '../../theme/colors';
import { usePrivy } from '@privy-io/expo';

const PRESETS = [
    { label: 'Starter', value: 1000 },
    { label: 'Growing', value: 5000 },
    { label: 'Established', value: 10000 },
];

export default function GoalScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const themeColors = useThemeColors();
    const { getAccessToken } = usePrivy();

    const [target, setTarget] = useState(5000);
    const [selectedPreset, setSelectedPreset] = useState<string | null>('Growing');
    const [loading, setLoading] = useState(false);

    const adjustTarget = (amount: number) => {
        const newValue = Math.max(0, target + amount);
        setTarget(newValue);
        // Clear preset selection when manually adjusting
        const matchingPreset = PRESETS.find(p => p.value === newValue);
        setSelectedPreset(matchingPreset?.label || null);
    };

    const selectPreset = (preset: typeof PRESETS[0]) => {
        setTarget(preset.value);
        setSelectedPreset(preset.label);
    };

    const formatNumber = (num: number) => {
        return num.toLocaleString('en-US');
    };

    const handleSetGoal = async () => {
        setLoading(true);
        try {
            const token = await getAccessToken();
            if (token) {
                const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
                await fetch(`${apiUrl}/api/users/profile`, {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ monthlyTarget: target })
                });
            }
        } catch (error) {
            console.error('Failed to save monthly target:', error);
        } finally {
            setLoading(false);
            router.replace('/auth/biometrics');
        }
    };

    return (
        <View style={[styles.container, { paddingTop: insets.top, backgroundColor: themeColors.background }]}>
            {/* Back button on its own row */}
            <TouchableOpacity style={styles.backButtonRow} onPress={() => router.back()}>
                <CaretLeft size={24} color={themeColors.textPrimary} weight="bold" />
            </TouchableOpacity>

            {/* Title */}
            <View style={styles.titleContainer}>
                <Text style={[styles.title, { color: themeColors.textPrimary }]}>
                    Your Monthly Earnings Goal
                </Text>
                <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
                    Set a goal based on how much you'd like to earn each month.
                </Text>
            </View>

            {/* Preset Chips */}
            <View style={styles.presetsContainer}>
                {PRESETS.map((preset) => (
                    <TouchableOpacity
                        key={preset.label}
                        style={[
                            styles.presetChip,
                            { backgroundColor: themeColors.surface },
                            selectedPreset === preset.label && styles.presetChipSelected
                        ]}
                        onPress={() => selectPreset(preset)}
                        activeOpacity={0.7}
                    >
                        <Text style={[
                            styles.presetChipText,
                            { color: themeColors.textPrimary },
                            selectedPreset === preset.label && styles.presetChipTextSelected
                        ]}>
                            {preset.label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Target Adjuster */}
            <View style={styles.targetContainer}>
                <TouchableOpacity
                    onPress={() => adjustTarget(-100)}
                    onLongPress={() => adjustTarget(-1000)}
                    style={styles.adjustButton}
                    activeOpacity={0.7}
                >
                    <Minus size={28} color="#FFFFFF" weight="bold" />
                </TouchableOpacity>

                <View style={styles.valueContainer}>
                    <Text style={[styles.value, { color: themeColors.textPrimary }]}>
                        {formatNumber(target)}
                    </Text>
                    <Text style={[styles.unit, { color: themeColors.textSecondary }]}>
                        USD/MONTH
                    </Text>
                </View>

                <TouchableOpacity
                    onPress={() => adjustTarget(100)}
                    onLongPress={() => adjustTarget(1000)}
                    style={styles.adjustButton}
                    activeOpacity={0.7}
                >
                    <Plus size={28} color="#FFFFFF" weight="bold" />
                </TouchableOpacity>
            </View>

            {/* Spacer */}
            <View style={{ flex: 1 }} />

            {/* Set Goal Button */}
            <View style={[styles.buttonContainer, { paddingBottom: insets.bottom + 16 }]}>
                <TouchableOpacity
                    style={[styles.setGoalButton, { backgroundColor: Colors.primary }]}
                    onPress={handleSetGoal}
                    activeOpacity={0.8}
                    disabled={loading}
                >
                    {loading ? (
                        <ActivityIndicator color="#FFFFFF" />
                    ) : (
                        <Text style={[styles.setGoalButtonText, { color: '#FFFFFF' }]}>
                            Set Goal
                        </Text>
                    )}
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingHorizontal: 24,
    },
    backButtonRow: {
        paddingVertical: 12,
        marginLeft: -4,
        alignSelf: 'flex-start',
    },
    titleContainer: {
        alignItems: 'flex-start',
        marginBottom: 32,
    },
    title: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 28,
        lineHeight: 36,
        textAlign: 'left',
        marginBottom: 12,
    },
    subtitle: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 16,
        lineHeight: 24,
        textAlign: 'left',
    },
    presetsContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 12,
        marginBottom: 48,
    },
    presetChip: {
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 20,
    },
    presetChipSelected: {
        backgroundColor: Colors.primary,
    },
    presetChipText: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 15,
    },
    presetChipTextSelected: {
        color: '#FFFFFF',
    },
    targetContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
    },
    adjustButton: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: Colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
    },
    valueContainer: {
        alignItems: 'center',
        minWidth: 140,
    },
    value: {
        fontFamily: 'GoogleSansFlex_300Light',
        fontSize: 72,
        lineHeight: 80,
    },
    unit: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 14,
        letterSpacing: 1,
        marginTop: 4,
    },
    buttonContainer: {
        paddingHorizontal: 8,
    },
    setGoalButton: {
        height: 56,
        borderRadius: 28,
        justifyContent: 'center',
        alignItems: 'center',
    },
    setGoalButtonText: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 17,
    },
});
