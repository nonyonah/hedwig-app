import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import { llmService } from '../services/llm';
import { getOrCreateUser } from '../utils/userHelper';
import { createLogger } from '../utils/logger';

const logger = createLogger('Assistant');
const router = Router();

const toNum = (v: unknown) => Number(v) || 0;

const safeJson = (text: string): Record<string, unknown> | null => {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try { return JSON.parse(match[0]); } catch { return null; }
};

const formatUsd = (n: number) =>
    n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(2)}`;

// GET /api/assistant/brief
router.get('/brief', authenticate, async (req: Request, res: Response) => {
    try {
        const user = await getOrCreateUser(req.user!.id);
        if (!user) { res.status(404).json({ success: false, error: 'User not found' }); return; }

        const now = new Date();
        const in14Days = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
        const nowIso = now.toISOString();

        const [unpaidRes, overdueRes, paymentLinksRes, deadlinesRes, reviewRes] = await Promise.all([
            // Unpaid invoices (sent/viewed, not yet overdue)
            supabase
                .from('documents')
                .select('id, amount, content')
                .eq('user_id', user.id)
                .eq('type', 'INVOICE')
                .in('status', ['SENT', 'VIEWED']),
            // Overdue invoices
            supabase
                .from('documents')
                .select('id, amount, content')
                .eq('user_id', user.id)
                .eq('type', 'INVOICE')
                .eq('status', 'OVERDUE'),
            // Active payment links
            supabase
                .from('documents')
                .select('id, amount, content')
                .eq('user_id', user.id)
                .eq('type', 'PAYMENT_LINK')
                .in('status', ['SENT', 'VIEWED', 'DRAFT']),
            // Project deadlines in next 14 days
            supabase
                .from('projects')
                .select('id, title, next_deadline_at, status')
                .eq('user_id', user.id)
                .in('status', ['ACTIVE', 'ONGOING', 'IN_PROGRESS'])
                .lte('next_deadline_at', in14Days)
                .gte('next_deadline_at', nowIso),
            // Contracts needing review
            supabase
                .from('documents')
                .select('id, content')
                .eq('user_id', user.id)
                .eq('type', 'CONTRACT')
                .in('status', ['DRAFT', 'REVIEW']),
        ]);

        const unpaidDocs = unpaidRes.data ?? [];
        const overdueDocs = overdueRes.data ?? [];
        const paymentLinks = paymentLinksRes.data ?? [];
        const deadlines = deadlinesRes.data ?? [];
        const reviewDocs = reviewRes.data ?? [];

        const unpaidAmountUsd = unpaidDocs.reduce((s, d) => s + toNum(d.amount), 0);
        const overdueAmountUsd = overdueDocs.reduce((s, d) => s + toNum(d.amount), 0);

        // Build events
        type EventInput = {
            id: string; type: string; severity: string; title: string; body?: string;
            entityId?: string; href?: string;
        };
        const events: EventInput[] = [];

        if (overdueDocs.length > 0) {
            events.push({
                id: 'overdue-invoices',
                type: 'overdue_invoice',
                severity: 'urgent',
                title: `${overdueDocs.length} overdue invoice${overdueDocs.length > 1 ? 's' : ''}`,
                body: `${formatUsd(overdueAmountUsd)} past due — follow up with clients`,
                href: '/payments',
            });
        }

        if (unpaidDocs.length > 0) {
            events.push({
                id: 'unpaid-invoices',
                type: 'unpaid_invoice',
                severity: 'warning',
                title: `${unpaidDocs.length} unpaid invoice${unpaidDocs.length > 1 ? 's' : ''}`,
                body: `${formatUsd(unpaidAmountUsd)} outstanding`,
                href: '/payments',
            });
        }

        for (const p of deadlines) {
            const daysLeft = Math.ceil(
                (new Date(p.next_deadline_at).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
            );
            events.push({
                id: `deadline-${p.id}`,
                type: 'project_deadline',
                severity: daysLeft <= 3 ? 'urgent' : 'warning',
                title: `${p.title || 'Project'} deadline`,
                body: daysLeft === 0 ? 'Due today' : daysLeft === 1 ? 'Due tomorrow' : `Due in ${daysLeft} days`,
                entityId: p.id,
                href: `/projects/${p.id}`,
            });
        }

        if (paymentLinks.length > 0) {
            events.push({
                id: 'payment-links',
                type: 'pending_payment_link',
                severity: 'info',
                title: `${paymentLinks.length} active payment link${paymentLinks.length > 1 ? 's' : ''}`,
                body: 'Awaiting client payment',
                href: '/payments',
            });
        }

        if (reviewDocs.length > 0) {
            events.push({
                id: 'review-docs',
                type: 'document_review',
                severity: 'info',
                title: `${reviewDocs.length} contract${reviewDocs.length > 1 ? 's' : ''} need${reviewDocs.length === 1 ? 's' : ''} review`,
                href: '/contracts',
            });
        }

        // Generate Gemini summary
        const dataContext = [
            unpaidDocs.length > 0 ? `${unpaidDocs.length} unpaid invoices (${formatUsd(unpaidAmountUsd)} outstanding)` : null,
            overdueDocs.length > 0 ? `${overdueDocs.length} overdue invoices (${formatUsd(overdueAmountUsd)} past due)` : null,
            paymentLinks.length > 0 ? `${paymentLinks.length} active payment links` : null,
            deadlines.length > 0 ? `${deadlines.length} project deadline${deadlines.length > 1 ? 's' : ''} in the next 14 days` : null,
            reviewDocs.length > 0 ? `${reviewDocs.length} contract${reviewDocs.length > 1 ? 's' : ''} awaiting review` : null,
        ].filter(Boolean).join(', ');

        const allClear = events.length === 0;

        let summary = 'Everything looks good — no outstanding items today.';
        let highlights: string[] = [];

        if (!allClear) {
            try {
                const prompt = `You are Hedwig, a concise AI assistant for freelancers. Today's workspace data: ${dataContext}.

