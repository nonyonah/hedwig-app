import { View, Text, StyleSheet, TouchableOpacity, Image, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Fingerprint } from 'phosphor-react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { Colors } from '../../theme/colors';
import { Metrics } from '../../theme/metrics';
import { Typography } from '../../styles/typography';

export default function BiometricsScreen() {
    const router = useRouter();

    const handleEnable = async () => {
        try {
            const hasHardware = await LocalAuthentication.hasHardwareAsync();
            if (!hasHardware) {
                Alert.alert('Error', 'Biometric hardware not available on this device.');
                return;
            }

            const isEnrolled = await LocalAuthentication.isEnrolledAsync();
            if (!isEnrolled) {
                Alert.alert('Error', 'No biometrics enrolled on this device. Please set them up in settings.');
                return;
            }

            const result = await LocalAuthentication.authenticateAsync({
                promptMessage: 'Secure your Hedwig account',
                fallbackLabel: 'Use passcode',
            });

            if (result.success) {
                // TODO: Save preference to use biometrics for future logins
                // For now, just navigate to home
                router.replace('/');
            } else {
                // User cancelled or failed
            }
        } catch (error) {
            console.error('Biometrics failed', error);
            Alert.alert('Error', 'Failed to authenticate with biometrics.');
        }
    };

    const handleLater = () => {
        router.replace('/');
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.content}>
                <View style={styles.iconContainer}>
                    <Fingerprint size={64} color="#FFFFFF" weight="fill" />
                </View>

                <View style={styles.textContainer}>
                    <Text style={styles.title}>Secure your account</Text>
                    <Text style={styles.subtitle}>
                        Log in faster, sign transactions securely with Hedwig using your biometrics.
                    </Text>
                </View>

                <View style={styles.footer}>
                    <TouchableOpacity
                        style={styles.primaryButton}
                        onPress={handleEnable}
                    >
                        <Text style={styles.primaryButtonText}>Enable now</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.secondaryButton}
                        onPress={handleLater}
                    >
                        <Text style={styles.secondaryButtonText}>Maybe later</Text>
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
        paddingHorizontal: Metrics.spacing.lg,
        paddingVertical: Metrics.spacing.xxl,
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    iconContainer: {
        marginTop: 60,
        marginBottom: Metrics.spacing.xl,
        width: 104,
        height: 104,
        borderRadius: 52, // Half of 104
        backgroundColor: '#000000',
        justifyContent: 'center',
        alignItems: 'center',
    },
    textContainer: {
        alignItems: 'center',
        gap: Metrics.spacing.sm,
    },
    title: {
        ...Typography.title,
        textAlign: 'center',
    },
    subtitle: {
        ...Typography.subtitle,
        paddingHorizontal: Metrics.spacing.xl,
    },
    footer: {
        width: '100%',
        gap: Metrics.spacing.md,
    },
    primaryButton: {
        backgroundColor: Colors.primary,
        paddingVertical: Metrics.spacing.md,
        borderRadius: Metrics.borderRadius.md,
        alignItems: 'center',
    },
    primaryButtonText: {
        ...Typography.button,
    },
    secondaryButton: {
        paddingVertical: Metrics.spacing.md,
        borderRadius: Metrics.borderRadius.md,
        alignItems: 'center',
    },
    secondaryButtonText: {
        ...Typography.button,
        color: Colors.textPrimary,
        fontFamily: 'Outfit_600SemiBold',
    },
});
