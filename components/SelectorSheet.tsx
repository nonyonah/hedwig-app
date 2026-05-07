import React, { useEffect, useState } from 'react';
import {
    Image,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { CheckCircle } from './ui/AppIcon';
import { Colors, useThemeColors } from '../theme/colors';

let SUI_Host: any = null;
let SUI_BottomSheet: any = null;
let SUI_Group: any = null;
let SUI_RNHostView: any = null;
let suiDetents: any = null;
let suiDragIndicator: any = null;
if (Platform.OS === 'ios') {
    try {
        const SwiftUI = require('@expo/ui/swift-ui');
        SUI_Host = SwiftUI.Host;
        SUI_BottomSheet = SwiftUI.BottomSheet;
        SUI_Group = SwiftUI.Group;
        SUI_RNHostView = SwiftUI.RNHostView;
        const mods = require('@expo/ui/swift-ui/modifiers');
        suiDetents = mods.presentationDetents;
        suiDragIndicator = mods.presentationDragIndicator;
    } catch (e) { /* not available */ }
}

let JCModalBottomSheet: any = null;
if (Platform.OS === 'android') {
    try {
        const JC = require('@expo/ui/jetpack-compose');
        JCModalBottomSheet = JC.ModalBottomSheet;
    } catch (e) { /* not available */ }
}

export type SelectorSheetOption = {
    id: string;
    label: string;
    sublabel?: string;
    icon?: any;
    flagEmoji?: string;
};

interface SelectorSheetProps {
    visible: boolean;
    onClose: () => void;
    title: string;
    options: SelectorSheetOption[];
    selectedId: string;
    onSelect: (id: string) => void;
    detentFraction?: number;
}

export function SelectorSheet({
    visible,
    onClose,
    title,
    options,
    selectedId,
    onSelect,
    detentFraction = 0.45,
}: SelectorSheetProps) {
    const themeColors = useThemeColors();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        if (visible) {
            setMounted(true);
        } else if (mounted) {
            const timeoutId = setTimeout(() => setMounted(false), 350);
            return () => clearTimeout(timeoutId);
        }
    }, [visible]);

    if (!mounted) return null;

    const listContent = (
        <View style={{ flex: 1 }}>
            <View style={styles.titleBlock}>
                <Text style={[styles.title, { color: themeColors.textPrimary }]}>{title}</Text>
            </View>
            <View style={[styles.titleDivider, { backgroundColor: themeColors.border }]} />
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.listContent}
                bounces={false}
            >
                {options.map((opt, index) => (
                    <TouchableOpacity
                        key={opt.id}
                        style={[
                            styles.row,
                            index < options.length - 1 && {
                                borderBottomWidth: StyleSheet.hairlineWidth,
                                borderBottomColor: themeColors.surface,
                            },
                        ]}
                        onPress={() => {
                            onSelect(opt.id);
                            onClose();
                        }}
                    >
                        {opt.icon ? (
                            <Image source={opt.icon} style={styles.icon} />
                        ) : opt.flagEmoji ? (
                            <Text style={styles.flag}>{opt.flagEmoji}</Text>
                        ) : null}
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.label, { color: themeColors.textPrimary }]} numberOfLines={1}>
                                {opt.label}
                            </Text>
                            {opt.sublabel ? (
                                <Text style={[styles.sublabel, { color: themeColors.textSecondary }]} numberOfLines={1}>
                                    {opt.sublabel}
                                </Text>
                            ) : null}
                        </View>
                        {opt.id === selectedId ? (
                            <CheckCircle size={18} color={Colors.primary} fill={Colors.primary} />
                        ) : null}
                    </TouchableOpacity>
                ))}
            </ScrollView>
        </View>
    );

    if (Platform.OS === 'ios' && SUI_Host && SUI_BottomSheet && SUI_Group && SUI_RNHostView) {
        const modifiers = [
            suiDetents?.([{ fraction: detentFraction }]),
            suiDragIndicator?.('visible'),
        ].filter(Boolean);
        return (
            <SUI_Host style={StyleSheet.absoluteFill}>
                <SUI_BottomSheet
                    isPresented={visible}
                    onIsPresentedChange={(isPresented: boolean) => {
                        if (!isPresented) onClose();
                    }}
                >
                    <SUI_Group modifiers={modifiers}>
                        <SUI_RNHostView>
                            <View style={{ flex: 1, backgroundColor: 'transparent' }}>
                                {listContent}
                            </View>
                        </SUI_RNHostView>
                    </SUI_Group>
                </SUI_BottomSheet>
            </SUI_Host>
        );
    }

    if (JCModalBottomSheet && visible) {
        return (
            <JCModalBottomSheet onDismissRequest={onClose}>
                <View style={{ backgroundColor: themeColors.background }}>
                    {listContent}
                </View>
            </JCModalBottomSheet>
        );
    }

    // RN Modal fallback (e.g. older devices / web).
    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <Pressable style={styles.backdrop} onPress={onClose}>
                <Pressable style={[styles.fallbackSheet, { backgroundColor: themeColors.background }]} onPress={(event) => event.stopPropagation()}>
                    {listContent}
                </Pressable>
            </Pressable>
        </Modal>
    );
}

const styles = StyleSheet.create({
    titleBlock: {
        paddingTop: 28,
        paddingBottom: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 17,
        textAlign: 'center',
    },
    titleDivider: {
        height: StyleSheet.hairlineWidth,
        marginHorizontal: 0,
    },
    listContent: {
        paddingHorizontal: 20,
        paddingTop: 8,
        paddingBottom: 40,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        gap: 12,
    },
    icon: { width: 28, height: 28, borderRadius: 14 },
    flag: { fontSize: 22 },
    label: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 16,
    },
    sublabel: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 12,
        marginTop: 2,
    },
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'flex-end',
    },
    fallbackSheet: {
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: '60%',
    },
});
