import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { usePrivy } from '@privy-io/expo';

import { useThemeColors } from '../../theme/colors';
import { joinApiUrl } from '../../utils/apiBaseUrl';
import IOSGlassIconButton from '../ui/IOSGlassIconButton';
import { Sparkles, X } from '../ui/AppIcon';

const QUESTIONS = [
    'Where did my money go?',
    'What can I afford to spend?',
    'Which clients pay fastest?',
    'Any invoices due soon?',
];

interface AiBriefCardProps {
    visible: boolean;
    range?: string;
    onDismiss: () => void;
}

/**
 * Event-gated AI Brief. Rendered only when the feed has enough activity
 * (gate enforced by the parent at >= 5 entries). Frames the user's month
 * into a short narrative plus four follow-up questions.
 */
export function AiBriefCard({ visible, range = '30d', onDismiss }: AiBriefCardProps) {
    const themeColors = useThemeColors();
    const router = useRouter();
    const { getAccessToken } = usePrivy();

    const [narrative, setNarrative] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const loadNarrative = useCallback(async () => {
        if (!visible || narrative !== null) return;
        setLoading(true);
        try {
            const token = await getAccessToken();
            if (!token) return;
            const response = await fetch(joinApiUrl(`/api/revenue/ledger/narrative?range=${range}`), {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            const result = await response.json();
            if (response.ok && result?.success && result.data?.narrative) {
                setNarrative(String(result.data.narrative));
            }
        } catch {
            // AI Brief is display-only; never fail the feed
        } finally {
            setLoading(false);
        }
    }, [visible, narrative, range, getAccessToken]);

    useEffect(() => {
        if (visible) void loadNarrative();
    }, [visible, loadNarrative]);

    if (!visible) return null;

    return (
        <View style={[styles.card, { backgroundColor: themeColors.surface }]}>
            <View style={styles.headerRow}>
                <View style={styles.titleWrap}>
                    <View style={[styles.sparkleWrap, { backgroundColor: themeColors.primaryLight }]}>
                        <Sparkles size={16} color={themeColors.primary} strokeWidth={2.2} />
                    </View>
                    <Text style={[styles.title, { color: themeColors.textPrimary }]}>AI Brief</Text>
                </View>
                <IOSGlassIconButton
                    onPress={onDismiss}
                    systemImage="xmark"
                    circleStyle={styles.dismissCircle}
                    icon={<X size={14} color={themeColors.textSecondary} strokeWidth={3} />}
                />
            </View>

            {loading && !narrative ? (
                <View style={styles.loadingRow}>
                    <ActivityIndicator size="small" color={themeColors.primary} />
                    <Text style={[styles.loadingText, { color: themeColors.textSecondary }]}>
                        Briefing your month…
                    </Text>
                </View>
            ) : narrative ? (
                <Text style={[styles.narrative, { color: themeColors.textPrimary }]}>{narrative}</Text>
            ) : null}

            <View style={styles.questionsGrid}>
                {QUESTIONS.map((q) => (
                    <TouchableOpacity
                        key={q}
                        style={[styles.questionChip, { backgroundColor: themeColors.background }]}
                        onPress={() => router.push('/insights' as never)}
                        activeOpacity={0.8}
                    >
                        <Text style={[styles.questionText, { color: themeColors.textPrimary }]} numberOfLines={2}>
                            {q}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        borderRadius: 20,
        padding: 16,
        marginTop: 16,
        gap: 12,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    titleWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    sparkleWrap: {
        width: 28,
        height: 28,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        fontSize: 16,
        fontWeight: '700',
        letterSpacing: -0.2,
    },
    dismissCircle: {
        width: 30,
        height: 30,
        borderRadius: 15,
    },
    loadingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    loadingText: {
        fontSize: 13,
    },
    narrative: {
        fontSize: 14,
        lineHeight: 20,
    },
    questionsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    questionChip: {
        flexBasis: '47%',
        flexGrow: 1,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    questionText: {
        fontSize: 13,
        fontWeight: '600',
        lineHeight: 17,
    },
});