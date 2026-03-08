import { useState, useEffect, useCallback } from 'react';
import { usePrivy } from '@privy-io/expo';

export type InsightsRange = '7d' | '30d' | '90d' | '1y';

export interface Insight {
    id: string;
    type?: 'earnings' | 'client' | 'invoice' | 'deadline' | 'generic';
    title: string;
    description: string;
    icon?: string;
    priority: number;
    trend?: 'up' | 'down' | 'neutral';
    actionLabel?: string;
    actionRoute?: string;
    color?: string;
}

export interface InsightsSummary {
    monthlyEarnings: number;
    previousPeriodEarnings: number;
    earningsDeltaPct: number;
    pendingInvoicesCount: number;
    pendingInvoicesTotal: number;
    paymentRate: number;
    paidDocuments: number;
    totalDocuments: number;
    clientsCount: number;
    activeProjects: number;
    paymentLinksCount: number;
    topClient: { name: string; totalEarnings: number } | null;
    transactionsCount: number;
    receivedAmount: number;
    withdrawalsPending: number;
    withdrawalsCompletedAmount: number;
}

export interface InsightPoint {
    key: string;
    value: number;
}

export function useInsights(initialRange: InsightsRange = '30d') {
    const [insights, setInsights] = useState<Insight[]>([]);
    const [summary, setSummary] = useState<InsightsSummary | null>(null);
    const [series, setSeries] = useState<{ earnings: InsightPoint[] }>({ earnings: [] });
    const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [range, setRange] = useState<InsightsRange>(initialRange);
    const { getAccessToken } = usePrivy();

    const fetchData = useCallback(async (isRefresh = false) => {
        if (isRefresh) {
            setRefreshing(true);
        } else {
            setLoading(true);
        }
        setError(null);

        try {
            const token = await getAccessToken();
            if (!token) {
                setError('Please sign in again.');
                return;
            }

            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
            const response = await fetch(`${apiUrl}/api/insights/summary?range=${range}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const result = await response.json();

            if (!response.ok || !result?.success) {
                throw new Error(result?.error?.message || 'Failed to load insights');
            }

            const data = result.data || {};
            setInsights(Array.isArray(data.insights) ? data.insights : []);
            setSummary((data.summary || null) as InsightsSummary | null);
            setSeries(data.series || { earnings: [] });
            setLastUpdatedAt(data.lastUpdatedAt || new Date().toISOString());
        } catch (err: any) {
            setError(err?.message || 'Failed to load insights');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [getAccessToken, range]);

    useEffect(() => {
        fetchData(false);
    }, [fetchData]);

    const refetch = useCallback(async () => {
        await fetchData(true);
    }, [fetchData]);

    return {
        insights,
        summary,
        series,
        range,
        setRange,
        lastUpdatedAt,
        loading,
        refreshing,
        error,
        refetch,
    };
}
