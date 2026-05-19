import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { SquareArrowOutUpRight as ArrowSquareOut } from './ui/AppIcon';

interface Props {
    onExplorer: () => void;
    onDone: () => void;
    explorerLabel?: string;
    doneLabel?: string;
}

const RNFallback: React.FC<Props> = ({ onExplorer, onDone, explorerLabel = 'View on explorer', doneLabel = 'Done' }) => (
    <View style={rnStyles.container}>
        <TouchableOpacity style={rnStyles.explorer} onPress={onExplorer} activeOpacity={0.8}>
            <Text style={rnStyles.explorerText}>{explorerLabel}</Text>
            <ArrowSquareOut size={18} color={Colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity style={rnStyles.done} onPress={onDone} activeOpacity={0.85}>
            <Text style={rnStyles.doneText}>{doneLabel}</Text>
        </TouchableOpacity>
    </View>
);

export const TransactionSuccessActions: React.FC<Props> = (props) => {
    return (
        <View style={rnStyles.root}>
            <RNFallback {...props} />
        </View>
    );
};

const rnStyles = StyleSheet.create({
    root: {
        width: '100%',
        alignSelf: 'stretch',
    },
    container: {
        width: '100%',
        gap: 12,
    },
    explorer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#EEF2FF',
        paddingVertical: 16,
        borderRadius: 30,
        gap: 8,
    },
    explorerText: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 14,
        color: Colors.primary,
    },
    done: {
        backgroundColor: Colors.primary,
        paddingVertical: 16,
        borderRadius: 30,
        alignItems: 'center',
    },
    doneText: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 16,
        color: '#FFFFFF',
    },
});
