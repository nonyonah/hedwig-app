import { Router, Request, Response } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import { getOrCreateUser } from '../utils/userHelper';
import { convertToUsd } from '../services/currency';
import { llmService } from '../services/llm';
import { createLogger } from '../utils/logger';
import { FREE_PLAN_LIMITS, getUserPlan } from '../services/billingRules';
import { getWorkspaceRole, isOwnerOrAdmin } from '../middleware/workspaceRole';

const logger = createLogger('Revenue');
const router = Router();

// Helper: returns true if the request should continue, false if 403 was sent
async function guardOwnerOrAdmin(req: Request, res: Response, userId: string): Promise<boolean> {
  const role = await getWorkspaceRole(req, userId);
  if (!isOwnerOrAdmin(role)) {
    res.status(403).json({ success: false, error: { message: 'Revenue data is restricted to owners and admins' } });
    return false;
  }
  return true;
}

function getEffectiveWorkspaceId(req: Request, userId: string): string {
  const wsId = req.headers['x-workspace-id'] as string;
  return wsId || `ws_personal_${userId}`;
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

type RangeKey = '7d' | '30d' | '90d' | '1y' | 'ytd';

const PAGE_SIZE = 500;
const MAX_ROWS = 20000;

const toNumber = (value: unknown): number => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const parsed = parseFloat(value.replace(/[^0-9.-]/g, ''));
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
};

const normalizeStatus = (value: unknown): string => String(value || '').trim().toUpperCase();

const getDocumentPaidAt = (doc: any): Date => {
    const candidates = [
        doc?.paid_at,
        doc?.paidAt,
        doc?.content?.paid_at,
        doc?.content?.paidAt,
        doc?.content?.payment_date,
        doc?.content?.recorded_at,
        doc?.updated_at,
        doc?.created_at,
    ];

    for (const candidate of candidates) {
        if (!candidate) continue;
        const date = new Date(candidate);
        if (!Number.isNaN(date.getTime())) return date;
    }

    return new Date(0);
};

const summarizeError = (error: any): string => {
    if (!error) return 'unknown error';
    if (typeof error === 'string') return error;
    const parts = [error.message, error.details, error.hint, error.code ? `code=${error.code}` : null]
        .filter((p): p is string => Boolean(p && String(p).trim()));
    return parts.length > 0 ? parts.join(' | ') : JSON.stringify(error);
};

const getRangeStart = (range: RangeKey): Date => {
    const now = new Date();
    if (range === '7d') return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    if (range === '30d') return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (range === '90d') return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    if (range === '1y') return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    return new Date(now.getFullYear(), 0, 1);
};

// Free plan: cap revenue history to FREE_PLAN_LIMITS.revenueHistoryDays (30d).
// Pro: any range. Returns the effective range plus whether it was clamped.
async function resolveRangeForUser(user: any, requested: RangeKey): Promise<{ range: RangeKey; gated: boolean }> {
    const plan = await getUserPlan(user);
    if (plan !== 'free') return { range: requested, gated: false };

    const gateEnabledAt = process.env.HEDWIG_AI_GATE_ENABLED_AT || '';
    if (gateEnabledAt && user?.created_at && Date.parse(user.created_at) < Date.parse(gateEnabledAt)) {
        return { range: requested, gated: false };
    }

    const wide = requested === '90d' || requested === '1y' || requested === 'ytd';
    if (wide && FREE_PLAN_LIMITS.revenueHistoryDays === 30) {
        return { range: '30d', gated: true };
    }
    return { range: requested, gated: false };
}

async function fetchPaged<T>(
    label: string,
    fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>
): Promise<T[]> {
    const rows: T[] = [];
    for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
        const to = from + PAGE_SIZE - 1;
        const { data, error } = await fetchPage(from, to);
        if (error) throw new Error(`${label} query failed: ${summarizeError(error)}`);
        const page = data || [];
        rows.push(...page);
        if (page.length < PAGE_SIZE) break;
    }
    return rows;
}

