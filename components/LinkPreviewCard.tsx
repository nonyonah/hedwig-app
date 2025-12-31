import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { usePrivy } from '@privy-io/expo';
import { Copy, ShareNetwork, CheckCircle, Clock, WarningCircle, ArrowSquareOut } from 'phosphor-react-native';
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import * as Haptics from 'expo-haptics';
import { Colors, useThemeColors } from '../theme/colors';

interface LinkPreviewCardProps {
    docType: 'invoice' | 'payment-link' | 'contract' | 'proposal';
    docId: string;
    path: string;
}

interface DocumentPreview {
    title: string;
    amount: number;
    status: string;
    type: string;
    clientName?: string;
    description?: string;
}

export const LinkPreviewCard: React.FC<LinkPreviewCardProps> = ({ docType, docId, path }) => {
    const router = useRouter();
    const { getAccessToken } = usePrivy();
    const themeColors = useThemeColors();
    const [preview, setPreview] = useState<DocumentPreview | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        fetchPreview();
    }, [docId]);

    const fetchPreview = async () => {
        try {
            setLoading(true);
            setError(false);
            const token = await getAccessToken();
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

            const response = await fetch(`${apiUrl}/api/documents/${docId}`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });

            if (!response.ok) {
                // Silently fail - will show fallback UI
                setError(true);
                return;
            }

            const data = await response.json();
            if (data.success && data.data?.document) {
                const doc = data.data.document;
                setPreview({
                    title: doc.title || 'Untitled',
                    amount: doc.amount || 0,
                    status: doc.status || 'DRAFT',
                    type: doc.type || docType.toUpperCase(),
                    clientName: doc.content?.client_name,
                    description: doc.description,
                });
            } else {
                setError(true);
            }
        } catch (err) {
            // Network errors are common (offline, server down) - fail silently
            setError(true);
        } finally {
            setLoading(false);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status?.toUpperCase()) {
            case 'PAID': return '#10B981';
            case 'PENDING': return '#F59E0B';
            case 'DRAFT': return Colors.textSecondary;
            default: return Colors.textSecondary;
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status?.toUpperCase()) {
            case 'PAID': return <CheckCircle size={14} color="#10B981" weight="fill" />;
            case 'PENDING': return <Clock size={14} color="#F59E0B" weight="fill" />;
            default: return <WarningCircle size={14} color={Colors.textSecondary} weight="fill" />;
        }
    };

    const getTypeLabel = () => {
        switch (docType) {
            case 'invoice': return 'Invoice';
            case 'payment-link': return 'Payment Link';
            case 'contract': return 'Contract';
            case 'proposal': return 'Proposal';
            default: return 'Document';
        }
    };

    const getTypeEmoji = () => {
        switch (docType) {
            case 'invoice': return '📄';
            case 'payment-link': return '💳';
            case 'contract': return '📝';
            case 'proposal': return '📋';
            default: return '📄';
        }
    };

    const handleCopy = async () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        const apiUrl = process.env.EXPO_PUBLIC_API_URL || '';
        await Clipboard.setStringAsync(`${apiUrl}${path}`);
    };

    const handleOpenInBrowser = async () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
        await WebBrowser.openBrowserAsync(`${apiUrl}${path}`, {
            presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
            controlsColor: Colors.primary,
        });
    };

    const handleTap = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push(path);
    };

    if (loading) {
        return (
            <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="small" color={themeColors.primary} />
                    <Text style={[styles.loadingText, { color: themeColors.textSecondary }]}>Loading preview...</Text>
                </View>
            </View>
        );
    }

    if (error || !preview) {
        return (
            <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                <TouchableOpacity style={styles.content} onPress={handleTap}>
                    <View style={[styles.iconContainer, { backgroundColor: themeColors.surfaceHighlight }]}>
                        <Text style={styles.emoji}>{getTypeEmoji()}</Text>
                    </View>
                    <View style={styles.info}>
                        <Text style={[styles.title, { color: themeColors.textPrimary }]}>{getTypeLabel()}</Text>
                        <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>Tap to view • ID: {docId?.substring(0, 8)}...</Text>
                    </View>
                </TouchableOpacity>
                <View style={[styles.actions, { borderTopColor: themeColors.border }]}>
                    <TouchableOpacity style={[styles.actionButton, { borderRightColor: themeColors.border }]} onPress={handleCopy}>
                        <Copy size={16} color={themeColors.primary} />
                        <Text style={[styles.actionText, { color: themeColors.primary }]}>Copy</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    return (
        <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <TouchableOpacity style={styles.content} onPress={handleTap}>
                <View style={[styles.iconContainer, { backgroundColor: `${getStatusColor(preview.status)}15` }]}>
                    <Text style={styles.emoji}>{getTypeEmoji()}</Text>
                </View>
                <View style={styles.info}>
                    <View style={styles.titleRow}>
                        <Text style={[styles.title, { color: themeColors.textPrimary }]} numberOfLines={1}>{preview.title}</Text>
                        <View style={[styles.statusBadge, { backgroundColor: themeColors.surfaceHighlight }]}>
                            {getStatusIcon(preview.status)}
                            <Text style={[styles.statusText, { color: getStatusColor(preview.status) }]}>
                                {preview.status}
                            </Text>
                        </View>
                    </View>
                    <Text style={[styles.amount, { color: themeColors.textPrimary }]}>${preview.amount?.toFixed(2)} USDC</Text>
                    {preview.clientName && (
                        <Text style={[styles.subtitle, { color: themeColors.textSecondary }]} numberOfLines={1}>
                            Client: {preview.clientName}
                        </Text>
                    )}
                </View>
            </TouchableOpacity>
            <View style={[styles.actions, { borderTopColor: themeColors.border }]}>
                <TouchableOpacity style={[styles.actionButton, { borderRightColor: themeColors.border }]} onPress={handleCopy}>
                    <Copy size={16} color={themeColors.primary} />
                    <Text style={[styles.actionText, { color: themeColors.primary }]}>Copy</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionButton, { borderRightColor: themeColors.border }]} onPress={handleOpenInBrowser}>
                    <ArrowSquareOut size={16} color={themeColors.primary} />
                    <Text style={[styles.actionText, { color: themeColors.primary }]}>Open</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    card: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        marginVertical: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 3,
        borderWidth: 1,
        borderColor: 'rgba(0, 0, 0, 0.05)',
        overflow: 'hidden',
    },
    loadingContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        gap: 10,
    },
    loadingText: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 14,
        color: Colors.textSecondary,
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        gap: 12,
    },
    iconContainer: {
        width: 48,
        height: 48,
        borderRadius: 12,
        backgroundColor: '#F3F4F6',
        alignItems: 'center',
        justifyContent: 'center',
    },
    emoji: {
        fontSize: 24,
    },
    info: {
        flex: 1,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
    },
    title: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 15,
        color: Colors.textPrimary,
        flex: 1,
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: 'rgba(0, 0, 0, 0.03)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    statusText: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 11,
        textTransform: 'uppercase',
    },
    amount: {
        fontFamily: 'GoogleSansFlex_600SemiBold',
        fontSize: 18,
        color: Colors.textPrimary,
        marginTop: 4,
    },
    subtitle: {
        fontFamily: 'GoogleSansFlex_400Regular',
        fontSize: 13,
        color: Colors.textSecondary,
        marginTop: 2,
    },
    actions: {
        flexDirection: 'row',
        borderTopWidth: 1,
        borderTopColor: 'rgba(0, 0, 0, 0.05)',
    },
    actionButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        gap: 6,
        borderRightWidth: 1,
        borderRightColor: 'rgba(0, 0, 0, 0.05)',
    },
    actionText: {
        fontFamily: 'GoogleSansFlex_500Medium',
        fontSize: 13,
        color: Colors.primary,
    },
});

export default LinkPreviewCard;
