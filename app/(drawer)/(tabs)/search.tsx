import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    Platform,
    StyleSheet,
    ScrollView,
    DeviceEventEmitter,
    TouchableOpacity,
    ActivityIndicator,
    TextInput,
    Keyboard,
    TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useThemeColors } from '../../../theme/colors';
import { useSettings } from '../../../context/SettingsContext';
import { useAuth } from '../../../hooks/useAuth';
import { joinApiUrl } from '../../../utils/apiBaseUrl';
import IOSGlassIconButton from '../../../components/ui/IOSGlassIconButton';
import {
    Search as SearchIcon,
    X as XIcon,
    Receipt as ReceiptIcon,
    Link2 as Link2Icon,
    FileText as FileTextIcon,
    Briefcase as BriefcaseIcon,
    Users as UsersIcon,
    ChevronRight as ChevronRightIcon,
} from '../../../components/ui/AppIcon';

const Search = (props: any) => <SearchIcon {...props} />;
const X = (props: any) => <XIcon {...props} />;
const Receipt = (props: any) => <ReceiptIcon {...props} />;
const Link2 = (props: any) => <Link2Icon {...props} />;
const FileText = (props: any) => <FileTextIcon {...props} />;
const Briefcase = (props: any) => <BriefcaseIcon {...props} />;
const Users = (props: any) => <UsersIcon {...props} />;
const ChevronRight = (props: any) => <ChevronRightIcon {...props} />;

type SearchItemType = 'invoice' | 'recurring_invoice' | 'payment_link' | 'contract' | 'project' | 'client';
type SearchItem = {
    id: string;
    type: SearchItemType;
    title: string;
    subtitle: string;
    status?: string;
    searchText: string;
};