// GET /api/revenue/summary?range=30d
router.get('/summary', authenticate, async (req: Request, res: Response, next) => {
    try {
        const rangeRaw = String(req.query.range || '30d').toLowerCase();
        const requestedRange: RangeKey = ['7d', '30d', '90d', '1y', 'ytd'].includes(rangeRaw) ? (rangeRaw as RangeKey) : '30d';

        const privyId = req.user!.id;
        const user = await getOrCreateUser(privyId);
        if (!user) {
            res.status(404).json({ success: false, error: { message: 'User not found' } });
            return;
        }

        if (!await guardOwnerOrAdmin(req, res, user.id)) return;

        const effectiveWsId = getEffectiveWorkspaceId(req, user.id);

        const { range, gated: revenueHistoryGated } = await resolveRangeForUser(user, requestedRange);
        const start = getRangeStart(range);
        const now = new Date();
        const nowIso = now.toISOString();
        const rangeMs = now.getTime() - start.getTime();
        const prevStart = new Date(start.getTime() - rangeMs);
        const prevStartIso = prevStart.toISOString();

        const [invoices, expenses, offramps, onramps] = await Promise.all([
            fetchPaged<any>('invoices_summary', (from, to) =>
                supabase
                    .from('documents')
                    .select('id,type,status,amount,created_at,updated_at,content')
                    .eq('user_id', user.id)
                    .eq('workspace_id', effectiveWsId)
                    .in('type', ['INVOICE', 'PAYMENT_LINK'])
                    .or(`created_at.gte.${prevStartIso},updated_at.gte.${prevStartIso}`)
                    .order('updated_at', { ascending: false })
                    .range(from, to)
            ),
            fetchPaged<any>('expenses_summary', (from, to) =>
                supabase
                    .from('expenses')
                    .select('id,amount,converted_amount_usd,date')
                    .eq('user_id', user.id)
                    .gte('date', start.toISOString())
                    .order('date', { ascending: false })
                    .range(from, to)
            ).catch(() => [] as any[]),
            fetchPaged<any>('offramp_revenue', (from, to) =>
                supabase
                    .from('offramp_orders')
                    .select('id,status,fiat_amount,fiat_currency,created_at')
                    .eq('user_id', user.id)
                    .gte('created_at', start.toISOString())
                    .order('created_at', { ascending: false })
                    .range(from, to)
            ).catch(() => [] as any[]),
            fetchPaged<any>('onramp_revenue', (from, to) =>
                supabase
                    .from('onramp_orders')
                    .select('id,status,fiat_amount,fiat_currency,created_at')
                    .eq('user_id', user.id)
                    .gte('created_at', start.toISOString())
                    .order('created_at', { ascending: false })
                    .range(from, to)
            ).catch(() => [] as any[]),
        ]);

        const isPaid = (d: any) => normalizeStatus(d.status) === 'PAID';
        const inRange = invoices.filter((d: any) => isPaid(d) ? getDocumentPaidAt(d) >= start : new Date(d.created_at) >= start);
        const inPrevRange = invoices.filter((d: any) => {
            const date = isPaid(d) ? getDocumentPaidAt(d) : new Date(d.created_at);
            return date >= prevStart && date < start;
        });
        const isOverdue = (d: any) => {
            // Only invoice-style docs go overdue. Payment links don't have due dates.
            if (normalizeStatus(d.type) !== 'INVOICE') return false;
            const s = normalizeStatus(d.status);
            if (!['SENT', 'VIEWED'].includes(s)) return false;
            const dueDate = d.content?.due_date;
            return dueDate ? dueDate < nowIso : false;
        };
        const isPending = (d: any) => {
            const s = normalizeStatus(d.status);
            const t = normalizeStatus(d.type);
            // Invoices: sent/viewed/draft and not overdue.
            if (t === 'INVOICE') return ['SENT', 'VIEWED', 'DRAFT'].includes(s) && !isOverdue(d);
            // Payment links: active links are collecting payment.
            if (t === 'PAYMENT_LINK') return ['ACTIVE', 'SENT', 'VIEWED', 'DRAFT'].includes(s);
            return false;
        };

        const paidRevenue = inRange.filter(isPaid).reduce((s: number, d: any) => s + toNumber(d.amount), 0);
        const prevRevenue = inPrevRange.filter(isPaid).reduce((s: number, d: any) => s + toNumber(d.amount), 0);
        const pendingRevenue = inRange
            .filter(isPending)
            .reduce((s: number, d: any) => s + toNumber(d.amount), 0);
        const overdueRevenue = inRange.filter(isOverdue).reduce((s: number, d: any) => s + toNumber(d.amount), 0);
        const totalRevenue = paidRevenue + pendingRevenue + overdueRevenue;
        const totalExpenses = expenses.reduce((s: number, e: any) => s + toNumber(e.converted_amount_usd), 0);
        const netRevenue = paidRevenue - totalExpenses;
        const revenueDeltaPct = prevRevenue > 0
            ? ((paidRevenue - prevRevenue) / prevRevenue) * 100
            : paidRevenue > 0 ? 100 : 0;

        const isCompleted = (o: any) => normalizeStatus(o.status) === 'COMPLETED';
        const isPendingOrder = (o: any) => ['PENDING', 'PROCESSING'].includes(normalizeStatus(o.status));
        const withdrawalsTotal = offramps.filter(isCompleted).reduce((s: number, o: any) => s + toNumber(o.fiat_amount), 0);
        const withdrawalsCount = offramps.length;
        const withdrawalsPending = offramps.filter(isPendingOrder).length;
        const depositsTotal = onramps.filter(isCompleted).reduce((s: number, o: any) => s + toNumber(o.fiat_amount), 0);
        const depositsCount = onramps.length;
        const depositsPending = onramps.filter(isPendingOrder).length;

        res.json({
            success: true,
            data: {
                totalRevenue: Number(totalRevenue.toFixed(2)),
                paidRevenue: Number(paidRevenue.toFixed(2)),
                pendingRevenue: Number(pendingRevenue.toFixed(2)),
                overdueRevenue: Number(overdueRevenue.toFixed(2)),
                totalExpenses: Number(totalExpenses.toFixed(2)),
                netRevenue: Number(netRevenue.toFixed(2)),
                currency: 'USD',
                range,
                requestedRange,
                gatedToFreeHistory: revenueHistoryGated,
                previousPeriodRevenue: Number(prevRevenue.toFixed(2)),
                revenueDeltaPct: Number(revenueDeltaPct.toFixed(1)),
                depositsTotal: Number(depositsTotal.toFixed(2)),
                depositsCount,
                depositsPending,
                withdrawalsTotal: Number(withdrawalsTotal.toFixed(2)),
                withdrawalsCount,
                withdrawalsPending,
            },
        });
    } catch (error) {
        logger.error('Failed to build revenue summary', { error: error instanceof Error ? error.message : 'Unknown' });
        next(error);
    }
});

