import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { CheckCircle, X } from 'phosphor-react-native';
import { useThemeColors } from '../theme/colors';
import { useSettings } from '../context/SettingsContext';

interface CreationSuccessModalProps {
    visible: boolean;
    onClose: () => void;
    type: 'invoice' | 'payment_link' | 'contract';
    amount?: number;
    title?: string;
}

export default function CreationSuccessModal({ visible, onClose, type, amount, title }: CreationSuccessModalProps) {
    const themeColors = useThemeColors();
    const { currentTheme } = useSettings();
    const isDark = currentTheme === 'dark';

    const getTypeName = () => {
        switch (type) {
            case 'invoice': return 'Invoice';
            case 'payment_link': return 'Payment Link';
            case 'contract': return 'Contract';
            default: return 'Item';
        }
    };

    return (
        <Modal
            transparent
            visible={visible}
            animationType="fade"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <View style={[styles.container, { backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF' }]}>
                    {/* Close Button */}
                    <TouchableOpacity
                        style={styles.closeButton}
                        onPress={onClose}
                        hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
                    >
                        <X size={24} color={isDark ? '#8E8E93' : '#8E8E93'} />
                    </TouchableOpacity>

                    {/* Content */}
                    <View style={styles.content}>
                        <CheckCircle
                            size={80}
                            weight="fill"
                            color={themeColors.primary}
                            style={styles.icon}
                        />

                        <Text style={[styles.title, { color: isDark ? '#FFFFFF' : '#000000' }]}>
                            {getTypeName()} Created!
                        </Text>

                        {amount !== undefined && (
                            <Text style={[styles.amount, { color: themeColors.primary }]}>
                                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)}
                            </Text>
                        )}

                        {title && (
                            <Text style={[styles.subtitle, { color: isDark ? '#8E8E93' : '#666666' }]} numberOfLines={2}>
                                {title}
                            </Text>
                        )}

                        <Text style={[styles.message, { color: isDark ? '#8E8E93' : '#666666' }]}>
                            Your {getTypeName().toLowerCase()} has been successfully created and sent.
                        </Text>

                        <TouchableOpacity
                            style={[styles.button, { backgroundColor: themeColors.primary }]}
                            onPress={onClose}
                        >
                            <Text style={styles.buttonText}>Done</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    container: {
        width: '100%',
        maxWidth: 400,
        borderRadius: 24,
        padding: 32,
        alignItems: 'center',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 5,
        position: 'relative',
    },
    closeButton: {
        position: 'absolute',
        top: 24,
        right: 24,
        zIndex: 10,
    },
    content: {
        alignItems: 'center',
        width: '100%',
    },
    icon: {
        marginBottom: 24,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 8,
        textAlign: 'center',
    },
    amount: {
        fontSize: 32,
        fontWeight: '700',
        marginBottom: 8,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 16,
        marginBottom: 24,
        textAlign: 'center',
        paddingHorizontal: 16,
    },
    message: {
        fontSize: 15,
        textAlign: 'center',
        marginBottom: 32,
        lineHeight: 22,
    },
    button: {
        width: '100%',
        paddingVertical: 16,
        borderRadius: 100,
        alignItems: 'center',
    },
    buttonText: {
        color: '#FFFFFF',
        fontSize: 17,
        fontWeight: '600',
    }
});
