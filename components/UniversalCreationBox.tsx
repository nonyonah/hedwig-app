import React, { useCallback, useEffect, useRef } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { TrueSheet } from '@hedwig/true-sheet';
import { useThemeColors } from '../theme/colors';
import {
    ChevronRight,
    FileText,
    FolderOpen,
    Link2,
    User,
    X,
} from './ui/AppIcon';

type CreateAction = 'invoice' | 'payment-link' | 'project' | 'client';

type CreateItem = {
    id: CreateAction;
    title: string;
    Icon: React.ComponentType<any>;
};

interface UniversalCreationBoxProps {
    visible: boolean;
    onClose: () => void;
    onTransfer?: (data: any) => void;
    presentation?: 'auto' | 'inline';
}

const CREATE_ITEMS: CreateItem[] = [
    {
        id: 'invoice',
        title: 'Invoice',
        Icon: FileText,
    },
    {
        id: 'payment-link',
        title: 'Payment Link',
        Icon: Link2,
    },
    {
        id: 'project',
        title: 'Project',
        Icon: FolderOpen,
    },
    {
        id: 'client',
        title: 'Client',
        Icon: User,
    },
];

const IOS_SHEET_MAX_HEIGHT = 360;
const ANDROID_SHEET_MAX_HEIGHT = 460;

export function UniversalCreationBox({ visible, onClose }: UniversalCreationBoxProps) {
    const router = useRouter();
    const colors = useThemeColors();
    const insets = useSafeAreaInsets();
    const sheetRef = useRef<TrueSheet>(null);
    const hasClosedRef = useRef(false);

    useEffect(() => {
        if (visible) {
            hasClosedRef.current = false;
        }

        if (visible) {
            sheetRef.current?.present().catch(() => {});
            return;
        }

        sheetRef.current?.dismiss().catch(() => {});
    }, [visible]);

    const closeOnce = useCallback(() => {
        if (hasClosedRef.current) return;
        hasClosedRef.current = true;
        onClose();
    }, [onClose]);

    const handleClose = useCallback(async () => {
        await sheetRef.current?.dismiss().catch(() => {});
        closeOnce();
    }, [closeOnce]);

    const handleSelect = useCallback((action: CreateAction) => {
        // Dismiss the sheet first, then push so the back stack includes home
        void sheetRef.current?.dismiss().catch(() => {});
        if (action === 'invoice') {
            router.push('/invoice/create');
            return;
        }
        if (action === 'payment-link') {
            router.push('/payment-link/create');
            return;
        }
        if (action === 'project') {
            router.push('/projects/create');
            return;
        }
        router.push('/clients/create');
    }, [router]);

    if (!visible) {
        return null;
    }

    return (
        <TrueSheet
            ref={sheetRef}
            detents={['auto']}
            cornerRadius={Platform.OS === 'ios' ? 38 : 20}
            backgroundColor={Platform.OS === 'ios' ? undefined : colors.background}
            onDidDismiss={closeOnce}
        >
            <View
                style={[
                    styles.container,
                    {
                        maxHeight: Platform.OS === 'ios' ? IOS_SHEET_MAX_HEIGHT : ANDROID_SHEET_MAX_HEIGHT,
                        paddingBottom: Math.max(insets.bottom + 2, 12),
                    },
                ]}
            >
                <View style={styles.headerRow}>
                    <View style={styles.headerCopy}>
                        <Text style={[styles.title, { color: colors.textPrimary }]}>Create</Text>
                    </View>
                    <TouchableOpacity
                        style={[styles.closeButton, { borderColor: colors.border, backgroundColor: colors.surface }]}
                        onPress={() => {
                            void handleClose();
                        }}
                        accessibilityRole="button"
                        accessibilityLabel="Close create menu"
                    >
                        <X size={16} color={colors.textPrimary} strokeWidth={2.8} />
                    </TouchableOpacity>
                </View>

                <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false} bounces={false}>
                    {CREATE_ITEMS.map((item, index) => (
                        <React.Fragment key={item.id}>
                            <TouchableOpacity
                                style={styles.row}
                                onPress={() => handleSelect(item.id)}
                                accessibilityRole="button"
                            >
                                <View style={[styles.iconWrap, { backgroundColor: colors.background }]}>
                                    <item.Icon size={16} color={colors.textPrimary} strokeWidth={2.2} />
                                </View>
                                <View style={styles.rowCopy}>
                                    <Text style={[styles.rowTitle, { color: colors.textPrimary }]}>{item.title}</Text>
                                </View>
                                <ChevronRight size={14} color={colors.textSecondary} strokeWidth={2.6} />
                            </TouchableOpacity>
                            {index < CREATE_ITEMS.length - 1 ? (
                                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                            ) : null}
                        </React.Fragment>
                    ))}
                </ScrollView>
            </View>
        </TrueSheet>
    );
}

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: 16,
        paddingTop: Platform.OS === 'ios' ? 20 : 14,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
        gap: 12,
    },
    headerCopy: {
        flex: 1,
    },
    title: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 20,
    },
    closeButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    listContent: {
        paddingVertical: 4,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 4,
        paddingVertical: 12,
    },
    iconWrap: {
        width: 30,
        height: 30,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
    },
    rowCopy: {
        flex: 1,
    },
    rowTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 15,
    },
    divider: {
        marginLeft: 44,
        height: StyleSheet.hairlineWidth,
    },
});

export default UniversalCreationBox;
