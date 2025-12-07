import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Image } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, User } from 'phosphor-react-native';
import { Colors } from '../../theme/colors';
import { usePrivy } from '@privy-io/expo';
import { LinearGradient } from 'expo-linear-gradient';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

export default function ProfileScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { email } = useLocalSearchParams<{ email: string }>();
    const [name, setName] = useState('');
    const [bio, setBio] = useState('');
    const [loading, setLoading] = useState(false);
    const { getAccessToken } = usePrivy();

    const handleSave = async () => {
        if (!name.trim()) return;

        setLoading(true);
        try {
            const token = await getAccessToken();

            // Split name into first and last
            const nameParts = name.trim().split(' ');
            const firstName = nameParts[0];
            const lastName = nameParts.slice(1).join(' ') || '';

            const response = await fetch(`${API_URL}/api/auth/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    email,
                    firstName,
                    lastName,
                    // bio, // Backend doesn't support bio yet
                })
            });

            const data = await response.json();

            if (data.success) {
                // Navigate to Biometrics or Home
                // User asked to redesign biometrics too, so maybe go there first
                router.replace('/auth/biometrics');
            } else {
                throw new Error(data.error?.message || 'Failed to create profile');
            }

        } catch (error) {
            console.error('Profile creation failed:', error);
            Alert.alert('Error', 'Failed to save profile. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.content}
            >
                <Text style={styles.title}>Your Profile</Text>
                <Text style={styles.subtitle}>Introduce yourself to others in your events.</Text>

                <View style={styles.formGroup}>
                    <Text style={styles.label}>Name</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Your Name"
                        placeholderTextColor="#9CA3AF"
                        value={name}
                        onChangeText={setName}
                        autoCapitalize="words"
                    />
                </View>

                <View style={styles.formGroup}>
                    <Text style={styles.label}>Bio</Text>
                    <TextInput
                        style={[styles.input, styles.textArea]}
                        placeholder="Share a little about your background and interests."
                        placeholderTextColor="#9CA3AF"
                        value={bio}
                        onChangeText={setBio}
                        multiline
                        numberOfLines={4}
                        textAlignVertical="top"
                    />
                </View>

                <View style={{ flex: 1 }} />

                <TouchableOpacity
                    style={[styles.button, (!name.trim() || loading) && styles.buttonDisabled]}
                    onPress={handleSave}
                    disabled={!name.trim() || loading}
                >
                    {loading ? (
                        <ActivityIndicator color="#FFFFFF" />
                    ) : (
                        <Text style={styles.buttonText}>Save Profile</Text>
                    )}
                </TouchableOpacity>
                <View style={{ height: insets.bottom + 20 }} />
            </KeyboardAvoidingView>
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
        paddingHorizontal: 24,
    },
    title: {
        fontFamily: 'Merriweather_700Bold',
        fontSize: 28,
        color: Colors.textPrimary,
        marginBottom: 8,
        marginTop: 40,
    },
    subtitle: {
        fontFamily: 'Merriweather_400Regular',
        fontSize: 16,
        color: Colors.textSecondary,
        marginBottom: 32,
    },
    formGroup: {
        marginBottom: 24,
    },
    label: {
        fontFamily: 'Merriweather_700Bold',
        fontSize: 14,
        color: Colors.textSecondary,
        marginBottom: 8,
    },
    input: {
        backgroundColor: '#F3F4F6',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 16,
        fontSize: 16,
        fontFamily: 'Merriweather_400Regular',
        color: Colors.textPrimary,
    },
    textArea: {
        height: 100,
        paddingTop: 16,
    },
    button: {
        backgroundColor: Colors.primary,
        paddingVertical: 16,
        borderRadius: 30,
        alignItems: 'center',
    },
    buttonDisabled: {
        backgroundColor: '#9CA3AF',
        opacity: 0.7,
    },
    buttonText: {
        fontFamily: 'Merriweather_700Bold',
        fontSize: 16,
        color: '#FFFFFF',
    },
});