// GET /api/revenue/trend
router.get('/trend', authenticate, async (req: Request, res: Response, next) => {
    try {
        const privyId = req.user!.id;
        const user = await getOrCreateUser(privyId);
        if (!user) {
            res.status(404).json({ success: false, error: { message: 'User not found' } });
            return;
        }

        if (!await guardOwnerOrAdmin(req, res, user.id)) return;

        const now = new Date();
        // Free plan: cap trend to last 30 days. Pro: full 6 months.
        const { gated: trendGated } = await resolveRangeForUser(user, '1y');
        const sixMonthsAgo = trendGated
            ? new Date(now.getTime() - FREE_PLAN_LIMITS.revenueHistoryDays * 24 * 60 * 60 * 1000)
            : new Date(now.getFullYear(), now.getMonth() - 5, 1);

        const [invoices, expenses] = await Promise.all([
            fetchPaged<any>('trend_invoices', (from, to) =>
                supabase
                    .from('documents')
                    .select('type,status,amount,created_at,updated_at,content')
                    .eq('user_id', user.id)
                    .in('type', ['INVOICE', 'PAYMENT_LINK'])
                    .eq('status', 'PAID')
                    .or(`created_at.gte.${sixMonthsAgo.toISOString()},updated_at.gte.${sixMonthsAgo.toISOString()}`)
                    .order('updated_at', { ascending: false })
                    .range(from, to)
            ),
            fetchPaged<any>('trend_expenses', (from, to) =>
                supabase
                    .from('expenses')
                    .select('converted_amount_usd,date')
                    .eq('user_id', user.id)
                    .gte('date', sixMonthsAgo.toISOString())
                    .order('date', { ascending: false })
                    .range(from, to)
            ).catch(() => [] as any[]),
        ]);

        const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const months: string[] = [];
        for (let i = 5; i >= 0; i--) {
            months.push(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
        }

        const revMap: Record<string, number> = Object.fromEntries(months.map((m) => [m, 0]));
        const expMap: Record<string, number> = Object.fromEntries(months.map((m) => [m, 0]));

        for (const doc of invoices) {
            const paidAt = getDocumentPaidAt(doc);
            if (paidAt < sixMonthsAgo) continue;
            const k = monthKey(paidAt);
            if (k in revMap) revMap[k] += toNumber(doc.amount);
        }
        for (const exp of expenses) {
            const k = monthKey(new Date(exp.date));
            if (k in expMap) expMap[k] += toNumber(exp.converted_amount_usd);
        }

        const trend = months.map((key) => ({
            key,
            revenue: Number(revMap[key].toFixed(2)),
            expenses: Number(expMap[key].toFixed(2)),
            net: Number((revMap[key] - expMap[key]).toFixed(2)),
        }));

        res.json({ success: true, data: trend, meta: { gatedToFreeHistory: trendGated } });
    } catch (error) {
        logger.error('Failed to build revenue trend', { error: error instanceof Error ? error.message : 'Unknown' });
        next(error);
    }
});

// GET /api/revenue/breakdown?range=30d
router.get('/breakdown', authenticate, async (req: Request, res: Response, next) => {
    try {
        const rangeRaw = String(req.query.range || '30d').toLowerCase();
        const requestedRange: RangeKey = ['7d', '30d', '90d', '1y', 'ytd'].includes(rangeRaw) ? (rangeRaw as RangeKey) : '30d';

        const privyId = req.user!.id;
        const user = await getOrCreateUser(privyId);
        if (!user) {
            res.status(404).json({ success: false, error: { message: 'User not found' } });
            return;
        }

        if (!await guardOwnerOrAdmin(req, res, user.id)) return;

        const { range } = await resolveRangeForUser(user, requestedRange);
        const start = getRangeStart(range);
        const startIso = start.toISOString();

        const invoices = await fetchPaged<any>('breakdown_invoices', (from, to) =>
            supabase
                .from('documents')
                .select('type,status,amount,client_id,project_id,created_at,updated_at,content')
                .eq('user_id', user.id)
                .in('type', ['INVOICE', 'PAYMENT_LINK'])
                .eq('status', 'PAID')
                .or(`created_at.gte.${startIso},updated_at.gte.${startIso}`)
                .order('updated_at', { ascending: false })
                .range(from, to)
        );
        const paidInvoices = invoices.filter((doc: any) => getDocumentPaidAt(doc) >= start);

        const clientIds = Array.from(
            new Set(paidInvoices.map((d: any) => d.client_id).filter((id: any): id is string => typeof id === 'string' && id.length > 0))
        );
        const projectIds = Array.from(
            new Set(paidInvoices.map((d: any) => d.project_id).filter((id: any): id is string => typeof id === 'string' && id.length > 0))
        );

        const [clientsRes, projectsRes] = await Promise.all([
            clientIds.length > 0
                ? supabase.from('clients').select('id,name,company').in('id', clientIds)
                : Promise.resolve({ data: [], error: null }),
            projectIds.length > 0
                ? supabase.from('projects').select('id,name,budget,currency,client_id').in('id', projectIds)
                : Promise.resolve({ data: [], error: null }),
        ]);

        if (clientsRes.error) throw new Error(`clients query failed: ${summarizeError(clientsRes.error)}`);
        if (projectsRes.error) throw new Error(`projects query failed: ${summarizeError(projectsRes.error)}`);

        const clientById = new Map((clientsRes.data || []).map((c: any) => [c.id, c]));
        const projectById = new Map((projectsRes.data || []).map((p: any) => [p.id, p]));

        // Client breakdown
        const clientMap = new Map<string, { clientId: string; clientName: string; company: string; totalRevenue: number; invoiceCount: number }>();
        for (const doc of paidInvoices) {
            const cId = String(doc.client_id || '');
            if (!cId) continue;
            const client = clientById.get(cId);
            const existing = clientMap.get(cId) || {
                clientId: cId,
                clientName: client?.name || 'Client',
                company: client?.company || '',
                totalRevenue: 0,
                invoiceCount: 0,
            };
            existing.totalRevenue += toNumber(doc.amount);
            existing.invoiceCount += 1;
            clientMap.set(cId, existing);
        }

        const totalRevenue = Array.from(clientMap.values()).reduce((s, c) => s + c.totalRevenue, 0);
        const clients = Array.from(clientMap.values())
            .sort((a, b) => b.totalRevenue - a.totalRevenue)
            .map((c) => ({
                ...c,
                totalRevenue: Number(c.totalRevenue.toFixed(2)),
                paidRevenue: Number(c.totalRevenue.toFixed(2)),
                shareOfTotal: totalRevenue > 0 ? Number(((c.totalRevenue / totalRevenue) * 100).toFixed(1)) : 0,
            }));

        // Project breakdown
        const projectMap = new Map<string, { projectId: string; projectName: string; clientName: string; totalRevenue: number; budgetUsd: number }>();
        for (const doc of paidInvoices) {
            const pId = String(doc.project_id || '');
            if (!pId) continue;
            const project = projectById.get(pId);
            const client = project ? clientById.get(project.client_id) : undefined;
            const existing = projectMap.get(pId) || {
                projectId: pId,
                projectName: project?.name || 'Project',
                clientName: client?.name || 'Client',
                totalRevenue: 0,
                budgetUsd: toNumber(project?.budget),
            };
            existing.totalRevenue += toNumber(doc.amount);
            projectMap.set(pId, existing);
        }

        const projects = Array.from(projectMap.values())
            .sort((a, b) => b.totalRevenue - a.totalRevenue)
            .map((p) => ({ ...p, totalRevenue: Number(p.totalRevenue.toFixed(2)) }));

        res.json({ success: true, data: { clients, projects } });
    } catch (error) {
        logger.error('Failed to build revenue breakdown', { error: error instanceof Error ? error.message : 'Unknown' });
        next(error);
    }
});

// GET /api/revenue/payment-sources?range=30d
router.get('/payment-sources', authenticate, async (req: Request, res: Response, next) => {
    try {
        const rangeRaw = String(req.query.range || '30d').toLowerCase();
        const requestedRange: RangeKey = ['7d', '30d', '90d', '1y', 'ytd'].includes(rangeRaw) ? (rangeRaw as RangeKey) : '30d';

        const privyId = req.user!.id;
        const user = await getOrCreateUser(privyId);
        if (!user) {
            res.status(404).json({ success: false, error: { message: 'User not found' } });
            return;
        }

        if (!await guardOwnerOrAdmin(req, res, user.id)) return;

        const { range } = await resolveRangeForUser(user, requestedRange);
        const start = getRangeStart(range);
        const startIso = start.toISOString();

        const [documents, transactions] = await Promise.all([
            fetchPaged<any>('payment_sources_documents', (from, to) =>
                supabase
                    .from('documents')
                    .select('id,type,status,amount,created_at,updated_at,content')
                    .eq('user_id', user.id)
                    .in('type', ['INVOICE', 'PAYMENT_LINK'])
                    .eq('status', 'PAID')
                    .or(`created_at.gte.${startIso},updated_at.gte.${startIso}`)
                    .order('updated_at', { ascending: false })
                    .range(from, to)
            ),
            fetchPaged<any>('payment_sources_transactions', (from, to) =>
                supabase
                    .from('transactions')
                    .select('id,type,status,amount,created_at,document_id')
                    .eq('user_id', user.id)
                    .eq('type', 'PAYMENT_RECEIVED')
                    .eq('status', 'CONFIRMED')
                    .gte('created_at', start.toISOString())
                    .order('created_at', { ascending: false })
                    .range(from, to)
            ),
        ]);

        const documentsInRange = documents.filter((doc: any) => getDocumentPaidAt(doc) >= start);
        const invoiceDocs = documentsInRange.filter((doc: any) => normalizeStatus(doc.type) === 'INVOICE');
        const paymentLinkDocs = documentsInRange.filter((doc: any) => normalizeStatus(doc.type) === 'PAYMENT_LINK');
        const directTransfers = transactions.filter((tx: any) => !tx.document_id);

        const invoiceAmount = invoiceDocs.reduce((sum: number, doc: any) => sum + toNumber(doc.amount), 0);
        const paymentLinkAmount = paymentLinkDocs.reduce((sum: number, doc: any) => sum + toNumber(doc.amount), 0);
        const directTransferAmount = directTransfers.reduce((sum: number, tx: any) => sum + toNumber(tx.amount), 0);
        const totalAmount = invoiceAmount + paymentLinkAmount + directTransferAmount;

        const sources = [
            {
                source: 'invoices',
                label: 'Invoices',
                amount: Number(invoiceAmount.toFixed(2)),
                count: invoiceDocs.length,
            },
            {
                source: 'payment_links',
                label: 'Payment links',
                amount: Number(paymentLinkAmount.toFixed(2)),
                count: paymentLinkDocs.length,
            },
            {
                source: 'direct_transfers',
                label: 'Direct transfers',
                amount: Number(directTransferAmount.toFixed(2)),
                count: directTransfers.length,
            },
        ].map((item) => ({
            ...item,
            shareOfTotal: totalAmount > 0 ? Number(((item.amount / totalAmount) * 100).toFixed(1)) : 0,
        }));

        res.json({ success: true, data: sources });
    } catch (error) {
        logger.error('Failed to build payment sources', { error: error instanceof Error ? error.message : 'Unknown' });
        next(error);
    }
});

// GET /api/revenue/activity
router.get('/activity', authenticate, async (req: Request, res: Response, next) => {
    try {
        const privyId = req.user!.id;
        const user = await getOrCreateUser(privyId);
        if (!user) {
            res.status(404).json({ success: false, error: { message: 'User not found' } });
            return;
        }

        if (!await guardOwnerOrAdmin(req, res, user.id)) return;

        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const nowIso = new Date().toISOString();

        const [invoices, expensesRes] = await Promise.all([
            supabase
                .from('documents')
                .select('id,type,status,amount,title,created_at,updated_at,content')
                .eq('user_id', user.id)
                .in('type', ['INVOICE', 'PAYMENT_LINK'])
                .or(`created_at.gte.${thirtyDaysAgo},updated_at.gte.${thirtyDaysAgo}`)
                .order('updated_at', { ascending: false })
                .limit(50),
            Promise.resolve(
                supabase
                    .from('expenses')
                    .select('id,amount,currency,converted_amount_usd,category,note,created_at')
                    .eq('user_id', user.id)
                    .gte('created_at', thirtyDaysAgo)
                    .order('created_at', { ascending: false })
                    .limit(20)
            ).catch(() => ({ data: [] as any[], error: null })),
        ]);

        if (invoices.error) throw new Error(`activity invoices query failed: ${summarizeError(invoices.error)}`);
        const expenses = expensesRes;

        const events: any[] = [];

        for (const doc of invoices.data || []) {
            const s = normalizeStatus(doc.status);
            const t = normalizeStatus(doc.type);
            const isPaymentLink = t === 'PAYMENT_LINK';
            const amount = toNumber(doc.amount);
            const fallbackLabel = isPaymentLink ? 'Payment link' : 'Invoice';
            const title = doc.title || fallbackLabel;
            const idPrefix = isPaymentLink ? 'link' : 'inv';

            if (s === 'PAID') {
                const paidAt = getDocumentPaidAt(doc);
                if (paidAt < new Date(thirtyDaysAgo)) continue;
                events.push({
                    id: `${idPrefix}_paid_${doc.id}`,
                    type: isPaymentLink ? 'payment_link_paid' : 'invoice_paid',
                    title: `${title} paid`,
                    description: `Payment received for ${title}`,
                    amount,
                    createdAt: paidAt.toISOString(),
                });
            } else if (!isPaymentLink && ['SENT', 'VIEWED'].includes(s) && doc.content?.due_date && doc.content.due_date < nowIso) {
                events.push({
                    id: `inv_overdue_${doc.id}`,
                    type: 'invoice_overdue',
                    title: `${title} overdue`,
                    description: `${title} is past due`,
                    amount,
                    createdAt: doc.created_at,
                });
            } else if (!isPaymentLink && s === 'SENT') {
                events.push({
                    id: `inv_sent_${doc.id}`,
                    type: 'invoice_sent',
                    title: `${title} sent`,
                    description: `${title} was sent to client`,
                    amount,
                    createdAt: doc.created_at,
                });
            } else if (isPaymentLink && s === 'ACTIVE') {
                events.push({
                    id: `link_active_${doc.id}`,
                    type: 'payment_link_active',
                    title: `${title} created`,
                    description: `${title} is collecting payments`,
                    amount,
                    createdAt: doc.created_at,
                });
            }
        }

        for (const exp of expenses.data || []) {
            events.push({
                id: `exp_${exp.id}`,
                type: 'expense_added',
                title: exp.note || `${exp.category} expense`,
                description: `${exp.category} expense recorded`,
                amount: toNumber(exp.converted_amount_usd),
                nativeAmount: toNumber(exp.amount),
                currency: exp.currency || 'USD',
                createdAt: exp.created_at,
            });
        }

        events.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        res.json({ success: true, data: events.slice(0, 30) });
    } catch (error) {
        logger.error('Failed to build revenue activity', { error: error instanceof Error ? error.message : 'Unknown' });
        next(error);
    }
});

// GET /api/revenue/expenses
router.get('/expenses', authenticate, async (req: Request, res: Response, next) => {
    try {
        const privyId = req.user!.id;
        const user = await getOrCreateUser(privyId);
        if (!user) {
            res.status(404).json({ success: false, error: { message: 'User not found' } });
            return;
        }

        if (!await guardOwnerOrAdmin(req, res, user.id)) return;

        const expenses = await fetchPaged<any>('expenses_list', (from, to) =>
            supabase
                .from('expenses')
                .select('*')
                .eq('user_id', user.id)
                .order('date', { ascending: false })
                .range(from, to)
        ).catch(() => [] as any[]);

        res.json({ success: true, data: expenses });
    } catch (error) {
        logger.error('Failed to list expenses', { error: error instanceof Error ? error.message : 'Unknown' });
        next(error);
    }
});

// POST /api/revenue/credits
router.post('/credits', authenticate, async (req: Request, res: Response, next) => {
    try {
        const privyId = req.user!.id;
        const user = await getOrCreateUser(privyId);
        if (!user) {
            res.status(404).json({ success: false, error: { message: 'User not found' } });
            return;
        }

        if (!await guardOwnerOrAdmin(req, res, user.id)) return;

        const { amount, currency = 'USD', convertedAmountUsd, title, note = '', clientId, date } = req.body;
        if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
            res.status(400).json({ success: false, error: { message: 'Invalid amount' } });
            return;
        }

        const currencyCode = String(currency || 'USD').toUpperCase();
        const numericAmount = Number(amount);
        let usdAmount: number;
        if (convertedAmountUsd !== undefined && convertedAmountUsd !== null) {
            usdAmount = Number(convertedAmountUsd);
        } else if (currencyCode === 'USD') {
            usdAmount = numericAmount;
        } else {
            try {
                usdAmount = await convertToUsd(numericAmount, currencyCode);
            } catch (err) {
                logger.warn('Credit currency conversion failed; falling back to raw amount', {
                    currency: currencyCode,
                    error: err instanceof Error ? err.message : 'Unknown',
                });
                usdAmount = numericAmount;
            }
        }

        const recordDate = date ? new Date(date).toISOString() : new Date().toISOString();
        const cleanTitle = String(title || note || 'Manual credit').trim().slice(0, 120) || 'Manual credit';

        const { data, error } = await supabase
            .from('documents')
            .insert({
                user_id: user.id,
                client_id: clientId || null,
                type: 'INVOICE',
                title: `${cleanTitle} [Credit]`,
                description: note || 'Manual revenue credit',
                amount: Number(usdAmount.toFixed(6)),
                currency: 'USD',
                status: 'PAID',
                chain: 'BASE',
                created_at: recordDate,
                content: {
                    created_from: 'manual_credit',
                    bookkeeping_only: true,
                    payment_status: 'paid',
                    original_amount: numericAmount,
                    original_currency: currencyCode,
                    recorded_at: recordDate,
                    note: note || null,
                    reminders_enabled: false,
                },
            })
            .select()
            .single();

        if (error) throw new Error(`credit insert failed: ${summarizeError(error)}`);

        res.json({ success: true, data });
    } catch (error) {
        logger.error('Failed to create revenue credit', { error: error instanceof Error ? error.message : 'Unknown' });
        next(error);
    }
});

