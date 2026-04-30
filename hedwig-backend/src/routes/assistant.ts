/**
 * Assistant routes for workspace summaries, rules-based suggestions, and limited notifications.
 * No action is ever executed automatically. Suggestions always require explicit user approval.
 */
import { Router, Request, Response } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import { processAttachment } from '../services/agent/attachment-handler';
import {
    buildNotificationSuggestions,
    getAssistantSuggestionById,
    markAssistantSuggestionShown,
    type AssistantSuggestionRecord,
    type AssistantSuggestionStatus,
    type AssistantSuggestionType,
    type SuggestionFilters,
} from '../services/assistantSuggestions';
import {
    approveRuntimeAssistantSuggestion,
    generateAssistantSuggestions,
    generateDailyBrief,
    generateWeeklySummary,
    listAssistantSuggestions,
    runAgentChat,
    updateAssistantSuggestion,
    type AgentChatMessage,
} from '../services/agent/assistant-runtime';
import { getOrCreateUser } from '../utils/userHelper';
import { createLogger } from '../utils/logger';

const logger = createLogger('Assistant');
const router = Router();
const attachmentUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const ensureAssistantAccess = async (req: Request, res: Response) => {
    const user = await getOrCreateUser(req.user!.id);
    if (!user) {
        res.status(404).json({ success: false, error: 'User not found' });
        return { user: null, allowed: false };
    }

    // Pro gate temporarily disabled — assistant is open to all users during testing.
    return { user, allowed: true };
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const parseBooleanQuery = (value: unknown): boolean | undefined => {
    if (typeof value !== 'string') return undefined;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return undefined;
};

const parseSuggestionTypes = (value: unknown): AssistantSuggestionType[] | undefined => {
    if (typeof value !== 'string' || !value.trim()) return undefined;
    const allowed = new Set<AssistantSuggestionType>([
        'invoice_reminder',
        'import_match',
        'expense_categorization',
        'calendar_event',
        'project_action',
        'tax_review',
    ]);

    const parsed = value
        .split(',')
        .map((item) => item.trim())
        .filter((item): item is AssistantSuggestionType => allowed.has(item as AssistantSuggestionType));

    return parsed.length > 0 ? parsed : undefined;
};

const toApiSuggestion = (suggestion: AssistantSuggestionRecord) => ({
    id: suggestion.id,
    userId: suggestion.user_id,
    type: suggestion.type,
    title: suggestion.title,
    description: suggestion.description,
    priority: suggestion.priority,
    confidenceScore: suggestion.confidence_score,
    status: suggestion.status,
    relatedEntities: suggestion.related_entities ?? {},
    editedData: suggestion.edited_data ?? null,
    actions: suggestion.actions ?? [],
    reason: suggestion.reason,
    surface: suggestion.surface,
    createdAt: suggestion.created_at,
    updatedAt: suggestion.updated_at,
    lastShownAt: suggestion.last_shown_at,
});

// ── GET /api/assistant/brief ─────────────────────────────────────────────────

router.get('/brief', authenticate, async (req: Request, res: Response) => {
    try {
        const access = await ensureAssistantAccess(req, res);
        if (!access.allowed || !access.user) return;
        const brief = await generateDailyBrief(access.user.id);
        res.json({ success: true, data: brief });
    } catch (err: any) {
        logger.error('Brief failed', { error: err.message });
        res.status(500).json({ success: false, error: 'Failed to generate brief' });
    }
});

// ── GET /api/assistant/weekly ────────────────────────────────────────────────

router.get('/weekly', authenticate, async (req: Request, res: Response) => {
    try {
        const access = await ensureAssistantAccess(req, res);
        if (!access.allowed || !access.user) return;
        const weeklySummary = await generateWeeklySummary(access.user.id);
        res.json({ success: true, data: weeklySummary });
    } catch (err: any) {
        logger.error('Weekly failed', { error: err.message });
        res.status(500).json({ success: false, error: 'Failed to generate weekly summary' });
    }
});

// ── GET /api/assistant/suggestions ──────────────────────────────────────────

router.get('/suggestions', authenticate, async (req: Request, res: Response) => {
    try {
        const access = await ensureAssistantAccess(req, res);
        if (!access.allowed || !access.user) return;
        const user = access.user;

        const filters: SuggestionFilters = {
            surface: typeof req.query.surface === 'string' ? req.query.surface as SuggestionFilters['surface'] : undefined,
            projectId: typeof req.query.projectId === 'string' ? req.query.projectId : undefined,
            invoiceId: typeof req.query.invoiceId === 'string' ? req.query.invoiceId : undefined,
            clientId: typeof req.query.clientId === 'string' ? req.query.clientId : undefined,
            contractId: typeof req.query.contractId === 'string' ? req.query.contractId : undefined,
            types: parseSuggestionTypes(req.query.types),
            expensePage: parseBooleanQuery(req.query.expensePage),
            taxPage: parseBooleanQuery(req.query.taxPage),
            importsPage: parseBooleanQuery(req.query.importsPage),
            insightsPage: parseBooleanQuery(req.query.insightsPage),
            limit: typeof req.query.limit === 'string' ? Number(req.query.limit) || undefined : undefined,
        };

        const suggestions = await listAssistantSuggestions(user.id, filters);

        res.json({
            success: true,
            data: {
                suggestions: suggestions.map(toApiSuggestion),
            },
        });
    } catch (err: any) {
        logger.error('Get suggestions failed', { error: err.message });
        res.status(500).json({ success: false, error: 'Failed to fetch suggestions' });
    }
});

// ── GET /api/assistant/suggestions/:id ──────────────────────────────────────

router.get('/suggestions/:id', authenticate, async (req: Request, res: Response) => {
    try {
        const access = await ensureAssistantAccess(req, res);
        if (!access.allowed || !access.user) return;

        const suggestionId = typeof req.params.id === 'string'
            ? req.params.id
            : Array.isArray(req.params.id)
                ? req.params.id[0] || ''
                : '';

        if (!suggestionId) {
            res.status(400).json({ success: false, error: 'Suggestion id is required' });
            return;
        }

        const suggestion = await getAssistantSuggestionById(access.user.id, suggestionId);
        if (!suggestion) {
            res.status(404).json({ success: false, error: 'Suggestion not found' });
            return;
        }

        res.json({ success: true, data: { suggestion: toApiSuggestion(suggestion) } });
    } catch (err: any) {
        logger.error('Get suggestion failed', { error: err.message });
        res.status(500).json({ success: false, error: 'Failed to fetch suggestion' });
    }
});

// ── POST /api/assistant/suggestions/generate ─────────────────────────────────
// Refreshes rules-based suggestions from live workspace data.

router.post('/suggestions/generate', authenticate, async (req: Request, res: Response) => {
    try {
        const access = await ensureAssistantAccess(req, res);
        if (!access.allowed || !access.user) return;
        const user = access.user;

        const suggestions = await generateAssistantSuggestions(user.id);

        res.json({
            success: true,
            data: {
                generated: suggestions.length,
                suggestions: suggestions.map(toApiSuggestion),
            },
        });
    } catch (err: any) {
        logger.error('Suggestion generate failed', { error: err.message });
        res.status(500).json({ success: false, error: 'Failed to generate suggestions' });
    }
});

// ── PATCH /api/assistant/suggestions/:id ────────────────────────────────────

router.patch('/suggestions/:id', authenticate, async (req: Request, res: Response) => {
    try {
        const access = await ensureAssistantAccess(req, res);
        if (!access.allowed || !access.user) return;
        const user = access.user;

        const suggestionId = typeof req.params.id === 'string'
            ? req.params.id
            : Array.isArray(req.params.id)
                ? req.params.id[0] || ''
                : '';
        const status = typeof req.body?.status === 'string' ? req.body.status : '';
        const actionType = typeof req.body?.actionType === 'string' ? req.body.actionType : null;

        if (!suggestionId) {
            res.status(400).json({ success: false, error: 'Suggestion id is required' });
            return;
        }

        if (!['approved', 'rejected', 'dismissed'].includes(status)) {
            res.status(400).json({ success: false, error: 'status must be approved, dismissed, or rejected' });
            return;
        }

        const updated = status === 'approved'
            ? await approveRuntimeAssistantSuggestion(user.id, suggestionId, actionType)
            : await updateAssistantSuggestion(user.id, suggestionId, status as AssistantSuggestionStatus, actionType);

        if (!updated) {
            res.status(404).json({ success: false, error: 'Suggestion not found' });
            return;
        }

        res.json({ success: true, data: { suggestion: toApiSuggestion(updated) } });
    } catch (err: any) {
        logger.error('Suggestion update failed', { error: err.message });
        res.status(500).json({ success: false, error: 'Failed to update suggestion' });
    }
});

// ── GET /api/assistant/preferences ──────────────────────────────────────────

router.get('/preferences', authenticate, async (req: Request, res: Response) => {
    try {
        const access = await ensureAssistantAccess(req, res);
        if (!access.allowed) return;
        const { data: user, error } = await supabase
            .from('users')
            .select('asst_daily_brief_email, asst_weekly_summary_email, asst_invoice_alerts, asst_deadline_alerts')
            .eq('privy_id', req.user!.id)
            .single();

        if (error || !user) { res.status(404).json({ success: false }); return; }

        res.json({
            success: true,
            data: {
                dailyBriefEmail: user.asst_daily_brief_email ?? false,
                weeklySummaryEmail: user.asst_weekly_summary_email ?? false,
                invoiceAlerts: user.asst_invoice_alerts ?? true,
                deadlineAlerts: user.asst_deadline_alerts ?? true,
            },
        });
    } catch (err: any) {
        logger.error('Get prefs failed', { error: err.message });
        res.status(500).json({ success: false, error: 'Failed to fetch preferences' });
    }
});

// ── PATCH /api/assistant/preferences ────────────────────────────────────────

router.patch('/preferences', authenticate, async (req: Request, res: Response) => {
    try {
        const access = await ensureAssistantAccess(req, res);
        if (!access.allowed) return;
        const { data: user, error: findErr } = await supabase
            .from('users').select('id').eq('privy_id', req.user!.id).single();
        if (findErr || !user) { res.status(404).json({ success: false }); return; }

        const allowed = ['dailyBriefEmail', 'weeklySummaryEmail', 'invoiceAlerts', 'deadlineAlerts'] as const;
        const colMap: Record<string, string> = {
            dailyBriefEmail: 'asst_daily_brief_email',
            weeklySummaryEmail: 'asst_weekly_summary_email',
            invoiceAlerts: 'asst_invoice_alerts',
            deadlineAlerts: 'asst_deadline_alerts',
        };

        const updates: Record<string, boolean> = {};
        for (const key of allowed) {
            if (key in req.body) updates[colMap[key]] = Boolean(req.body[key]);
        }

        if (Object.keys(updates).length === 0) {
            res.status(400).json({ success: false, error: 'No valid fields provided' }); return;
        }

        await supabase.from('users').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', user.id);
        res.json({ success: true });
    } catch (err: any) {
        logger.error('Patch prefs failed', { error: err.message });
        res.status(500).json({ success: false, error: 'Failed to update preferences' });
    }
});

// ── POST /api/assistant/notify ───────────────────────────────────────────────
// Notification engine: creates in-app notifications and optionally sends email.
// Called by scheduler — no user auth needed (uses user_id from body).

router.post('/notify', authenticate, async (req: Request, res: Response) => {
    try {
        const access = await ensureAssistantAccess(req, res);
        if (!access.allowed || !access.user) return;
        const user = access.user;

        // Get preferences
        const { data: prefs } = await supabase
            .from('users')
            .select('asst_daily_brief_email, asst_weekly_summary_email, asst_invoice_alerts, asst_deadline_alerts, email, first_name')
            .eq('id', user.id).single();

        if (!prefs) { res.json({ success: true, data: { sent: 0 } }); return; }

        const today = new Date().toISOString().slice(0, 10);
        const sent: string[] = [];

        // Check for already-sent notifications today to avoid duplicates
        const { data: todayNotes } = await supabase
            .from('notifications')
            .select('metadata')
            .eq('user_id', user.id)
            .gte('created_at', `${today}T00:00:00Z`);

        const todayTypes = new Set(
            (todayNotes ?? []).map((n) => (n.metadata as any)?.assistant_type).filter(Boolean)
        );

        if (prefs.asst_invoice_alerts) {
            const notificationSuggestions = await buildNotificationSuggestions(user.id);
            for (const suggestion of notificationSuggestions) {
                const notificationKey = suggestion.suggestion_key || suggestion.id;
                if (todayTypes.has(notificationKey)) continue;

                await supabase.from('notifications').insert({
                    user_id: user.id,
                    type: 'assistant',
                    title: suggestion.title,
                    message: suggestion.description,
                    metadata: {
                        assistant_type: notificationKey,
                        suggestion_id: suggestion.id,
                        suggestion_type: suggestion.type,
                    },
                    is_read: false,
                });
                await markAssistantSuggestionShown(suggestion.id);
                sent.push(notificationKey);
            }
        }

        // Deadline alerts
        if (prefs.asst_deadline_alerts && !todayTypes.has('deadline_alert')) {
            const in3Days = new Date(Date.now() + 3 * 86_400_000).toISOString();
            const { data: deadlines } = await supabase.from('projects')
                .select('id, name').eq('user_id', user.id)
                .in('status', ['ACTIVE', 'ONGOING', 'IN_PROGRESS', 'ON_HOLD'])
                .lte('deadline', in3Days).gte('deadline', new Date().toISOString());
            if (deadlines && deadlines.length > 0) {
                await supabase.from('notifications').insert({
                    user_id: user.id,
                    type: 'assistant',
                    title: `${deadlines.length} project deadline${deadlines.length > 1 ? 's' : ''} in the next 3 days`,
                    message: deadlines.map((p: any) => p.name).join(', '),
                    metadata: { assistant_type: 'deadline_alert' },
                    is_read: false,
                });
                sent.push('deadline_alert');
            }
        }

        res.json({ success: true, data: { sent } });
    } catch (err: any) {
        logger.error('Notify failed', { error: err.message });
        res.status(500).json({ success: false, error: 'Failed to send notifications' });
    }
});

// ─── Chat (agent) ────────────────────────────────────────────────────────────

router.post('/chat', authenticate, async (req: Request, res: Response) => {
    try {
        const access = await ensureAssistantAccess(req, res);
        if (!access.allowed || !access.user) return;

        const { message, history } = (req.body ?? {}) as {
            message?: string;
            history?: Array<{ role: string; content: string }>;
        };

        if (!message || typeof message !== 'string' || !message.trim()) {
            res.status(400).json({ success: false, error: 'message is required' });
            return;
        }

        const sanitisedHistory: AgentChatMessage[] = Array.isArray(history)
            ? history
                .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
                .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))
                .slice(-10)
            : [];

        const result = await runAgentChat({
            userId: access.user.id,
            history: sanitisedHistory,
            userMessage: message.trim(),
        });

        res.json({ success: true, data: result });
    } catch (err: any) {
        logger.error('Agent chat failed', { error: err?.message });
        res.status(500).json({ success: false, error: 'Chat failed' });
    }
});

// ─── Attachment (agent-driven document import) ───────────────────────────────

router.post('/attachment', authenticate, attachmentUpload.single('file'), async (req: Request, res: Response) => {
    try {
        const access = await ensureAssistantAccess(req, res);
        if (!access.allowed || !access.user) return;

        if (!req.file) {
            res.status(400).json({ success: false, error: 'A file is required' });
            return;
        }

        const instruction = typeof req.body?.message === 'string' ? req.body.message.trim() : undefined;

        const result = await processAttachment({
            userId: access.user.id,
            fileName: req.file.originalname,
            mimeType: req.file.mimetype,
            buffer: req.file.buffer,
            instruction: instruction || undefined,
        });

        res.json({
            success: true,
            data: {
                reply: result.reply,
                classification: result.classification,
                stagedSuggestionIds: result.stagedSuggestionIds,
                createdEntities: result.createdEntities,
                fileName: req.file.originalname,
                toolsCalled: [`attachment_${result.classification}`],
            },
        });
    } catch (err: any) {
        logger.error('Attachment processing failed', { error: err?.message });
        res.status(500).json({ success: false, error: 'Could not process attachment' });
    }
});

export default router;
