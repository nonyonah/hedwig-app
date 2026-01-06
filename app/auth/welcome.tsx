import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, useThemeColors } from '../../theme/colors';
import { Button } from '../../components/Button';

export default function WelcomeScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const themeColors = useThemeColors();
    const scrollViewRef = useRef<ScrollView>(null);
    const positionRef = useRef(0);

    const features = [
        {
            text: <>Create <Text style={styles.highlight}>payment links</Text> and <Text style={styles.highlight}>invoices</Text> in seconds with AI-powered assistance.</>,
        },
        {
            text: <>Manage <Text style={styles.highlight}>clients</Text>, <Text style={styles.highlight}>projects</Text>, and track your <Text style={styles.highlight}>milestones</Text> effortlessly.</>,
        },
        {
            text: <>Get paid in <Text style={styles.highlight}>crypto</Text> and <Text style={styles.highlight}>withdraw</Text> to your local bank account.</>,
        },
        {
            text: <>Chat with <Text style={styles.highlight}>Hedwig AI</Text> to generate contracts, proposals, and business documents.</>,
        },
        {
            text: <>Track your <Text style={styles.highlight}>earnings</Text> and get <Text style={styles.highlight}>insights</Text> on your freelance business.</>,
        },
        {
            text: <>Set <Text style={styles.highlight}>monthly goals</Text> and monitor your <Text style={styles.highlight}>progress</Text> with smart analytics.</>,
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
                {features.map((feature, index) => (
                    <View key={index} style={[styles.featureCard, { backgroundColor: themeColors.surface, borderLeftColor: Colors.primary }]}>
                        <Text style={[styles.featureText, { color: themeColors.textPrimary }]}>
                            {feature.text}
                        </Text>
                    </View>
                ))}
                {/* Duplicate first few items for seamless loop */}
                {features.slice(0, 3).map((feature, index) => (
                    <View key={`dup-${index}`} style={[styles.featureCard, { backgroundColor: themeColors.surface, borderLeftColor: Colors.primary }]}>
                        <Text style={[styles.featureText, { color: themeColors.textPrimary }]}>
                            {feature.text}
                        </Text>
                    </View>
                ))}
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
        fontSize: 32,
        color: Colors.textPrimary,
        marginBottom: 16,
    },
    subtitle: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 17,
        color: Colors.textSecondary,
        lineHeight: 26,
    },
    featureCard: {
        backgroundColor: '#FAFAFA',
        borderRadius: 12,
        padding: 20,
        marginBottom: 16,
        borderLeftWidth: 3,
        borderLeftColor: Colors.primary,
    },
    featureText: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 17,
        color: Colors.textPrimary,
        lineHeight: 26,
    },
    highlight: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        textDecorationLine: 'underline',
        textDecorationColor: Colors.primary,
    },
    buttonContainer: {
        paddingHorizontal: 24,
        backgroundColor: '#FFFFFF',
    },
});
