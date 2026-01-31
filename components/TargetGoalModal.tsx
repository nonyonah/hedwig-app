import React, { useState, useEffect, forwardRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { BottomSheetModal, BottomSheetView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { X, Minus, Plus } from 'phosphor-react-native';
import { Colors, useThemeColors } from '../theme/colors';

const { height } = Dimensions.get('window');

interface TargetGoalModalProps {
    currentTarget: number;
    onClose: () => void;
    onSave: (newTarget: number) => void;
    user?: any; // Privy user object for API calls
    getAccessToken?: () => Promise<string | null>;
}

export const TargetGoalModal = forwardRef<BottomSheetModal, TargetGoalModalProps>(({
    currentTarget,
    onClose,
    onSave,
    user,
    getAccessToken
}, ref) => {
    const themeColors = useThemeColors();
    const [target, setTarget] = useState(currentTarget);

    // Update target when currentTarget prop changes
    useEffect(() => {
        setTarget(currentTarget);
    }, [currentTarget]);

    const adjustTarget = (amount: number) => {
        setTarget(prev => Math.max(0, prev + amount));
    };

    const handleSave = async () => {
        // Save to backend if user and getAccessToken are available
        if (user && getAccessToken) {
            try {
                const token = await getAccessToken();
                if (token) {
                    const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
                    const response = await fetch(`${apiUrl}/api/users/profile`, {
                        method: 'PATCH',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ monthlyTarget: target })
                    });

                    if (!response.ok) {
                        console.error('Failed to save monthly target to backend');
                    }
                }
            } catch (error) {
                console.error('Error saving monthly target:', error);
            }
        }

        // Call the onSave callback (updates local state)
        onSave(target);
        // @ts-ignore
        ref?.current?.dismiss();
        onClose();
    };

    const handleClose = () => {
        // @ts-ignore
        ref?.current?.dismiss();
        onClose();
    };

    const formatNumber = (num: number) => {
        return num.toLocaleString('en-US');
    };

    const renderBackdrop = useCallback(
        (props: any) => (
            <BottomSheetBackdrop
                {...props}
                disappearsOnIndex={-1}
                appearsOnIndex={0}
                opacity={0.5}
            />
        ),
        []
    );

    return (
        <BottomSheetModal
            ref={ref}
            index={0}
            enableDynamicSizing={true}
            enablePanDownToClose={true}
            backdropComponent={renderBackdrop}
            backgroundStyle={{ backgroundColor: themeColors.background, borderRadius: 24 }}
            handleIndicatorStyle={{ backgroundColor: themeColors.textSecondary }}
            onDismiss={onClose}
        >
            <BottomSheetView style={styles.contentContainer}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity
                        onPress={handleClose}
                        style={[styles.closeButton, { backgroundColor: themeColors.surface }]}
                    >
                        <X size={20} color={themeColors.textSecondary} weight="bold" />
                    </TouchableOpacity>
                </View>

                {/* Title and Description */}
                <View style={styles.content}>
                    <Text style={[styles.title, { color: themeColors.textPrimary }]}>
                        Monthly Earnings Goal
                    </Text>
                    <Text style={[styles.description, { color: themeColors.textSecondary }]}>
                        Set a goal based on how much you want to earn each month.
                    </Text>

                    {/* Target Adjuster */}
                    <View style={styles.targetContainer}>
                        <TouchableOpacity
                            onPress={() => adjustTarget(-100)}
                            onLongPress={() => adjustTarget(-1000)}
                            style={[styles.adjustButton, { backgroundColor: Colors.primary }]}
                        >
                            <Minus size={32} color="#FFFFFF" weight="bold" />
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
                            style={[styles.adjustButton, { backgroundColor: Colors.primary }]}
                        >
                            <Plus size={32} color="#FFFFFF" weight="bold" />
                        </TouchableOpacity>
                    </View>

                    {/* Quick Presets - Centered */}
                    <View style={styles.presetsContainer}>
                        {[1000, 2500, 5000, 10000].map((preset) => (
                            <TouchableOpacity
                                key={preset}
                                onPress={() => setTarget(preset)}
                                style={[
                                    styles.presetButton,
                                    { backgroundColor: themeColors.surface },
                                    target === preset && { backgroundColor: Colors.primary }
                                ]}
                            >
                                <Text style={[
                                    styles.presetText,
                                    { color: themeColors.textSecondary },
                                    target === preset && { color: '#FFFFFF', fontFamily: 'GoogleSansFlex_600SemiBold' }
                                ]}>
                                    ${formatNumber(preset)}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* Save Button - Consistent with app style */}
                    <TouchableOpacity
                        onPress={handleSave}
                        style={[styles.saveButton, { backgroundColor: Colors.primary }]}
                    >
                        <Text style={styles.saveButtonText}>Change Earnings Goal</Text>
                    </TouchableOpacity>
                </View>
            </BottomSheetView>
        </BottomSheetModal>
    );
});

const styles = StyleSheet.create({
    contentContainer: {
        paddingBottom: 40,
    },
    modalOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    container: {
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingBottom: 24,
        maxHeight: height * 0.85,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        padding: 20,
        paddingBottom: 0,
    },
    closeButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    content: {
        padding: 24,
        paddingTop: 8,
    },
    title: {
        fontSize: 28,
        fontFamily: 'GoogleSansFlex_700Bold',
        marginBottom: 8,
    },
    description: {
        fontSize: 15,
        fontFamily: 'GoogleSansFlex_400Regular',
        lineHeight: 22,
        marginBottom: 40,
    },
    targetContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 32,
    },
    adjustButton: {
        width: 64,
        height: 64,
        borderRadius: 32,
        justifyContent: 'center',
        alignItems: 'center',
    },
    valueContainer: {
        flex: 1,
        alignItems: 'center',
        marginHorizontal: 16,
    },
    value: {
        fontSize: 56,
        fontFamily: 'GoogleSansFlex_700Bold',
        lineHeight: 64,
    },
    unit: {
        fontSize: 13,
        fontFamily: 'GoogleSansFlex_600SemiBold',
        letterSpacing: 1.5,
        marginTop: 4,
    },
    presetsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 40,
        justifyContent: 'center', // Center the preset chips
    },
    presetButton: {
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 100,
        minWidth: '22%',
        alignItems: 'center',
    },
    presetText: {
        fontSize: 14,
        fontFamily: 'GoogleSansFlex_500Medium',
    },
    saveButton: {
        paddingVertical: 16,
        borderRadius: 30,
        alignItems: 'center',
    },
    saveButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontFamily: 'GoogleSansFlex_600SemiBold',
    },
});