// POST /api/revenue/expenses
router.post('/expenses', authenticate, async (req: Request, res: Response, next) => {
    try {
        const privyId = req.user!.id;
        const user = await getOrCreateUser(privyId);
        if (!user) {
            res.status(404).json({ success: false, error: { message: 'User not found' } });
            return;
        }

        if (!await guardOwnerOrAdmin(req, res, user.id)) return;

        const { amount, currency = 'USD', convertedAmountUsd, category = 'other', projectId, clientId, note = '', sourceType = 'manual', date } = req.body;

        if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
            res.status(400).json({ success: false, error: { message: 'Invalid amount' } });
            return;
        }

        const currencyCode = String(currency).toUpperCase();
        const numericAmount = Number(amount);
        let usdAmount: number;
        if (convertedAmountUsd !== undefined && convertedAmountUsd !== null) {
            usdAmount = Number(convertedAmountUsd);
        } else if (currencyCode === 'USD') {
            usdAmount = numericAmount;
        } else {
            try {
                usdAmount = await convertToUsd(numericAmount, currencyCode);
            } catch (err) {
                logger.warn('Currency conversion failed; falling back to raw amount', {
                    currency: currencyCode,
                    error: err instanceof Error ? err.message : 'Unknown',
                });
                usdAmount = numericAmount;
            }
        }

        const { data, error } = await supabase
            .from('expenses')
            .insert({
                user_id: user.id,
                amount: numericAmount,
                currency: currencyCode,
                converted_amount_usd: usdAmount,
                category: String(category),
                project_id: projectId || null,
                client_id: clientId || null,
                note: String(note),
                source_type: String(sourceType),
                date: date ? new Date(date).toISOString() : new Date().toISOString(),
            })
            .select('*')
            .single();

        if (error) throw new Error(`expense insert failed: ${summarizeError(error)}`);

        res.status(201).json({ success: true, data });
    } catch (error) {
        logger.error('Failed to create expense', { error: error instanceof Error ? error.message : 'Unknown' });
        next(error);
    }
});

