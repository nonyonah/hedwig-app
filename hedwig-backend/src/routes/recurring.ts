import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import { getOrCreateUser } from '../utils/userHelper';
import { createLogger } from '../utils/logger';
import { addDays, addMonths, addYears, format, isAfter, parseISO } from 'date-fns';

const logger = createLogger('Recurring');
const router = Router();

const WEB_CLIENT_URL = (process.env.WEB_CLIENT_URL || process.env.PUBLIC_BASE_URL || 'https://hedwigbot.xyz').replace(/\/+$/, '');

export type RecurringFrequency = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annual';

/**
 * Compute the next due date based on frequency.
 * date-fns addMonths already clamps to the last day of the target month
 * (e.g. Jan 31 + 1 month = Feb 28/29), so no extra edge-case handling needed.
 */
export function computeNextDueDate(from: Date, frequency: RecurringFrequency): Date {
    switch (frequency) {
        case 'weekly':    return addDays(from, 7);
        case 'biweekly':  return addDays(from, 14);
        case 'monthly':   return addMonths(from, 1);
        case 'quarterly': return addMonths(from, 3);
        case 'annual':    return addYears(from, 1);
    }
}

function formatDate(d: Date): string {
    return format(d, 'yyyy-MM-dd');
}

function mapRow(row: any) {
    return {
        id: row.id,
        userId: row.user_id,
        clientId: row.client_id,
        clientName: row.client_name,
        clientEmail: row.client_email,
        projectId: row.project_id,
        title: row.title,
        amountUsd: row.amount,
        currency: row.currency,
        chain: row.chain,
        memo: row.memo,
        items: row.items || [],
        frequency: row.frequency,
        startDate: row.start_date,
        endDate: row.end_date,
        nextDueDate: row.next_due_date,
        status: row.status,
        autoSend: row.auto_send,
        generatedCount: row.generated_count,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

/**
 * GET /api/recurring-invoices
 */
router.get('/', authenticate, async (req: Request, res: Response, next) => {
    try {
        const user = await getOrCreateUser(req.user!.id);
        if (!user) { res.status(404).json({ success: false, error: 'User not found' }); return; }

        const { data, error } = await supabase
            .from('recurring_invoices')
            .select('*')
            .eq('user_id', user.id)
            .neq('status', 'cancelled')
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json({ success: true, data: { recurringInvoices: (data || []).map(mapRow) } });
    } catch (err) { next(err); }
});

/**
 * POST /api/recurring-invoices
 */
router.post('/', authenticate, async (req: Request, res: Response, next) => {
    try {
        const user = await getOrCreateUser(req.user!.id);
        if (!user) { res.status(404).json({ success: false, error: 'User not found' }); return; }

        const {
            clientId, clientName, clientEmail, projectId,
            title, amount, currency = 'USDC', chain = 'BASE',
            memo, items = [],
            frequency, startDate, endDate,
            autoSend = false,
        } = req.body;

        if (!amount || !frequency || !startDate) {
            res.status(400).json({ success: false, error: 'amount, frequency, and startDate are required' });
            return;
        }

        const validFrequencies: RecurringFrequency[] = ['weekly', 'biweekly', 'monthly', 'quarterly', 'annual'];
        if (!validFrequencies.includes(frequency)) {
            res.status(400).json({ success: false, error: `frequency must be one of: ${validFrequencies.join(', ')}` });
            return;
        }

        // Resolve client info if clientId provided
        let resolvedClientName = clientName;
        let resolvedClientEmail = clientEmail;
        if (clientId && (!resolvedClientName || !resolvedClientEmail)) {
            const { data: client } = await supabase
                .from('clients').select('name, email').eq('id', clientId).single();
            if (client) {
                resolvedClientName = resolvedClientName || client.name;
                resolvedClientEmail = resolvedClientEmail || client.email;
            }
        }

        const startD = parseISO(startDate);
        const nextDueDate = formatDate(startD);

        const { data, error } = await supabase
            .from('recurring_invoices')
            .insert({
                user_id: user.id,
                client_id: clientId || null,
                client_name: resolvedClientName || null,
                client_email: resolvedClientEmail || null,
                project_id: projectId || null,
                title: title || `Recurring invoice for ${resolvedClientName || 'Services'}`,
                amount: parseFloat(amount),
                currency,
                chain: String(chain).toUpperCase(),
                memo: memo || null,
                items,
                frequency,
                start_date: startDate,
                end_date: endDate || null,
                next_due_date: nextDueDate,
                status: 'active',
                auto_send: Boolean(autoSend),
                generated_count: 0,
            })
            .select()
            .single();

        if (error) throw error;

        logger.info('Recurring invoice created', { id: data.id, frequency });

        // Auto-generate the first invoice immediately if start date is today or in the past
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            if (start <= today) {
                await generateInvoiceFromTemplate(data, user.id);
                logger.info('Auto-generated first invoice for new recurring template', { id: data.id });
            }
        } catch (genErr) {
            logger.warn('Failed to auto-generate first invoice for recurring template', { id: data.id });
        }

        // Notify client immediately so they know about the recurring arrangement
        if (resolvedClientEmail) {
            try {
                const { data: senderProfile } = await supabase
                    .from('users').select('first_name, last_name').eq('id', user.id).single();
                const senderName = senderProfile
                    ? `${senderProfile.first_name || ''} ${senderProfile.last_name || ''}`.trim() || 'Hedwig User'
                    : 'Hedwig User';

                const { EmailService } = await import('../services/email');
                await EmailService.sendRecurringSetupEmail({
                    to: resolvedClientEmail,
                    senderName,
                    amount: String(parseFloat(amount)),
                    currency,
                    frequency,
                    title: title || undefined,
                    startDate: startDate,
                });
            } catch (emailErr) {
                logger.warn('Failed to send recurring setup email', { id: data.id });
            }
        }

        res.status(201).json({ success: true, data: { recurringInvoice: mapRow(data) } });
    } catch (err) { next(err); }
});

/**
 * GET /api/recurring-invoices/:id
 */
router.get('/:id', authenticate, async (req: Request, res: Response, next) => {
    try {
        const user = await getOrCreateUser(req.user!.id);
        if (!user) { res.status(404).json({ success: false, error: 'User not found' }); return; }

        const { data, error } = await supabase
            .from('recurring_invoices')
            .select('*')
            .eq('id', req.params.id)
            .eq('user_id', user.id)
            .single();

        if (error || !data) { res.status(404).json({ success: false, error: 'Not found' }); return; }

        res.json({ success: true, data: { recurringInvoice: mapRow(data) } });
    } catch (err) { next(err); }
});

/**
 * PATCH /api/recurring-invoices/:id
 * Update editable fields (title, amount, memo, items, endDate, autoSend, frequency)
 */
router.patch('/:id', authenticate, async (req: Request, res: Response, next) => {
    try {
        const user = await getOrCreateUser(req.user!.id);
        if (!user) { res.status(404).json({ success: false, error: 'User not found' }); return; }

        const { title, amount, memo, items, endDate, autoSend, frequency } = req.body;
        const updates: any = {};

        if (title !== undefined)    updates.title = title;
        if (amount !== undefined)   updates.amount = parseFloat(amount);
        if (memo !== undefined)     updates.memo = memo || null;
        if (items !== undefined)    updates.items = items;
        if (endDate !== undefined)  updates.end_date = endDate || null;
        if (autoSend !== undefined) updates.auto_send = Boolean(autoSend);
        if (frequency !== undefined) {
            const valid: RecurringFrequency[] = ['weekly', 'biweekly', 'monthly', 'quarterly', 'annual'];
            if (!valid.includes(frequency)) {
                res.status(400).json({ success: false, error: 'Invalid frequency' }); return;
            }
            updates.frequency = frequency;
        }

        if (Object.keys(updates).length === 0) {
            res.status(400).json({ success: false, error: 'No update fields provided' }); return;
        }

        const { data, error } = await supabase
            .from('recurring_invoices')
            .update(updates)
            .eq('id', req.params.id)
            .eq('user_id', user.id)
            .select()
            .single();

        if (error || !data) { res.status(404).json({ success: false, error: 'Not found' }); return; }

        res.json({ success: true, data: { recurringInvoice: mapRow(data) } });
    } catch (err) { next(err); }
});

/**
 * PATCH /api/recurring-invoices/:id/status
 * Pause, resume, or cancel a recurring invoice
 */
router.patch('/:id/status', authenticate, async (req: Request, res: Response, next) => {
    try {
        const user = await getOrCreateUser(req.user!.id);
        if (!user) { res.status(404).json({ success: false, error: 'User not found' }); return; }

        const { status } = req.body;
        if (!['active', 'paused', 'cancelled'].includes(status)) {
            res.status(400).json({ success: false, error: 'status must be active, paused, or cancelled' }); return;
        }

        const { data, error } = await supabase
            .from('recurring_invoices')
            .update({ status })
            .eq('id', req.params.id)
            .eq('user_id', user.id)
            .select()
            .single();

        if (error || !data) { res.status(404).json({ success: false, error: 'Not found' }); return; }

        logger.info('Recurring invoice status updated', { id: data.id, status });
        res.json({ success: true, data: { recurringInvoice: mapRow(data) } });
    } catch (err) { next(err); }
});

/**
 * POST /api/recurring-invoices/:id/trigger
 * Manually generate the next invoice now (ignores next_due_date)
 */
router.post('/:id/trigger', authenticate, async (req: Request, res: Response, next) => {
    try {
        const user = await getOrCreateUser(req.user!.id);
        if (!user) { res.status(404).json({ success: false, error: 'User not found' }); return; }

        const { data: template, error: fetchErr } = await supabase
            .from('recurring_invoices')
            .select('*')
            .eq('id', req.params.id)
            .eq('user_id', user.id)
            .single();

        if (fetchErr || !template) { res.status(404).json({ success: false, error: 'Not found' }); return; }

        const invoice = await generateInvoiceFromTemplate(template, user.id);
        res.status(201).json({ success: true, data: { document: invoice } });
    } catch (err) { next(err); }
});

/**
 * Shared helper: create an invoice document from a recurring template.
 * Called by both the trigger endpoint and the scheduler.
 */
export async function generateInvoiceFromTemplate(template: any, userId: string) {
    const now = new Date();
    const dueDate = formatDate(computeNextDueDate(now, template.frequency as RecurringFrequency));

    const { data: doc, error } = await supabase
        .from('documents')
        .insert({
            user_id: userId,
            client_id: template.client_id || null,
            project_id: template.project_id || null,
            type: 'INVOICE',
            title: template.title,
            amount: template.amount,
            description: template.memo || null,
            status: 'DRAFT',
            chain: template.chain,
            content: {
                recipient_email: template.client_email || null,
                client_name: template.client_name || null,
                due_date: dueDate,
                items: template.items || [],
                reminders_enabled: true,
                recurring_invoice_id: template.id,
            },
        })
        .select()
        .single();

    if (error || !doc) throw new Error(`Failed to create invoice: ${error?.message}`);

    const shareableUrl = `${WEB_CLIENT_URL}/invoice/${doc.id}`;
    await supabase.from('documents').update({ payment_link_url: shareableUrl }).eq('id', doc.id);

    // Auto-send if configured and client email is available
    if (template.auto_send && template.client_email) {
        try {
            const { data: senderProfile } = await supabase
                .from('users').select('first_name, last_name').eq('id', userId).single();
            const senderName = senderProfile
                ? `${senderProfile.first_name || ''} ${senderProfile.last_name || ''}`.trim() || 'Hedwig User'
                : 'Hedwig User';

            const { EmailService } = await import('../services/email');
            const generationNumber = (template.generated_count || 0) + 1;
            const sent = await EmailService.sendRecurringInvoiceEmail({
                to: template.client_email,
                senderName,
                amount: String(template.amount),
                currency: template.currency || 'USD',
                description: template.title,
                linkId: doc.id,
                paymentUrl: shareableUrl,
                frequency: template.frequency,
                generationNumber,
            });

            if (sent) {
                await supabase.from('documents').update({ status: 'SENT' }).eq('id', doc.id);
                doc.status = 'SENT';
            }
        } catch (emailErr) {
            logger.warn('Failed to auto-send recurring invoice email', { docId: doc.id });
        }
    }

    // Advance next_due_date on the template
    const nextDue = computeNextDueDate(
        parseISO(template.next_due_date || formatDate(now)),
        template.frequency as RecurringFrequency
    );
    const updates: any = {
        next_due_date: formatDate(nextDue),
        generated_count: (template.generated_count || 0) + 1,
    };

    // Cancel if end_date has been passed
    if (template.end_date && isAfter(nextDue, parseISO(template.end_date))) {
        updates.status = 'cancelled';
    }

    await supabase.from('recurring_invoices').update(updates).eq('id', template.id);

    logger.info('Generated invoice from recurring template', {
        templateId: template.id,
        docId: doc.id,
        autoSend: template.auto_send,
    });

    return doc;
}

export default router;
