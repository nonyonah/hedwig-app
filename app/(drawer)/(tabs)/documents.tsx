import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    FlatList,
    DeviceEventEmitter,
    Platform,
    RefreshControl,
    ListRenderItem,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';

import { useThemeColors } from '../../../theme/colors';
import { useAuth } from '../../../hooks/useAuth';
import { joinApiUrl } from '../../../utils/apiBaseUrl';
import {
    Receipt as ReceiptIcon,
    Link2 as Link2Icon,
    FileText as FileTextIcon,
    ChevronRight as ChevronRightIcon,
} from '../../../components/ui/AppIcon';

type DocType = 'invoice' | 'contract' | 'payment_link';
type DocFilter = 'all' | 'invoices' | 'links' | 'contracts';

type DocumentItem = {
    id: string;
    type: DocType;
    title: string;
    subtitle: string;
    status?: string;
    amount?: number;
    currency?: string;
    date?: string;
};

const FILTERS: { key: DocFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'invoices', label: 'Invoices' },
    { key: 'links', label: 'Links' },
    { key: 'contracts', label: 'Contracts' },
];

function statusTone(status: string | undefined): { label: string; color: string; bg: string } {
    const s = (status || '').toUpperCase();
    if (s === 'PAID') return { label: 'Paid', color: '#10B981', bg: '#10B98118' };
    if (s === 'OVERDUE') return { label: 'Overdue', color: '#EF4444', bg: '#EF444418' };
    if (s === 'ACTIVE') return { label: 'Active', color: '#10B981', bg: '#10B98118' };
    if (s === 'PENDING' || s === 'DUE' || s === 'SENT' || s === 'UNPAID') {
        return { label: 'Open', color: '#F59E0B', bg: '#F59E0B18' };
    }
    if (s === 'DRAFT') return { label: 'Draft', color: '#6B7280', bg: '#6B728018' };
    if (s === 'CANCELLED' || s === 'DECLINED') return { label: 'Closed', color: '#6B7280', bg: '#6B728018' };
    return { label: status || '—', color: '#6B7280', bg: '#6B728018' };
}

function formatCurrencyValue(amount: number | undefined, currency?: string): string {
    if (amount === undefined || amount === null || Number.isNaN(Number(amount))) return '';
    const symbols: Record<string, string> = { USD: '$', NGN: '₦', GHS: '₵', KES: 'KSh' };
    const symbol = symbols[String(currency || 'USD').toUpperCase()] || '$';
    const formatted = Number(amount).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
    return `${symbol}${formatted}`;
}

