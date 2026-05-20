import { Drawer } from 'expo-router/drawer';
import { useRouter } from 'expo-router';
import { Alert, Linking, View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { useThemeColors } from '../../theme/colors';
import { useTutorial } from '../../hooks/useTutorial';
import { HugeiconsIcon } from '@hugeicons/react-native';
import * as HugeiconsCore from '@hugeicons/core-free-icons';
import { useAuth } from '../../hooks/useAuth';
import { openUserbackFeedback } from '../../services/userbackNative';
import CoreFeaturesIntroModal from '../../components/CoreFeaturesIntroModal';

const resolveHugeIcon = (...names: string[]) => {
    const iconSet = HugeiconsCore as Record<string, any>;
    for (const name of names) {
        if (iconSet[name]) return iconSet[name];
    }
    return null;
};

const WHATSAPP_FEEDBACK_URL = 'https://wa.me/message/4E5VFMHK3F4QO1';

function CustomDrawerContent(props: any) {
    const router = useRouter();
    const themeColors = useThemeColors();
    const { user } = useAuth();

    const mainMenuItems: { name: string; icon: any; route: string }[] = [
        { name: 'Insights', icon: resolveHugeIcon('Analytics01Icon', 'BarChartIcon', 'BarChart'), route: '/insights' },
        { name: 'Contracts', icon: resolveHugeIcon('File02Icon', 'DocumentAttachmentIcon', 'Briefcase'), route: '/contracts' },
        { name: 'Projects', icon: resolveHugeIcon('Folder01Icon', 'FolderOpen', 'Folder'), route: '/projects' },
        { name: 'Clients', icon: resolveHugeIcon('UserGroupIcon', 'UsersIcon', 'CircleUser'), route: '/clients' },
    ];

    const settingsItems: { name: string; icon: any; route: string }[] = [
        { name: 'Settings', icon: resolveHugeIcon('Settings01Icon', 'Settings02Icon', 'SettingsIcon'), route: '/settings' },
    ];
    const feedbackIcon = resolveHugeIcon('SentIcon', 'Send', 'MoneySend01Icon');

    const handleNavigation = (route: string) => {
        props.navigation.closeDrawer();
        router.push(route as any);
    };

    const openFeedbackForm = () => {
        props.navigation.closeDrawer();
        setTimeout(() => {
            void openUserbackFeedback(user).then((opened) => {
                if (!opened) {
                    router.push('/feedback' as any);
                }
            });
        }, 300);
    };

    const handleFeedbackPress = () => {
        props.navigation.closeDrawer();
        setTimeout(() => {
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
                        onPress: openFeedbackForm,
                    },
                ],
            );
        }, 300);
    };

    return (
        <View style={[styles.drawerContainer, { backgroundColor: themeColors.background }]}>
            {/* Header */}
            <View style={styles.header}>
                <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]}>More</Text>
            </View>

            <ScrollView style={styles.menuScroll} showsVerticalScrollIndicator={false}>
                {/* Main Menu Items */}
                <View style={styles.menuSection}>
                    {mainMenuItems.map((item, index) => (
                        <TouchableOpacity
                            key={index}
                            style={styles.menuItem}
                            onPress={() => handleNavigation(item.route)}
                        >
                            {item.icon ? (
                                <HugeiconsIcon icon={item.icon} size={24} color={themeColors.textPrimary} strokeWidth={1.5} />
                            ) : (
                                <View style={{ width: 24, height: 24 }} />
                            )}
                            <Text style={[styles.menuTitle, { color: themeColors.textPrimary }]}>{item.name}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Settings Section */}
                <View style={styles.settingsSection}>
                    <Text style={[styles.sectionLabel, { color: themeColors.textSecondary }]}>SETTINGS</Text>
                    {settingsItems.map((item, index) => (
                        <TouchableOpacity
                            key={index}
                            style={styles.menuItem}
                            onPress={() => handleNavigation(item.route)}
                        >
                            {item.icon ? (
                                <HugeiconsIcon icon={item.icon} size={24} color={themeColors.textPrimary} strokeWidth={1.5} />
                            ) : (
                                <View style={{ width: 24, height: 24 }} />
                            )}
                            <Text style={[styles.menuTitle, { color: themeColors.textPrimary }]}>{item.name}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </ScrollView>

            {/* Footer with Feedback Button */}
            <View style={styles.footer}>
                <TouchableOpacity
                    style={[styles.feedbackButton, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}
                    onPress={handleFeedbackPress}
                >
                    {feedbackIcon ? (
                        <HugeiconsIcon icon={feedbackIcon} size={20} color={themeColors.textPrimary} strokeWidth={1.5} />
                    ) : (
                        <View style={{ width: 20, height: 20 }} />
                    )}
                    <Text style={[styles.feedbackText, { color: themeColors.textPrimary }]}>Give feedback</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

function GlobalTutorial() {
    const router = useRouter();
    const { isDemo } = useAuth();
    const { isVisible, activeStep, activeStepIndex, nextStep, goToStep, skipTutorial } = useTutorial();

    if (isDemo || !isVisible || !activeStep) return null;

    return (
        <CoreFeaturesIntroModal
            visible={isVisible}
            activeStep={activeStepIndex}
            onStepChange={goToStep}
            onDismiss={skipTutorial}
            onStart={() => {
                skipTutorial();
                router.push('/invoice/create' as any);
            }}
        />
    );
}

export default function DrawerLayout() {
    const themeColors = useThemeColors();

    return (
        <View style={{ flex: 1 }}>
            <GlobalTutorial />
            <Drawer
                drawerContent={(props) => <CustomDrawerContent {...props} />}
                screenOptions={{
                    headerShown: false,
                    swipeEnabled: false,
                    swipeEdgeWidth: Platform.OS === 'android' ? 40 : undefined,
                    drawerStyle: {
                        backgroundColor: themeColors.background,
                        width: 300,
                    },
                }}
            >
                <Drawer.Screen
                    name="(tabs)"
                    options={{
                        drawerLabel: 'Home',
                        title: 'Home',
                    }}
                />
                <Drawer.Screen
                    name="search"
                    options={{
                        drawerItemStyle: { display: 'none' },
                        title: 'Search',
                    }}
                />
            </Drawer>
        </View>
    );
}

const styles = StyleSheet.create({
    drawerContainer: {
        flex: 1,
    },
    header: {
        paddingHorizontal: 24,
        paddingTop: 60,
        paddingBottom: 24,
    },
    headerTitle: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 32,
    },
    menuScroll: {
        flex: 1,
    },
    menuSection: {
        paddingHorizontal: 16,
        paddingBottom: 24,
    },
    settingsSection: {
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 24,
    },
    sectionLabel: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 12,
        letterSpacing: 0.5,
        paddingHorizontal: 8,
        paddingVertical: 12,
        textTransform: 'uppercase',
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 8,
        borderRadius: 8,
        gap: 16,
    },
    menuTitle: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 16,
    },
    footer: {
        padding: 24,
        paddingBottom: 40,
    },
    feedbackButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderRadius: 12,
        borderWidth: 1,
        gap: 8,
    },
    feedbackText: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 16,
    },
});
