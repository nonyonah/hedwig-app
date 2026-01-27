
import { Tabs, useRouter } from 'expo-router';
import { View, Platform, StyleSheet } from 'react-native';
import { useEffect } from 'react';
import { House, Receipt, Link, Scroll, DotsThreeCircle } from 'phosphor-react-native';

import { useThemeColors } from '../../theme/colors';
import { useAuth } from '../../hooks/useAuth';

export default function TabLayout() {
    const themeColors = useThemeColors();
    const router = useRouter();
    const { user, isReady } = useAuth();

    useEffect(() => {
        if (isReady && !user) {
            router.replace('/auth/welcome');
        }
    }, [isReady, user]);

    if (!isReady) return null; // Or loading spinner

    return (
        <Tabs
            screenOptions={{
                headerShown: false,
                tabBarStyle: {
                    position: 'absolute',
                    backgroundColor: 'transparent',
                    borderTopWidth: 0,
                    elevation: 0,
                    shadowOpacity: 0,
                    height: Platform.OS === 'ios' ? 88 : 60,
                    paddingTop: 8,
                },
                tabBarBackground: () => (
                    Platform.OS === 'ios' ? (
                        <View style={[StyleSheet.absoluteFill, { backgroundColor: themeColors.surface }]} />
                    ) : (
                        <View style={[StyleSheet.absoluteFill, { backgroundColor: themeColors.surface }]} />
                    )
                ),
                tabBarActiveTintColor: themeColors.primary,
                tabBarInactiveTintColor: themeColors.textSecondary,
                tabBarLabelStyle: {
                    fontFamily: 'GoogleSansFlex_500Medium',
                    fontSize: 12,
                    marginBottom: 4,
                },
            }}
        >
            <Tabs.Screen
                name="index"
                options={{
                    headerShown: false,
                    title: 'Home',
                    tabBarIcon: ({ color, size }) => (
                        <House size={24} color={color} weight="fill" />
                    ),
                }}
            />
            <Tabs.Screen
                name="invoices"
                options={{
                    headerShown: false,
                    title: 'Invoices',
                    tabBarIcon: ({ color, size }) => (
                        <Receipt size={24} color={color} weight="fill" />
                    ),
                }}
            />
            <Tabs.Screen
                name="links"
                options={{
                    headerShown: false,
                    title: 'Links',
                    tabBarIcon: ({ color, size }) => (
                        <Link size={24} color={color} weight="bold" />
                    ),
                }}
            />
            <Tabs.Screen
                name="contracts"
                options={{
                    headerShown: false,
                    title: 'Contracts',
                    tabBarIcon: ({ color, size }) => (
                        <Scroll size={24} color={color} weight="fill" />
                    ),
                }}
            />
            <Tabs.Screen
                name="more"
                options={{
                    headerShown: false,
                    title: 'More',
                    tabBarIcon: ({ color, size }) => (
                        <DotsThreeCircle size={24} color={color} weight="fill" />
                    ),
                }}
            />
        </Tabs>
    );
}
