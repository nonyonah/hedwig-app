import React, { useMemo, useRef, useState } from 'react';
import {
    Dimensions,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useThemeColors } from '../../theme/colors';

export interface AndroidDropdownMenuOption {
    label: string;
    onPress: () => void;
    destructive?: boolean;
    icon?: React.ReactNode;
}

interface AndroidDropdownMenuProps {
    options: AndroidDropdownMenuOption[];
    trigger: React.ReactNode;
    width?: number;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function AndroidDropdownMenu({
    options,
    trigger,
    width = 240,
}: AndroidDropdownMenuProps) {
    const themeColors = useThemeColors();
    const triggerRef = useRef<View>(null);
    const [visible, setVisible] = useState(false);
    const [position, setPosition] = useState({ top: 0, left: 0 });

    const openMenu = () => {
        triggerRef.current?.measureInWindow((x, y, triggerWidth, triggerHeight) => {
            const left = Math.min(
                Math.max(12, x + triggerWidth - width),
                SCREEN_WIDTH - width - 12
            );
            const top = Math.min(y + triggerHeight + 8, SCREEN_HEIGHT - 16);
            setPosition({ top, left });
            setVisible(true);
        });
    };

    const closeMenu = () => setVisible(false);

    const menuStyles = useMemo(
        () => [
            styles.menu,
            {
                width,
                top: position.top,
                left: position.left,
                backgroundColor: themeColors.surface,
                borderColor: themeColors.border,
            },
        ],
        [position.left, position.top, themeColors.border, themeColors.surface, width]
    );

    return (
        <>
            <View ref={triggerRef} collapsable={false}>
                <TouchableOpacity onPress={openMenu} activeOpacity={0.8}>
                    {trigger}
                </TouchableOpacity>
            </View>

            <Modal
                animationType="fade"
                transparent
                visible={visible}
                onRequestClose={closeMenu}
            >
                <Pressable style={styles.backdrop} onPress={closeMenu}>
                    <View style={menuStyles}>
                        {options.map((option, index) => {
                            const optionColor = option.destructive
                                ? '#EF4444'
                                : themeColors.textPrimary;
                            const showDivider = index < options.length - 1;

                            return (
                                <View key={`${option.label}-${index}`}>
                                    <TouchableOpacity
                                        style={styles.menuItem}
                                        activeOpacity={0.8}
                                        onPress={() => {
                                            closeMenu();
                                            option.onPress();
                                        }}
                                    >
                                        <View style={styles.menuItemLeft}>
                                            {option.icon ? <View style={styles.iconWrap}>{option.icon}</View> : null}
                                            <Text style={[styles.menuItemText, { color: optionColor }]}>
                                                {option.label}
                                            </Text>
                                        </View>
                                    </TouchableOpacity>
                                    {showDivider ? (
                                        <View
                                            style={[
                                                styles.divider,
                                                { backgroundColor: themeColors.border },
                                            ]}
                                        />
                                    ) : null}
                                </View>
                            );
                        })}
                    </View>
                </Pressable>
            </Modal>
        </>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
    },
    menu: {
        position: 'absolute',
        borderRadius: 14,
        borderWidth: 1,
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.16,
        shadowRadius: 20,
        elevation: 14,
        overflow: 'hidden',
    },
    menuItem: {
        paddingVertical: 13,
        paddingHorizontal: 14,
    },
    menuItemLeft: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        width: '100%',
    },
    menuItemText: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 15,
        lineHeight: 20,
        flexShrink: 1,
    },
    iconWrap: {
        width: 20,
        alignItems: 'center',
        marginTop: 1,
    },
    divider: {
        height: StyleSheet.hairlineWidth,
    },
});
