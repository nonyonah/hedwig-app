import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { HugeiconsIcon } from '@hugeicons/react-native';
import * as HugeiconsCore from '@hugeicons/core-free-icons';

import { useThemeColors } from '../../theme/colors';
import IOSGlassIconButton from './IOSGlassIconButton';

const InboxIcon = (props: any) => <HugeiconsIcon icon={(HugeiconsCore as any).InboxIcon} {...props} />;

type HeaderActionButtonsProps = {
    style?: StyleProp<ViewStyle>;
};

export default function HeaderActionButtons({ style }: HeaderActionButtonsProps) {
    const router = useRouter();
    const themeColors = useThemeColors();

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
                label="Notifications"
                onPress={openNotifications}
                systemImage="bell.fill"
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
