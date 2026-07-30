import { Router, Request, Response } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import { getOrCreateUser } from '../utils/userHelper';
import { convertToUsd, getRate, getRateSnapshot } from '../services/currency';
import { jsonrepair } from 'jsonrepair';
import { llmService } from '../services/llm';
import { createLogger } from '../utils/logger';
import { FREE_PLAN_LIMITS, getUserPlan } from '../services/billingRules';
import { getWorkspaceRole, isOwnerOrAdmin } from '../middleware/workspaceRole';
import { parseStatement, ParseResult } from '../services/statement-parser';
import { processStatementJob } from '../services/statement-job-processor';
import { detectBankName } from '../services/statement-job-processor';
import { initiateConnection, isComposioConfigured } from '../services/composio';


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

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

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

// Convert an amount + currency to USD equivalent using the cached rate snapshot.
// Returns the raw amount if currency is USD or conversion fails.
async function toUsdAmount(amount: number, currency: string | null | undefined): Promise<number> {
  const curr = (currency || 'USD').toUpperCase().trim();
  if (curr === 'USD' || !amount || amount <= 0) return amount;
  try {
    const snapshot = await getRateSnapshot();
    const rate = snapshot.rates[curr];
    return rate ? amount / rate : amount;
  } catch {
    return amount;
  }
}

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
                    .select('id,type,status,amount,currency,created_at,updated_at,content')
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

        const paidDocs = inRange.filter(isPaid);
        const prevDocs = inPrevRange.filter(isPaid);
        const pendingDocs = inRange.filter(isPending);
        const overdueDocs = inRange.filter(isOverdue);

        const paidRevenue = (await Promise.all(paidDocs.map((d: any) => toUsdAmount(toNumber(d.amount), d.currency)))).reduce((s, v) => s + v, 0);
        const prevRevenue = (await Promise.all(prevDocs.map((d: any) => toUsdAmount(toNumber(d.amount), d.currency)))).reduce((s, v) => s + v, 0);
        const pendingRevenue = (await Promise.all(pendingDocs.map((d: any) => toUsdAmount(toNumber(d.amount), d.currency)))).reduce((s, v) => s + v, 0);
        const overdueRevenue = (await Promise.all(overdueDocs.map((d: any) => toUsdAmount(toNumber(d.amount), d.currency)))).reduce((s, v) => s + v, 0);
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
                .select('type,status,amount,currency,client_id,project_id,created_at,updated_at,content')
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
            existing.totalRevenue += await toUsdAmount(toNumber(doc.amount), doc.currency);
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
            existing.totalRevenue += await toUsdAmount(toNumber(doc.amount), doc.currency);
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
                    .select('id,type,status,amount,currency,created_at,updated_at,content')
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

        const invoiceAmount = (await Promise.all(invoiceDocs.map((doc: any) => toUsdAmount(toNumber(doc.amount), doc.currency)))).reduce((sum, v) => sum + v, 0);
        const paymentLinkAmount = (await Promise.all(paymentLinkDocs.map((doc: any) => toUsdAmount(toNumber(doc.amount), doc.currency)))).reduce((sum, v) => sum + v, 0);
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

