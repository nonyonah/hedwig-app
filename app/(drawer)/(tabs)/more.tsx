import React from 'react';
import { Alert, Linking, View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { HugeiconsIcon } from '@hugeicons/react-native';
import * as HugeiconsCore from '@hugeicons/core-free-icons';
import { useThemeColors } from '../../../theme/colors';
import { useAuth } from '../../../hooks/useAuth';
import { openUserbackFeedback } from '../../../services/userbackNative';

const resolveHugeIcon = (...names: string[]) => {
    const iconSet = HugeiconsCore as Record<string, any>;
    for (const name of names) {
        if (iconSet[name]) return iconSet[name];
    }
    return null;
};

const MORE_ICON_STROKE = 1.35;
const WHATSAPP_FEEDBACK_URL = 'https://wa.me/message/4E5VFMHK3F4QO1';

export default function MoreScreen() {
    const router = useRouter();
    const themeColors = useThemeColors();
    const { user } = useAuth();
    const feedbackIcon = resolveHugeIcon('SentIcon', 'Send', 'MoneySend01Icon');
    const cardBackground = themeColors.surface;

    const menuItems = [
        { name: 'Insights', route: '/insights', icon: resolveHugeIcon('Analytics01Icon', 'BarChartIcon', 'BarChart') },
        { name: 'Contracts', route: '/contracts', icon: resolveHugeIcon('File02Icon', 'DocumentAttachmentIcon', 'Briefcase') },
        { name: 'Projects', route: '/projects', icon: resolveHugeIcon('Folder01Icon', 'FolderOpen', 'Folder') },
        { name: 'Clients', route: '/clients', icon: resolveHugeIcon('UserGroupIcon', 'UsersIcon', 'CircleUser') },
        { name: 'Settings', route: '/settings', icon: resolveHugeIcon('Settings01Icon', 'Settings02Icon') },
    ];

    const openFeedbackForm = async () => {
        const opened = await openUserbackFeedback(user);
        if (!opened) router.push('/feedback' as any);
    };

    const handleFeedbackPress = () => {
        Alert.alert(
            'Give feedback',
            'Send a quick message or open the feedback form.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'WhatsApp',
                    onPress: () => {
                        void Linking.openURL(WHATSAPP_FEEDBACK_URL);
                    },
                },
                {
                    text: 'Feedback form',
                    onPress: () => {
                        void openFeedbackForm();
                    },
                },
            ],
        );
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
            <View style={styles.header}>
                <Text style={[styles.title, { color: themeColors.textPrimary }]}>More</Text>
            </View>
            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <View style={[styles.card, { backgroundColor: cardBackground, borderColor: themeColors.border }]}>
                    {menuItems.map((item, index) => (
                        <TouchableOpacity
                            key={item.name}
                            style={[
                                styles.row,
                                index < menuItems.length - 1 && { borderBottomColor: themeColors.border, borderBottomWidth: StyleSheet.hairlineWidth },
                            ]}
                            onPress={() => router.push(item.route as any)}
                            activeOpacity={0.75}
                        >
                            {item.icon ? (
                                <HugeiconsIcon icon={item.icon} size={22} color={themeColors.textPrimary} strokeWidth={MORE_ICON_STROKE} />
                            ) : (
                                <View style={styles.iconPlaceholder} />
                            )}
                            <Text style={[styles.rowText, { color: themeColors.textPrimary }]}>{item.name}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                <TouchableOpacity
                    style={[styles.feedbackButton, { backgroundColor: cardBackground, borderColor: themeColors.border }]}
                    onPress={handleFeedbackPress}
                    activeOpacity={0.75}
                >
                    {feedbackIcon ? (
                        <HugeiconsIcon
                            icon={feedbackIcon}
                            size={20}
                            color={themeColors.textPrimary}
                            strokeWidth={MORE_ICON_STROKE}
                        />
                    ) : (
                        <View style={styles.iconPlaceholder} />
                    )}
                    <Text style={[styles.feedbackText, { color: themeColors.textPrimary }]}>Give feedback</Text>
                </TouchableOpacity>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
    title: { fontFamily: 'GoogleSansFlex_700Bold', fontSize: 28 },
    content: { paddingHorizontal: 20, paddingBottom: 120 },
    card: {
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: 18,
        overflow: 'hidden',
    },
    row: {
        minHeight: 58,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
    },
    rowText: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 16,
    },
    iconPlaceholder: { width: 22, height: 22 },
    feedbackButton: {
        marginTop: 18,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: 18,
        minHeight: 54,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    feedbackText: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 15,
    },
});
