import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import { getOrCreateUser } from '../utils/userHelper';
import { createLogger } from '../utils/logger';
import { GeminiService } from '../services/gemini';

const logger = createLogger('Insights');
const router = Router();

type RangeKey = '7d' | '30d' | '90d' | '1y' | 'ytd';

const INSIGHTS_PAGE_SIZE = Math.max(100, Number(process.env.INSIGHTS_PAGE_SIZE || 500));
const INSIGHTS_MAX_ROWS = Math.max(INSIGHTS_PAGE_SIZE, Number(process.env.INSIGHTS_MAX_ROWS || 20000));

const summarizeSupabaseError = (error: any): string => {
    if (!error) return 'unknown error';
    if (typeof error === 'string') return error;

    const parts = [
        error.message,
        error.details,
        error.hint,
        error.code ? `code=${error.code}` : null,
    ].filter((part): part is string => Boolean(part && String(part).trim().length > 0));

    if (parts.length > 0) {
        return parts.join(' | ');
    }

    try {
        return JSON.stringify(error);
    } catch {
        return 'unknown error';
    }
};

const toNumber = (value: unknown): number => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const parsed = parseFloat(value.replace(/[^0-9.-]/g, ''));
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
};

const normalizeStatus = (value: unknown): string => String(value || '').trim().toUpperCase();

const getRangeStart = (range: RangeKey): Date => {
    const now = new Date();
    if (range === '7d') return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    if (range === '30d') return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (range === '90d') return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    if (range === '1y') return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    return new Date(now.getFullYear(), 0, 1); // YTD
};

const monthKey = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

async function fetchPagedRows<T>(
    label: string,
    fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>
): Promise<T[]> {
    const rows: T[] = [];

    for (let from = 0; from < INSIGHTS_MAX_ROWS; from += INSIGHTS_PAGE_SIZE) {
        const to = from + INSIGHTS_PAGE_SIZE - 1;
        const { data, error } = await fetchPage(from, to);
        if (error) {
            throw new Error(`${label} query failed: ${summarizeSupabaseError(error)}`);
        }
        const page = data || [];
        rows.push(...page);
        if (page.length < INSIGHTS_PAGE_SIZE) break;
    }

    if (rows.length >= INSIGHTS_MAX_ROWS) {
        logger.warn('Insights row cap reached; truncating results', {
            label,
            cap: INSIGHTS_MAX_ROWS,
        });
    }

    return rows;
}

const getCountOrThrow = (label: string, result: { count: number | null; error: any }): number => {
    if (result.error) {
        throw new Error(`${label} count query failed: ${summarizeSupabaseError(result.error)}`);
    }
    return Number(result.count || 0);
};

async function sumOutstandingInvoiceUsd(userId: string): Promise<number> {
    const rows = await fetchPagedRows<{ amount: unknown }>('outstanding_invoices', (from, to) =>
        supabase
            .from('documents')
            .select('amount')
            .eq('user_id', userId)
            .eq('type', 'INVOICE')
            .neq('status', 'PAID')
            .order('created_at', { ascending: false })
            .range(from, to)
    );

    return rows.reduce((sum, row) => sum + toNumber((row as any).amount), 0);
}

