import React from 'react';
import { Platform, View, TouchableOpacity, Text, StyleSheet } from 'react-native';
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

const IosNative: React.FC<Props> = ({ onExplorer, onDone, explorerLabel = 'View on explorer', doneLabel = 'Done' }) => {
    const SwiftUI = require('@expo/ui/swift-ui');
    const Mods = require('@expo/ui/swift-ui/modifiers');
    const { Host, VStack, Button } = SwiftUI;
    const { buttonStyle, controlSize, tint, frame } = Mods;
    return (
        <Host matchContents>
            <VStack spacing={12} modifiers={[frame({ maxWidth: Infinity })]}>
                <Button
                    label={explorerLabel}
                    systemImage="arrow.up.right.square"
                    onPress={onExplorer}
                    modifiers={[
                        buttonStyle('bordered'),
                        controlSize('large'),
                        tint(Colors.primary as any),
                        frame({ maxWidth: Infinity }),
                    ]}
                />
                <Button
                    label={doneLabel}
                    onPress={onDone}
                    modifiers={[
                        buttonStyle('borderedProminent'),
                        controlSize('large'),
                        tint(Colors.primary as any),
                        frame({ maxWidth: Infinity }),
                    ]}
                />
            </VStack>
        </Host>
    );
};

const AndroidNative: React.FC<Props> = ({ onExplorer, onDone, explorerLabel = 'View on explorer', doneLabel = 'Done' }) => {
    const Compose = require('@expo/ui/jetpack-compose');
    const Mods = require('@expo/ui/jetpack-compose/modifiers');
    const { Host, Column, Button, OutlinedButton, Text: ComposeText } = Compose;
    const { fillMaxWidth } = Mods;
    return (
        <Host matchContents>
            <Column verticalArrangement={{ spacedBy: 12 }} modifiers={[fillMaxWidth()]}>
                <OutlinedButton onClick={onExplorer} modifiers={[fillMaxWidth()]}>
                    <ComposeText>{explorerLabel}</ComposeText>
                </OutlinedButton>
                <Button
                    onClick={onDone}
                    modifiers={[fillMaxWidth()]}
                    colors={{ containerColor: Colors.primary as any, contentColor: '#FFFFFF' }}
                >
                    <ComposeText>{doneLabel}</ComposeText>
                </Button>
            </Column>
        </Host>
    );
};

export const TransactionSuccessActions: React.FC<Props> = (props) => {
    if (Platform.OS === 'ios') return <IosNative {...props} />;
    if (Platform.OS === 'android') return <AndroidNative {...props} />;
    return <RNFallback {...props} />;
};

const rnStyles = StyleSheet.create({
    container: {
        width: '100%',
        gap: 12,
        marginTop: 24,
    },
    explorer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#EEF2FF',
        paddingVertical: 14,
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
