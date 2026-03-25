import { Drawer } from 'expo-router/drawer';
import { useRouter } from 'expo-router';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useThemeColors } from '../../theme/colors';
import { useEffect, useRef } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { TutorialCard } from '../../components/TutorialCard';
import { useTutorial } from '../../hooks/useTutorial';
import { TUTORIAL_STEPS } from '../../constants/tutorialSteps';
import {
    BarChart3 as ChartBar,
    ArrowLeftRight as ArrowsLeftRight,
    DollarSign as CurrencyDollar,
    Calendar,
    FolderOpen,
    Users,
    Settings as Gear,
    Send as PaperPlaneTilt
} from '../../components/ui/AppIcon';

function CustomDrawerContent(props: any) {
    const router = useRouter();
    const themeColors = useThemeColors();

    const mainMenuItems = [
        {
            name: 'Insights',
            icon: ChartBar,
            route: '/insights',
        },
        {
            name: 'Transactions',
            icon: ArrowsLeftRight,
            route: '/transactions',
        },
        {
            name: 'Withdrawals',
            icon: CurrencyDollar,
            route: '/offramp-history',
        },
        {
            name: 'Calendar',
            icon: Calendar,
            route: '/calendar',
        },
        {
            name: 'Projects',
            icon: FolderOpen,
            route: '/projects',
        },
        {
            name: 'Clients',
            icon: Users,
            route: '/clients',
        },
    ];

    const settingsItems = [
        {
            name: 'Settings',
            icon: Gear,
            route: '/settings',
        },
    ];

    const handleNavigation = (route: string) => {
        props.navigation.closeDrawer();
        router.push(route as any);
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
                    {mainMenuItems.map((item, index) => {
                        const IconComponent = item.icon;
                        return (
                            <TouchableOpacity
                                key={index}
                                style={styles.menuItem}
                                onPress={() => handleNavigation(item.route)}
                            >
                                <IconComponent size={24} color={themeColors.textPrimary} />
                                <Text style={[styles.menuTitle, { color: themeColors.textPrimary }]}>{item.name}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                {/* Settings Section */}
                <View style={styles.settingsSection}>
                    <Text style={[styles.sectionLabel, { color: themeColors.textSecondary }]}>SETTINGS</Text>
                    {settingsItems.map((item, index) => {
                        const IconComponent = item.icon;
                        return (
                            <TouchableOpacity
                                key={index}
                                style={styles.menuItem}
                                onPress={() => handleNavigation(item.route)}
                            >
                                <IconComponent size={24} color={themeColors.textPrimary} />
                                <Text style={[styles.menuTitle, { color: themeColors.textPrimary }]}>{item.name}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </ScrollView>

            {/* Footer with Feedback Button */}
            <View style={styles.footer}>
                <TouchableOpacity
                    style={[styles.feedbackButton, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}
                    onPress={() => {
                        props.navigation.closeDrawer();
                        // Add feedback functionality here
                    }}
                >
                    <PaperPlaneTilt size={20} color={themeColors.textPrimary} />
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
    const { isVisible, activeStep, activeStepIndex, totalSteps, nextStep, prevStep, skipTutorial } = useTutorial();
    const prevIndexRef = useRef(activeStepIndex);

    // Auto-navigate when the step's screenId changes
    useEffect(() => {
        if (!isVisible || !activeStep) return;
        const prevStep_ = TUTORIAL_STEPS[prevIndexRef.current];
        if (prevStep_?.screenId !== activeStep.screenId) {
            const route = SCREEN_ROUTES[activeStep.screenId];
            if (route) router.push(route as any);
        }
        prevIndexRef.current = activeStepIndex;
    }, [activeStepIndex, isVisible, activeStep]);

    if (!isVisible || !activeStep) return null;

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
        <GestureHandlerRootView style={{ flex: 1 }}>
            <GlobalTutorial />
            <Drawer
                drawerContent={(props) => <CustomDrawerContent {...props} />}
                screenOptions={{
                    headerShown: false,
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
        </GestureHandlerRootView>
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
        fontFamily: 'GoogleSansFlex_500Medium',
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
