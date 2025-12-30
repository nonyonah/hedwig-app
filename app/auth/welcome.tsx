import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, useThemeColors } from '../../theme/colors';
import { Button } from '../../components/Button';

export default function WelcomeScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const themeColors = useThemeColors();

    return (
        <View style={[styles.container, { paddingTop: insets.top + 40, backgroundColor: themeColors.background }]}>
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Title */}
                <Text style={[styles.title, { color: themeColors.textPrimary }]}>Welcome to Hedwig!</Text>

                {/* Subtitle */}
                <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
                    Your personal freelance assistant. Here's what you can do:
                </Text>

                {/* Feature Cards */}
                <View style={[styles.featureCard, { backgroundColor: themeColors.surface }]}>
                    <Text style={[styles.featureText, { color: themeColors.textPrimary }]}>
                        Create <Text style={styles.highlight}>payment links</Text> and{' '}
                        <Text style={styles.highlight}>invoices</Text> in seconds with AI-powered assistance.
                    </Text>
                </View>

                <View style={[styles.featureCard, { backgroundColor: themeColors.surface }]}>
                    <Text style={[styles.featureText, { color: themeColors.textPrimary }]}>
                        Manage <Text style={styles.highlight}>clients</Text>,{' '}
                        <Text style={styles.highlight}>projects</Text>, and track your{' '}
                        <Text style={styles.highlight}>milestones</Text> effortlessly.
                    </Text>
                </View>

                <View style={[styles.featureCard, { backgroundColor: themeColors.surface }]}>
                    <Text style={[styles.featureText, { color: themeColors.textPrimary }]}>
                        Get paid in <Text style={styles.highlight}>crypto</Text> and{' '}
                        <Text style={styles.highlight}>withdraw</Text> to your local bank account.
                    </Text>
                </View>
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
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 24,
        paddingBottom: 100,
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
        marginBottom: 32,
    },
    featureCard: {
        backgroundColor: '#FAFAFA',
        borderRadius: 12,
        padding: 20,
        marginBottom: 16,
        borderLeftWidth: 3,
        borderLeftColor: '#FCD34D',
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
        textDecorationColor: '#FCD34D',
    },
    buttonContainer: {
        paddingHorizontal: 24,
        backgroundColor: '#FFFFFF',
    },
});
