import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { HugeiconsIcon } from '@hugeicons/react-native';
import * as HugeiconsCore from '@hugeicons/core-free-icons';

import { useThemeColors } from '../../theme/colors';
import IOSGlassIconButton from './IOSGlassIconButton';

const SearchIcon = (props: any) => <HugeiconsIcon icon={(HugeiconsCore as any).Search01Icon} {...props} />;
const InboxIcon = (props: any) => <HugeiconsIcon icon={(HugeiconsCore as any).InboxIcon} {...props} />;

type HeaderActionButtonsProps = {
    style?: StyleProp<ViewStyle>;
};

export default function HeaderActionButtons({ style }: HeaderActionButtonsProps) {
    const router = useRouter();
    const themeColors = useThemeColors();

    const openSearch = React.useCallback(() => {
        try {
            router.push('/search' as any);
        } catch {
            try {
                router.push('/(drawer)/search' as any);
            } catch {
                router.push('/(drawer)/(tabs)/search' as any);
            }
        }
    }, [router]);

    const openNotifications = React.useCallback(() => {
        try {
            router.push('/notifications' as any);
        } catch {
            router.push('/notifications/index' as any);
        }
    }, [router]);

    return (
        <View style={[styles.container, style]}>
            <IOSGlassIconButton
                label="Search"
                onPress={openSearch}
                systemImage="magnifyingglass"
                circleStyle={styles.button}
                icon={<SearchIcon size={22} color={themeColors.textPrimary} strokeWidth={1.9} />}
            />
            <IOSGlassIconButton
                label="Notifications"
                onPress={openNotifications}
                systemImage="tray.fill"
                circleStyle={styles.button}
                icon={<InboxIcon size={23} color={themeColors.textPrimary} strokeWidth={1.9} />}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    button: {
        width: 40,
        height: 40,
        borderRadius: 20,
    },
});