// PATCH /api/revenue/expenses/:id
router.patch('/expenses/:id', authenticate, async (req: Request, res: Response, next) => {
    try {
        const privyId = req.user!.id;
        const user = await getOrCreateUser(privyId);
        if (!user) {
            res.status(404).json({ success: false, error: { message: 'User not found' } });
            return;
        }

        if (!await guardOwnerOrAdmin(req, res, user.id)) return;

        const { id } = req.params;
        const { amount, currency, convertedAmountUsd, category, projectId, clientId, note, date } = req.body;

        const updates: Record<string, any> = {};
        if (amount !== undefined) updates.amount = Number(amount);
        if (currency !== undefined) updates.currency = String(currency).toUpperCase();
        if (convertedAmountUsd !== undefined) {
            updates.converted_amount_usd = Number(convertedAmountUsd);
        } else if (amount !== undefined || currency !== undefined) {
            // Recompute USD when amount changes — use the (possibly updated) currency.
            let effectiveAmount = Number(amount);
            if (amount === undefined) {
                const { data: existing, error: existingError } = await supabase
                    .from('expenses')
                    .select('amount')
                    .eq('id', id)
                    .eq('user_id', user.id)
                    .single();
                if (existingError) throw new Error(`expense lookup failed: ${summarizeError(existingError)}`);
                effectiveAmount = Number(existing?.amount);
            }
            const effectiveCurrency = updates.currency || String(currency || 'USD').toUpperCase();
            if (effectiveCurrency === 'USD') {
                updates.converted_amount_usd = effectiveAmount;
            } else {
                try {
                    updates.converted_amount_usd = await convertToUsd(effectiveAmount, effectiveCurrency);
                } catch (err) {
                    logger.warn('Currency conversion on update failed; falling back to raw amount', {
                        currency: effectiveCurrency,
                        error: err instanceof Error ? err.message : 'Unknown',
                    });
                    updates.converted_amount_usd = effectiveAmount;
                }
            }
        }
        if (category !== undefined) updates.category = String(category);
        if (projectId !== undefined) updates.project_id = projectId || null;
        if (clientId !== undefined) updates.client_id = clientId || null;
        if (note !== undefined) updates.note = String(note);
        if (date !== undefined) updates.date = new Date(date).toISOString();

        const { data, error } = await supabase
            .from('expenses')
            .update(updates)
            .eq('id', id)
            .eq('user_id', user.id)
            .select('*')
            .single();

        if (error) throw new Error(`expense update failed: ${summarizeError(error)}`);
        if (!data) {
            res.status(404).json({ success: false, error: { message: 'Expense not found' } });
            return;
        }

        res.json({ success: true, data });
    } catch (error) {
        logger.error('Failed to update expense', { error: error instanceof Error ? error.message : 'Unknown' });
        next(error);
    }
});