router.get('/assistant-summary', authenticate, async (req: Request, res: Response, next) => {
    try {
        const privyId = req.user!.id;
        const user = await getOrCreateUser(privyId);
        if (!user) {
            res.status(404).json({ success: false, error: { message: 'User not found' } });
            return;
        }

        const nowIso = new Date().toISOString();

        const [
            overdueInvoicesResult,
            activePaymentLinksResult,
            activeProjectsResult,
            pendingWithdrawalsResult,
            calendarRes,
            notificationsRes,
            outstandingUsd,
        ] = await Promise.all([
            supabase
                .from('documents')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', user.id)
                .eq('type', 'INVOICE')
                .in('status', ['DRAFT', 'SENT', 'VIEWED'])
                .not('content->>due_date', 'is', null)
                .lt('content->>due_date', nowIso),
            supabase
                .from('documents')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', user.id)
                .eq('type', 'PAYMENT_LINK')
                .in('status', ['DRAFT', 'SENT', 'VIEWED']),
            supabase
                .from('projects')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', user.id)
                .in('status', ['ACTIVE', 'ONGOING', 'ON_HOLD']),
            supabase
                .from('offramp_orders')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', user.id)
                .in('status', ['PENDING', 'PROCESSING']),
            supabase
                .from('calendar_events')
                .select('id,title,event_date,status')
                .eq('user_id', user.id)
                .neq('status', 'cancelled')
                .gte('event_date', nowIso)
                .order('event_date', { ascending: true })
                .limit(1),
            supabase
                .from('notifications')
                .select('id,title,message,created_at')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(1),
            sumOutstandingInvoiceUsd(user.id),
        ]);

        const overdueInvoices = getCountOrThrow('overdue_invoices', overdueInvoicesResult);
        const activePaymentLinks = getCountOrThrow('active_payment_links', activePaymentLinksResult);
        const activeProjects = getCountOrThrow('active_projects', activeProjectsResult);
        const pendingWithdrawals = getCountOrThrow('pending_withdrawals', pendingWithdrawalsResult);

        if (calendarRes.error) {
            throw new Error(`calendar query failed: ${summarizeSupabaseError(calendarRes.error)}`);
        }
        if (notificationsRes.error) {
            throw new Error(`notifications query failed: ${summarizeSupabaseError(notificationsRes.error)}`);
        }

        const upcomingEvent = (calendarRes.data || [])[0] || null;
        const latestNotification = (notificationsRes.data || [])[0] || null;

        const summary = await GeminiService.generateDashboardAssistantSummary({
            firstName: user.first_name || null,
            overdueInvoices,
            outstandingUsd,
            activePaymentLinks,
            activeProjects,
            upcomingEventTitle: upcomingEvent?.title || null,
            upcomingEventDate: upcomingEvent?.event_date || null,
            latestNotificationTitle: latestNotification?.title || null,
            latestNotificationMessage: latestNotification?.message || null,
            pendingWithdrawals,
        });

        res.json({
            success: true,
            data: {
                summary,
                snapshot: {
                    overdueInvoices,
                    outstandingUsd,
                    activePaymentLinks,
                    activeProjects,
                    upcomingEventTitle: upcomingEvent?.title || null,
                    upcomingEventDate: upcomingEvent?.event_date || null,
                    latestNotificationTitle: latestNotification?.title || null,
                    pendingWithdrawals,
                },
            },
        });
    } catch (error) {
        logger.error('Failed to build assistant summary', {
            error: error instanceof Error ? error.message : 'Unknown',
            stack: error instanceof Error ? error.stack : undefined,
        });
        next(error);
    }
});