Return ONLY valid JSON:
{
  "summary": "1-2 sentence plain-English overview of the financial situation",
  "highlights": ["short actionable point", "short actionable point"]
}

Rules: be direct, no filler words, no emojis, max 2 highlights.`;

                const text = await llmService.generateText(prompt, { purpose: 'general', useFallbacks: true });
                const parsed = safeJson(text);
                if (parsed?.summary) summary = String(parsed.summary);
                if (Array.isArray(parsed?.highlights)) {
                    highlights = (parsed.highlights as unknown[]).slice(0, 3).map(String);
                }
            } catch (err) {
                logger.warn('Gemini brief generation failed', { error: err });
                summary = `You have ${events.length} item${events.length > 1 ? 's' : ''} needing attention.`;
            }
        }

        res.json({
            success: true,
            data: {
                generatedAt: nowIso,
                summary,
                highlights,
                events,
                metrics: {
                    unpaidCount: unpaidDocs.length,
                    unpaidAmountUsd,
                    overdueCount: overdueDocs.length,
                    overdueAmountUsd,
                    upcomingDeadlines: deadlines.length,
                    activePaymentLinks: paymentLinks.length,
                    reviewDocuments: reviewDocs.length,
                },
            },
        });
    } catch (err: any) {
        logger.error('Brief generation failed', { error: err.message });
        res.status(500).json({ success: false, error: 'Failed to generate brief' });
    }
});

// GET /api/assistant/weekly
router.get('/weekly', authenticate, async (req: Request, res: Response) => {
    try {
        const user = await getOrCreateUser(req.user!.id);
        if (!user) { res.status(404).json({ success: false, error: 'User not found' }); return; }

        const now = new Date();
        const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const weekStartIso = weekStart.toISOString();
        const nowIso = now.toISOString();

        const [paidRes, newRes, overdueRes] = await Promise.all([
            // Invoices paid this week
            supabase
                .from('documents')
                .select('id, amount, content')
                .eq('user_id', user.id)
                .eq('type', 'INVOICE')
                .eq('status', 'PAID')
                .gte('updated_at', weekStartIso),
            // Invoices created this week
            supabase
                .from('documents')
                .select('id, amount, content')
                .eq('user_id', user.id)
                .eq('type', 'INVOICE')
                .gte('created_at', weekStartIso),
            // Currently overdue
            supabase
                .from('documents')
                .select('id, amount, content')
                .eq('user_id', user.id)
                .eq('type', 'INVOICE')
                .eq('status', 'OVERDUE'),
        ]);

        const paidDocs = paidRes.data ?? [];
        const newDocs = newRes.data ?? [];
        const overdueDocs = overdueRes.data ?? [];

        const revenueUsd = paidDocs.reduce((s, d) => s + toNum(d.amount), 0);
        const overdueAmountUsd = overdueDocs.reduce((s, d) => s + toNum(d.amount), 0);

        // Top clients from paid invoices
        const clientTotals: Record<string, number> = {};
        for (const doc of paidDocs) {
            const name: string = (doc.content as any)?.client_name || (doc.content as any)?.clientName || 'Unknown client';
            clientTotals[name] = (clientTotals[name] ?? 0) + toNum(doc.amount);
        }
        const topClients = Object.entries(clientTotals)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([name, amountUsd]) => ({ name, amountUsd }));

        // Gemini weekly insight
        let aiInsight = 'No invoices were paid this week yet.';
        try {
            const ctx = [
                `Revenue this week: ${formatUsd(revenueUsd)} from ${paidDocs.length} paid invoice${paidDocs.length !== 1 ? 's' : ''}`,
                newDocs.length > 0 ? `${newDocs.length} new invoice${newDocs.length !== 1 ? 's' : ''} created` : null,
                overdueDocs.length > 0 ? `${overdueDocs.length} overdue (${formatUsd(overdueAmountUsd)})` : 'No overdue invoices',
                topClients.length > 0 ? `Top client: ${topClients[0].name} (${formatUsd(topClients[0].amountUsd)})` : null,
            ].filter(Boolean).join('. ');

            const prompt = `You are Hedwig, a concise AI assistant for freelancers. Weekly workspace summary: ${ctx}.

Return ONLY valid JSON:
{
  "insight": "1 sentence summarising this week's financial performance and one key observation"
}

Rules: be specific, use the numbers, no fluff, no emojis.`;

            const text = await llmService.generateText(prompt, { purpose: 'general', useFallbacks: true });
            const parsed = safeJson(text);
            if (parsed?.insight) aiInsight = String(parsed.insight);
        } catch (err) {
            logger.warn('Gemini weekly insight failed', { error: err });
        }

        const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        res.json({
            success: true,
            data: {
                weekLabel: `${fmt(weekStart)} – ${fmt(now)}`,
                startDate: weekStartIso,
                endDate: nowIso,
                revenueUsd,
                newInvoiceCount: newDocs.length,
                paidInvoiceCount: paidDocs.length,
                overdueCount: overdueDocs.length,
                overdueAmountUsd,
                topClients,
                aiInsight,
            },
        });
    } catch (err: any) {
        logger.error('Weekly summary failed', { error: err.message });
        res.status(500).json({ success: false, error: 'Failed to generate weekly summary' });
    }
});

export default router;
