import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, useThemeColors } from '../../theme/colors';
import { Button } from '../../components/Button';
import { useAnalyticsScreen } from '../../hooks/useAnalyticsScreen';
import { useAuth } from '../../hooks/useAuth';
import { Link as LinkIcon, FileText, Users, FolderOpen, Wallet, BarChart3 } from '../../components/ui/AppIcon';

export default function WelcomeScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const themeColors = useThemeColors();
    const scrollViewRef = useRef<ScrollView>(null);
    const positionRef = useRef(0);
    const { user, isReady } = useAuth();

    // Track page view
    useAnalyticsScreen('Welcome');

    // Redirect already-authenticated users so back navigation doesn't strand them here
    useEffect(() => {
        if (isReady && user) {
            router.replace('/');
        }
    }, [isReady, user]);

    const features = [
        {
            icon: LinkIcon,
            iconColor: '#2563eb',
            iconBg: '#eff6ff',
            title: 'Invoices & payment links',
            text: 'Create professional invoices and shareable payment links in seconds — AI fills in the details for you.',
        },
        {
            icon: Users,
            iconColor: '#7c3aed',
            iconBg: '#f5f3ff',
            title: 'Client management',
            text: 'Keep all your client info, history, and earnings in one place. Never lose track of who owes you.',
        },
        {
            icon: FolderOpen,
            iconColor: '#d97706',
            iconBg: '#fffbeb',
            title: 'Projects & milestones',
            text: 'Organize work into projects, break it into milestones, and convert completed work into invoices instantly.',
        },
        {
            icon: Wallet,
            iconColor: '#059669',
            iconBg: '#ecfdf5',
            title: 'Crypto wallet & offramp',
            text: 'Get paid in USDC or USDT on any chain. Withdraw to your local bank account without leaving the app.',
        },
        {
            icon: FileText,
            iconColor: '#0891b2',
            iconBg: '#ecfeff',
            title: 'Contracts & proposals',
            text: 'Generate contracts and proposals with Hedwig AI. Send for signature and track when clients view them.',
        },
        {
            icon: BarChart3,
            iconColor: '#db2777',
            iconBg: '#fdf2f8',
            title: 'Insights & goals',
            text: 'See your earnings trends, invoice performance, and set monthly targets to grow your freelance business.',
        },
    ];

    // Continuous auto-scroll
    useEffect(() => {
        const itemHeight = 100;
        const maxScroll = features.length * itemHeight;

        const interval = setInterval(() => {
            positionRef.current += 0.5;

            if (positionRef.current >= maxScroll) {
                positionRef.current = 0;
                scrollViewRef.current?.scrollTo({ y: 0, animated: false });
            } else {
                scrollViewRef.current?.scrollTo({ y: positionRef.current, animated: false });
            }
        }, 30); // Smoother at 30ms

        return () => clearInterval(interval);
    }, [features.length]);

    return (
        <View style={[styles.container, { paddingTop: insets.top + 40, backgroundColor: themeColors.background }]}>
            {/* Fixed Header */}
            <View style={styles.headerContainer}>
                <Text style={[styles.title, { color: themeColors.textPrimary }]}>Hi, I'm Hedwig!</Text>
                <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
                    Your personal freelance assistant. Here's what I can help you with:
                </Text>
            </View>

            {/* Auto-scrolling Feature Cards */}
            <ScrollView
                ref={scrollViewRef}
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                scrollEnabled={false}
            >
                {[...features, ...features.slice(0, 3)].map((feature, index) => {
                    const Icon = feature.icon;
                    return (
                        <View key={index} style={[styles.featureCard, { backgroundColor: themeColors.background, borderColor: themeColors.border }]}>
                            <View style={[styles.iconWrap, { backgroundColor: feature.iconBg }]}>
                                <Icon size={18} color={feature.iconColor} />
                            </View>
                            <View style={styles.cardBody}>
                                <Text style={[styles.cardTitle, { color: themeColors.textPrimary }]}>{feature.title}</Text>
                                <Text style={[styles.featureText, { color: themeColors.textSecondary }]}>{feature.text}</Text>
                            </View>
                        </View>
                    );
                })}
            </ScrollView>

            {/* Bottom Button */}
            <View style={[styles.buttonContainer, { paddingBottom: insets.bottom + 8, backgroundColor: themeColors.background }]}>
                <Button
                    title="Get Started"
                    onPress={() => router.push('/auth/login')}
                    variant="primary"
                    size="large"
                />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FFFFFF',
    },
    headerContainer: {
        paddingHorizontal: 24,
        marginBottom: 24,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 24,
        paddingBottom: 20,
    },
    title: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 34,
        letterSpacing: -0.5,
        color: Colors.textPrimary,
        marginBottom: 10,
    },
    subtitle: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 16,
        color: Colors.textSecondary,
        lineHeight: 24,
    },
    featureCard: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 14,
        borderRadius: 20,
        padding: 18,
        marginBottom: 12,
        borderWidth: 1,
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.06,
                shadowRadius: 4,
            },
            android: { elevation: 1 },
        }),
    },
    iconWrap: {
        width: 36,
        height: 36,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        flexShrink: 0,
    },
    cardBody: {
        flex: 1,
    },
    cardTitle: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 15,
        marginBottom: 4,
    },
    featureText: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 14,
        lineHeight: 21,
    },
    buttonContainer: {
        paddingHorizontal: 24,
        backgroundColor: '#FFFFFF',
    },
});