router.get('/summary', authenticate, async (req: Request, res: Response, next) => {
    try {
        const rangeRaw = String(req.query.range || '30d').toLowerCase();
        const range: RangeKey = ['7d', '30d', '90d', '1y', 'ytd'].includes(rangeRaw) ? (rangeRaw as RangeKey) : '30d';
        const start = getRangeStart(range);
        const now = new Date();
        const rangeMs = now.getTime() - start.getTime();
        const prevStart = new Date(start.getTime() - rangeMs);
        const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
        const docsSince = new Date(Math.min(prevStart.getTime(), sixMonthsAgo.getTime()));

        const privyId = req.user!.id;
        const user = await getOrCreateUser(privyId);
        if (!user) {
            res.status(404).json({ success: false, error: { message: 'User not found' } });
            return;
        }

        const [docs, txs, offramps, clientsCountRes, activeProjectsRes, topClientRes] = await Promise.all([
            fetchPagedRows<any>('documents_summary', (from, to) =>
                supabase
                    .from('documents')
                    .select('id,type,status,amount,created_at,title,content')
                    .eq('user_id', user.id)
                    .gte('created_at', docsSince.toISOString())
                    .order('created_at', { ascending: false })
                    .range(from, to)
            ),
            fetchPagedRows<any>('transactions_summary', (from, to) =>
                supabase
                    .from('transactions')
                    .select('id,type,status,amount,created_at,timestamp')
                    .eq('user_id', user.id)
                    .gte('created_at', prevStart.toISOString())
                    .order('created_at', { ascending: false })
                    .range(from, to)
            ),
            fetchPagedRows<any>('offramp_summary', (from, to) =>
                supabase
                    .from('offramp_orders')
                    .select('id,status,fiat_amount,fiat_currency,created_at')
                    .eq('user_id', user.id)
                    .gte('created_at', prevStart.toISOString())
                    .order('created_at', { ascending: false })
                    .range(from, to)
            ),
            supabase
                .from('clients')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', user.id),
            supabase
                .from('projects')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', user.id)
                .in('status', ['ONGOING', 'ACTIVE', 'ON_HOLD']),
            supabase
                .from('clients')
                .select('name,total_earnings')
                .eq('user_id', user.id)
                .order('total_earnings', { ascending: false })
                .limit(1),
        ]);

        const clientsCount = getCountOrThrow('clients', clientsCountRes);
        const activeProjects = getCountOrThrow('active_projects', activeProjectsRes);
        if (topClientRes.error) {
            throw new Error(`top_client query failed: ${topClientRes.error.message || 'unknown error'}`);
        }
        const topClientRow = (topClientRes.data || [])[0];
        const topClient = topClientRow
            ? { name: topClientRow.name, totalEarnings: toNumber(topClientRow.total_earnings) }
            : null;

        const docsInRange = docs.filter((d: any) => new Date(d.created_at) >= start);
        const docsInPrevRange = docs.filter((d: any) => {
            const created = new Date(d.created_at);
            return created >= prevStart && created < start;
        });

        const isPaidDoc = (d: any) => normalizeStatus(d.status) === 'PAID';
        const paidInRange = docsInRange.filter(isPaidDoc);
        const paidInPrevRange = docsInPrevRange.filter(isPaidDoc);

        const monthlyEarnings = paidInRange.reduce((sum: number, d: any) => sum + toNumber(d.amount), 0);
        const prevEarnings = paidInPrevRange.reduce((sum: number, d: any) => sum + toNumber(d.amount), 0);
        const earningsDeltaPct = prevEarnings > 0 ? ((monthlyEarnings - prevEarnings) / prevEarnings) * 100 : (monthlyEarnings > 0 ? 100 : 0);

        const pendingStatuses = new Set(['SENT', 'VIEWED', 'PENDING', 'DRAFT']);
        const pendingInvoices = docsInRange.filter((d: any) => normalizeStatus(d.type) === 'INVOICE' && pendingStatuses.has(normalizeStatus(d.status)));
        const pendingInvoicesCount = pendingInvoices.length;
        const pendingInvoicesTotal = pendingInvoices.reduce((sum: number, d: any) => sum + toNumber(d.amount), 0);

        const totalDocuments = docsInRange.length;
        const paidDocuments = paidInRange.length;
        const paymentRate = totalDocuments > 0 ? Math.round((paidDocuments / totalDocuments) * 100) : 0;

        const txInRange = txs.filter((t: any) => new Date(t.created_at || t.timestamp) >= start);
        const receivedAmount = txInRange
            .filter((t: any) => normalizeStatus(t.type) === 'PAYMENT_RECEIVED' && normalizeStatus(t.status) === 'CONFIRMED')
            .reduce((sum: number, t: any) => sum + toNumber(t.amount), 0);

        const offrampsInRange = offramps.filter((o: any) => new Date(o.created_at) >= start);
        const withdrawalsPending = offrampsInRange.filter((o: any) => ['PENDING', 'PROCESSING'].includes(normalizeStatus(o.status))).length;
        const withdrawalsCompletedAmount = offrampsInRange
            .filter((o: any) => normalizeStatus(o.status) === 'COMPLETED')
            .reduce((sum: number, o: any) => sum + toNumber(o.fiat_amount), 0);

        // Last 6 months sparkline data from paid docs.
        const monthBuckets: Record<string, number> = {};
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            monthBuckets[monthKey(d)] = 0;
        }
        for (const d of docs.filter((x: any) => isPaidDoc(x))) {
            const key = monthKey(new Date(d.created_at));
            if (key in monthBuckets) monthBuckets[key] += toNumber(d.amount);
        }
        const earningsSeries = Object.entries(monthBuckets).map(([key, value]) => ({ key, value }));

        const insights: any[] = [];
        insights.push({
            id: 'earnings',
            title: 'Monthly earnings trend',
            description: earningsDeltaPct >= 0
                ? `You are up ${earningsDeltaPct.toFixed(0)}% versus previous period.`
                : `You are down ${Math.abs(earningsDeltaPct).toFixed(0)}% versus previous period.`,
            priority: 10,
            actionLabel: 'Open transactions',
            actionRoute: '/transactions',
            trend: earningsDeltaPct > 0 ? 'up' : earningsDeltaPct < 0 ? 'down' : 'neutral',
        });

        if (pendingInvoicesCount > 0) {
            insights.push({
                id: 'pending',
                title: 'Pending invoices need attention',
                description: `${pendingInvoicesCount} pending invoice(s), $${pendingInvoicesTotal.toLocaleString()} outstanding.`,
                priority: 9,
                actionLabel: 'Send reminders',
                actionRoute: '/invoices',
                trend: 'down',
            });
        }

        if (withdrawalsPending > 0) {
            insights.push({
                id: 'withdrawals',
                title: 'Withdrawals in progress',
                description: `${withdrawalsPending} withdrawal(s) are currently processing.`,
                priority: 8,
                actionLabel: 'View withdrawals',
                actionRoute: '/offramp-history',
                trend: 'neutral',
            });
        }

        if (topClient?.name) {
            insights.push({
                id: 'top-client',
                title: 'Top client performance',
                description: `${topClient.name} has contributed $${topClient.totalEarnings.toLocaleString()} in lifetime payments.`,
                priority: 6,
                actionLabel: 'Message client',
                actionRoute: '/clients',
                trend: 'up',
            });
        }

        res.json({
            success: true,
            data: {
                range,
                lastUpdatedAt: new Date().toISOString(),
                summary: {
                    monthlyEarnings,
                    previousPeriodEarnings: prevEarnings,
                    earningsDeltaPct,
                    pendingInvoicesCount,
                    pendingInvoicesTotal,
                    paymentRate,
                    paidDocuments,
                    totalDocuments,
                    clientsCount,
                    activeProjects,
                    paymentLinksCount: docsInRange.filter((d: any) => normalizeStatus(d.type) === 'PAYMENT_LINK').length,
                    topClient,
                    transactionsCount: txInRange.length,
                    receivedAmount,
                    withdrawalsPending,
                    withdrawalsCompletedAmount,
                },
                series: {
                    earnings: earningsSeries,
                },
                insights: insights.sort((a, b) => b.priority - a.priority),
            },
        });
    } catch (error) {
        logger.error('Failed to build insights summary', { error: error instanceof Error ? error.message : 'Unknown' });
        next(error);
    }
});

