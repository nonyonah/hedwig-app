import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../theme/colors';
import { Metrics } from '../../theme/metrics';
import { Typography } from '../../styles/typography';

export default function WelcomeScreen() {
    const router = useRouter();

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.content}>
                <View style={styles.logoContainer}>
                    <Image
                        source={require('../../assets/logo.jpg')}
                        style={styles.logoImage}
                        resizeMode="contain"
                    />
                </View>

                <View style={styles.buttonContainer}>
                    <TouchableOpacity
                        style={styles.loginButton}
                        onPress={() => router.push('/auth/login')}
                    >
                        <Text style={styles.loginButtonText}>Log in</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.createAccountButton}
                        onPress={() => router.push('/auth/signup')}
                    >
                        <Text style={styles.createAccountButtonText}>Create account</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    content: {
        flex: 1,
        justifyContent: 'space-between',
        paddingHorizontal: Metrics.spacing.lg,
        paddingBottom: Metrics.spacing.xxl,
        paddingTop: 0,
    },
    logoContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
    },
    logoImage: {
        width: Metrics.logo.width,
        height: Metrics.logo.height,
    },
    buttonContainer: {
        gap: Metrics.spacing.md,
        width: '100%',
    },
    loginButton: {
        backgroundColor: '#1F2937', // Keep specific color or add to theme if needed
        paddingVertical: Metrics.spacing.md,
        borderRadius: Metrics.borderRadius.md,
        alignItems: 'center',
    },
    loginButtonText: {
        ...Typography.button,
        fontFamily: 'Outfit_600SemiBold', // Override if needed, but Typography.button has it
    },
    createAccountButton: {
        backgroundColor: Colors.primary,
        paddingVertical: Metrics.spacing.md,
        borderRadius: Metrics.borderRadius.md,
        alignItems: 'center',
    },
    createAccountButtonText: {
        ...Typography.button,
    },
});
