import { supabase } from '../lib/supabase';
import { DeepSeekService } from './deepseek';
import { EmailService } from './email';
import { createLogger } from '../utils/logger';
import { differenceInDays, parseISO } from 'date-fns';
import { emitTimelineEvent, TIMELINE_EVENT_KINDS, TIMELINE_EVENT_VERBS } from './timeline-events';

const logger = createLogger('DunningEngine');

/**
 * Dunning stage ladder (REVENUE-PAGE-STRATEGY §3.10):
 *   pre_due   — due in ≤3 days
 *   due       — due today through 2 days past
 *   overdue   — 3–14 days past due
 *   escalation— 15–44 days past due
 *   final     — 45+ days past due
 *
 * Contract:
 * - One email touch PER STAGE (no same-stage repeats) → at most 5 emails per
 *   document, no spam.
 * - The engine is the SINGLE reminder sender for documents it manages: the
 *   first touch sets content.dunning_active = true, which suppresses the
 *   legacy 7-day remind path (processDocumentReminder skips those docs).
 * - Pauses (reply/dispute/promise) are read from content flags set via
 *   PATCH /documents/:id/dunning; PAID documents get cancelled.
 * - Every send emits a `reminder.reminded` timeline event (stage-aware
 *   version) — Timeline is the record, email is derived from it.
 */

export type DunningStage = 'pre_due' | 'due' | 'overdue' | 'escalation' | 'final' | 'completed';

interface DunningDocument {
    id: string;
    type: string;
    status: string;
    amount: number | string | null;
    currency: string | null;
    title: string | null;
    user_id: string;
    workspace_id: string | null;
    created_at: string;
    content: Record<string, any> | null;
}

interface DunningUserRow {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    client_reminders_enabled: boolean | null;
    asst_dunning_emails: boolean | null;
}

interface DunningStateRow {
    id: string;
    document_id: string;
    current_stage: DunningStage;
    send_count: number;
    last_email_sent_at: string | null;
    paused: boolean | null;
    promised_payment_date: string | null;
}

const STAGE_LABELS: Record<string, string> = {
    pre_due: 'Due soon',
    due: 'Due today',
    overdue: 'Overdue',
    escalation: 'Overdue — escalation',
    final: 'Overdue — final notice',
};

export class DunningEngine {
    private static readonly BATCH_LIMIT = 200;

    static computeStage(daysUntilDue: number | null, daysSinceCreation: number): DunningStage {
        if (daysUntilDue !== null) {
            if (daysUntilDue >= -3 && daysUntilDue < 0) return 'pre_due';
            if (daysUntilDue >= 0 && daysUntilDue < 3) return 'due';
            if (daysUntilDue >= 3 && daysUntilDue < 15) return 'overdue';
            if (daysUntilDue >= 15 && daysUntilDue < 45) return 'escalation';
            if (daysUntilDue >= 45) return 'final';
            return 'pre_due'; // far in the future — not dunnable yet
        }
        // No due date: fall back on creation age so SENT docs still get chased.
        if (daysSinceCreation >= 45) return 'final';
        if (daysSinceCreation >= 15) return 'escalation';
        if (daysSinceCreation >= 7) return 'overdue';
        if (daysSinceCreation >= 2) return 'due';
        return 'pre_due';
    }

    static isTerminal(stage: DunningStage): boolean {
        return stage === 'completed';
    }

    private static getDueDate(doc: DunningDocument): string | null {
        const content = doc.content || {};
        const dueDate = content.due_date || content.dueDate || null;
        return typeof dueDate === 'string' && dueDate.trim().length > 0 ? dueDate : null;
    }

    /**
     * Run the full sweep: fetch manageable open documents, compute stages,
     * send stage emails where due, and update dunning_state rows.
     */
    static async run(): Promise<{ scanned: number; sent: number; paused: number; cancelled: number }> {
        const { data: docs, error } = await supabase
            .from('documents')
            .select(`
                id, type, status, amount, currency, title, user_id, workspace_id, created_at, content,
                user:users(first_name, last_name, email, client_reminders_enabled, asst_dunning_emails)
            `)
            .in('status', ['SENT', 'VIEWED'])
            .in('type', ['INVOICE', 'PAYMENT_LINK'])
            .limit(this.BATCH_LIMIT);

        if (error) {
            logger.error('Failed to fetch dunning documents', { error: error.message });
            return { scanned: 0, sent: 0, paused: 0, cancelled: 0 };
        }

        const documents = (docs || []) as unknown as Array<DunningDocument & { user: DunningUserRow | null }>;
        if (documents.length === 0) return { scanned: 0, sent: 0, paused: 0, cancelled: 0 };

        const stateRows = await this.loadState(documents.map((d) => d.id));
        const stateById = new Map(stateRows.map((row) => [row.document_id, row]));

        let sent = 0;
        let paused = 0;
        let cancelled = 0;

        for (const doc of documents) {
            try {
                const outcome = await this.processOne(doc, stateById.get(doc.id) || null);
                if (outcome === 'sent') sent += 1;
                else if (outcome === 'paused') paused += 1;
                else if (outcome === 'cancelled') cancelled += 1;
            } catch (err) {
                logger.error('Dunning failed for document', {
                    docId: doc.id,
                    error: err instanceof Error ? err.message : 'Unknown',
                });
            }
        }

        logger.info('Dunning sweep complete', { scanned: documents.length, sent, paused, cancelled });
        return { scanned: documents.length, sent, paused, cancelled };
    }