export default function SearchScreen() {
    const themeColors = useThemeColors();
    const router = useRouter();
    const { getAccessToken, user, isReady } = useAuth();
    const { currentTheme } = useSettings();
    const isDark = currentTheme === 'dark';

    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    const emitTabBarScrollOffset = useCallback((offsetY: number) => {
        if (Platform.OS !== 'android') return;
        DeviceEventEmitter.emit('hedwig:tabbar-scroll', offsetY);
    }, []);

    const handleTabBarAwareScroll = useCallback((event: any) => {
        emitTabBarScrollOffset(event?.nativeEvent?.contentOffset?.y ?? 0);
    }, [emitTabBarScrollOffset]);

    useEffect(() => {
        return () => {
            emitTabBarScrollOffset(0);
        };
    }, [emitTabBarScrollOffset]);

    const fetchSearchIndex = useCallback(async () => {
        if (!isReady || !user) return;
        setLoading(true);
        setLoadError(null);
        try {
            const token = await getAccessToken();
            const headers = { Authorization: `Bearer ${token}` };

            const [
                invoicesRes,
                contractsRes,
                linksRes,
                projectsRes,
                recurringRes,
                clientsRes,
            ] = await Promise.allSettled([
                fetch(joinApiUrl('/api/documents?type=INVOICE'), { headers }).then((r) => r.json()),
                fetch(joinApiUrl('/api/documents?type=CONTRACT'), { headers }).then((r) => r.json()),
                fetch(joinApiUrl('/api/documents?type=PAYMENT_LINK'), { headers }).then((r) => r.json()),
                fetch(joinApiUrl('/api/projects'), { headers }).then((r) => r.json()),
                fetch(joinApiUrl('/api/recurring-invoices'), { headers }).then((r) => r.json()),
                fetch(joinApiUrl('/api/clients'), { headers }).then((r) => r.json()),
            ]);

            const nextResults: SearchItem[] = [];
            const addResult = (item: SearchItem) => {
                nextResults.push({
                    ...item,
                    searchText: `${item.title} ${item.subtitle} ${item.status || ''}`.toLowerCase(),
                });
            };

            const invoicesData = invoicesRes.status === 'fulfilled' ? invoicesRes.value : null;
            if (invoicesData?.success && Array.isArray(invoicesData?.data?.documents)) {
                invoicesData.data.documents.forEach((invoice: any) => {
                    addResult({
                        id: invoice.id,
                        type: 'invoice',
                        title: `Invoice #${invoice.content?.invoice_number || invoice.id?.slice?.(0, 8) || ''}`,
                        subtitle: invoice.content?.client_name || invoice.content?.recipient_email || 'Invoice',
                        status: invoice.status,
                        searchText: '',
                    });
                });
            }

            const contractsData = contractsRes.status === 'fulfilled' ? contractsRes.value : null;
            if (contractsData?.success && Array.isArray(contractsData?.data?.documents)) {
                contractsData.data.documents.forEach((contract: any) => {
                    addResult({
                        id: contract.id,
                        type: 'contract',
                        title: contract.title || 'Untitled Contract',
                        subtitle: contract.content?.client_name || 'Contract',
                        status: contract.status,
                        searchText: '',
                    });
                });
            }

            const linksData = linksRes.status === 'fulfilled' ? linksRes.value : null;
            if (linksData?.success && Array.isArray(linksData?.data?.documents)) {
                linksData.data.documents.forEach((link: any) => {
                    addResult({
                        id: link.id,
                        type: 'payment_link',
                        title: link.title || 'Payment Link',
                        subtitle: link.content?.client_name || link.content?.description || 'Payment Link',
                        status: link.status,
                        searchText: '',
                    });
                });
            }

            const projectsData = projectsRes.status === 'fulfilled' ? projectsRes.value : null;
            if (projectsData?.success && Array.isArray(projectsData?.data?.projects)) {
                projectsData.data.projects.forEach((project: any) => {
                    addResult({
                        id: project.id,
                        type: 'project',
                        title: project.name || project.title || 'Untitled Project',
                        subtitle: project.client?.name || 'Project',
                        status: project.status,
                        searchText: '',
                    });
                });
            }

            const recurringData = recurringRes.status === 'fulfilled' ? recurringRes.value : null;
            if (recurringData?.success && Array.isArray(recurringData?.data?.recurringInvoices)) {
                recurringData.data.recurringInvoices.forEach((recurring: any) => {
                    addResult({
                        id: recurring.id,
                        type: 'recurring_invoice',
                        title: recurring.title || 'Recurring Invoice',
                        subtitle: `${recurring.clientName || recurring.clientEmail || 'No client'} • ${recurring.frequency || 'monthly'}`,
                        status: recurring.status || 'active',
                        searchText: '',
                    });
                });
            }

            const clientsData = clientsRes.status === 'fulfilled' ? clientsRes.value : null;
            if (clientsData?.success && Array.isArray(clientsData?.data?.clients)) {
                clientsData.data.clients.forEach((client: any) => {
                    addResult({
                        id: client.id,
                        type: 'client',
                        title: client.name || 'Unnamed Client',
                        subtitle: client.email || client.company || 'Client',
                        status: client.status,
                        searchText: '',
                    });
                });
            }

            setResults(nextResults);
            if (nextResults.length === 0) {
                setLoadError('No searchable items found yet.');
            }
        } catch (error) {
            console.error('[Search] Failed to build search index:', error);
            setLoadError('Could not load search data right now.');
        } finally {
            setLoading(false);
        }
    }, [getAccessToken, isReady, user]);

    useFocusEffect(
        useCallback(() => {
            void fetchSearchIndex();
        }, [fetchSearchIndex])
    );

    const filteredResults = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        if (!normalized) return [];
        return results.filter((item) => item.searchText.includes(normalized));
    }, [query, results]);

    const countsByType = useMemo(() => {
        const counts: Record<SearchItemType, number> = {
            invoice: 0,
            recurring_invoice: 0,
            payment_link: 0,
            contract: 0,
            project: 0,
            client: 0,
        };
        results.forEach((item) => {
            counts[item.type] += 1;
        });
        return counts;
    }, [results]);

    const getResultIcon = (type: SearchItemType) => {
        const iconColor = themeColors.textPrimary;
        switch (type) {
            case 'invoice':
            case 'recurring_invoice':
                return <Receipt size={17} color={iconColor} />;
            case 'payment_link':
                return <Link2 size={17} color={iconColor} />;
            case 'contract':
                return <FileText size={17} color={iconColor} />;
            case 'project':
                return <Briefcase size={17} color={iconColor} />;
            case 'client':
                return <Users size={17} color={iconColor} />;
            default:
                return <Search size={17} color={iconColor} />;
        }
    };

    const getTypeLabel = (type: SearchItemType) => {
        switch (type) {
            case 'invoice':
                return 'Invoice';
            case 'recurring_invoice':
                return 'Recurring Invoice';
            case 'payment_link':
                return 'Payment Link';
            case 'contract':
                return 'Contract';
            case 'project':
                return 'Project';
            case 'client':
                return 'Client';
            default:
                return 'Result';
        }
    };

    const handleSelectResult = useCallback((item: SearchItem) => {
        if (item.type === 'invoice') {
            router.push({ pathname: '/invoices', params: { selected: item.id } } as any);
            return;
        }
        if (item.type === 'recurring_invoice') {
            router.push({ pathname: '/invoices', params: { filter: 'recurring', selectedRecurring: item.id } } as any);
            return;
        }
        if (item.type === 'payment_link') {
            router.push({ pathname: '/payment-links', params: { selected: item.id } } as any);
            return;
        }
        if (item.type === 'contract') {
            router.push({ pathname: '/contracts', params: { selected: item.id } } as any);
            return;
        }
        if (item.type === 'project') {
            router.push({ pathname: '/projects', params: { projectId: item.id } } as any);
            return;
        }
        router.push('/clients' as any);
    }, [router]);

    const clearSearch = useCallback(() => {
        setQuery('');
        Keyboard.dismiss();
    }, []);

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
                <View style={styles.content} onTouchStart={Keyboard.dismiss}>
                    <View style={styles.searchRow}>
                        <View style={[styles.searchBarWrapper, { backgroundColor: isDark ? '#1C1C1E' : '#F2F2F7' }]}>
                            <Search size={16} color={themeColors.textSecondary} />
                            <TextInput
                                value={query}
                                onChangeText={setQuery}
                                placeholder="Search invoices, links, contracts, clients…"
                                placeholderTextColor={themeColors.textSecondary}
                                style={[styles.nativeInput, { color: themeColors.textPrimary }]}
                                returnKeyType="search"
                                onSubmitEditing={Keyboard.dismiss}
                                blurOnSubmit
                            />
                        </View>
                        <IOSGlassIconButton
                            onPress={clearSearch}
                            icon={<X size={15} color={themeColors.textPrimary} />}
                            systemImage="xmark"
                            useGlass
                            forceGlassForClose
                            circleStyle={styles.cancelButton}
                        />
                    </View>

                    <ScrollView
                        style={styles.results}
                        contentContainerStyle={styles.resultsContent}
                        contentInsetAdjustmentBehavior="automatic"
                        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                        keyboardShouldPersistTaps="handled"
                        onTouchStart={Keyboard.dismiss}
                        onScroll={handleTabBarAwareScroll}
                        scrollEventThrottle={16}
                    >
                        {loading ? (
                            <View style={styles.centerState}>
                                <ActivityIndicator color={themeColors.primary} />
                            </View>
                        ) : query.trim().length === 0 ? (
                            <>
                                <Text style={[styles.sectionLabel, { color: themeColors.textSecondary }]}>Browse</Text>
                                {[
                                    { label: 'Invoices', count: countsByType.invoice + countsByType.recurring_invoice },
                                    { label: 'Payment Links', count: countsByType.payment_link },
                                    { label: 'Contracts', count: countsByType.contract },
                                    { label: 'Projects', count: countsByType.project },
                                    { label: 'Clients', count: countsByType.client },
                                ].map((cat) => (
                                    <View key={cat.label} style={[styles.categoryRow, { borderColor: themeColors.border }]}>
                                        <Text style={[styles.categoryText, { color: themeColors.textPrimary }]}>{cat.label}</Text>
                                        <Text style={[styles.categoryCount, { color: themeColors.textSecondary }]}>{cat.count}</Text>
                                    </View>
                                ))}
                                {loadError ? (
                                    <Text style={[styles.emptyHint, { color: themeColors.textSecondary }]}>
                                        {loadError}
                                    </Text>
                                ) : null}
                            </>
                        ) : filteredResults.length > 0 ? (
                            <>
                                <Text style={[styles.sectionLabel, { color: themeColors.textSecondary }]}>
                                    Results ({filteredResults.length})
                                </Text>
                                {filteredResults.map((item) => (
                                    <TouchableOpacity
                                        key={`${item.type}:${item.id}`}
                                        style={[styles.resultRow, { borderColor: themeColors.border }]}
                                        onPress={() => handleSelectResult(item)}
                                        activeOpacity={0.75}
                                    >
                                        <View style={[styles.resultIconWrap, { backgroundColor: themeColors.surface }]}>
                                            {getResultIcon(item.type)}
                                        </View>
                                        <View style={styles.resultTextWrap}>
                                            <Text style={[styles.resultTitle, { color: themeColors.textPrimary }]} numberOfLines={1}>
                                                {item.title}
                                            </Text>
                                            <Text style={[styles.resultSubtitle, { color: themeColors.textSecondary }]} numberOfLines={1}>
                                                {item.subtitle}
                                            </Text>
                                            <Text style={[styles.resultType, { color: themeColors.textSecondary }]}>
                                                {getTypeLabel(item.type)}
                                            </Text>
                                        </View>
                                        <ChevronRight size={16} color={themeColors.textSecondary} />
                                    </TouchableOpacity>
                                ))}
                            </>
                        ) : (
                            <Text style={[styles.emptyHint, { color: themeColors.textSecondary }]}>
                                No results for "{query.trim()}"
                            </Text>
                        )}
                    </ScrollView>
                </View>
            </TouchableWithoutFeedback>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    content: { flex: 1 },
    searchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginHorizontal: 16,
        marginTop: 6,
        marginBottom: 6,
    },
    searchBarWrapper: {
        flex: 1,
        minHeight: 46,
        borderRadius: 24,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    nativeInput: {
        flex: 1,
        height: 40,
        fontSize: 16,
        fontFamily: 'GoogleSansFlex_400Regular',
    },
    cancelButton: {
        width: 40,
        height: 40,
    },
    results: { flex: 1 },
    resultsContent: { padding: 16, paddingTop: 8, paddingBottom: 28 },
    sectionLabel: {
        fontSize: 13,
        fontFamily: 'GoogleSansFlex_700Bold',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 8,
    },
    categoryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 14,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    categoryText: {
        fontSize: 16,
        fontFamily: 'GoogleSansFlex_700Bold',
    },
    categoryCount: {
        fontSize: 14,
        fontFamily: 'GoogleSansFlex_700Bold',
    },
    centerState: {
        marginTop: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    resultRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    resultIconWrap: {
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: 'center',
        justifyContent: 'center',
    },
    resultTextWrap: {
        flex: 1,
        gap: 1,
    },
    resultTitle: {
        fontSize: 15,
        fontFamily: 'GoogleSansFlex_700Bold',
    },
    resultSubtitle: {
        fontSize: 13,
        fontFamily: 'GoogleSansFlex_600SemiBold',
    },
    resultType: {
        marginTop: 2,
        fontSize: 12,
        fontFamily: 'GoogleSansFlex_700Bold',
    },
    emptyHint: {
        fontSize: 15,
        textAlign: 'center',
        marginTop: 40,
        fontFamily: 'GoogleSansFlex_400Regular',
    },
});
