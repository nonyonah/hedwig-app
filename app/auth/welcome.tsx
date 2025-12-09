import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../theme/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Sparkle } from 'phosphor-react-native';
import { Button } from '../../components/Button';

const { width } = Dimensions.get('window');

export default function WelcomeScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();

    return (
        <View style={styles.container}>
            {/* Background Gradient */}
            <LinearGradient
                colors={['#FFFFFF', '#F0F9FF', '#E0F2FE']}
                style={StyleSheet.absoluteFill}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
            />

            {/* Content */}
            <View style={[styles.content, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 20 }]}>

                {/* 3D Elements Placeholder (Circle of avatars/icons) */}
                <View style={styles.visualContainer}>
                    {/* Central Sparkle */}
                    <View style={styles.centerSparkleContainer}>
                        <Sparkle size={64} color="#F59E0B" weight="fill" />
                    </View>

                    {/* Orbiting Elements (Simulated) */}
                    <View style={[styles.orbitItem, { top: -80, left: 0 }]}>
                        <View style={[styles.avatarPlaceholder, { backgroundColor: '#E0E7FF' }]}>
                            <Text style={{ fontSize: 24 }}>📄</Text>
                        </View>
                    </View>
                    <View style={[styles.orbitItem, { top: -40, right: -20 }]}>
                        <View style={[styles.avatarPlaceholder, { backgroundColor: '#FEF3C7' }]}>
                            <Text style={{ fontSize: 24 }}>💰</Text>
                        </View>
                    </View>
                    <View style={[styles.orbitItem, { bottom: -60, left: -20 }]}>
                        <View style={[styles.avatarPlaceholder, { backgroundColor: '#D1FAE5' }]}>
                            <Text style={{ fontSize: 24 }}>🤖</Text>
                        </View>
                    </View>
                    <View style={[styles.orbitItem, { bottom: -20, right: 20 }]}>
                        <View style={[styles.avatarPlaceholder, { backgroundColor: '#FCE7F3' }]}>
                            <Text style={{ fontSize: 24 }}>✍️</Text>
                        </View>
                    </View>
                </View>

                {/* Text Content */}
                <View style={styles.textContainer}>
                    <View style={styles.logoContainer}>
                        <Sparkle size={24} color={Colors.textSecondary} weight="fill" />
                        <Text style={styles.logoText}>Hedwig</Text>
                    </View>

                    <Text style={styles.title}>I'm your freelance assistant</Text>
                </View>

                {/* Bottom Button */}
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
    content: {
        flex: 1,
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 24,
    },
    visualContainer: {
        width: width * 0.8,
        height: width * 0.8,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 40,
    },
    centerSparkleContainer: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: '#FFFFFF',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#F59E0B',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
        elevation: 10,
    },
    orbitItem: {
        position: 'absolute',
    },
    avatarPlaceholder: {
        width: 60,
        height: 60,
        borderRadius: 30,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
        backgroundColor: '#FFFFFF',
    },
    textContainer: {
        alignItems: 'center',
        marginBottom: 40,
    },
    logoContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 16,
    },
    logoText: {
        fontFamily: 'RethinkSans_700Bold',
        fontSize: 20,
        color: Colors.textSecondary,
    },
    title: {
        fontFamily: 'RethinkSans_700Bold',
        fontSize: 36,
        color: Colors.textPrimary,
        textAlign: 'center',
        marginBottom: 8,
        lineHeight: 44,
    },
    subtitle: {
        fontFamily: 'RethinkSans_400Regular',
        fontSize: 32,
        textAlign: 'center',
    },
});
