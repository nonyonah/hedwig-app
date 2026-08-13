import * as React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../theme/colors';
import { CheckCircle as CheckCircleIcon, X } from '../ui/AppIcon';

export default function WithdrawalProgress({ status, themeColors }: { status: string; themeColors: any }) {
    const steps = [
        { key: 'PENDING',    label: 'Initiated' },
        { key: 'PROCESSING', label: 'Processing' },
        { key: 'COMPLETED',  label: 'Completed' },
    ];
    const currentIndex = steps.findIndex(s => s.key === status);
    const isFailed = status === 'FAILED' || status === 'CANCELLED';

    return (
        <View style={ps.container}>
            {steps.map((step, index) => {
                const isActive    = index <= currentIndex && !isFailed;
                const isCompleted = index < currentIndex && !isFailed;
                const isCurrent   = index === currentIndex && !isFailed;
                return (
                    <View key={step.key} style={ps.step}>
                        {index > 0 && (
                            <View style={[ps.line, isActive && ps.lineActive]} />
                        )}
                        <View style={[
                            ps.circle,
                            isActive && ps.circleActive,
                            isCurrent && ps.circleCurrent,
                            isFailed && index === currentIndex && ps.circleFailed,
                        ]}>
                            {isCompleted ? (
                                <CheckCircleIcon size={16} color="#FFFFFF" strokeWidth={3} />
                            ) : isFailed && index === currentIndex ? (
                                <X size={16} color="#FFFFFF" strokeWidth={4} />
                            ) : (
                                <Text style={[ps.num, isActive && ps.numActive]}>{index + 1}</Text>
                            )}
                        </View>
                        <Text style={[ps.label, isActive && [ps.labelActive, { color: themeColors.textPrimary }]]}>
                            {step.label}
                        </Text>
                    </View>
                );
            })}
        </View>
    );
}

const ps = StyleSheet.create({
    container:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    step:         { flex: 1, alignItems: 'center', position: 'relative' },
    line:         { position: 'absolute', top: 14, left: -50, right: 50, height: 2, backgroundColor: '#E5E7EB', zIndex: -1 },
    lineActive:   { backgroundColor: Colors.primary },
    circle:       { width: 28, height: 28, borderRadius: 14, backgroundColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
    circleActive: { backgroundColor: Colors.primary },
    circleCurrent:{ backgroundColor: Colors.primary, borderWidth: 3, borderColor: '#DBEAFE' },
    circleFailed: { backgroundColor: '#EF4444' },
    num:          { fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 12, color: '#9CA3AF' },
    numActive:    { color: '#FFFFFF' },
    label:        { fontFamily: 'GoogleSansFlex_500Medium', fontSize: 12, color: '#9CA3AF', textAlign: 'center' },
    labelActive:  {},
});