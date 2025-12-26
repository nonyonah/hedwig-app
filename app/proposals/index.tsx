/**
 * Proposals Screen - TEMPORARILY DISABLED
 * 
 * This feature is temporarily disabled for TestFlight.
 * To re-enable: restore from git history or remove this file and recreate.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, FileText } from 'phosphor-react-native';
import { Colors } from '../../theme/colors';
import { Typography } from '../../styles/typography';

export default function ProposalsScreen() {
    const router = useRouter();

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <ArrowLeft size={24} color={Colors.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Proposals</Text>
                <View style={{ width: 24 }} />
            </View>

            <View style={styles.content}>
                <FileText size={80} color={Colors.textSecondary} weight="light" />
                <Text style={styles.title}>Coming Soon</Text>
                <Text style={styles.subtitle}>
                    The proposals feature is currently being improved.{'\n'}
                    Check back soon!
                </Text>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    backButton: {
        padding: 4,
    },
    headerTitle: {
        ...Typography.h3,
        color: Colors.textPrimary,
    },
    content: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 40,
    },
    title: {
        ...Typography.h2,
        color: Colors.textPrimary,
        marginTop: 24,
        marginBottom: 12,
    },
    subtitle: {
        ...Typography.body,
        color: Colors.textSecondary,
        textAlign: 'center',
        lineHeight: 22,
    },
});