// DELETE /api/revenue/expenses/:id
router.delete('/expenses/:id', authenticate, async (req: Request, res: Response, next) => {
    try {
        const privyId = req.user!.id;
        const user = await getOrCreateUser(privyId);
        if (!user) {
            res.status(404).json({ success: false, error: { message: 'User not found' } });
            return;
        }

        if (!await guardOwnerOrAdmin(req, res, user.id)) return;

        const { id } = req.params;

        const { error, count } = await supabase
            .from('expenses')
            .delete({ count: 'exact' })
            .eq('id', id)
            .eq('user_id', user.id);

        if (error) throw new Error(`expense delete failed: ${summarizeError(error)}`);
        if (!count) {
            res.status(404).json({ success: false, error: { message: 'Expense not found' } });
            return;
        }

        res.json({ success: true });
    } catch (error) {
        logger.error('Failed to delete expense', { error: error instanceof Error ? error.message : 'Unknown' });
        next(error);
    }
});

// ─── Import document (unified add credit / add expense via AI) ───────────────

const SUPPORTED_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);

function normalizeCurrency(currency: unknown): string | null {
  if (!currency || typeof currency !== 'string') return null;
  const clean = currency.trim().toUpperCase().replace(/[^A-Z]/g, '');
  if (clean.length === 3) return clean;
  if (clean === 'NGN' || currency.includes('₦') || /naira/i.test(currency)) return 'NGN';
  if (clean === 'EUR' || currency.includes('€')) return 'EUR';
  if (clean === 'GBP' || currency.includes('£')) return 'GBP';
  if (clean === 'GHS' || currency.includes('₵') || /cedis?/i.test(currency)) return 'GHS';
  if (clean === 'KES' || /ksh|kes/i.test(currency)) return 'KES';
  if (clean === 'ZAR' || /rand/i.test(currency)) return 'ZAR';
  return 'USD';
}