// GET /api/revenue/metrics?range=30d
router.get('/metrics', authenticate, async (req: Request, res: Response, next) => {
    try {
        const rangeRaw = String(req.query.range || '30d').toLowerCase();
        const requestedRange: RangeKey = ['7d', '30d', '90d', '1y', 'ytd'].includes(rangeRaw)
            ? (rangeRaw as RangeKey)
            : '30d';

        const privyId = req.user!.id;
        const user = await getOrCreateUser(privyId);
        if (!user) {
            res.status(404).json({ success: false, error: { message: 'User not found' } });
            return;
        }
        if (!await guardOwnerOrAdmin(req, res, user.id)) return;

        const effectiveWsId = getEffectiveWorkspaceId(req, user.id);
        const { range } = await resolveRangeForUser(user, requestedRange);
        const rangeStart = getRangeStart(range);
        const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

        const [paidDocs, rangeExpenses, expenses90d] = await Promise.all([
            fetchPaged<any>('metrics_paid_docs', (from, to) =>
                supabase
                    .from('documents')
                    .select('id,amount,currency,status,type,created_at,updated_at,content')
                    .eq('user_id', user.id)
                    .eq('workspace_id', effectiveWsId)
                    .in('type', ['INVOICE', 'PAYMENT_LINK'])
                    .eq('status', 'PAID')
                    .gte('updated_at', rangeStart.toISOString())
                    .order('updated_at', { ascending: false })
                    .range(from, to)
            ),
            fetchPaged<any>('metrics_range_expenses', (from, to) =>
                supabase
                    .from('expenses')
                    .select('category,converted_amount_usd,date')
                    .eq('user_id', user.id)
                    .gte('date', rangeStart.toISOString())
                    .order('date', { ascending: false })
                    .range(from, to)
            ).catch(() => [] as any[]),
            fetchPaged<any>('metrics_90d_expenses', (from, to) =>
                supabase
                    .from('expenses')
                    .select('converted_amount_usd,date')
                    .eq('user_id', user.id)
                    .gte('date', ninetyDaysAgo.toISOString())
                    .order('date', { ascending: false })
                    .range(from, to)
            ).catch(() => [] as any[]),
        ]);

        const paidRevenue = (await Promise.all(paidDocs.map((d: any) => toUsdAmount(toNumber(d.amount), d.currency)))).reduce((s, v) => s + v, 0);
        const totalExpenses = rangeExpenses.reduce((s: number, e: any) => s + toNumber(e.converted_amount_usd), 0);
        const profitMargin = paidRevenue > 0 ? ((paidRevenue - totalExpenses) / paidRevenue) * 100 : 0;

        const total90d = expenses90d.reduce((s: number, e: any) => s + toNumber(e.converted_amount_usd), 0);
        const burnRate = total90d / 3;

        const runway = burnRate > 0 ? paidRevenue / burnRate : null;

        const catMap: Record<string, number> = {};
        for (const e of rangeExpenses) {
            const cat = (e.category || 'other').toLowerCase();
            catMap[cat] = (catMap[cat] || 0) + toNumber(e.converted_amount_usd);
        }
        const catTotal = Object.values(catMap).reduce((s: number, v: number) => s + v, 0);
        const expenseCategories = Object.entries(catMap)
            .map(([category, total]) => ({
                category,
                total: Number(total.toFixed(2)),
                percentage: catTotal > 0 ? Number(((total / catTotal) * 100).toFixed(1)) : 0,
            }))
            .sort((a, b) => b.total - a.total);

        res.json({
            success: true,
            data: {
                profitMargin: Number(profitMargin.toFixed(1)),
                burnRate: Number(burnRate.toFixed(2)),
                runway: runway !== null ? Number(runway.toFixed(1)) : null,
                expenseCategories,
            },
        });
    } catch (error) {
        logger.error('Failed to build revenue metrics', { error: error instanceof Error ? error.message : 'Unknown' });
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

        const effectiveWsId = getEffectiveWorkspaceId(req, user.id);

        const { amount, currency = 'USD', convertedAmountUsd, category = 'other', projectId, clientId, note = '', sourceType = 'manual', date } = req.body;

        if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
            res.status(400).json({ success: false, error: { message: 'Invalid amount' } });
            return;
        }

        const VALID_CATEGORIES = new Set(['software', 'contractors', 'marketing', 'travel', 'meals', 'office', 'operations', 'taxes', 'subscriptions', 'shopping', 'entertainment', 'groceries', 'utilities', 'health', 'education', 'transportation', 'rent', 'personal_care', 'other']);
        const currencyCode = KNOWN_CURRENCIES.has(String(currency).toUpperCase()) ? String(currency).toUpperCase() : 'USD';
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
                workspace_id: effectiveWsId,
                amount: numericAmount,
                currency: currencyCode,
                converted_amount_usd: usdAmount,
                category: VALID_CATEGORIES.has(String(category)) ? String(category) : 'other',
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
        if (currency !== undefined) updates.currency = KNOWN_CURRENCIES.has(String(currency).toUpperCase()) ? String(currency).toUpperCase() : 'USD';
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
            const effectiveCurrency = updates.currency || (KNOWN_CURRENCIES.has(String(currency || 'USD').toUpperCase()) ? String(currency || 'USD').toUpperCase() : 'USD');
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
        const VALID_CATEGORIES = new Set(['software', 'contractors', 'marketing', 'travel', 'meals', 'office', 'operations', 'taxes', 'subscriptions', 'shopping', 'entertainment', 'groceries', 'utilities', 'health', 'education', 'transportation', 'rent', 'personal_care', 'other']);
        if (category !== undefined) {
            const cat = String(category);
            updates.category = VALID_CATEGORIES.has(cat) ? cat : 'other';
        }
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

const KNOWN_CURRENCIES = new Set([
  'AED','AFN','ALL','AMD','ANG','AOA','ARS','AUD','AWG','AZN',
  'BAM','BBD','BDT','BGN','BHD','BIF','BMD','BND','BOB','BRL',
  'BSD','BTN','BWP','BYN','BZD','CAD','CDF','CHF','CLP','CNY',
  'COP','CRC','CUP','CVE','CZK','DJF','DKK','DOP','DZD','EGP',
  'ERN','ETB','EUR','FJD','FKP','FOK','GBP','GEL','GHS','GIP',
  'GMD','GNF','GTQ','GYD','HKD','HNL','HRK','HTG','HUF','IDR',
  'ILS','INR','IQD','IRR','ISK','JMD','JOD','JPY','KES','KGS',
  'KHR','KID','KMF','KRW','KWD','KYD','KZT','LAK','LBP','LKR',
  'LRD','LSL','LYD','MAD','MDL','MGA','MKD','MMK','MNT','MOP',
  'MRU','MUR','MVR','MWK','MXN','MYR','MZN','NAD','NGN','NIO',
  'NOK','NPR','NZD','OMR','PAB','PEN','PGK','PHP','PKR','PLN',
  'PYG','QAR','RON','RSD','RUB','RWF','SAR','SBD','SCR','SDG',
  'SEK','SGD','SHP','SLL','SOS','SRD','SSP','STN','SVC','SYP',
  'SZL','THB','TJS','TMT','TND','TOP','TRY','TTD','TVD','TWD',
  'TZS','UAH','UGX','USD','UYU','UZS','VES','VND','VUV','WST',
  'XAF','XCD','XDR','XOF','XPF','YER','ZAR','ZMW',
]);

function normalizeCurrency(currency: unknown): string | null {
  if (!currency || typeof currency !== 'string') return null;
  const clean = currency.trim().toUpperCase().replace(/[^A-Z]/g, '');
  if (KNOWN_CURRENCIES.has(clean)) return clean;
  if (clean === 'NGN' || currency.includes('₦') || /naira/i.test(currency)) return 'NGN';
  if (clean === 'EUR' || currency.includes('€')) return 'EUR';
  if (clean === 'GBP' || currency.includes('£')) return 'GBP';
  if (clean === 'GHS' || currency.includes('₵') || /cedis?/i.test(currency)) return 'GHS';
  if (clean === 'KES' || /ksh|kes/i.test(currency)) return 'KES';
  if (clean === 'ZAR' || /rand/i.test(currency)) return 'ZAR';
  return 'USD';
}

function tryExtractJson(text: string): Record<string, unknown> | null {
  // Remove markdown code fences
  let cleaned = text.replace(/```(?:json)?\s*/gi, '').replace(/\s*```/g, '').trim();
  // Try direct parse first
  try { return JSON.parse(cleaned); } catch { /* fall through */ }
  // Try jsonrepair for common LLM issues (unquoted keys, trailing commas, single quotes)
  try { return JSON.parse(jsonrepair(cleaned)); } catch { /* fall through */ }
  // Try finding JSON object with balanced braces
  let depth = 0;
  let start = -1;
  for (let i = 0; i < cleaned.length; i++) {
    if (cleaned[i] === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (cleaned[i] === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        const candidate = cleaned.slice(start, i + 1);
        try { return JSON.parse(jsonrepair(candidate)); } catch { /* continue searching */ }
      }
    }
  }
  // Fall back to greedy regex match
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(jsonrepair(match[0])); } catch { /* give up */ }
  }
  return null;
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

    const parsed = tryExtractJson(text);
    if (!parsed) {
      res.status(422).json({ success: false, error: { message: 'AI could not parse the document. Try a clearer scan or different format.' } });
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

    const effectiveWsId = getEffectiveWorkspaceId(req, user.id);

    if (entryType === 'expense') {
      const { data, error } = await supabase
        .from('expenses')
        .insert({
          user_id: user.id,
          workspace_id: effectiveWsId,
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
        workspace_id: effectiveWsId,
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

// ── Statement Import (CSV/OFX/QFX) ─────────────────────────────────────────────

router.post('/import-statement/parse', authenticate, upload.single('file'), async (req: Request, res: Response, next) => {
  try {
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) { res.status(404).json({ success: false, error: { message: 'User not found' } }); return; }
    if (!await guardOwnerOrAdmin(req, res, user.id)) return;

    const effectiveWsId = getEffectiveWorkspaceId(req, user.id);

    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) { res.status(400).json({ success: false, error: { message: 'No file uploaded' } }); return; }

    // Detect file type — PDF/image statements are extracted via AI
    const ext = file.originalname.split('.').pop()?.toLowerCase() || '';
    const imageFormats = ['pdf', 'png', 'jpg', 'jpeg', 'webp'];
    let parseResult: ParseResult;

    if (imageFormats.includes(ext)) {
      // ── AI-powered extraction for PDF/image statements (async job) ──
      if (!process.env.OPENROUTER_API_KEY) {
        res.status(503).json({ success: false, error: { message: 'AI-powered statement import requires OPENROUTER_API_KEY to be configured.' } });
        return;
      }

      // Create async job record
      const { data: jobRecord, error: jobErr } = await supabase
        .from('statement_jobs')
        .insert({
          user_id: user.id,
          workspace_id: effectiveWsId,
          original_filename: file.originalname,
          file_format: ext,
          file_data: file.buffer.toString('base64'),
          status: 'processing',
        })
        .select('id')
        .single();

      if (jobErr || !jobRecord) {
        throw new Error(`Failed to create import job: ${summarizeError(jobErr)}`);
      }

      // Kick off background processing (fire-and-forget)
      setImmediate(() => {
        processStatementJob(jobRecord.id).catch((err) => {
          logger.error('Background statement job failed', { jobId: jobRecord.id, error: err.message });
        });
      });

      res.json({
        success: true,
        data: {
          jobId: jobRecord.id,
          status: 'processing',
        },
      });
      return;
    } else {
      // ── Text-based parsing for CSV/OFX/QFX ──
      const content = file.buffer.toString('utf-8');
      parseResult = parseStatement(content, file.originalname);
    }

    // ── Persist statement_imports record ──
    let totalDebits = 0;
    let totalCredits = 0;
    for (const txn of parseResult.transactions) {
      if (txn.type === 'debit') totalDebits += txn.amount;
      else totalCredits += txn.amount;
    }

    const { data: stmtRecord, error: stmtErr } = await supabase
      .from('statement_imports')
      .insert({
        user_id: user.id,
        workspace_id: effectiveWsId,
        original_filename: file.originalname,
        file_format: parseResult.source,
        bank_name: parseResult.bankName,
        account_number: parseResult.accountNumber,
        start_date: parseResult.startDate,
        end_date: parseResult.endDate,
        currency: parseResult.currency,
        transaction_count: parseResult.transactions.length,
        total_debits: totalDebits || null,
        total_credits: totalCredits || null,
        status: 'reviewing',
      })
      .select('id')
      .single();

    if (stmtErr || !stmtRecord) {
      throw new Error(`Failed to create statement record: ${summarizeError(stmtErr)}`);
    }

    const statementId = stmtRecord.id;

    // ── Compute USD conversions for each transaction ──
    const enrichedTxns = await Promise.all(parseResult.transactions.map(async (txn) => {
      let convertedAmountUsd: number | null = null;
      let fxRate: number | null = null;
      let fxSource: string | null = null;

      if (txn.currency !== 'USD' && txn.amount > 0) {
        try {
          convertedAmountUsd = await convertToUsd(txn.amount, txn.currency);
          const rate = await getRate('USD', txn.currency).catch(() => null);
          if (rate && rate > 0) {
            fxRate = rate;
            fxSource = 'frankfurter';
          }
        } catch {
          // keep null — fallback handled at confirm time
        }
      } else {
        convertedAmountUsd = txn.amount;
        fxRate = 1;
        fxSource = 'identity';
      }

      return {
        user_id: user.id,
        workspace_id: effectiveWsId,
        statement_id: statementId,
        transaction_date: txn.transactionDate || new Date().toISOString().slice(0, 10),
        description: txn.description,
        original_description: txn.originalDescription,
        amount: txn.amount,
        currency: txn.currency,
        type: txn.type,
        bank_name: txn.bankName,
        account_number: parseResult.accountNumber,
        running_balance: txn.runningBalance,
        reference: txn.reference,
        converted_amount_usd: convertedAmountUsd,
        fx_rate: fxRate,
        fx_source: fxSource,
        status: 'pending',
      };
    }));

    // ── Bulk insert imported_transactions ──
    const { data: insertedTxns, error: insertErr } = await supabase
      .from('imported_transactions')
      .insert(enrichedTxns)
      .select('id, transaction_date, description, original_description, amount, currency, type, running_balance, reference, bank_name, converted_amount_usd, fx_rate, fx_source');

    if (insertErr || !insertedTxns) {
      // Clean up the statement record on failure
      await supabase.from('statement_imports').delete().eq('id', statementId);
      throw new Error(`Failed to insert transactions: ${summarizeError(insertErr)}`);
    }

    // ── AI analysis (non-blocking) ──
    const apiKey = process.env.AI_GATEWAY_API_KEY;
    let aiSuggestions: Record<string, unknown> | null = null;

    if (apiKey && parseResult.transactions.length > 0) {
      const sampleTxns = parseResult.transactions.slice(0, 50);
      const prompt = `You are Hedwig, a bookkeeping assistant. You have been given a bank statement with ${parseResult.transactions.length} transactions from ${parseResult.bankName || 'unknown bank'}.

Analyze the transactions and return ONLY valid JSON with no markdown fences, no commentary:

{
  "categories": { "software": number, "income": number, "transfers": number, "other_expenses": number },
  "largestTransactions": ["desc1", "desc2", "desc3"],
  "suspiciousTransactions": ["desc1"],
  "clientSuggestions": [
    {
      "transactionDescription": "the matching description",
      "suggestedClientName": "Likely client name",
      "confidence": 0.0-1.0
    }
  ],
  "summary": "One sentence summary of this statement."
}

Here are the first ${Math.min(50, sampleTxns.length)} transactions as JSON:
${JSON.stringify(sampleTxns, null, 2)}

Rules:
- Categorize transactions based on description
- If a transaction looks like a client payment (recurring, invoice-like), suggest a client name
- Flag transactions that look unusual or suspicious
- Be concise`;

      try {
        const aiText = (await llmService.generateText(prompt, {
          maxOutputTokens: 2000,
          temperature: 0.1,
        })).trim();

        const jsonMatch = aiText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          aiSuggestions = JSON.parse(jsonMatch[0]);
        }
      } catch (aiErr) {
        logger.warn('AI analysis for statement import failed', { error: aiErr instanceof Error ? aiErr.message : 'Unknown' });
      }

      // Save AI summary on the statement_imports record
      if (aiSuggestions) {
        await supabase
          .from('statement_imports')
          .update({ import_summary: aiSuggestions as any })
          .eq('id', statementId);
      }
    }

    res.json({
      success: true,
      data: {
        statementId,
        bankName: parseResult.bankName,
        accountNumber: parseResult.accountNumber,
        startDate: parseResult.startDate,
        endDate: parseResult.endDate,
        currency: parseResult.currency,
        transactionCount: insertedTxns.length,
        transactions: insertedTxns,
        aiSuggestions,
      },
    });
  } catch (error: any) {
    logger.error('Statement import parse failed', { error: error instanceof Error ? error.message : 'Unknown' });
    if (error.message?.includes('Could not detect CSV columns') || error.message?.includes('Unsupported file format')) {
      res.status(422).json({ success: false, error: { message: error.message } });
      return;
    }
    next(error);
  }
});

// ── Statement Import History ────────────────────────────────────────────────

router.get('/statement-imports', authenticate, async (req: Request, res: Response, next) => {
  try {
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) { res.status(404).json({ success: false, error: { message: 'User not found' } }); return; }
    if (!await guardOwnerOrAdmin(req, res, user.id)) return;

    const effectiveWsId = getEffectiveWorkspaceId(req, user.id);

    const { data, error } = await supabase
      .from('statement_imports')
      .select('*')
      .eq('workspace_id', effectiveWsId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw new Error(`statement imports query failed: ${summarizeError(error)}`);

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/statement-imports/:id', authenticate, async (req: Request, res: Response, next) => {
  try {
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) { res.status(404).json({ success: false, error: { message: 'User not found' } }); return; }
    if (!await guardOwnerOrAdmin(req, res, user.id)) return;

    const { id } = req.params;

    const { data: stmt, error: stmtErr } = await supabase
      .from('statement_imports')
      .select('*')
      .eq('id', id)
      .single();

    if (stmtErr || !stmt) {
      res.status(404).json({ success: false, error: { message: 'Statement import not found' } });
      return;
    }

    const { data: transactions, error: txnErr } = await supabase
      .from('imported_transactions')
      .select('*')
      .eq('statement_id', id)
      .order('transaction_date', { ascending: true });

    if (txnErr) throw new Error(`imported transactions query failed: ${summarizeError(txnErr)}`);

    res.json({ success: true, data: { statement: stmt, transactions } });
  } catch (error) {
    next(error);
  }
});

router.patch('/imported-transactions/:id/match', authenticate, async (req: Request, res: Response, next) => {
  try {
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) { res.status(404).json({ success: false, error: { message: 'User not found' } }); return; }
    if (!await guardOwnerOrAdmin(req, res, user.id)) return;

    const { id } = req.params;
    const { matchedInvoiceId, matchedExpenseId, matchedClientId, matchMethod, status } = req.body;

    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (matchedInvoiceId !== undefined) updates.matched_invoice_id = matchedInvoiceId;
    if (matchedExpenseId !== undefined) updates.matched_expense_id = matchedExpenseId;
    if (matchedClientId !== undefined) updates.matched_client_id = matchedClientId;
    if (matchMethod !== undefined) updates.match_method = matchMethod;
    if (status !== undefined) updates.status = status;

    const { data, error } = await supabase
      .from('imported_transactions')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) throw new Error(`match update failed: ${summarizeError(error)}`);

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// ── Categorization Rules ─────────────────────────────────────────────────────

router.get('/categorization-rules', authenticate, async (req: Request, res: Response, next) => {
  try {
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) { res.status(404).json({ success: false, error: { message: 'User not found' } }); return; }
    if (!await guardOwnerOrAdmin(req, res, user.id)) return;

    const effectiveWsId = getEffectiveWorkspaceId(req, user.id);

    const { data, error } = await supabase
      .from('categorization_rules')
      .select('*')
      .eq('workspace_id', effectiveWsId)
      .order('priority', { ascending: true });

    if (error) throw new Error(`categorization rules query failed: ${summarizeError(error)}`);

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/categorization-rules', authenticate, async (req: Request, res: Response, next) => {
  try {
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) { res.status(404).json({ success: false, error: { message: 'User not found' } }); return; }
    if (!await guardOwnerOrAdmin(req, res, user.id)) return;

    const effectiveWsId = getEffectiveWorkspaceId(req, user.id);
    const { conditions, category, priority } = req.body;

    if (!conditions || !category) {
      res.status(400).json({ success: false, error: { message: 'conditions and category are required' } });
      return;
    }

    const { data, error } = await supabase
      .from('categorization_rules')
      .insert({
        user_id: user.id,
        workspace_id: effectiveWsId,
        conditions,
        category,
        priority: priority ?? 0,
      })
      .select()
      .single();

    if (error) throw new Error(`categorization rule create failed: ${summarizeError(error)}`);

    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.delete('/categorization-rules/:id', authenticate, async (req: Request, res: Response, next) => {
  try {
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) { res.status(404).json({ success: false, error: { message: 'User not found' } }); return; }
    if (!await guardOwnerOrAdmin(req, res, user.id)) return;

    const { id } = req.params;

    const { error } = await supabase
      .from('categorization_rules')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) throw new Error(`categorization rule delete failed: ${summarizeError(error)}`);

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.post('/import-statement/confirm', authenticate, async (req: Request, res: Response, next) => {
  try {
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) { res.status(404).json({ success: false, error: { message: 'User not found' } }); return; }
    if (!await guardOwnerOrAdmin(req, res, user.id)) return;

    const effectiveWsId = getEffectiveWorkspaceId(req, user.id);

    const { statementId, transactions } = req.body;

    if (!statementId || !Array.isArray(transactions) || transactions.length === 0) {
      res.status(400).json({ success: false, error: { message: 'statementId and transactions array required' } });
      return;
    }

    // Verify the statement_import exists (now it will — we created it in the parse route)
    const { data: stmtData, error: stmtErr } = await supabase
      .from('statement_imports')
      .select('id, currency')
      .eq('id', statementId)
      .single();

    if (stmtErr || !stmtData) {
      res.status(404).json({ success: false, error: { message: 'Statement import not found' } });
      return;
    }

    const created: string[] = [];
    const skipped: string[] = [];
    let totalExpenses = 0;
    let totalCredits = 0;

    for (const txn of transactions) {
      if (txn.status === 'skipped') {
        skipped.push(txn.id);
        await supabase
          .from('imported_transactions')
          .update({ status: 'skipped', updated_at: new Date().toISOString() })
          .eq('id', txn.id);
        continue;
      }

      // Skip already-expensed transactions (idempotency guard)
      const { data: existingStatus } = await supabase
        .from('imported_transactions')
        .select('status')
        .eq('id', txn.id)
        .single();
      if (existingStatus?.status === 'expensed') {
        created.push(txn.id);
        continue;
      }

      // Mark as expensed — this transaction is now consumed
      const { error: markErr } = await supabase
        .from('imported_transactions')
        .update({ status: 'expensed', updated_at: new Date().toISOString() })
        .eq('id', txn.id);

      if (markErr) {
        logger.error('Failed to mark transaction as expensed', { error: markErr, txnId: txn.id });
        continue;
      }

      if (txn.type === 'debit') {
        // Create expense
        let convertedAmountUsd: number;
        const curr = txn.currency || 'USD';
        if (curr === 'USD') {
          convertedAmountUsd = txn.amount;
        } else {
          try {
            convertedAmountUsd = await convertToUsd(txn.amount, curr);
          } catch {
            convertedAmountUsd = txn.amount;
          }
        }

        const { error: insErr } = await supabase
          .from('expenses')
          .insert({
            user_id: user.id,
            workspace_id: effectiveWsId,
            amount: txn.amount,
            currency: curr,
            converted_amount_usd: convertedAmountUsd,
            category: txn.category || 'other',
            note: txn.description || '',
            source_type: 'transaction_import',
            date: txn.transactionDate || new Date().toISOString(),
            client_id: txn.matchedClientId || null,
            project_id: txn.matchedProjectId || null,
          });

        if (!insErr) {
          created.push(txn.id);
          totalExpenses += txn.amount;
        } else {
          logger.error('Failed to create expense from import', { error: insErr, txnId: txn.id });
        }
      } else {
        // Credit — create a bookkeeping-only revenue document
        const description = txn.description || 'Statement credit';
        const { error: creditErr } = await supabase
          .from('documents')
          .insert({
            user_id: user.id,
            workspace_id: effectiveWsId,
            client_id: txn.matchedClientId || null,
            type: 'INVOICE',
            title: `${description} [Credit]`,
            amount: txn.amount,
            currency: txn.currency || 'USD',
            status: 'PAID',
            chain: 'BASE',
            content: {
              bookkeeping_only: true,
              created_from: 'statement_import',
              original_amount: txn.amount,
              original_currency: txn.currency || 'USD',
            },
          });

        if (!creditErr) {
          created.push(txn.id);
          totalCredits += txn.amount;
        } else {
          logger.error('Failed to create credit from import', { error: creditErr, txnId: txn.id });
        }
      }
    }

    const confirmedCount = created.length;
    const skippedCount = skipped.length;
    const finalStatus = confirmedCount > 0 && skippedCount === 0 ? 'confirmed'
      : confirmedCount > 0 ? 'partially_confirmed'
      : 'confirmed';

    const { error: updateStmtErr } = await supabase
      .from('statement_imports')
      .update({
        status: finalStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', statementId);

    if (updateStmtErr) {
      logger.error('Failed to update statement status', { error: updateStmtErr, statementId });
    }

    res.json({
      success: true,
      data: {
        confirmedCount,
        skippedCount,
        statementId,
        totalExpenses,
        totalCredits,
        status: finalStatus,
      },
    });
  } catch (error) {
    logger.error('Statement import confirm failed', { error: error instanceof Error ? error.message : 'Unknown' });
    next(error || new Error('Statement confirm failed'));
  }
});

// ── Statement Job Polling ────────────────────────────────────────────────────

router.get('/import-statement/jobs/:id', authenticate, async (req: Request, res: Response, next) => {
  try {
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) { res.status(404).json({ success: false, error: { message: 'User not found' } }); return; }

    const { id } = req.params;
    const { data: job, error } = await supabase
      .from('statement_jobs')
      .select('id, status, error_message, chunk_info, result, chunk_count, chunk_success_count, chunk_fail_count')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (error || !job) {
      res.status(404).json({ success: false, error: { message: 'Job not found' } });
      return;
    }

    const payload: any = {
      jobId: job.id,
      status: job.status,
    };

    if (job.status === 'failed') {
      payload.error = job.error_message;
    }

    if (job.status === 'complete' || job.status === 'partial') {
      const result = typeof job.result === 'string' ? JSON.parse(job.result) : job.result;
      payload.result = result;
      if (job.status === 'partial') {
        payload.warning = job.chunk_info;
      }
    }

    res.json({ success: true, data: payload });
  } catch (error) {
    logger.error('Statement job poll failed', { error: (error as Error).message });
    next(error);
  }
});

// ── Unified P&L Ledger ────────────────────────────────────────────────────────

interface LedgerEntry {
  date: string;
  description: string;
  account: string;
  debit: number;
  credit: number;
  type: 'revenue' | 'expense' | 'credit' | 'transfer';
  referenceId: string;
  category: string | null;
  currency: string;
}

// GET /api/revenue/ledger?range=30d&type=all&page=1&pageSize=50
router.get('/ledger', authenticate, async (req: Request, res: Response, next) => {
  try {
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) { res.status(404).json({ success: false, error: { message: 'User not found' } }); return; }
    if (!await guardOwnerOrAdmin(req, res, user.id)) return;

    const effectiveWsId = getEffectiveWorkspaceId(req, user.id);
    const rangeRaw = String(req.query.range || '30d').toLowerCase();
    const requestedRange: RangeKey = ['7d', '30d', '90d', '1y', 'ytd'].includes(rangeRaw) ? (rangeRaw as RangeKey) : '30d';
    const { range } = await resolveRangeForUser(user, requestedRange);
    const start = getRangeStart(range);
    const startIso = start.toISOString();
    const typeFilter = String(req.query.type || 'all').toLowerCase();
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const pageSize = Math.min(200, Math.max(1, parseInt(String(req.query.pageSize || '50'), 10)));

    const [invoices, expenses, importedTxns] = await Promise.all([
      fetchPaged<any>('ledger_invoices', (from, to) =>
        supabase
          .from('documents')
          .select('id,type,status,amount,currency,title,created_at,updated_at,content,client_id')
          .eq('user_id', user.id)
          .eq('workspace_id', effectiveWsId)
          .in('type', ['INVOICE', 'PAYMENT_LINK'])
          .or(`created_at.gte.${startIso},updated_at.gte.${startIso}`)
          .order('updated_at', { ascending: false })
          .range(from, to)
      ),
      fetchPaged<any>('ledger_expenses', (from, to) =>
        supabase
          .from('expenses')
          .select('id,amount,currency,converted_amount_usd,category,note,date,client_id,created_at')
          .eq('user_id', user.id)
          .gte('date', startIso)
          .order('date', { ascending: false })
          .range(from, to)
      ).catch(() => [] as any[]),
      fetchPaged<any>('ledger_imported', (from, to) =>
        supabase
          .from('imported_transactions')
          .select('id,transaction_date,description,amount,converted_amount_usd,currency,type,category,status,created_at')
          .eq('user_id', user.id)
          .gte('created_at', startIso)
          .order('transaction_date', { ascending: false })
          .range(from, to)
      ).catch(() => [] as any[]),
    ]);

    const entries: LedgerEntry[] = [];

    // Paid invoices → revenue (convert non-USD to USD equivalent)
    for (const inv of invoices) {
      const s = normalizeStatus(inv.status);
      if (s !== 'PAID') continue;
      const paidAt = getDocumentPaidAt(inv);
      if (paidAt < start) continue;
      const isCredit = inv.content?.bookkeeping_only === true;
      let revAmount = toNumber(inv.amount);
      const revCurrency = inv.currency || 'USD';
      if (revCurrency !== 'USD' && revAmount > 0) {
        try { revAmount = await convertToUsd(revAmount, revCurrency); }
        catch { /* leave as-is */ }
      }
      entries.push({
        date: paidAt.toISOString().slice(0, 10),
        description: inv.title || (isCredit ? 'Credit entry' : 'Invoice payment'),
        account: isCredit ? 'Other Income' : 'Revenue',
        debit: 0,
        credit: revAmount,
        type: isCredit ? 'credit' : 'revenue',
        referenceId: inv.id,
        category: null,
        currency: 'USD',
      });
    }

    // Expenses
    for (const exp of expenses) {
      let debitAmount = toNumber(exp.converted_amount_usd);
      if (!debitAmount || debitAmount === 0) {
        debitAmount = toNumber(exp.amount);
        const expCurr = exp.currency || 'USD';
        if (expCurr !== 'USD' && debitAmount > 0) {
          try { debitAmount = await convertToUsd(debitAmount, expCurr); }
          catch { /* leave raw */ }
        }
      }
      entries.push({
        date: exp.date?.slice(0, 10) || exp.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10),
        description: exp.note || `${exp.category || 'other'} expense`,
        account: mapCategoryToAccount(exp.category),
        debit: debitAmount,
        credit: 0,
        type: 'expense',
        referenceId: exp.id,
        category: exp.category || 'other',
        currency: 'USD',
      });
    }

    // Imported transactions (unmatched ones still in pending)
    for (const txn of importedTxns) {
      if (txn.status === 'skipped' || txn.status === 'expensed') continue;
      let effectiveAmount = txn.converted_amount_usd;
      if (!effectiveAmount || effectiveAmount === 0) {
        effectiveAmount = toNumber(txn.amount);
        const txnCurr = txn.currency || 'USD';
        if (txnCurr !== 'USD' && effectiveAmount > 0) {
          try { effectiveAmount = await convertToUsd(effectiveAmount, txnCurr); }
          catch { /* leave raw */ }
        }
      }
      entries.push({
        date: txn.transaction_date?.slice(0, 10) || txn.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10),
        description: txn.description || 'Imported transaction',
        account: txn.type === 'debit' ? mapCategoryToAccount(txn.category) : 'Imported Credit',
        debit: txn.type === 'debit' ? toNumber(effectiveAmount) : 0,
        credit: txn.type === 'credit' ? toNumber(effectiveAmount) : 0,
        type: 'transfer',
        referenceId: txn.id,
        category: txn.category || null,
        currency: 'USD',
      });
    }

    // Sort by date descending
    entries.sort((a, b) => b.date.localeCompare(a.date));

    // Filter by type
    const filtered = typeFilter === 'all' ? entries
      : typeFilter === 'revenue' ? entries.filter((e) => e.type === 'revenue' || e.type === 'credit')
      : typeFilter === 'expense' ? entries.filter((e) => e.type === 'expense')
      : entries;

    // Paginate
    const total = filtered.length;
    const totalPages = Math.ceil(total / pageSize);
    const startIdx = (page - 1) * pageSize;
    const paged = filtered.slice(startIdx, startIdx + pageSize);

    // Compute P&L summary from filtered data
    const totalRevenue = entries.filter((e) => e.type === 'revenue').reduce((s, e) => s + e.credit, 0);
    const totalCredits = entries.filter((e) => e.type === 'credit').reduce((s, e) => s + e.credit, 0);
    const totalExpenses = entries.filter((e) => e.type === 'expense').reduce((s, e) => s + e.debit, 0);

    res.json({
      success: true,
      data: {
        entries: paged,
        summary: {
          totalRevenue: Number(totalRevenue.toFixed(2)),
          totalCredits: Number(totalCredits.toFixed(2)),
          totalExpenses: Number(totalExpenses.toFixed(2)),
          netIncome: Number((totalRevenue + totalCredits - totalExpenses).toFixed(2)),
          entryCount: total,
        },
        pagination: { page, pageSize, total, totalPages },
      },
    });
  } catch (error) {
    logger.error('Failed to build ledger', { error: error instanceof Error ? error.message : 'Unknown' });
    next(error);
  }
});

function mapCategoryToAccount(category: string | null): string {
  const map: Record<string, string> = {
    software: 'Software & Tools',
    contractors: 'Contractors',
    marketing: 'Marketing',
    travel: 'Travel',
    meals: 'Meals & Entertainment',
    office: 'Office Supplies',
    operations: 'Operations',
    taxes: 'Taxes & Licenses',
    subscriptions: 'Subscriptions',
    shopping: 'Shopping',
    entertainment: 'Entertainment',
    groceries: 'Groceries',
    utilities: 'Utilities',
    health: 'Health',
    education: 'Education',
    transportation: 'Transportation',
    rent: 'Rent',
    personal_care: 'Personal Care',
  };
  return map[category || ''] || 'Other Expenses';
}

// GET /api/revenue/ledger/export?range=30d
router.get('/ledger/export', authenticate, async (req: Request, res: Response, next) => {
  try {
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) { res.status(404).json({ success: false, error: { message: 'User not found' } }); return; }
    if (!await guardOwnerOrAdmin(req, res, user.id)) return;

    // Fetch ledger data (reuse the query logic by making an internal-style call)
    const effectiveWsId = getEffectiveWorkspaceId(req, user.id);
    const rangeRaw = String(req.query.range || '30d').toLowerCase();
    const requestedRange: RangeKey = ['7d', '30d', '90d', '1y', 'ytd'].includes(rangeRaw) ? (rangeRaw as RangeKey) : '30d';
    const { range } = await resolveRangeForUser(user, requestedRange);
    const start = getRangeStart(range);
    const startIso = start.toISOString();

    const [invoices, expenses] = await Promise.all([
      fetchPaged<any>('export_ledger_invoices', (from, to) =>
        supabase.from('documents').select('id,type,status,amount,currency,title,created_at,updated_at,content,client_id')
          .eq('user_id', user.id).eq('workspace_id', effectiveWsId)
          .in('type', ['INVOICE', 'PAYMENT_LINK'])
          .or(`created_at.gte.${startIso},updated_at.gte.${startIso}`)
          .order('updated_at', { ascending: false }).range(from, to)
      ),
      fetchPaged<any>('export_ledger_expenses', (from, to) =>
        supabase.from('expenses').select('id,amount,currency,converted_amount_usd,category,note,date,client_id,created_at')
          .eq('user_id', user.id).gte('date', startIso)
          .order('date', { ascending: false }).range(from, to)
      ).catch(() => [] as any[]),
    ]);

    // Build the Excel workbook
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Hedwig';

    // ── Sheet 1: P&L Statement ──
    const pnlSheet = wb.addWorksheet('P&L Statement');
    pnlSheet.columns = [
      { header: 'Account', key: 'account', width: 35 },
      { header: 'Amount', key: 'amount', width: 18 },
      { header: '% of Revenue', key: 'pct', width: 15 },
    ];

    // Revenue
    let totalRev = 0;
    let totalExp = 0;

    const revenueByAccount: Record<string, number> = {};
    for (const inv of invoices) {
      if (normalizeStatus(inv.status) !== 'PAID') continue;
      const isCredit = inv.content?.bookkeeping_only === true;
      const account = isCredit ? 'Other Income' : 'Revenue';
      let amt = toNumber(inv.amount);
      const curr = inv.currency || 'USD';
      if (curr !== 'USD' && amt > 0) {
        try { amt = await convertToUsd(amt, curr); } catch { /* leave as-is */ }
      }
      revenueByAccount[account] = (revenueByAccount[account] || 0) + amt;
      totalRev += amt;
    }

    const expensesByAccount: Record<string, number> = {};
    for (const exp of expenses) {
      const account = mapCategoryToAccount(exp.category);
      const amt = toNumber(exp.converted_amount_usd || exp.amount);
      expensesByAccount[account] = (expensesByAccount[account] || 0) + amt;
      totalExp += amt;
    }

    // Title row
    pnlSheet.mergeCells('A1:C1');
    const titleCell = pnlSheet.getCell('A1');
    titleCell.value = `Profit & Loss — ${range} (${start.toISOString().slice(0, 10)} to ${new Date().toISOString().slice(0, 10)})`;
    titleCell.font = { bold: true, size: 14 };
    pnlSheet.addRow([]);

    pnlSheet.addRow(['Revenue']);
    pnlSheet.getCell(`A${pnlSheet.lastRow.number}`).font = { bold: true };

    for (const [account, amt] of Object.entries(revenueByAccount)) {
      pnlSheet.addRow([`  ${account}`, amt, totalRev > 0 ? (amt / totalRev * 100).toFixed(1) + '%' : '0%']);
    }
    pnlSheet.addRow(['Total Revenue', totalRev, '100%']);
    pnlSheet.getCell(`A${pnlSheet.lastRow.number}`).font = { bold: true };
    pnlSheet.getCell(`B${pnlSheet.lastRow.number}`).font = { bold: true };

    pnlSheet.addRow([]);
    pnlSheet.addRow(['Expenses']);
    pnlSheet.getCell(`A${pnlSheet.lastRow.number}`).font = { bold: true };

    for (const [account, amt] of Object.entries(expensesByAccount)) {
      pnlSheet.addRow([`  ${account}`, amt, totalRev > 0 ? (amt / totalRev * 100).toFixed(1) + '%' : '0%']);
    }
    pnlSheet.addRow(['Total Expenses', totalExp, totalRev > 0 ? (totalExp / totalRev * 100).toFixed(1) + '%' : '0%']);
    pnlSheet.getCell(`A${pnlSheet.lastRow.number}`).font = { bold: true };
    pnlSheet.getCell(`B${pnlSheet.lastRow.number}`).font = { bold: true };

    pnlSheet.addRow([]);
    pnlSheet.addRow(['Net Income', totalRev - totalExp, '']);
    pnlSheet.getCell(`A${pnlSheet.lastRow.number}`).font = { bold: true, color: { argb: 'FF0066FF' } };
    pnlSheet.getCell(`B${pnlSheet.lastRow.number}`).font = { bold: true, color: { argb: 'FF0066FF' } };

    // Format currency columns
    pnlSheet.eachRow((row: any, _rowNum: number) => {
      const cell = row.getCell('B');
      if (typeof cell.value === 'number') {
        cell.numFmt = '$#,##0.00';
      }
    });

    // ── Sheet 2: General Ledger ──
    const glSheet = wb.addWorksheet('General Ledger');
    glSheet.columns = [
      { header: 'Date', key: 'date', width: 14 },
      { header: 'Description', key: 'description', width: 45 },
      { header: 'Account', key: 'account', width: 30 },
      { header: 'Debit', key: 'debit', width: 16 },
      { header: 'Credit', key: 'credit', width: 16 },
      { header: 'Type', key: 'type', width: 12 },
    ];

    glSheet.getRow(1).font = { bold: true };

    // Build sorted entries
    const allEntries: any[] = [];
    for (const inv of invoices) {
      if (normalizeStatus(inv.status) !== 'PAID') continue;
      const paidAt = getDocumentPaidAt(inv);
      if (paidAt < start) continue;
      const isCredit = inv.content?.bookkeeping_only === true;
      let amt = toNumber(inv.amount);
      const curr = inv.currency || 'USD';
      if (curr !== 'USD' && amt > 0) {
        try { amt = await convertToUsd(amt, curr); } catch { /* leave as-is */ }
      }
      allEntries.push({
        date: paidAt.toISOString().slice(0, 10),
        description: inv.title || 'Invoice payment',
        account: isCredit ? 'Other Income' : 'Revenue',
        debit: 0, credit: amt,
        type: isCredit ? 'Credit' : 'Revenue',
      });
    }
    for (const exp of expenses) {
      allEntries.push({
        date: exp.date?.slice(0, 10) || exp.created_at?.slice(0, 10),
        description: exp.note || `${exp.category} expense`,
        account: mapCategoryToAccount(exp.category),
        debit: toNumber(exp.converted_amount_usd || exp.amount), credit: 0,
        type: 'Expense',
      });
    }

    allEntries.sort((a: any, b: any) => b.date.localeCompare(a.date));

    for (const entry of allEntries) {
      const row = glSheet.addRow([entry.date, entry.description, entry.account, entry.debit || '', entry.credit || '', entry.type]);
      const debitCell = row.getCell(4);
      const creditCell = row.getCell(5);
      if (typeof debitCell.value === 'number') debitCell.numFmt = '$#,##0.00';
      if (typeof creditCell.value === 'number') creditCell.numFmt = '$#,##0.00';
    }

    // ── Sheet 3: Expense Categories ──
    const catSheet = wb.addWorksheet('Expense Categories');
    catSheet.columns = [
      { header: 'Category', key: 'category', width: 25 },
      { header: 'Total', key: 'total', width: 16 },
      { header: 'Percentage', key: 'pct', width: 14 },
    ];
    catSheet.getRow(1).font = { bold: true };

    // Group expenses by category
    const catTotals: Record<string, number> = {};
    for (const exp of expenses) {
      const cat = exp.category || 'other';
      catTotals[cat] = (catTotals[cat] || 0) + toNumber(exp.converted_amount_usd || exp.amount);
    }
    const catTotalSum = Object.values(catTotals).reduce((s, v) => s + v, 0);
    for (const [cat, amt] of Object.entries(catTotals).sort(([, a], [, b]) => b - a)) {
      const row = catSheet.addRow([cat, amt, catTotalSum > 0 ? (amt / catTotalSum * 100).toFixed(1) + '%' : '0%']);
      if (typeof row.getCell(2).value === 'number') row.getCell(2).numFmt = '$#,##0.00';
    }

    // Write response
    const buffer = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="hedwig-pnl-${range}-${new Date().toISOString().slice(0, 10)}.xlsx"`);
    res.send(Buffer.from(buffer));
  } catch (error) {
    logger.error('Failed to export ledger', { error: error instanceof Error ? error.message : 'Unknown' });
    next(error);
  }
});

// POST /api/revenue/ledger/export-to-sheets?range=30d
router.post('/ledger/export-to-sheets', authenticate, async (req: Request, res: Response, next) => {
  try {
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) { res.status(404).json({ success: false, error: { message: 'User not found' } }); return; }
    if (!await guardOwnerOrAdmin(req, res, user.id)) return;

    if (!isComposioConfigured()) {
      res.status(400).json({ success: false, error: { message: 'Composio integration is not configured' } });
      return;
    }

    const effectiveWsId = getEffectiveWorkspaceId(req, user.id);
    const rangeRaw = String(req.query.range || '30d').toLowerCase();
    const requestedRange: RangeKey = ['7d', '30d', '90d', '1y', 'ytd'].includes(rangeRaw) ? (rangeRaw as RangeKey) : '30d';
    const { range } = await resolveRangeForUser(user, requestedRange);
    const start = getRangeStart(range);
    const startIso = start.toISOString();

    // Check if Google Sheets is connected
    const { data: connRow } = await supabase
      .from('composio_connections')
      .select('*')
      .eq('user_id', user.id)
      .eq('provider', 'google_sheets')
      .maybeSingle();

    if (!connRow || connRow.status !== 'active') {
      // Not connected — return the OAuth URL
      const redirectUri = `${req.protocol}://${req.get('host')}/api/revenue/ledger/export-to-sheets/callback`;
      const { redirectUrl } = await initiateConnection({ userId: user.id, provider: 'google_sheets', redirectUri });
      res.json({ success: true, data: { needsConnection: true, redirectUrl } });
      return;
    }

    // Connected — fetch data and export
    const [invoices, expenses] = await Promise.all([
      fetchPaged<any>('sheets_export_invoices', (from, to) =>
        supabase.from('documents').select('id,type,status,amount,currency,title,created_at,updated_at,content,client_id')
          .eq('user_id', user.id).eq('workspace_id', effectiveWsId)
          .in('type', ['INVOICE', 'PAYMENT_LINK'])
          .or(`created_at.gte.${startIso},updated_at.gte.${startIso}`)
          .order('updated_at', { ascending: false }).range(from, to)
      ),
      fetchPaged<any>('sheets_export_expenses', (from, to) =>
        supabase.from('expenses').select('id,amount,currency,converted_amount_usd,category,note,date,client_id,created_at')
          .eq('user_id', user.id).gte('date', startIso)
          .order('date', { ascending: false }).range(from, to)
      ).catch(() => [] as any[]),
    ]);

    // Build rows same as XLSX export
    const rows: string[][] = [];
    rows.push(['Hedwig P&L Export', `Range: ${range}`, `Generated: ${new Date().toISOString().slice(0, 10)}`]);
    rows.push([]);
    rows.push(['Account', 'Amount', '% of Revenue']);

    let totalRev = 0;
    let totalExp = 0;

    const revenueByAccount: Record<string, number> = {};
    for (const inv of invoices) {
      if (normalizeStatus(inv.status) !== 'PAID') continue;
      const isCredit = inv.content?.bookkeeping_only === true;
      const account = isCredit ? 'Other Income' : 'Revenue';
      let amt = toNumber(inv.amount);
      const curr = inv.currency || 'USD';
      if (curr !== 'USD' && amt > 0) {
        try { amt = await convertToUsd(amt, curr); } catch {}
      }
      revenueByAccount[account] = (revenueByAccount[account] || 0) + amt;
      totalRev += amt;
    }

    const expensesByAccount: Record<string, number> = {};
    for (const exp of expenses) {
      const account = mapCategoryToAccount(exp.category);
      const amt = toNumber(exp.converted_amount_usd || exp.amount);
      expensesByAccount[account] = (expensesByAccount[account] || 0) + amt;
      totalExp += amt;
    }

    rows.push(['Revenue']);
    for (const [account, amt] of Object.entries(revenueByAccount)) {
      rows.push([`  ${account}`, String(amt.toFixed(2)), totalRev > 0 ? (amt / totalRev * 100).toFixed(1) + '%' : '0%']);
    }
    rows.push(['Total Revenue', totalRev.toFixed(2), '100%']);
    rows.push([]);
    rows.push(['Expenses']);
    for (const [account, amt] of Object.entries(expensesByAccount)) {
      rows.push([`  ${account}`, String(amt.toFixed(2)), totalRev > 0 ? (amt / totalRev * 100).toFixed(1) + '%' : '0%']);
    }
    rows.push(['Total Expenses', totalExp.toFixed(2), totalRev > 0 ? (totalExp / totalRev * 100).toFixed(1) + '%' : '0%']);
    rows.push([]);
    rows.push(['Net Income', (totalRev - totalExp).toFixed(2), '']);
    rows.push([]);
    rows.push([]);

    // General Ledger
    rows.push(['Date', 'Description', 'Account', 'Debit', 'Credit', 'Type']);
    const allEntries: any[] = [];
    for (const inv of invoices) {
      if (normalizeStatus(inv.status) !== 'PAID') continue;
      const paidAt = getDocumentPaidAt(inv);
      if (paidAt < start) continue;
      const isCredit = inv.content?.bookkeeping_only === true;
      let amt = toNumber(inv.amount);
      const curr = inv.currency || 'USD';
      if (curr !== 'USD' && amt > 0) {
        try { amt = await convertToUsd(amt, curr); } catch {}
      }
      allEntries.push({
        date: paidAt.toISOString().slice(0, 10),
        description: inv.title || 'Invoice payment',
        account: isCredit ? 'Other Income' : 'Revenue',
        debit: '', credit: amt.toFixed(2),
        type: isCredit ? 'Credit' : 'Revenue',
      });
    }
    for (const exp of expenses) {
      allEntries.push({
        date: exp.date?.slice(0, 10) || exp.created_at?.slice(0, 10),
        description: exp.note || `${exp.category} expense`,
        account: mapCategoryToAccount(exp.category),
        debit: toNumber(exp.converted_amount_usd || exp.amount).toFixed(2), credit: '',
        type: 'Expense',
      });
    }
    allEntries.sort((a: any, b: any) => b.date.localeCompare(a.date));
    for (const entry of allEntries) {
      rows.push([entry.date, entry.description, entry.account, entry.debit, entry.credit, entry.type]);
    }

    // Create spreadsheet via Composio
    const sdk = new (require('@composio/core').Composio)({ apiKey: process.env.COMPOSIO_API_KEY });
    const composioUserId = `hedwig_${user.id}`;

    const title = `Hedwig P&L — ${range} (${start.toISOString().slice(0, 10)} to ${new Date().toISOString().slice(0, 10)})`;
    const createResult: any = await sdk.tools.execute('googlesheets', 'googlesheets_create_spreadsheet', {
      entityId: composioUserId,
      connectedAccountId: connRow.composio_connected_account_id!,
      input: { title },
    });

    const spreadsheetId = createResult?.data?.spreadsheetId || createResult?.spreadsheetId || createResult?.id;
    if (!spreadsheetId) {
      throw new Error('Failed to create spreadsheet: no spreadsheet ID returned');
    }

    // Write data to the sheet
    await sdk.tools.execute('googlesheets', 'googlesheets_batch_update', {
      entityId: composioUserId,
      connectedAccountId: connRow.composio_connected_account_id!,
      input: {
        spreadsheetId,
        requests: [{
          updateCells: {
            range: { sheetId: 0, startRowIndex: 0, endRowIndex: rows.length, startColumnIndex: 0, endColumnIndex: 6 },
            rows: rows.map((row) => ({ values: row.map((cell) => ({ userEnteredValue: { stringValue: cell } })) })),
            fields: 'userEnteredValue',
          },
        }],
      },
    });

    // Update last_synced_at
    await supabase.from('composio_connections').update({ last_synced_at: new Date().toISOString() }).eq('id', connRow.id);

    res.json({ success: true, data: { spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}` } });
  } catch (error) {
    logger.error('Failed to export to Google Sheets', { error: error instanceof Error ? error.message : 'Unknown' });
    next(error);
  }
});

// GET /api/revenue/ledger/narrative?range=30d
router.get('/ledger/narrative', authenticate, async (req: Request, res: Response, next) => {
  try {
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) { res.status(404).json({ success: false, error: { message: 'User not found' } }); return; }
    if (!await guardOwnerOrAdmin(req, res, user.id)) return;

    const effectiveWsId = getEffectiveWorkspaceId(req, user.id);
    const rangeRaw = String(req.query.range || '30d').toLowerCase();
    const requestedRange: RangeKey = ['7d', '30d', '90d', '1y', 'ytd'].includes(rangeRaw) ? (rangeRaw as RangeKey) : '30d';
    const { range } = await resolveRangeForUser(user, requestedRange);
    const start = getRangeStart(range);
    const startIso = start.toISOString();

    const [narrativeInvoices, narrativeExpenses] = await Promise.all([
      fetchPaged<any>('narrative_invoices', (from, to) =>
        supabase.from('documents').select('id,type,status,amount,currency,title,created_at,content')
          .eq('user_id', user.id).eq('workspace_id', effectiveWsId)
          .in('type', ['INVOICE', 'PAYMENT_LINK'])
          .eq('status', 'PAID').gte('updated_at', startIso)
          .order('updated_at', { ascending: false }).range(from, to)
      ),
      fetchPaged<any>('narrative_expenses', (from, to) =>
        supabase.from('expenses').select('amount,currency,converted_amount_usd,category,date,note')
          .eq('user_id', user.id).gte('date', startIso)
          .order('date', { ascending: false }).range(from, to)
      ).catch(() => [] as any[]),
    ]);

    const totalRevenue = (
      await Promise.all(narrativeInvoices.map(async (d: any) => {
        const amt = toNumber(d.amount);
        const curr = d.currency || 'USD';
        if (curr !== 'USD' && amt > 0) {
          try { return await convertToUsd(amt, curr); }
          catch { return amt; }
        }
        return amt;
      }))
    ).reduce((s: number, v: number) => s + v, 0);
    const totalExpenses = narrativeExpenses.reduce((s: number, e: any) => s + toNumber(e.converted_amount_usd), 0);
    const netIncome = totalRevenue - totalExpenses;

    const topCategories: Record<string, number> = {};
    for (const exp of narrativeExpenses) {
      const cat = exp.category || 'other';
      topCategories[cat] = (topCategories[cat] || 0) + toNumber(exp.converted_amount_usd);
    }
    const topCatEntries = Object.entries(topCategories).sort(([, a], [, b]) => b - a).slice(0, 3);
    const topCatStr = topCatEntries.length > 0
      ? `Top expense categories: ${topCatEntries.map(([c, a]) => `${c} ($${a.toFixed(2)})`).join(', ')}.`
      : '';

    const prompt = `You are Hedwig, a financial assistant. Write a concise 2-3 sentence narrative summary of this business's financial performance for the last ${range}.

Data:
- Total Revenue: $${totalRevenue.toFixed(2)}
- Total Expenses: $${totalExpenses.toFixed(2)}
- Net Income: $${netIncome.toFixed(2)}
- ${narrativeExpenses.length} expenses recorded
- ${narrativeInvoices.length} paid invoices
${topCatStr}

Write in second person ("you"), be encouraging and specific. Focus on the key numbers and trends.`;

    const apiKey = process.env.AI_GATEWAY_API_KEY;
    if (!apiKey) {
      // No AI configured — return a basic summary
      res.json({
        success: true,
        data: {
          narrative: `In the last ${range}, your business earned $${totalRevenue.toFixed(2)} in revenue and spent $${totalExpenses.toFixed(2)} on expenses, resulting in a net income of $${netIncome.toFixed(2)}. ${topCatStr}`,
          summary: { totalRevenue, totalExpenses, netIncome, revenueCount: narrativeInvoices.length, expenseCount: narrativeExpenses.length },
        },
      });
      return;
    }

    let narrative = '';
    try {
      narrative = (await llmService.generateText(prompt, {
        maxOutputTokens: 500,
        temperature: 0.3,
      })).trim();
    } catch {
      narrative = `In the last ${range}, your business earned $${totalRevenue.toFixed(2)} in revenue and spent $${totalExpenses.toFixed(2)} on expenses, resulting in a net income of $${netIncome.toFixed(2)}.`;
    }

    res.json({
      success: true,
      data: {
        narrative,
        summary: {
          totalRevenue: Number(totalRevenue.toFixed(2)),
          totalExpenses: Number(totalExpenses.toFixed(2)),
          netIncome: Number(netIncome.toFixed(2)),
          revenueCount: narrativeInvoices.length,
          expenseCount: narrativeExpenses.length,
        },
      },
    });
  } catch (error) {
    logger.error('Failed to generate narrative', { error: error instanceof Error ? error.message : 'Unknown' });
    next(error);
  }
});

// ── Receipt Forwarding (Resend inbound webhook) ──────────────────────────────

// POST /api/revenue/receipt-forwarding/resend-webhook
// Called by Resend when emails are forwarded to the user's inbound address.
// Resend sends: { email: { from, subject, text, html, attachments: [{ filename, content, content_type }] } }
router.post('/receipt-forwarding/resend-webhook', async (req: Request, res: Response, _next) => {
  try {
    const { email } = req.body;

    if (!email || !email.from) {
      res.status(400).json({ success: false, error: { message: 'Invalid Resend webhook payload' } });
      return;
    }

    // Find the user by their receipt forwarding email alias
    const recipientEmail = String(email.to || '').toLowerCase().trim();
    const fromEmail = String(email.from || '').toLowerCase().trim();
    const subject = String(email.subject || '').trim();
    const textBody = String(email.text || email.html || '').trim();

    logger.info('Receipt forwarding webhook received', { from: fromEmail, subject, recipient: recipientEmail });

    // Extract the user ID from the recipient email (e.g., abc123@receipts.hedwig.app)
    const userPrefix = recipientEmail.split('@')[0];
    if (!userPrefix || userPrefix.length < 4) {
      logger.warn('Could not extract user from recipient email', { recipient: recipientEmail });
      res.json({ success: true }); // ack to prevent resend
      return;
    }

    // Look up user by matching the webhook secret/prefix
    const { data: users, error: userErr } = await supabase
      .from('users')
      .select('id')
      .ilike('id', `${userPrefix}%`)
      .limit(1);

    if (userErr || !users || users.length === 0) {
      logger.warn('No user found for receipt forwarding', { userPrefix });
      res.json({ success: true });
      return;
    }

    const userId = users[0].id;

    // Check if there are attachments
    const attachments = Array.isArray(email.attachments) ? email.attachments : [];

    if (attachments.length === 0) {
      // No attachments — try to use the email body text as a manual expense description
      if (textBody) {
        const { error: insErr } = await supabase
          .from('expenses')
          .insert({
            user_id: userId,
            amount: 0, // amount unknown from text alone
            currency: 'USD',
            converted_amount_usd: 0,
            category: 'other',
            note: `[Email receipt] ${subject} — ${textBody.slice(0, 200)}`,
            source_type: 'email_import',
            date: new Date().toISOString(),
          });

        if (insErr) {
          logger.error('Failed to create email-only expense', { error: insErr });
        } else {
          logger.info('Created email-only expense from forwarded receipt', { userId });
        }
      }

      res.json({ success: true });
      return;
    }

    // Process attachments through AI ingestion
    const apiKey = process.env.AI_GATEWAY_API_KEY;
    const createdExpenses: string[] = [];

    for (const attachment of attachments) {
      const filename = attachment.filename || 'receipt';
      const contentB64 = attachment.content || '';
      const contentType = attachment.content_type || 'application/octet-stream';

      if (!contentB64) continue;

      // Skip non-image/non-PDF attachments
      const supportedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'application/pdf'];
      const normalizedType = supportedTypes.includes(contentType)
        ? contentType
        : filename.endsWith('.pdf') ? 'application/pdf'
        : filename.endsWith('.png') ? 'image/png'
        : filename.endsWith('.jpg') || filename.endsWith('.jpeg') ? 'image/jpeg'
        : null;

      if (!normalizedType) {
        logger.info('Skipping unsupported attachment type', { filename, contentType });
        continue;
      }

      // Only process with AI if key is available
      if (!apiKey) {
        // Create a basic expense from the attachment
        const { error: insErr } = await supabase
          .from('expenses')
          .insert({
            user_id: userId,
            amount: 0,
            currency: 'USD',
            converted_amount_usd: 0,
            category: 'other',
            note: `[Receipt] ${subject || filename}`,
            source_type: 'email_import',
            date: new Date().toISOString(),
          });

        if (!insErr) {
          createdExpenses.push(filename);
          logger.info('Created basic expense from forwarded receipt (no AI)', { userId, filename });
        }
        continue;
      }

      // Analyze with AI
      try {
        const prompt = `You are Hedwig, a receipt processing assistant. Extract the following fields from this receipt image.
Return ONLY valid JSON with no markdown fences, no commentary.

Schema:
{
  "amount": number or null,
  "currency": "3-letter ISO code or null",
  "date": "YYYY-MM-DD or null",
  "merchant": "Merchant name or null",
  "category": "software" | "contractors" | "marketing" | "travel" | "meals" | "office" | "operations" | "taxes" | "subscriptions" | "other"
}`;

        const aiResult = (await llmService.generateText(prompt, {
          maxOutputTokens: 500,
          temperature: 0.1,
          files: [{ mimeType: normalizedType, data: contentB64 }],
        })).trim();

        const jsonMatch = aiResult.match(/\{[\s\S]*\}/);
        let parsed: Record<string, unknown> = {};
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        }

        const amount = typeof parsed.amount === 'number' && parsed.amount > 0 ? parsed.amount : 0;
        const currency = String(parsed.currency || 'USD').toUpperCase();
        const category = ['software', 'contractors', 'marketing', 'travel', 'meals', 'office', 'operations', 'taxes', 'subscriptions'].includes(String(parsed.category)) ? String(parsed.category) : 'other';
        const merchant = parsed.merchant ? String(parsed.merchant) : subject;

        let convertedAmountUsd: number;
        if (currency === 'USD') {
          convertedAmountUsd = amount;
        } else {
          try {
            convertedAmountUsd = await convertToUsd(amount, currency);
          } catch {
            convertedAmountUsd = amount;
          }
        }

        const { error: insErr } = await supabase
          .from('expenses')
          .insert({
            user_id: userId,
            amount,
            currency,
            converted_amount_usd: convertedAmountUsd,
            category,
            note: `[Forwarded receipt] ${merchant}${subject !== merchant ? ` — ${subject}` : ''} (via email)`,
            source_type: 'email_import',
            date: parsed.date ? String(parsed.date).slice(0, 10) : new Date().toISOString(),
          });

        if (!insErr) {
          createdExpenses.push(filename);
          logger.info('Created AI-processed expense from forwarded receipt', { userId, filename, amount, category });
        }
      } catch (aiErr) {
        logger.warn('AI processing failed for forwarded receipt attachment', { filename, error: aiErr instanceof Error ? aiErr.message : 'Unknown' });
      }
    }

    logger.info('Receipt forwarding processed', { userId, attachmentsCount: attachments.length, createdCount: createdExpenses.length });

    res.json({ success: true, data: { processedCount: createdExpenses.length } });
  } catch (error) {
    logger.error('Receipt forwarding webhook failed', { error: error instanceof Error ? error.message : 'Unknown' });
    // Always ack to prevent Resend from retrying endlessly
    res.json({ success: true });
  }
});

router.post('/statement-imports/backfill-banks', authenticate, async (req: Request, res: Response, next) => {
  try {
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) { res.status(404).json({ success: false, error: { message: 'User not found' } }); return; }
    if (!await guardOwnerOrAdmin(req, res, user.id)) return;

    const effectiveWsId = getEffectiveWorkspaceId(req, user.id);

    const { data: stmts, error: fetchErr } = await supabase
      .from('statement_imports')
      .select('id, original_filename')
      .is('bank_name', null)
      .eq('workspace_id', effectiveWsId);

    if (fetchErr) {
      res.status(500).json({ success: false, error: { message: 'Failed to fetch statements' } });
      return;
    }

    if (!stmts || stmts.length === 0) {
      res.json({ success: true, data: { updated: 0 } });
      return;
    }

    let updated = 0;
    for (const stmt of stmts) {
      // Try to detect bank from filename
      let bankName = detectBankName(stmt.original_filename || '');
      if (!bankName) {
        // Fallback: read a few transaction descriptions
        const { data: txns } = await supabase
          .from('imported_transactions')
          .select('description, original_description')
          .eq('statement_id', stmt.id)
          .limit(5);

        if (txns && txns.length > 0) {
          const text = txns.map((t: any) => `${t.description || ''} ${t.original_description || ''}`).join(' ');
          bankName = detectBankName(text);
        }
      }

      if (bankName) {
        await supabase
          .from('statement_imports')
          .update({ bank_name: bankName, updated_at: new Date().toISOString() })
          .eq('id', stmt.id);

        // Also update individual transactions
        await supabase
          .from('imported_transactions')
          .update({ bank_name: bankName, updated_at: new Date().toISOString() })
          .eq('statement_id', stmt.id);

        updated++;
      }
    }

    res.json({ success: true, data: { updated } });
  } catch (error) {
    logger.error('Backfill banks failed', { error: error instanceof Error ? error.message : 'Unknown' });
    next(error);
  }
});

router.post('/import-statement/bulk-confirm', authenticate, async (req: Request, res: Response, next) => {
  try {
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) { res.status(404).json({ success: false, error: { message: 'User not found' } }); return; }
    if (!await guardOwnerOrAdmin(req, res, user.id)) return;

    const effectiveWsId = getEffectiveWorkspaceId(req, user.id);

    // Fetch all pending imported transactions for this workspace
    const { data: pendingTxns, error: fetchErr } = await supabase
      .from('imported_transactions')
      .select('*')
      .eq('workspace_id', effectiveWsId)
      .eq('status', 'pending')
      .order('transaction_date', { ascending: false });

    if (fetchErr) {
      res.status(500).json({ success: false, error: { message: 'Failed to fetch pending transactions' } });
      return;
    }

    if (!pendingTxns || pendingTxns.length === 0) {
      res.json({ success: true, data: { confirmedCount: 0, skippedCount: 0 } });
      return;
    }

    const byStatement = new Map<string, any[]>();
    for (const txn of pendingTxns) {
      const sid = txn.statement_id;
      if (!byStatement.has(sid)) byStatement.set(sid, []);
      byStatement.get(sid)!.push(txn);
    }

    let totalConfirmed = 0;
    let totalSkipped = 0;

    for (const [statementId, txns] of byStatement) {
      let confirmed = 0;
      let skipped = 0;

      for (const txn of txns) {
        // Mark as expensed
        const { error: markErr } = await supabase
          .from('imported_transactions')
          .update({ status: 'expensed', updated_at: new Date().toISOString() })
          .eq('id', txn.id);

        if (markErr) {
          logger.error('Bulk confirm: failed to mark transaction', { error: markErr, txnId: txn.id });
          continue;
        }

        if (txn.type === 'debit') {
          // Create expense
          const curr = txn.currency || 'USD';
          const convertedAmountUsd = txn.converted_amount_usd ?? (curr !== 'USD'
            ? await convertToUsd(txn.amount, curr).catch(() => txn.amount)
            : txn.amount);

          const { error: insErr } = await supabase.from('expenses').insert({
            user_id: user.id,
            workspace_id: effectiveWsId,
            amount: txn.amount,
            currency: curr,
            converted_amount_usd: convertedAmountUsd,
            category: txn.category || 'other',
            note: txn.description || '',
            source_type: 'transaction_import',
            date: txn.transaction_date || new Date().toISOString(),
            client_id: txn.matched_client_id || null,
            project_id: txn.matched_project_id || null,
          });

          if (!insErr) confirmed++;
          else logger.error('Bulk confirm: failed to create expense', { error: insErr, txnId: txn.id });
        } else {
          // Credit — create bookkeeping revenue document
          const description = txn.description || 'Statement credit';
          const { error: creditErr } = await supabase.from('documents').insert({
            user_id: user.id,
            workspace_id: effectiveWsId,
            client_id: txn.matched_client_id || null,
            type: 'INVOICE',
            title: `${description} [Credit]`,
            amount: txn.amount,
            currency: txn.currency || 'USD',
            status: 'PAID',
            chain: 'BASE',
            content: {
              bookkeeping_only: true,
              created_from: 'statement_import',
              original_amount: txn.amount,
              original_currency: txn.currency || 'USD',
            },
          });

          if (!creditErr) confirmed++;
          else logger.error('Bulk confirm: failed to create credit', { error: creditErr, txnId: txn.id });
        }
      }

      // Update statement status
      const finalStatus = confirmed > 0 && skipped === 0 ? 'confirmed'
        : confirmed > 0 ? 'partially_confirmed'
        : 'confirmed';

      await supabase.from('statement_imports').update({
        status: finalStatus,
        updated_at: new Date().toISOString(),
      }).eq('id', statementId);

      totalConfirmed += confirmed;
      totalSkipped += skipped;
    }

    res.json({ success: true, data: { confirmedCount: totalConfirmed, skippedCount: totalSkipped } });
  } catch (error) {
    logger.error('Bulk confirm failed', { error: error instanceof Error ? error.message : 'Unknown' });
    next(error);
  }
});

export default router;
