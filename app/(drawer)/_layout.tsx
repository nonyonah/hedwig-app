import { Drawer } from 'expo-router/drawer';
import { usePathname, useRouter } from 'expo-router';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { useThemeColors } from '../../theme/colors';
import { useEffect, useRef } from 'react';
import { TutorialCard } from '../../components/TutorialCard';
import { useTutorial } from '../../hooks/useTutorial';
import { TUTORIAL_STEPS } from '../../constants/tutorialSteps';
import { HugeiconsIcon } from '@hugeicons/react-native';
import * as HugeiconsCore from '@hugeicons/core-free-icons';
import { useAuth } from '../../hooks/useAuth';
import { openUserbackFeedback } from '../../services/userbackNative';

const resolveHugeIcon = (...names: string[]) => {
    const iconSet = HugeiconsCore as Record<string, any>;
    for (const name of names) {
        if (iconSet[name]) return iconSet[name];
    }
    return null;
};

function CustomDrawerContent(props: any) {
    const router = useRouter();
    const themeColors = useThemeColors();
    const { user } = useAuth();

    const mainMenuItems: { name: string; icon: any; route: string }[] = [
        { name: 'Insights', icon: resolveHugeIcon('Analytics01Icon', 'BarChartIcon', 'BarChart'), route: '/insights' },
        { name: 'Contracts', icon: resolveHugeIcon('File02Icon', 'DocumentAttachmentIcon', 'Briefcase'), route: '/contracts' },
        { name: 'Calendar', icon: resolveHugeIcon('Calendar01Icon', 'Calendar'), route: '/calendar' },
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

    const handleFeedbackPress = () => {
        props.navigation.closeDrawer();
        setTimeout(() => {
            void openUserbackFeedback(user).then((opened) => {
                if (!opened) {
                    router.push('/feedback' as any);
                }
            });
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

// Maps tutorial screenId → the route to navigate to when that step becomes active
const SCREEN_ROUTES: Record<string, string> = {
    home: '/(tabs)',
    invoices: '/(tabs)/invoices',
    links: '/(tabs)/links',
    wallet: '/(tabs)/wallet',
    insights: '/insights',
    transactions: '/transactions',
    withdrawals: '/offramp-history',
    calendar: '/calendar',
    projects: '/projects',
    clients: '/clients',
    settings: '/settings',
};

function GlobalTutorial() {
    const router = useRouter();
    const pathname = usePathname();
    const { isVisible, activeStep, activeStepIndex, totalSteps, nextStep, prevStep, skipTutorial } = useTutorial();
    const prevIndexRef = useRef(activeStepIndex);

    // Auto-navigate when the step's screenId changes
    useEffect(() => {
        if (!isVisible || !activeStep) return;
        const prevStep_ = TUTORIAL_STEPS[prevIndexRef.current];
        if (prevStep_?.screenId !== activeStep.screenId) {
            const route = SCREEN_ROUTES[activeStep.screenId];
            if (route && route !== pathname) {
                router.replace(route as any);
            }
        }
        prevIndexRef.current = activeStepIndex;
    }, [activeStepIndex, isVisible, activeStep, pathname, router]);

    if (!isVisible || !activeStep) return null;
    if (pathname === '/settings') return null;

    return (
        <TutorialCard
            step={activeStepIndex + 1}
            totalSteps={totalSteps}
            title={activeStep.title}
            body={activeStep.body}
            anchorPosition={activeStep.anchorPosition}
            onNext={nextStep}
            onBack={prevStep}
            onSkip={skipTutorial}
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
                    swipeEnabled: true,
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