// POST /api/revenue/import-document/analyze — upload file, classify via DeepSeek, no DB writes
router.post('/import-document/analyze', authenticate, upload.single('file'), async (req: Request, res: Response, next) => {
  try {
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) { res.status(404).json({ success: false, error: { message: 'User not found' } }); return; }

    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) { res.status(400).json({ success: false, error: { message: 'No file uploaded' } }); return; }

    const mimeType = String(file.mimetype || '').trim().toLowerCase();
    const normalizedMime = SUPPORTED_MIME.has(mimeType) ? mimeType
      : file.originalname.endsWith('.pdf') ? 'application/pdf'
      : file.originalname.endsWith('.png') ? 'image/png'
      : file.originalname.match(/\.jpe?g$/i) ? 'image/jpeg'
      : file.originalname.endsWith('.webp') ? 'image/webp'
      : mimeType;

    if (!SUPPORTED_MIME.has(normalizedMime)) {
      res.status(400).json({ success: false, error: { message: 'Unsupported file type. Use PDF, PNG, JPG, or WebP.' } });
      return;
    }

    const apiKey = process.env.AI_GATEWAY_API_KEY;
    if (!apiKey) {
      res.status(503).json({ success: false, error: { message: 'AI analysis is not configured. Contact support.' } });
      return;
    }

    const base64Data = file.buffer.toString('base64');

    const prompt = `You are Hedwig, an assistant for freelancers. Classify the attached document and extract bookkeeping fields.
Return ONLY valid JSON with no markdown fences, no commentary, no extra text.

Schema:
{
  "classification": "invoice" | "receipt" | "bank_statement" | "contract" | "other",
  "confidence": 0.0 to 1.0,
  "summary": "One sentence describing what this document is.",
  "suggestedTitle": "Short filing title",
  "amount": number or null,
  "currency": "3-letter ISO code like USD, EUR, NGN, GBP or null",
  "date": "YYYY-MM-DD or null",
  "issuer": "Sender/company name or null",
  "issuerEmail": "email or null",
  "paymentStatus": "paid" | "unpaid" | "unknown",
  "category": "software" | "contractors" | "marketing" | "travel" | "meals" | "office" | "operations" | "taxes" | "other"
}

Rules:
- Use "receipt" for money the user already spent (expense).
- Use "invoice" for money owed to or paid to the user.
- Use "bank_statement" for account/transaction statements.
- Use "contract" for agreements or signed documents.
- If the document is a receipt or shows money going out, set classification to "receipt".
- If the document is a bank statement, set classification to "bank_statement" and extract totals.
- paymentStatus "paid" = the document shows the invoice was paid, receipt, zero balance, or paid stamp.
- category is for expense categorization — only relevant for receipts.
- If amount is not clear, set it to null.
- Currency must be a 3-letter ISO code. Detect from symbols: ₦=NGN, €=EUR, £=GBP, ₵=GHS, KSh/KES, R/ZAR. Default to USD.`;

    const text = (await llmService.generateText(prompt, {
      maxOutputTokens: 1800,
      temperature: 0.1,
      files: [{ mimeType: normalizedMime, data: base64Data }],
    })).trim();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      res.status(422).json({ success: false, error: { message: 'AI could not parse the document. Try a clearer scan or different format.' } });
      return;
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      res.status(422).json({ success: false, error: { message: 'AI returned an unreadable response. Try again.' } });
      return;
    }

    const classification = String(parsed.classification || 'other');
    const validClassifications = ['invoice', 'receipt', 'bank_statement', 'contract', 'other'];
    const normalizedClassification = validClassifications.includes(classification) ? classification : 'other';

    // Determine if it's expense or credit
    let suggestedEntryType = 'credit';
    if (normalizedClassification === 'receipt') {
      suggestedEntryType = 'expense';
    } else if (normalizedClassification === 'bank_statement') {
      suggestedEntryType = 'expense';
    } else if (normalizedClassification === 'invoice') {
      suggestedEntryType = parsed.paymentStatus === 'paid' ? 'credit' : 'credit';
    }

    const amount = typeof parsed.amount === 'number' && parsed.amount > 0 ? parsed.amount : null;

    res.json({
      success: true,
      data: {
        classification: normalizedClassification,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
        summary: String(parsed.summary || ''),
        suggestedTitle: parsed.suggestedTitle ? String(parsed.suggestedTitle) : undefined,
        suggestedEntryType,
        amount: amount ?? null,
        currency: normalizeCurrency(parsed.currency),
        date: parsed.date ? String(parsed.date).slice(0, 10) : null,
        issuer: parsed.issuer ? String(parsed.issuer) : null,
        issuerEmail: parsed.issuerEmail ? String(parsed.issuerEmail) : null,
        paymentStatus: parsed.paymentStatus || 'unknown',
        category: ['software', 'contractors', 'marketing', 'travel', 'meals', 'office', 'operations', 'taxes', 'other'].includes(String(parsed.category)) ? String(parsed.category) : 'other',
      },
    });
  } catch (error) {
    logger.error('Document analysis failed', { error: error instanceof Error ? error.message : 'Unknown' });
    next(error);
  }
});