    private static async loadState(documentIds: string[]): Promise<DunningStateRow[]> {
        const { data, error } = await supabase
            .from('dunning_state')
            .select('id,document_id,current_stage,send_count,last_email_sent_at,paused,promised_payment_date')
            .in('document_id', documentIds);

        if (error) {
            logger.warn('Failed to load dunning state', { error: error.message });
            return [];
        }
        return (data || []) as DunningStateRow[];
    }

    private static async processOne(
        doc: DunningDocument & { user: DunningUserRow | null },
        state: DunningStateRow | null
    ): Promise<'sent' | 'paused' | 'cancelled' | 'skipped'> {
        const content = doc.content || {};

        // PAID documents cancel the sequence (webhook may also call markCompleted).
        if (doc.status === 'PAID') {
            await this.markCompleted(doc.id, 'paid');
            return 'cancelled';
        }

        const user = doc.user;
        if (user?.client_reminders_enabled === false || user?.asst_dunning_emails === false) {
            return 'skipped';
        }

        const recipientEmail = content.recipient_email || content.client_email;
        if (!recipientEmail || typeof recipientEmail !== 'string') return 'skipped';
        if (content.reminders_enabled === false) return 'skipped';

        // Pause flags: replied/disputed/promised. Read from content (set via
        // PATCH /documents/:id/dunning) or from the state row.
        const promisedDate = content.promised_payment_date
            ? parseISO(String(content.promised_payment_date))
            : state?.promised_payment_date ? new Date(state.promised_payment_date) : null;
        const isPaused = content.dunning_paused === true || (state?.paused === true && state.current_stage !== 'completed');
        if (isPaused) return 'paused';
        if (promisedDate && promisedDate > new Date()) return 'paused';

        const now = new Date();
        const dueDateStr = this.getDueDate(doc);
        const daysUntilDue = dueDateStr ? differenceInDays(parseISO(dueDateStr), now) : null;
        const daysSinceCreation = differenceInDays(now, parseISO(doc.created_at));

        const stage = DunningEngine.computeStage(daysUntilDue, daysSinceCreation);
        if (stage === 'pre_due' && dueDateStr === null) return 'skipped'; // created < 2d ago, nothing due yet

        // Fire once per stage. Same-stage repeats are never sent; a PAID
        // document is handled above. Guard against clock skew (stage is
        // always ≥ previous stage since days only advance).
        if (state && state.current_stage === stage) {
            if (stage === 'final' || stage === 'escalation') {
                // Long stages get one reinforcement after 14/21 days max.
                const lastSent = state.last_email_sent_at ? new Date(state.last_email_sent_at) : null;
                const cooldownDays = stage === 'final' ? 21 : 14;
                if (lastSent && differenceInDays(now, lastSent) < cooldownDays) return 'skipped';
            } else {
                return 'skipped';
            }
        }
        // Never send if the previous touch was very recent (< 7 days) — guards
        // against stage churn triggered by date changes.
        if (state?.last_email_sent_at) {
            const lastSent = new Date(state.last_email_sent_at);
            if (differenceInDays(now, lastSent) < 7 && state.current_stage !== 'completed') return 'skipped';
        }

        const sent = await this.sendStageEmail(doc, user, stage, daysSinceCreation, recipientEmail);
        if (!sent) return 'skipped';

        await this.upsertState(doc, state, stage);

        // Keep the legacy reminder path in sync: it reads last_reminder_sent_at
        // (7-day cooldown) AND dunning_active (hard skip).
        await supabase
            .from('documents')
            .update({
                content: {
                    ...content,
                    dunning_active: true,
                    dunning_stage: stage,
                    last_reminder_sent_at: new Date().toISOString(),
                },
            })
            .eq('id', doc.id);

        await emitTimelineEvent({
            userId: doc.user_id,
            workspaceId: doc.workspace_id ?? null,
            kind: TIMELINE_EVENT_KINDS.REMINDER,
            entityType: doc.type === 'PAYMENT_LINK' ? 'payment_link' : 'invoice',
            entityId: doc.id,
            verb: TIMELINE_EVENT_VERBS.REMINDED,
            version: new Date().toISOString(),
            title: `${STAGE_LABELS[stage] || stage}: ${doc.title || (doc.type === 'PAYMENT_LINK' ? 'payment link' : 'invoice')}`,
            context: {
                title: doc.title || null,
                amount: Number.isFinite(Number(doc.amount)) ? Number(doc.amount) : null,
                currency: doc.currency || 'USD',
                type: doc.type || 'INVOICE',
                stage,
                days_since_creation: daysSinceCreation,
                days_until_due: daysUntilDue,
            },
        });

        return 'sent';
    }