export default function DocumentsScreen() {
    const themeColors = useThemeColors();
    const router = useRouter();
    const { getAccessToken, user, isReady } = useAuth();

    const [items, setItems] = useState<DocumentItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [filter, setFilter] = useState<DocFilter>('all');

    const emitTabBarScrollOffset = useCallback((offsetY: number) => {
        if (Platform.OS !== 'android') return;
        DeviceEventEmitter.emit('hedwig:tabbar-scroll', offsetY);
    }, []);

    useEffect(() => {
        return () => emitTabBarScrollOffset(0);
    }, [emitTabBarScrollOffset]);

    const fetchDocuments = useCallback(async (isRefresh = false) => {
        if (!isReady || !user) return;
        isRefresh ? setRefreshing(true) : setLoading(true);
        setLoadError(null);
        try {
            const token = await getAccessToken();
            const headers = { Authorization: `Bearer ${token}` };

            const [invoicesRes, contractsRes, linksRes] = await Promise.allSettled([
                fetch(joinApiUrl('/api/documents?type=INVOICE'), { headers }).then((r) => r.json()),
                fetch(joinApiUrl('/api/documents?type=CONTRACT'), { headers }).then((r) => r.json()),
                fetch(joinApiUrl('/api/documents?type=PAYMENT_LINK'), { headers }).then((r) => r.json()),
            ]);

            const next: DocumentItem[] = [];

            const pushInvoices = (documents: any[]) => {
                documents.forEach((inv: any) => {
                    next.push({
                        id: inv.id,
                        type: 'invoice',
                        title: `Invoice #${inv.content?.invoice_number || inv.invoice_number || inv.id?.slice?.(0, 8) || ''}`,
                        subtitle: inv.content?.client_name || inv.content?.recipient_email || 'Invoice',
                        status: inv.status,
                        amount: Number(inv.content?.amount ?? inv.content?.total ?? inv.amount) || undefined,
                        currency: inv.currency || 'USD',
                        date: inv.created_at || inv.content?.issued_at || inv.issue_date,
                    });
                });
            };

            const pushLinks = (documents: any[]) => {
                documents.forEach((link: any) => {
                    const content = link.content || link;
                    next.push({
                        id: link.id,
                        type: 'payment_link',
                        title: link.title || 'Payment Link',
                        subtitle: content.client_name || content.description || 'Payment Link',
                        status: link.status,
                        amount: Number(content.amount ?? content.amount_paid ?? link.amount) || undefined,
                        currency: link.currency || 'USD',
                        date: link.created_at || link.date,
                    });
                });
            };

            const pushContracts = (documents: any[]) => {
                documents.forEach((contract: any) => {
                    next.push({
                        id: contract.id,
                        type: 'contract',
                        title: contract.title || contract.content?.title || 'Contract',
                        subtitle: contract.content?.client_name || contract.content?.company_name || 'Contract',
                        status: contract.status,
                        currency: 'USD',
                        date: contract.created_at || contract.date,
                    });
                });
            };

            if (invoicesRes.status === 'fulfilled' && invoicesRes.value?.success) {
                pushInvoices(invoicesRes.value?.data?.documents || []);
            }
            if (contractsRes.status === 'fulfilled' && contractsRes.value?.success) {
                pushContracts(contractsRes.value?.data?.documents || []);
            }
            if (linksRes.status === 'fulfilled' && linksRes.value?.success) {
                pushLinks(linksRes.value?.data?.documents || []);
            }

            next.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
            setItems(next);
            if (next.length === 0) {
                setLoadError('No documents yet — create your first invoice or link.');
            }
        } catch (error) {
            console.error('[Documents] Failed to load documents:', error);
            setLoadError('Could not load documents right now.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [getAccessToken, isReady, user]);

    useFocusEffect(
        useCallback(() => {
            void fetchDocuments(false);
            return () => emitTabBarScrollOffset(0);
        }, [fetchDocuments, emitTabBarScrollOffset]),
    );

    const filtered = useMemo(() => {
        if (filter === 'all') return items;
        if (filter === 'invoices') return items.filter((i) => i.type === 'invoice');
        if (filter === 'links') return items.filter((i) => i.type === 'payment_link');
        return items.filter((i) => i.type === 'contract');
    }, [items, filter]);

    const counts = useMemo(
        () => ({
            invoices: items.filter((i) => i.type === 'invoice').length,
            links: items.filter((i) => i.type === 'payment_link').length,
            contracts: items.filter((i) => i.type === 'contract').length,
        }),
        [items],
    );

    const handleSelect = useCallback(
        (item: DocumentItem) => {
            if (item.type === 'invoice') {
                router.push({ pathname: '/invoices', params: { selected: item.id } } as any);
            } else if (item.type === 'payment_link') {
                router.push({ pathname: '/payment-links', params: { selected: item.id } } as any);
            } else {
                router.push({ pathname: '/contracts', params: { selected: item.id } } as any);
            }
        },
        [router],
    );

    const TypeIcon = (item: DocumentItem) => {
        if (item.type === 'invoice') return <ReceiptIcon size={18} color={themeColors.primary} />;
        if (item.type === 'payment_link') return <Link2Icon size={18} color={themeColors.primary} />;
        return <FileTextIcon size={18} color={themeColors.primary} />;
    };

    const renderItem: ListRenderItem<DocumentItem> = ({ item }) => {
        const tone = statusTone(item.status);
        return (
            <TouchableOpacity
                style={[styles.row, { borderColor: themeColors.border }]}
                onPress={() => handleSelect(item)}
                activeOpacity={0.75}
            >                <View style={[styles.rowIcon, { backgroundColor: themeColors.surface }]}>
                    {TypeIcon(item)}
                </View>
                <View style={styles.rowText}>
                    <Text style={[styles.rowTitle, { color: themeColors.textPrimary }]} numberOfLines={1}>
                        {item.title}
                    </Text>
                    <Text style={[styles.rowSubtitle, { color: themeColors.textSecondary }]} numberOfLines={1}>
                        {item.subtitle}
                    </Text>
                </View>
                <View style={styles.rowRight}>
                    {item.amount !== undefined ? (
                        <Text style={[styles.rowAmount, { color: themeColors.textPrimary }]}>
                            {formatCurrencyValue(item.amount, item.currency)}
                        </Text>
                    ) : null}
                    <View style={[styles.statusChip, { backgroundColor: tone.bg }]}>
                        <Text style={[styles.statusText, { color: tone.color }]}>{tone.label}</Text>
                    </View>
                </View>
                <ChevronRightIcon size={15} color={themeColors.textSecondary} />
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
            <View style={styles.header}>
                <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]}>Documents</Text>
                <Text style={[styles.headerSubtitle, { color: themeColors.textSecondary }]}>
                    {items.length} active
                </Text>
            </View>

            <View style={styles.filterRow}>
                {FILTERS.map((f) => {
                    const active = filter === f.key;
                    return (
                        <TouchableOpacity
                            key={f.key}
                            onPress={() => setFilter(f.key)}
                            style={[
                                styles.filterChip,
                                { backgroundColor: active ? themeColors.primary : themeColors.surface },
                            ]}
                        >
                            <Text
                                style={[
                                    styles.filterLabel,
                                    { color: active ? '#FFFFFF' : themeColors.textSecondary },
                                ]}
                            >
                                {f.label}
                            </Text>
                            {f.key !== 'all' ? (
                                <Text
                                    style={[
                                        styles.filterCount,
                                        { color: active ? '#FFFFFF' : themeColors.textSecondary },
                                    ]}
                                >
                                    {counts[f.key as keyof typeof counts]}
                                </Text>
                            ) : null}
                        </TouchableOpacity>
                    );
                })}
            </View>

            {loading ? (
                <View style={styles.centerState}>
                    <ActivityIndicator color={themeColors.primary} />
                </View>
            ) : filtered.length === 0 ? (
                <View style={styles.centerState}>
                    <View style={[styles.emptyIcon, { backgroundColor: themeColors.surface }]}>
                        <FileTextIcon size={28} color={themeColors.textSecondary} />
                    </View>
                    <Text style={[styles.emptyTitle, { color: themeColors.textPrimary }]}>
                        {filter === 'all' ? 'No documents yet' : 'Nothing here'}
                    </Text>
                    <Text style={[styles.emptyHint, { color: themeColors.textSecondary }]}>
                        {loadError || 'Create an invoice, link, or contract to get started.'}
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={filtered}
                    keyExtractor={(item) => `${item.type}:${item.id}`}
                    renderItem={renderItem}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={() => fetchDocuments(true)}
                            tintColor={themeColors.primary}
                        />
                    }
                    ListFooterComponent={<View style={styles.listFooter} />}
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 12,
    },
    headerTitle: {
        fontSize: 28,
        fontWeight: '700',
        letterSpacing: -0.5,
    },
    headerSubtitle: {
        fontSize: 14,
    },
    filterRow: {
        flexDirection: 'row',
        gap: 8,
        paddingHorizontal: 20,
        paddingBottom: 12,
    },
    filterChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 14,
    },
    filterLabel: {
        fontSize: 14,
        fontWeight: '600',
    },
    filterCount: {
        fontSize: 12,
        fontWeight: '700',
        opacity: 0.8,
    },
    listContent: {
        paddingHorizontal: 16,
        paddingTop: 4,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 8,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    rowIcon: {
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    rowText: {
        flex: 1,
        gap: 2,
    },
    rowTitle: {
        fontSize: 15,
        fontWeight: '700',
    },
    rowSubtitle: {
        fontSize: 13,
    },
    rowRight: {
        alignItems: 'flex-end',
        gap: 4,
    },
    rowAmount: {
        fontSize: 14,
        fontWeight: '700',
    },
    statusChip: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 8,
    },
    statusText: {
        fontSize: 11,
        fontWeight: '700',
    },
    centerState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 40,
    },
    emptyIcon: {
        width: 64,
        height: 64,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 14,
    },
    emptyTitle: {
        fontSize: 17,
        fontWeight: '700',
    },
    emptyHint: {
        fontSize: 14,
        textAlign: 'center',
        marginTop: 6,
        lineHeight: 20,
    },
    listFooter: {
        height: 48,
    },
});