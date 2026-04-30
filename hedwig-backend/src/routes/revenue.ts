import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import { getOrCreateUser } from '../utils/userHelper';
import { convertToUsd } from '../services/currency';
import { createLogger } from '../utils/logger';

const logger = createLogger('Revenue');
const router = Router();

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
        const range: RangeKey = ['7d', '30d', '90d', '1y', 'ytd'].includes(rangeRaw) ? (rangeRaw as RangeKey) : '30d';
        const start = getRangeStart(range);
        const now = new Date();
        const nowIso = now.toISOString();
        const rangeMs = now.getTime() - start.getTime();
        const prevStart = new Date(start.getTime() - rangeMs);

        const privyId = req.user!.id;
        const user = await getOrCreateUser(privyId);
        if (!user) {
            res.status(404).json({ success: false, error: { message: 'User not found' } });
            return;
        }

        const [invoices, expenses] = await Promise.all([
            fetchPaged<any>('invoices_summary', (from, to) =>
                supabase
                    .from('documents')
                    .select('id,status,amount,created_at,content')
                    .eq('user_id', user.id)
                    .eq('type', 'INVOICE')
                    .gte('created_at', prevStart.toISOString())
                    .order('created_at', { ascending: false })
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
        ]);

        const inRange = invoices.filter((d: any) => new Date(d.created_at) >= start);
        const inPrevRange = invoices.filter((d: any) => {
            const c = new Date(d.created_at);
            return c >= prevStart && c < start;
        });

        const isPaid = (d: any) => normalizeStatus(d.status) === 'PAID';
        const isOverdue = (d: any) => {
            const s = normalizeStatus(d.status);
            if (!['SENT', 'VIEWED'].includes(s)) return false;
            const dueDate = d.content?.due_date;
            return dueDate ? dueDate < nowIso : false;
        };

        const paidRevenue = inRange.filter(isPaid).reduce((s: number, d: any) => s + toNumber(d.amount), 0);
        const prevRevenue = inPrevRange.filter(isPaid).reduce((s: number, d: any) => s + toNumber(d.amount), 0);
        const pendingRevenue = inRange
            .filter((d: any) => ['SENT', 'VIEWED', 'DRAFT'].includes(normalizeStatus(d.status)) && !isOverdue(d))
            .reduce((s: number, d: any) => s + toNumber(d.amount), 0);
        const overdueRevenue = inRange.filter(isOverdue).reduce((s: number, d: any) => s + toNumber(d.amount), 0);
        const totalRevenue = paidRevenue + pendingRevenue + overdueRevenue;
        const totalExpenses = expenses.reduce((s: number, e: any) => s + toNumber(e.converted_amount_usd), 0);
        const netRevenue = paidRevenue - totalExpenses;
        const revenueDeltaPct = prevRevenue > 0
            ? ((paidRevenue - prevRevenue) / prevRevenue) * 100
            : paidRevenue > 0 ? 100 : 0;

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
                previousPeriodRevenue: Number(prevRevenue.toFixed(2)),
                revenueDeltaPct: Number(revenueDeltaPct.toFixed(1)),
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

        const now = new Date();
        const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

        const [invoices, expenses] = await Promise.all([
            fetchPaged<any>('trend_invoices', (from, to) =>
                supabase
                    .from('documents')
                    .select('status,amount,created_at')
                    .eq('user_id', user.id)
                    .eq('type', 'INVOICE')
                    .eq('status', 'PAID')
                    .gte('created_at', sixMonthsAgo.toISOString())
                    .order('created_at', { ascending: false })
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
            const k = monthKey(new Date(doc.created_at));
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

        res.json({ success: true, data: trend });
    } catch (error) {
        logger.error('Failed to build revenue trend', { error: error instanceof Error ? error.message : 'Unknown' });
        next(error);
    }
});

// GET /api/revenue/breakdown?range=30d
router.get('/breakdown', authenticate, async (req: Request, res: Response, next) => {
    try {
        const rangeRaw = String(req.query.range || '30d').toLowerCase();
        const range: RangeKey = ['7d', '30d', '90d', '1y', 'ytd'].includes(rangeRaw) ? (rangeRaw as RangeKey) : '30d';
        const start = getRangeStart(range);

        const privyId = req.user!.id;
        const user = await getOrCreateUser(privyId);
        if (!user) {
            res.status(404).json({ success: false, error: { message: 'User not found' } });
            return;
        }

        const invoices = await fetchPaged<any>('breakdown_invoices', (from, to) =>
            supabase
                .from('documents')
                .select('status,amount,client_id,project_id')
                .eq('user_id', user.id)
                .eq('type', 'INVOICE')
                .eq('status', 'PAID')
                .gte('created_at', start.toISOString())
                .order('created_at', { ascending: false })
                .range(from, to)
        );

        const clientIds = Array.from(
            new Set(invoices.map((d: any) => d.client_id).filter((id: any): id is string => typeof id === 'string' && id.length > 0))
        );
        const projectIds = Array.from(
            new Set(invoices.map((d: any) => d.project_id).filter((id: any): id is string => typeof id === 'string' && id.length > 0))
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
        for (const doc of invoices) {
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
        for (const doc of invoices) {
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
        const range: RangeKey = ['7d', '30d', '90d', '1y', 'ytd'].includes(rangeRaw) ? (rangeRaw as RangeKey) : '30d';
        const start = getRangeStart(range);

        const privyId = req.user!.id;
        const user = await getOrCreateUser(privyId);
        if (!user) {
            res.status(404).json({ success: false, error: { message: 'User not found' } });
            return;
        }

        const [documents, transactions] = await Promise.all([
            fetchPaged<any>('payment_sources_documents', (from, to) =>
                supabase
                    .from('documents')
                    .select('id,type,status,amount,created_at')
                    .eq('user_id', user.id)
                    .in('type', ['INVOICE', 'PAYMENT_LINK'])
                    .eq('status', 'PAID')
                    .gte('created_at', start.toISOString())
                    .order('created_at', { ascending: false })
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

        const invoiceDocs = documents.filter((doc: any) => normalizeStatus(doc.type) === 'INVOICE');
        const paymentLinkDocs = documents.filter((doc: any) => normalizeStatus(doc.type) === 'PAYMENT_LINK');
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

        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const nowIso = new Date().toISOString();

        const [invoices, expensesRes] = await Promise.all([
            supabase
                .from('documents')
                .select('id,status,amount,title,created_at,content')
                .eq('user_id', user.id)
                .eq('type', 'INVOICE')
                .gte('created_at', thirtyDaysAgo)
                .order('created_at', { ascending: false })
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
            const amount = toNumber(doc.amount);
            const title = doc.title || 'Invoice';

            if (s === 'PAID') {
                events.push({
                    id: `inv_paid_${doc.id}`,
                    type: 'invoice_paid',
                    title: `${title} paid`,
                    description: `Payment received for ${title}`,
                    amount,
                    createdAt: doc.created_at,
                });
            } else if (['SENT', 'VIEWED'].includes(s) && doc.content?.due_date && doc.content.due_date < nowIso) {
                events.push({
                    id: `inv_overdue_${doc.id}`,
                    type: 'invoice_overdue',
                    title: `${title} overdue`,
                    description: `${title} is past due`,
                    amount,
                    createdAt: doc.created_at,
                });
            } else if (s === 'SENT') {
                events.push({
                    id: `inv_sent_${doc.id}`,
                    type: 'invoice_sent',
                    title: `${title} sent`,
                    description: `${title} was sent to client`,
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

export default router;