    private static async sendStageEmail(
        doc: DunningDocument & { user: DunningUserRow | null },
        user: DunningUserRow | null,
        stage: DunningStage,
        daysSinceCreation: number,
        recipientEmail: string
    ): Promise<boolean> {
        const clientName = String(doc.content?.client_name || 'Client');
        const documentType = doc.type === 'PAYMENT_LINK' ? 'Payment Link' : 'Invoice';
        const amount = `${Number(doc.amount)} ${doc.currency || 'USDC'}`;
        const daysOverdue = stage === 'pre_due' ? 0 : Math.max(daysSinceCreation, 0);
        const senderName = `${user?.first_name || 'Hedwig'} ${user?.last_name || ''}`.trim();

        let subject: string;
        let body: string;

        try {
            const ai = await DeepSeekService.generatePaymentReminder(
                clientName,
                amount,
                daysOverdue,
                documentType,
                doc.title || 'payment',
                senderName
            );
            subject = ai.subject;
            body = ai.body;
        } catch {
            const stageCopy =
                stage === 'pre_due' ? 'your payment is due shortly'
                : stage === 'due' ? 'your payment is due now'
                : stage === 'overdue' ? `your payment is ${daysSinceCreation} day${daysSinceCreation === 1 ? '' : 's'} overdue`
                : stage === 'escalation' ? `your payment is now considerably overdue`
                : 'this is a final notice — please settle your balance';
            subject = `${STAGE_LABELS[stage]}: payment for ${doc.title || documentType}`;
            body = `<p>Hi ${clientName},</p><p>${stageCopy}` +
                   ` for "${doc.title || documentType}" — ${amount}.</p>` +
                   `<p>If you have any questions or have already paid, please let me know.</p><p>Thanks,<br>${senderName}</p>`;
        }

        const BASE_URL = (process.env.WEB_CLIENT_URL || process.env.PUBLIC_BASE_URL || 'https://hedwig.riftlabs.xyz').replace(/\/+$/, '');
        const actionLink = doc.type === 'INVOICE' ? `${BASE_URL}/invoice/${doc.id}` : `${BASE_URL}/pay/${doc.id}`;
        const sent = await EmailService.sendSmartReminder(recipientEmail, subject, body, actionLink, 'Pay Now');
        if (!sent) logger.warn('Dunning email failed to send', { docId: doc.id, stage });
        return sent;
    }

    private static async upsertState(doc: DunningDocument, state: DunningStateRow | null, stage: DunningStage): Promise<void> {
        const payload = {
            document_id: doc.id,
            user_id: doc.user_id,
            workspace_id: doc.workspace_id ?? null,
            entity_type: doc.type === 'PAYMENT_LINK' ? 'payment_link' : 'invoice',
            current_stage: stage,
            send_count: (state?.send_count ?? 0) + 1,
            last_email_sent_at: new Date().toISOString(),
            paused: false,
            pause_reason: null,
            cancelled_reason: null,
            updated_at: new Date().toISOString(),
        };
        const { error } = state
            ? await supabase.from('dunning_state').update(payload).eq('id', state.id)
            : await supabase.from('dunning_state').insert(payload);
        if (error) logger.warn('Failed to write dunning state', { docId: doc.id, error: error.message });
    }

    /** Cancel a sequence (PAID, refunded, or deleted). Called from the engine
     *  and from payment webhooks so the termination is immediate. */
    static async markCompleted(documentId: string, reason: string): Promise<void> {
        const { data: existing, error: findErr } = await supabase
            .from('dunning_state')
            .select('id,current_stage')
            .eq('document_id', documentId)
            .maybeSingle();

        if (findErr) return;
        if (!existing) return;

        const { error } = await supabase
            .from('dunning_state')
            .update({
                current_stage: 'completed',
                cancelled_reason: reason,
                paused: false,
                updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id);

        if (error) {
            logger.warn('Failed to complete dunning state', { documentId, error: error.message });
        }
    }

    /** Pause/resume a sequence (client replied, disputed, or promised a date).
     *  Called from PATCH /documents/:id/dunning; content flags are
     *  authoritative, this row keeps the state machine in sync. */
    static async setPaused(documentId: string, paused: boolean, reason?: string, promisedPaymentDate?: string | null): Promise<void> {
        const { data: existing, error: findErr } = await supabase
            .from('dunning_state')
            .select('id')
            .eq('document_id', documentId)
            .maybeSingle();

        if (findErr) return;
        if (!existing) return;

        const { error } = await supabase
            .from('dunning_state')
            .update({
                paused,
                pause_reason: paused ? (reason?.trim() || null) : null,
                promised_payment_date: promisedPaymentDate || null,
                updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id);

        if (error) {
            logger.warn('Failed to update dunning pause state', { documentId, error: error.message });
        }
    }
}