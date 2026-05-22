import { Drawer } from 'expo-router/drawer';
import { useRouter } from 'expo-router';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { useThemeColors } from '../../theme/colors';
import { useAuth } from '../../hooks/useAuth';
import { useTutorial } from '../../hooks/useTutorial';
import CoreFeaturesIntroModal from '../../components/CoreFeaturesIntroModal';

function CustomDrawerContent(props: any) {
    const router = useRouter();
    const themeColors = useThemeColors();

    const handleNavigation = (route: string) => {
        props.navigation.closeDrawer();
        router.push(route as any);
    };

    return (
        <View style={[styles.drawerContainer, { backgroundColor: themeColors.background }]}>
            {/* Header */}
            <View style={styles.header}>
                <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]}>Menu</Text>
            </View>

            <ScrollView style={styles.menuScroll} showsVerticalScrollIndicator={false}>
                <View style={styles.menuSection}>
                    <TouchableOpacity
                        style={styles.menuItem}
                        onPress={() => handleNavigation('/wallet')}
                    >
                        <Text style={[styles.menuTitle, { color: themeColors.textPrimary }]}>Wallet</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.menuItem}
                        onPress={() => handleNavigation('/settings')}
                    >
                        <Text style={[styles.menuTitle, { color: themeColors.textPrimary }]}>Settings</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
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
                        drawerLabel: 'Wallet',
                        title: 'Wallet',
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
});
