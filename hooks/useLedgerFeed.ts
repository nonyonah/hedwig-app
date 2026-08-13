import { useState, useEffect, useCallback } from 'react';
import { usePrivy } from '@privy-io/expo';
import { fetchApiJson, getApiBaseUrl } from '../utils/apiBaseUrl';

export type LedgerFeedRange = '7d' | '30d' | '90d' | 'ytd' | '1y';

export interface LedgerFeedEntry {
    date: string;
    description: string;
    account: string;
    debit: number;
    credit: number;
    type: 'revenue' | 'expense' | 'credit' | 'transfer';
    referenceId: string;
    category: string | null;
    currency: string;
    event_type?: string | null;
    status?: string | null;
}

export interface LedgerMovement {
    account: string;
    amount: number;
}

export interface LedgerFeedSummary {
    totalRevenue: number;
    totalCredits: number;
    totalExpenses: number;
    netIncome: number;
    entryCount: number;
    moneyIn: number;
    moneyOut: number;
    net: number;
    movement: { in: LedgerMovement[]; out: LedgerMovement[] };
}

/**
 * Timeline feed — reads the normalized ledger (/api/revenue/ledger), which is
 * enriched with financial_event kinds + reconciliation status. Mirrors the
 * web Ledger screen data contract 1:1 so the mobile feed and desktop agree.
 */
export function useLedgerFeed(range: LedgerFeedRange = '30d') {
    const { getAccessToken } = usePrivy();
    const [entries, setEntries] = useState<LedgerFeedEntry[]>([]);
    const [summary, setSummary] = useState<LedgerFeedSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchFeed = useCallback(
        async (isRefresh = false) => {
            if (isRefresh) setRefreshing(true);
            else setLoading(true);
            setError(null);

            try {
                const token = await getAccessToken();
                if (!token) {
                    setError('Please sign in again.');
                    return;
                }

                const result = await fetchApiJson(`/api/revenue/ledger?range=${range}&kind=all&page=1&pageSize=100`, {
                    headers: { 'Authorization': `Bearer ${token}` },
                });

                if (!result?.success) {
                    throw new Error(result?.error?.message || 'Failed to load your timeline');
                }

                const data = result.data || {};
                setEntries(Array.isArray(data.entries) ? data.entries : []);
                setSummary((data.summary || null) as LedgerFeedSummary | null);
            } catch (err: any) {
                setError(err?.message || 'Failed to load your timeline');
            } finally {
                setLoading(false);
                setRefreshing(false);
            }
        },
        [getAccessToken, range],
    );

    useEffect(() => {
        fetchFeed(false);
    }, [fetchFeed]);

    const refetch = useCallback(() => fetchFeed(true), [fetchFeed]);

    return { entries, summary, loading, refreshing, error, refetch, range };
}