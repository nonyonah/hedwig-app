import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../theme/colors';
import { Button } from '../../components/Button';

export default function WelcomeScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();

    return (
        <View style={styles.container}>
            {/* Main Content - Centered Logo */}
            <View style={styles.centerContent}>
                <Image
                    source={require('../../assets/images/hedwig-logo.png')}
                    style={styles.logo}
                    resizeMode="contain"
                />
            </View>

            {/* Bottom Section */}
            <View style={[styles.bottomSection, { paddingBottom: insets.bottom + 8 }]}>
                {/* Text Content */}
                <View style={styles.textContainer}>
                    <Text style={styles.logoText}>Hedwig</Text>
                    <Text style={styles.tagline}>Your personal freelance assistant.</Text>
                </View>

                {/* Get Started Button */}
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
    centerContent: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    logo: {
        width: 120,
        height: 120,
    },
    bottomSection: {
        paddingHorizontal: 24,
        gap: 24,
    },
    textContainer: {
        alignItems: 'center',
        gap: 8,
    },
    logoText: {
        fontFamily: 'RethinkSans_700Bold',
        fontSize: 28,
        color: Colors.textPrimary,
    },
    tagline: {
        fontFamily: 'RethinkSans_400Regular',
        fontSize: 16,
        color: Colors.textSecondary,
        textAlign: 'center',
    },
});
