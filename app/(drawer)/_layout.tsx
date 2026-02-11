import { Drawer } from 'expo-router/drawer';
import { useRouter } from 'expo-router';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useThemeColors } from '../../theme/colors';
import { useAuth } from '../../hooks/useAuth';
import { useState, useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { 
    ChartBar, 
    ArrowsLeftRight, 
    CurrencyDollar, 
    Calendar, 
    FolderOpen, 
    Users, 
    Gear,
    PaperPlaneTilt
} from 'phosphor-react-native';

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
                                <IconComponent size={24} color={themeColors.textPrimary} weight="regular" />
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
                                <IconComponent size={24} color={themeColors.textPrimary} weight="regular" />
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
                    <PaperPlaneTilt size={20} color={themeColors.textPrimary} weight="regular" />
                    <Text style={[styles.feedbackText, { color: themeColors.textPrimary }]}>Give feedback</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

export default function DrawerLayout() {
    const themeColors = useThemeColors();

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
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
        fontFamily: 'GoogleSansFlex_600SemiBold',
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
        fontFamily: 'GoogleSansFlex_600SemiBold',
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
