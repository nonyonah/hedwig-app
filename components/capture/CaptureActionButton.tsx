import React, { useCallback, useRef } from 'react';
import {
    Platform,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TrueSheet } from '@hedwig/true-sheet';

import { useThemeColors } from '../../theme/colors';
import IOSGlassIconButton from '../ui/IOSGlassIconButton';
import { Coins, Pencil, Plus, Receipt, ScanLine, X } from '../ui/AppIcon';

type CaptureOption = {
    key: string;
    label: string;
    subtitle: string;
    icon: React.ReactNode;
    route: () => void;
};

/**
 * Global capture affordance (FAB) floating above the native tab bar.
 * Opens a bottom sheet with the unified "add money" entry points:
 * scan a document, type the details, request money, or record an expense.
 */
export function CaptureActionButton() {
    const router = useRouter();
    const themeColors = useThemeColors();
    const insets = useSafeAreaInsets();
    const sheetRef = useRef<TrueSheet | null>(null);

    const dismiss = useCallback(() => {
        sheetRef.current?.dismiss();
    }, []);

    const navigate = useCallback(
        (path: string) => {
            dismiss();
            router.push(path as never);
        },
        [router],
    );

    const options: CaptureOption[] = [
        {
            key: 'scan',
            label: 'Scan a receipt',
            subtitle: 'Photo, invoice, or statement',
            icon: <ScanLine size={22} color={themeColors.primary} strokeWidth={2.1} />,
            route: () => navigate('/capture'),
        },
        {
            key: 'manual',
            label: 'Type it instead',
            subtitle: 'Enter the details manually',
            icon: <Pencil size={22} color={themeColors.primary} strokeWidth={2.1} />,
            route: () => navigate('/capture?manual=1'),
        },
        {
            key: 'request',
            label: 'Request money',
            subtitle: 'Send an invoice or payment link',
            icon: <Coins size={22} color={themeColors.primary} strokeWidth={2.1} />,
            route: () => navigate('/invoice/create'),
        },
        {
            key: 'expense',
            label: 'Add an expense',
            subtitle: 'Record money you’ve spent',
            icon: <Receipt size={22} color={themeColors.primary} strokeWidth={2.1} />,
            route: () => navigate('/capture?mode=expense'),
        },
    ];

    return (
        <View
            pointerEvents="box-none"
            style={[styles.overlay, { paddingBottom: insets.bottom + 16 }]}
        >
            <Pressable
                accessibilityLabel="Add money"
                accessibilityRole="button"
                onPress={() => sheetRef.current?.present()}
                style={({ pressed }) => [
                    styles.fab,
                    { backgroundColor: themeColors.primary },
                    pressed && styles.fabPressed,
                ]}
            >
                <Plus size={30} color="#FFFFFF" strokeWidth={2.4} />
            </Pressable>

            <TrueSheet
                ref={sheetRef}
                detents={[0.45]}
                cornerRadius={Platform.OS === 'ios' ? 50 : 24}
                {...(Platform.OS === 'ios'
                    ? { backgroundBlur: 'regular' as const }
                    : { backgroundColor: themeColors.background })}
                grabber={true}
            >
                <View style={styles.sheetContent}>
                    <View style={styles.sheetHeader}>
                        <View style={styles.sheetHeaderText}>
                            <Text style={[styles.sheetTitle, { color: themeColors.textPrimary }]}>
                                What are you adding?
                            </Text>
                            <Text style={[styles.sheetSubtitle, { color: themeColors.textSecondary }]}>
                                Hedwig turns it into a ledger-ready record
                            </Text>
                        </View>
                        <IOSGlassIconButton
                            onPress={dismiss}
                            systemImage="xmark"
                            circleStyle={styles.closeCircle}
                            icon={<X size={22} color={themeColors.textSecondary} strokeWidth={3.5} />}
                        />
                    </View>

                    <View style={styles.optionsList}>
                        {options.map((option) => (
                            <Pressable
                                key={option.key}
                                onPress={option.route}
                                style={({ pressed }) => [
                                    styles.optionRow,
                                    pressed && { backgroundColor: themeColors.surface },
                                ]}
                            >
                                <View
                                    style={[styles.optionIcon, { backgroundColor: themeColors.primaryLight }]}
                                >
                                    {option.icon}
                                </View>
                                <View style={styles.optionText}>
                                    <Text style={[styles.optionLabel, { color: themeColors.textPrimary }]}>
                                        {option.label}
                                    </Text>
                                    <Text style={[styles.optionSubtitle, { color: themeColors.textSecondary }]}>
                                        {option.subtitle}
                                    </Text>
                                </View>
                                <View style={styles.optionChevron}>
                                    <Text style={{ color: themeColors.textSecondary }}>›</Text>
                                </View>
                            </Pressable>
                        ))}
                    </View>
                </View>
            </TrueSheet>
        </View>
    );
}

const styles = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'flex-end',
        justifyContent: 'flex-end',
        paddingRight: 20,
        paddingBottom: 16,
        zIndex: 50,
    },
    fab: {
        width: 58,
        height: 58,
        borderRadius: 29,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#2563EB',
        shadowOpacity: 0.45,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 10 },
        elevation: 12,
    },
    fabPressed: {
        opacity: 0.85,
        transform: [{ scale: 0.96 }],
    },
    sheetContent: {
        paddingHorizontal: 24,
        paddingTop: 8,
        paddingBottom: Platform.OS === 'ios' ? 34 : 24,
    },
    sheetHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        paddingVertical: 16,
    },
    sheetHeaderText: {
        flex: 1,
        paddingRight: 12,
    },
    sheetTitle: {
        fontSize: 22,
        fontWeight: '700',
        letterSpacing: -0.4,
    },
    sheetSubtitle: {
        fontSize: 14,
        marginTop: 4,
    },
    closeCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
    },
    optionsList: {
        gap: 6,
    },
    optionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 10,
        borderRadius: 18,
    },
    optionIcon: {
        width: 44,
        height: 44,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    optionText: {
        flex: 1,
        marginLeft: 14,
    },
    optionLabel: {
        fontSize: 16,
        fontWeight: '600',
    },
    optionSubtitle: {
        fontSize: 13,
        marginTop: 2,
    },
    optionChevron: {
        width: 20,
        alignItems: 'flex-end',
        fontSize: 22,
        opacity: 0.6,
    },
});