router.get('/tax-summary', authenticate, async (req: Request, res: Response, next) => {
    try {
        const yearRaw = Number(req.query.year || new Date().getUTCFullYear());
        const year = Number.isFinite(yearRaw) ? Math.floor(yearRaw) : new Date().getUTCFullYear();
        if (year < 2000 || year > 2100) {
            res.status(400).json({
                success: false,
                error: { message: 'Invalid year parameter' },
            });
            return;
        }

        const privyId = req.user!.id;
        const user = await getOrCreateUser(privyId);
        if (!user) {
            res.status(404).json({ success: false, error: { message: 'User not found' } });
            return;
        }

        const start = new Date(Date.UTC(year, 0, 1));
        const end = new Date(Date.UTC(year + 1, 0, 1));
        const startIso = start.toISOString();
        const endIso = end.toISOString();

        const [paidDocuments, completedWithdrawals, feeTransactions] = await Promise.all([
            fetchPagedRows<any>('tax_paid_documents', (from, to) =>
                supabase
                    .from('documents')
                    .select('id,type,status,amount,created_at,client_id')
                    .eq('user_id', user.id)
                    .in('type', ['INVOICE', 'PAYMENT_LINK'])
                    .eq('status', 'PAID')
                    .gte('created_at', startIso)
                    .lt('created_at', endIso)
                    .order('created_at', { ascending: false })
                    .range(from, to)
            ),
            fetchPagedRows<any>('tax_offramp_withdrawals', (from, to) =>
                supabase
                    .from('offramp_orders')
                    .select('id,status,fiat_amount,created_at')
                    .eq('user_id', user.id)
                    .eq('status', 'COMPLETED')
                    .gte('created_at', startIso)
                    .lt('created_at', endIso)
                    .order('created_at', { ascending: false })
                    .range(from, to)
            ),
            fetchPagedRows<any>('tax_fee_transactions', (from, to) =>
                supabase
                    .from('transactions')
                    .select('id,type,status,amount,created_at')
                    .eq('user_id', user.id)
                    .gte('created_at', startIso)
                    .lt('created_at', endIso)
                    .order('created_at', { ascending: false })
                    .range(from, to)
            ),
        ]);

        const clientIds = Array.from(
            new Set(
                paidDocuments
                    .map((doc) => doc.client_id)
                    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
            )
        );

        let clientNameById = new Map<string, string>();
        if (clientIds.length > 0) {
            const { data: clients, error: clientsError } = await supabase
                .from('clients')
                .select('id,name')
                .in('id', clientIds);
            if (clientsError) {
                throw new Error(`tax clients query failed: ${summarizeSupabaseError(clientsError)}`);
            }
            clientNameById = new Map((clients || []).map((client: any) => [String(client.id), String(client.name || 'Client')]));
        }

        const monthLabel = (date: Date) =>
            `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;

        const monthlyMap: Record<string, { incomeUsd: number; feesFromTransactionsUsd: number; estimatedFeesUsd: number; withdrawalsUsd: number; netEstimateUsd: number }> = {};
        for (let month = 0; month < 12; month += 1) {
            const key = monthLabel(new Date(Date.UTC(year, month, 1)));
            monthlyMap[key] = {
                incomeUsd: 0,
                feesFromTransactionsUsd: 0,
                estimatedFeesUsd: 0,
                withdrawalsUsd: 0,
                netEstimateUsd: 0,
            };
        }

        const clientTotals = new Map<string, { name: string; incomeUsd: number; invoiceCount: number }>();

        for (const doc of paidDocuments) {
            const createdAt = new Date(doc.created_at);
            const key = monthLabel(createdAt);
            const amount = toNumber(doc.amount);
            if (monthlyMap[key]) monthlyMap[key].incomeUsd += amount;

            const clientId = String(doc.client_id || '').trim();
            if (!clientId) continue;
            const current = clientTotals.get(clientId) || {
                name: clientNameById.get(clientId) || 'Client',
                incomeUsd: 0,
                invoiceCount: 0,
            };
            current.incomeUsd += amount;
            current.invoiceCount += 1;
            clientTotals.set(clientId, current);
        }

        for (const withdrawal of completedWithdrawals) {
            const createdAt = new Date(withdrawal.created_at);
            const key = monthLabel(createdAt);
            const amount = toNumber(withdrawal.fiat_amount);
            if (monthlyMap[key]) monthlyMap[key].withdrawalsUsd += amount;
        }

        let hasExplicitFeeRows = false;
        for (const tx of feeTransactions) {
            const txType = normalizeStatus(tx.type);
            if (!txType.includes('FEE')) continue;
            const createdAt = new Date(tx.created_at);
            const key = monthLabel(createdAt);
            const amount = Math.abs(toNumber(tx.amount));
            if (monthlyMap[key]) {
                monthlyMap[key].feesFromTransactionsUsd += amount;
                hasExplicitFeeRows = true;
            }
        }

        for (const bucket of Object.values(monthlyMap)) {
            const fallbackEstimate = bucket.incomeUsd * 0.01;
            bucket.estimatedFeesUsd = hasExplicitFeeRows
                ? bucket.feesFromTransactionsUsd
                : Number(fallbackEstimate.toFixed(2));
            bucket.netEstimateUsd = Number(
                (bucket.incomeUsd - bucket.estimatedFeesUsd - bucket.withdrawalsUsd).toFixed(2)
            );
        }

        const monthly = Object.entries(monthlyMap).map(([month, value]) => ({
            month,
            incomeUsd: Number(value.incomeUsd.toFixed(2)),
            estimatedFeesUsd: Number(value.estimatedFeesUsd.toFixed(2)),
            withdrawalsUsd: Number(value.withdrawalsUsd.toFixed(2)),
            netEstimateUsd: Number(value.netEstimateUsd.toFixed(2)),
        }));

        const totals = monthly.reduce(
            (acc, bucket) => {
                acc.incomeUsd += bucket.incomeUsd;
                acc.estimatedFeesUsd += bucket.estimatedFeesUsd;
                acc.withdrawalsUsd += bucket.withdrawalsUsd;
                acc.netEstimateUsd += bucket.netEstimateUsd;
                return acc;
            },
            { incomeUsd: 0, estimatedFeesUsd: 0, withdrawalsUsd: 0, netEstimateUsd: 0 }
        );

        const topClients = Array.from(clientTotals.entries())
            .map(([clientId, value]) => ({
                clientId,
                name: value.name,
                incomeUsd: Number(value.incomeUsd.toFixed(2)),
                invoiceCount: value.invoiceCount,
            }))
            .sort((a, b) => b.incomeUsd - a.incomeUsd)
            .slice(0, 8);

        res.json({
            success: true,
            data: {
                year,
                generatedAt: new Date().toISOString(),
                totals: {
                    incomeUsd: Number(totals.incomeUsd.toFixed(2)),
                    estimatedFeesUsd: Number(totals.estimatedFeesUsd.toFixed(2)),
                    withdrawalsUsd: Number(totals.withdrawalsUsd.toFixed(2)),
                    netEstimateUsd: Number(totals.netEstimateUsd.toFixed(2)),
                },
                monthly,
                topClients,
                feeMethod: hasExplicitFeeRows ? 'transactions' : 'estimated_1_percent_of_income',
            },
        });
    } catch (error) {
        logger.error('Failed to build tax summary', { error: error instanceof Error ? error.message : 'Unknown' });
        next(error);
    }
});

export default router;