// POST /api/revenue/import-document/confirm — create the record (expense or credit)
router.post('/import-document/confirm', authenticate, async (req: Request, res: Response, next) => {
  try {
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) { res.status(404).json({ success: false, error: { message: 'User not found' } }); return; }

    const { entryType, amount, currency, category, note, date, clientId, title, suggestedTitle, issuer, issuerEmail, classification } = req.body;

    const amt = Number(amount);
    const curr = String(currency || 'USD').toUpperCase();

    if (!Number.isFinite(amt) || amt <= 0) {
      res.status(400).json({ success: false, error: { message: 'Valid amount is required' } });
      return;
    }

    let convertedAmountUsd: number;
    if (curr === 'USD') {
      convertedAmountUsd = amt;
    } else {
      try {
        convertedAmountUsd = await convertToUsd(amt, curr);
      } catch (err) {
        logger.warn('Currency conversion failed; using raw amount', { currency: curr, error: err });
        convertedAmountUsd = amt;
      }
    }

    if (entryType === 'expense') {
      const { data, error } = await supabase
        .from('expenses')
        .insert({
          user_id: user.id,
          amount: amt,
          currency: curr,
          converted_amount_usd: convertedAmountUsd,
          category: category || 'other',
          note: note || '',
          source_type: 'attachment_import',
          date: date ? new Date(date).toISOString() : new Date().toISOString(),
          client_id: clientId || null,
        })
        .select('*')
        .single();

      if (error) throw new Error(`expense insert failed: ${summarizeError(error)}`);
      res.json({ success: true, data });
      return;
    }

    // Credit / revenue
    const creditTitle = title || suggestedTitle || 'Imported credit';
    const { data, error } = await supabase
      .from('documents')
      .insert({
        user_id: user.id,
        type: 'INVOICE',
        title: `${creditTitle} [Credit]`,
        amount: amt,
        currency: curr,
        status: 'PAID',
        chain: 'BASE',
        client_id: clientId || null,
        content: {
          bookkeeping_only: true,
          created_from: 'document_import',
          ...(note ? { notes: note } : {}),
          ...(issuer ? { issuer } : {}),
          ...(issuerEmail ? { issuer_email: issuerEmail } : {}),
          ...(classification ? { source_classification: classification } : {}),
        },
      })
      .select('id')
      .single();

    if (error) throw new Error(`credit insert failed: ${summarizeError(error)}`);
    res.json({ success: true, data });
  } catch (error) {
    logger.error('Document import confirm failed', { error: error instanceof Error ? error.message : 'Unknown' });
    next(error);
  }
});

export default router;
