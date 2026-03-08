import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import { getOrCreateUser } from '../utils/userHelper';
import { createLogger } from '../utils/logger';

const logger = createLogger('Insights');
const router = Router();

type RangeKey = '7d' | '30d' | '90d' | '1y' | 'ytd';

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

router.get('/summary', authenticate, async (req: Request, res: Response, next) => {
    try {
        const rangeRaw = String(req.query.range || '30d').toLowerCase();
        const range: RangeKey = ['7d', '30d', '90d', '1y', 'ytd'].includes(rangeRaw) ? (rangeRaw as RangeKey) : '30d';
        const start = getRangeStart(range);
        const now = new Date();
        const rangeMs = now.getTime() - start.getTime();
        const prevStartIso = new Date(start.getTime() - rangeMs).toISOString();

        const privyId = req.user!.id;
        const user = await getOrCreateUser(privyId);
        if (!user) {
            res.status(404).json({ success: false, error: { message: 'User not found' } });
            return;
        }

        const [docsRes, clientsRes, projectsRes, txRes, offrampRes] = await Promise.all([
            supabase
                .from('documents')
                .select('id,type,status,amount,created_at,title,content')
                .eq('user_id', user.id),
            supabase
                .from('clients')
                .select('id,name,total_earnings,created_at')
                .eq('user_id', user.id),
            supabase
                .from('projects')
                .select('id,status,created_at')
                .eq('user_id', user.id),
            supabase
                .from('transactions')
                .select('id,type,status,amount,created_at,timestamp')
                .eq('user_id', user.id),
            supabase
                .from('offramp_orders')
                .select('id,status,fiat_amount,fiat_currency,created_at')
                .eq('user_id', user.id),
        ]);

        const docs = docsRes.data || [];
        const clients = clientsRes.data || [];
        const projects = projectsRes.data || [];
        const txs = txRes.data || [];
        const offramps = offrampRes.data || [];

        const docsInRange = docs.filter((d: any) => new Date(d.created_at) >= start);
        const docsInPrevRange = docs.filter((d: any) => {
            const created = new Date(d.created_at);
            return created >= new Date(prevStartIso) && created < start;
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
        const paidDocuments = docsInRange.filter(isPaidDoc).length;
        const paymentRate = totalDocuments > 0 ? Math.round((paidDocuments / totalDocuments) * 100) : 0;

        const activeProjects = projects.filter((p: any) => ['ONGOING', 'ACTIVE', 'ON_HOLD'].includes(normalizeStatus(p.status))).length;
        const clientsCount = clients.length;
        const sortedClients = [...clients].sort((a: any, b: any) => toNumber(b.total_earnings) - toNumber(a.total_earnings));
        const topClient = sortedClients[0]
            ? { name: sortedClients[0].name, totalEarnings: toNumber(sortedClients[0].total_earnings) }
            : null;

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

export default router;
