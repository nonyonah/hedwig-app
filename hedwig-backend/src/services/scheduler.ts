import cron from 'node-cron';
import { supabase } from '../lib/supabase';
import { GeminiService } from './gemini';
import { EmailService } from './email';
import NotificationService from './notifications';
import BackendAnalytics from './analytics';
import { differenceInDays, parseISO, addDays, isSameDay, format } from 'date-fns';
import { createLogger } from '../utils/logger';

const logger = createLogger('Scheduler');

const DAY_MS = 24 * 60 * 60 * 1000;

export const SchedulerService = {
    initScheduler() {
        logger.info('Initializing Reminder Scheduler');

        // Run every day at 10:00 AM UTC - check for overdue payments
        cron.schedule('0 10 * * *', async () => {
            logger.debug('Running daily automated check for overdue payments');
            await this.checkAndRemind();
        });

        // Run every day at 9:00 AM UTC - check for upcoming due dates
        cron.schedule('0 9 * * *', async () => {
            logger.debug('Running daily due date reminder check');
            await this.checkDueDateReminders();
        });

        // Run every day at 3:30 AM UTC - prune stale/wrong-project Expo push tokens
        cron.schedule('30 3 * * *', async () => {
            logger.debug('Running Expo token cleanup job');
            await NotificationService.cleanupExpoDeviceTokens();
        });

        // Run every day at 8:00 AM UTC - generate due recurring invoices
        cron.schedule('0 8 * * *', async () => {
            logger.debug('Running recurring invoice generation job');
            await this.checkRecurringInvoices();
        });

        // Run hourly at minute 15 - send dormant user nudges (3-day inactivity)
        cron.schedule('15 * * * *', async () => {
            logger.debug('Running dormant-user re-engagement nudge job');
            await this.sendDormantUserNudges();
        });

        // Run hourly at minute 20 - send KYC reminder nudges (24h after app_opened)
        cron.schedule('20 * * * *', async () => {
            logger.debug('Running KYC reminder nudge job');
            await this.sendKycReminderNudges();
        });

        // Run hourly at minute 25 - send feature highlight nudges every few days
        cron.schedule('25 * * * *', async () => {
            logger.debug('Running feature-highlight re-engagement nudge job');
            await this.sendFeatureHighlightNudges();
        });
    },

    timestampMs(value: string | null | undefined): number | null {
        if (!value) return null;
        const ms = Date.parse(value);
        return Number.isNaN(ms) ? null : ms;
    },

    pickLatestTimestamp(values: Array<string | null | undefined>): string | null {
        let bestMs: number | null = null;
        let bestValue: string | null = null;

        for (const value of values) {
            const ms = this.timestampMs(value);
            if (ms === null) continue;
            if (bestMs === null || ms > bestMs) {
                bestMs = ms;
                bestValue = new Date(ms).toISOString();
            }
        }

        return bestValue;
    },

    async getOneSignalLastSeenMap(): Promise<Record<string, string>> {
        const lastSeenByUser: Record<string, string> = {};
        const { data, error } = await supabase
            .from('onesignal_subscriptions')
            .select('user_id, last_seen_at')
            .not('last_seen_at', 'is', null)
            .order('last_seen_at', { ascending: false })
            .limit(10000);

        if (error) {
            logger.warn('Failed to fetch OneSignal last_seen activity for nudge targeting', {
                error: error.message,
            });
            return lastSeenByUser;
        }

        for (const row of data || []) {
            const userId = String((row as any).user_id || '').trim();
            const lastSeenAt = String((row as any).last_seen_at || '').trim();
            if (!userId || !lastSeenAt) continue;
            if (!lastSeenByUser[userId]) {
                lastSeenByUser[userId] = lastSeenAt;
            }
        }

        return lastSeenByUser;
    },

    getEffectiveLastActivityAt(user: any, oneSignalLastSeenMap: Record<string, string>): string | null {
        return this.pickLatestTimestamp([
            user?.last_app_opened_at || null,
            user?.last_login || null,
            oneSignalLastSeenMap[user?.id] || null,
        ]);
    },

    async backfillLastAppOpenedAt(users: any[], oneSignalLastSeenMap: Record<string, string>) {
        const updates = users
            .map((user) => {
                const effectiveLastActivityAt = this.getEffectiveLastActivityAt(user, oneSignalLastSeenMap);
                const effectiveMs = this.timestampMs(effectiveLastActivityAt);
                const appOpenedMs = this.timestampMs(user?.last_app_opened_at);
                if (!effectiveLastActivityAt || effectiveMs === null) return null;
                if (appOpenedMs !== null && appOpenedMs >= effectiveMs) return null;

                return {
                    id: String(user.id),
                    lastAppOpenedAt: effectiveLastActivityAt,
                };
            })
            .filter(Boolean) as Array<{ id: string; lastAppOpenedAt: string }>;

        if (updates.length === 0) return;

        logger.info('Backfilling last_app_opened_at from backend activity/session data', {
            count: updates.length,
        });

        for (const update of updates) {
            const { error } = await supabase
                .from('users')
                .update({ last_app_opened_at: update.lastAppOpenedAt })
                .eq('id', update.id);

            if (error) {
                logger.warn('Failed to backfill last_app_opened_at for user', {
                    userId: update.id,
                    error: error.message,
                });
            }
        }
    },

    async sendDormantUserNudges() {
        try {
            const cutoffMs = Date.now() - (3 * DAY_MS);

            const { data: users, error } = await supabase
                .from('users')
                .select('id, privy_id, email, first_name, last_name, last_app_opened_at, last_dormant_nudge_at, last_login');

            if (error) {
                logger.error('Failed to fetch dormant users', { error: error.message });
                return;
            }

            const oneSignalLastSeenMap = await this.getOneSignalLastSeenMap();
            await this.backfillLastAppOpenedAt(users || [], oneSignalLastSeenMap);

            const candidates = (users || []).filter((user: any) => {
                const effectiveActivityAt = this.getEffectiveLastActivityAt(user, oneSignalLastSeenMap);
                const effectiveActivityMs = this.timestampMs(effectiveActivityAt);
                if (effectiveActivityMs === null) return false;
                if (effectiveActivityMs > cutoffMs) return false;
                if (!user?.last_dormant_nudge_at) return true;
                const lastDormantNudgeMs = this.timestampMs(user.last_dormant_nudge_at);
                if (lastDormantNudgeMs === null) return true;
                return lastDormantNudgeMs < effectiveActivityMs;
            });

            if (candidates.length === 0) {
                logger.debug('No dormant users eligible for nudges');
                return;
            }

            logger.info('Sending dormant user nudges', { count: candidates.length });
            const creativeCopy = await GeminiService.generateReengagementNudge({
                kind: 'dormant_3day',
            });

            for (const user of candidates) {
                const firstName = String(user.first_name || '').trim();
                const title = creativeCopy.pushTitle;
                const body = firstName
                    ? `${firstName}, ${creativeCopy.pushBody}`
                    : creativeCopy.pushBody;

                await NotificationService.notifyUser(user.id, {
                    title,
                    body,
                    data: {
                        type: 'reengagement_dormant',
                        route: '/(drawer)/(tabs)',
                    },
                });

                if (user.email) {
                    await EmailService.sendSmartReminder(
                        user.email,
                        creativeCopy.emailSubject,
                        `<p class=\"eyebrow\">Re-engagement</p><h1 class=\"heading\">${creativeCopy.emailHeading}</h1><p class=\"description\">${creativeCopy.emailBody}</p>`,
                        'https://hedwigbot.xyz',
                        creativeCopy.ctaText || 'Open Hedwig'
                    );
                }

                await supabase.from('notifications').insert({
                    user_id: user.id,
                    type: 'announcement',
                    title,
                    message: body,
                    metadata: {
                        nudge_type: 'dormant_3day',
                    },
                    is_read: false,
                });

                await supabase
                    .from('users')
                    .update({ last_dormant_nudge_at: new Date().toISOString() })
                    .eq('id', user.id);

                await BackendAnalytics.capture(String(user.privy_id || user.id), 'reengagement_nudge_sent', {
                    user_id: user.id,
                    nudge_type: 'dormant_3day',
                    channels: user.email ? ['push', 'email'] : ['push'],
                });
            }
        } catch (error: any) {
            logger.error('Error sending dormant user nudges', { error: error?.message });
        }
    },

    async sendKycReminderNudges() {
        try {
            const cutoffMs = Date.now() - DAY_MS;
            const flagKey = process.env.POSTHOG_ONBOARDING_KYC_NUDGE_FLAG || 'onboarding_kyc_nudge_variant';

            const { data: users, error } = await supabase
                .from('users')
                .select('id, privy_id, email, first_name, kyc_status, kyc_started_at, last_app_opened_at, last_kyc_nudge_at, last_login')
                .in('kyc_status', ['not_started', 'pending', 'retry_required']);

            if (error) {
                logger.error('Failed to fetch KYC nudge users', { error: error.message });
                return;
            }

            const oneSignalLastSeenMap = await this.getOneSignalLastSeenMap();
            await this.backfillLastAppOpenedAt(users || [], oneSignalLastSeenMap);

            const candidates = (users || []).filter((user: any) => {
                const effectiveActivityAt = this.getEffectiveLastActivityAt(user, oneSignalLastSeenMap);
                const effectiveActivityMs = this.timestampMs(effectiveActivityAt);
                if (effectiveActivityMs === null) return false;
                if (effectiveActivityMs > cutoffMs) return false;
                if (user?.kyc_started_at) return false;
                if (!user?.last_kyc_nudge_at) return true;
                const lastKycNudgeMs = this.timestampMs(user.last_kyc_nudge_at);
                if (lastKycNudgeMs === null) return true;
                return lastKycNudgeMs < effectiveActivityMs;
            });

            if (candidates.length === 0) {
                logger.debug('No users eligible for KYC nudges');
                return;
            }

            logger.info('Sending KYC nudges', { count: candidates.length });
            const copyByVariant: Record<string, {
                pushTitle: string;
                pushBody: string;
                emailSubject: string;
                emailHeading: string;
                emailBody: string;
                ctaText: string;
            }> = {};

            for (const user of candidates) {
                const variant = await BackendAnalytics.getFeatureFlagVariant(
                    String(user.privy_id || user.id),
                    flagKey,
                    'control'
                );
                if (!copyByVariant[variant]) {
                    copyByVariant[variant] = await GeminiService.generateReengagementNudge({
                        kind: 'kyc_24h',
                        variant,
                    });
                }
                const copy = copyByVariant[variant];

                await NotificationService.notifyUser(user.id, {
                    title: copy.pushTitle,
                    body: copy.pushBody,
                    data: {
                        type: 'kyc_nudge_24h',
                        route: '/settings/index',
                        variant,
                    },
                });

                if (user.email) {
                    await EmailService.sendSmartReminder(
                        user.email,
                        copy.emailSubject,
                        `<p class=\"eyebrow\">Verification reminder</p><h1 class=\"heading\">${copy.emailHeading}</h1><p class=\"description\">${copy.emailBody}</p>`,
                        'https://hedwigbot.xyz/settings',
                        copy.ctaText || 'Complete Verification'
                    );
                }

                await supabase.from('notifications').insert({
                    user_id: user.id,
                    type: 'announcement',
                    title: copy.pushTitle,
                    message: copy.pushBody,
                    metadata: {
                        nudge_type: 'kyc_24h',
                        variant,
                    },
                    is_read: false,
                });

                await supabase
                    .from('users')
                    .update({ last_kyc_nudge_at: new Date().toISOString() })
                    .eq('id', user.id);

                await BackendAnalytics.capture(String(user.privy_id || user.id), 'reengagement_nudge_sent', {
                    user_id: user.id,
                    nudge_type: 'kyc_24h',
                    variant,
                    channels: user.email ? ['push', 'email'] : ['push'],
                });
            }
        } catch (error: any) {
            logger.error('Error sending KYC nudges', { error: error?.message });
        }
    },

    async sendFeatureHighlightNudges() {
        try {
            const cadenceDays = Number(process.env.REENGAGEMENT_FEATURE_NUDGE_INTERVAL_DAYS || '4');
            const dormantStartMs = Date.now() - (2 * DAY_MS);
            const dormantEndMs = Date.now() - (45 * DAY_MS);
            const cadenceCutoffMs = Date.now() - (Math.max(cadenceDays, 2) * DAY_MS);
            const flagKey = process.env.POSTHOG_FEATURE_HIGHLIGHT_NUDGE_FLAG || 'retention_feature_nudge_variant';

            const { data: users, error } = await supabase
                .from('users')
                .select('id, privy_id, email, first_name, last_app_opened_at, last_login, last_feature_nudge_at, last_dormant_nudge_at');

            if (error) {
                logger.error('Failed to fetch users for feature-highlight nudges', { error: error.message });
                return;
            }

            const oneSignalLastSeenMap = await this.getOneSignalLastSeenMap();
            await this.backfillLastAppOpenedAt(users || [], oneSignalLastSeenMap);

            const candidates = (users || []).filter((user: any) => {
                const effectiveActivityAt = this.getEffectiveLastActivityAt(user, oneSignalLastSeenMap);
                const effectiveActivityMs = this.timestampMs(effectiveActivityAt);
                if (effectiveActivityMs === null) return false;

                // We only nudge users who have gone quiet for at least 2 days,
                // but still had activity in the last 45 days.
                if (effectiveActivityMs > dormantStartMs) return false;
                if (effectiveActivityMs < dormantEndMs) return false;

                const lastFeatureNudgeMs = this.timestampMs(user?.last_feature_nudge_at);
                if (lastFeatureNudgeMs !== null && lastFeatureNudgeMs > cadenceCutoffMs) return false;

                // Avoid stacking feature and dormant nudges too tightly.
                const lastDormantNudgeMs = this.timestampMs(user?.last_dormant_nudge_at);
                if (lastDormantNudgeMs !== null && lastDormantNudgeMs > cadenceCutoffMs) return false;

                return true;
            });

            if (candidates.length === 0) {
                logger.debug('No users eligible for feature-highlight nudges');
                return;
            }

            logger.info('Sending feature-highlight nudges', {
                count: candidates.length,
                cadenceDays,
            });

            const copyByVariant: Record<string, {
                pushTitle: string;
                pushBody: string;
                emailSubject: string;
                emailHeading: string;
                emailBody: string;
                ctaText: string;
            }> = {};

            for (const user of candidates) {
                const variant = await BackendAnalytics.getFeatureFlagVariant(
                    String(user.privy_id || user.id),
                    flagKey,
                    'control'
                );

                if (!copyByVariant[variant]) {
                    copyByVariant[variant] = await GeminiService.generateReengagementNudge({
                        kind: 'feature_highlight',
                        variant,
                    });
                }

                const copy = copyByVariant[variant];
                const firstName = String(user.first_name || '').trim();
                const body = firstName ? `${firstName}, ${copy.pushBody}` : copy.pushBody;

                await NotificationService.notifyUser(user.id, {
                    title: copy.pushTitle,
                    body,
                    data: {
                        type: 'feature_highlight_reengagement',
                        route: '/(drawer)/(tabs)',
                        variant,
                    },
                });

                if (user.email) {
                    await EmailService.sendSmartReminder(
                        user.email,
                        copy.emailSubject,
                        `<p class=\"eyebrow\">What to try next</p><h1 class=\"heading\">${copy.emailHeading}</h1><p class=\"description\">${copy.emailBody}</p>`,
                        'https://hedwigbot.xyz',
                        copy.ctaText || 'Explore Hedwig'
                    );
                }

                await supabase.from('notifications').insert({
                    user_id: user.id,
                    type: 'announcement',
                    title: copy.pushTitle,
                    message: body,
                    metadata: {
                        nudge_type: `feature_highlight_every_${cadenceDays}d`,
                        variant,
                    },
                    is_read: false,
                });

                await supabase
                    .from('users')
                    .update({ last_feature_nudge_at: new Date().toISOString() })
                    .eq('id', user.id);

                await BackendAnalytics.capture(String(user.privy_id || user.id), 'reengagement_nudge_sent', {
                    user_id: user.id,
                    nudge_type: `feature_highlight_every_${cadenceDays}d`,
                    variant,
                    channels: user.email ? ['push', 'email'] : ['push'],
                });
            }
        } catch (error: any) {
            logger.error('Error sending feature-highlight nudges', { error: error?.message });
        }
    },

    /**
     * Find all active recurring invoices whose next_due_date is today or in the past,
     * generate an invoice document for each, then advance next_due_date.
     */
    async checkRecurringInvoices() {
        try {
            const today = format(new Date(), 'yyyy-MM-dd');

            const { data: templates, error } = await supabase
                .from('recurring_invoices')
                .select('*')
                .eq('status', 'active')
                .lte('next_due_date', today);

            if (error) { logger.error('Failed to fetch recurring invoices'); return; }
            if (!templates || templates.length === 0) { logger.debug('No recurring invoices due'); return; }

            logger.info('Processing recurring invoices', { count: templates.length });

            const { generateInvoiceFromTemplate } = await import('../routes/recurring');

            for (const template of templates) {
                try {
                    const doc = await generateInvoiceFromTemplate(template, template.user_id);

                    // Push notification to the freelancer
                    await NotificationService.notifyUser(template.user_id, {
                        title: template.auto_send ? 'Recurring invoice sent' : 'Recurring invoice ready',
                        body: template.auto_send
                            ? `Your invoice to ${template.client_name || 'client'} for $${template.amount} has been sent automatically.`
                            : `A draft invoice to ${template.client_name || 'client'} for $${template.amount} is ready to review and send.`,
                        data: { type: 'recurring_invoice_generated', documentId: doc.id, recurringId: template.id },
                    });
                } catch (err) {
                    logger.error('Failed to process recurring invoice template', { templateId: template.id });
                }
            }
        } catch (err) {
            logger.error('Error in checkRecurringInvoices');
        }
    },

    /**
     * Check for upcoming due dates and send reminders
     * - 3 days before due: Send gentle reminder
     * - 1 day before due: Send urgent reminder
     * - On due date: Send final notice
     */
    async checkDueDateReminders() {
        try {
            const today = new Date();
            const threeDaysFromNow = addDays(today, 3);
            const oneDayFromNow = addDays(today, 1);

            // Fetch all unpaid documents with due dates
            const { data: documents, error } = await supabase
                .from('documents')
                .select(`
                    *,
                    user:users(id, first_name, last_name, email)
                `)
                .in('status', ['DRAFT', 'SENT', 'PENDING'])
                .not('content->due_date', 'is', null);

            if (error) {
                logger.error('Failed to fetch documents for due date reminders');
                return;
            }

            if (!documents || documents.length === 0) {
                logger.debug('No documents with due dates found');
                return;
            }

            logger.debug('Checking documents for due date reminders', { count: documents.length });

            for (const doc of documents) {
                await this.processDueDateReminder(doc, today, threeDaysFromNow, oneDayFromNow);
            }

            // Also check milestones
            await this.checkMilestoneDueDates(today, threeDaysFromNow, oneDayFromNow);

        } catch (error) {
            logger.error('Error in checkDueDateReminders');
        }
    },

    async processDueDateReminder(doc: any, today: Date, threeDays: Date, oneDay: Date) {
        try {
            const content = doc.content || {};
            const dueDateStr = content.due_date;
            
            if (!dueDateStr) return;

            const dueDate = parseISO(dueDateStr);
            const recipientEmail = content.recipient_email || content.client_email;
            const clientName = content.client_name || 'Client';
            const userId = doc.user?.id;

            // Check if reminders are enabled
            if (content.reminders_enabled === false) return;

            // Determine reminder type
            let reminderType: '3_day' | '1_day' | 'due_today' | null = null;
            
            if (isSameDay(dueDate, threeDays)) {
                reminderType = '3_day';
            } else if (isSameDay(dueDate, oneDay)) {
                reminderType = '1_day';
            } else if (isSameDay(dueDate, today)) {
                reminderType = 'due_today';
            }

            if (!reminderType) return;

            // Check if we already sent this type of reminder
            const reminderKey = `reminder_${reminderType}_sent`;
            if (content[reminderKey]) return;

            logger.debug('Sending reminder', { reminderType });

            const senderName = `${doc.user?.first_name || ''} ${doc.user?.last_name || ''}`.trim() || 'Freelancer';
            const docType = doc.type === 'INVOICE' ? 'invoice' : 'payment';
            const daysUntilDue = differenceInDays(dueDate, today);

            // Send reminder to CLIENT via email
            if (recipientEmail) {
                const urgency = reminderType === 'due_today' ? 'urgent' : reminderType === '1_day' ? 'important' : 'friendly';
                const subject = reminderType === 'due_today' 
                    ? `⚠️ Payment Due Today - ${doc.title || docType}`
                    : `Reminder: ${doc.title || docType} due ${reminderType === '1_day' ? 'tomorrow' : 'in 3 days'}`;
                
                const body = reminderType === 'due_today'
                    ? `Hi ${clientName},\n\nThis is a reminder that your ${docType} for ${doc.amount} USDC from ${senderName} is due today. Please complete the payment at your earliest convenience.\n\nThank you!`
                    : `Hi ${clientName},\n\nJust a ${urgency} reminder that you have a ${docType} for ${doc.amount} USDC from ${senderName} due ${daysUntilDue === 1 ? 'tomorrow' : `in ${daysUntilDue} days`}.\n\nBest regards`;

                const actionLink = doc.type === 'INVOICE'
                    ? `https://hedwig.app/invoice/${doc.id}`
                    : `https://hedwig.app/pay/${doc.id}`;

                await EmailService.sendSmartReminder(
                    recipientEmail,
                    subject,
                    body,
                    actionLink,
                    'Pay Now'
                );
            }

            // Send notification to FREELANCER via push
            if (userId) {
                const title = reminderType === 'due_today' 
                    ? `⚠️ ${docType} Due Today!`
                    : `📅 ${docType} due ${daysUntilDue === 1 ? 'tomorrow' : `in ${daysUntilDue} days`}`;
                
                await NotificationService.notifyUser(userId, {
                    title,
                    body: `${clientName} has a ${docType} for $${doc.amount} due${reminderType === 'due_today' ? ' today' : ''}`,
                    data: { type: 'due_date_reminder', documentId: doc.id, reminderType }
                });
            }

            // Mark reminder as sent
            await supabase
                .from('documents')
                .update({
                    content: {
                        ...content,
                        [reminderKey]: new Date().toISOString()
                    }
                })
                .eq('id', doc.id);

            logger.info('Reminder sent');

        } catch (error) {
            logger.error('Failed to process due date reminder');
        }
    },

    async checkMilestoneDueDates(today: Date, threeDays: Date, oneDay: Date) {
        try {
            const { data: milestones, error } = await supabase
                .from('milestones')
                .select(`
                    *,
                    project:projects(
                        id, name, user_id,
                        user:users(id, first_name, last_name),
                        client:clients(id, name, email)
                    )
                `)
                .in('status', ['pending', 'invoiced'])
                .not('due_date', 'is', null);

            if (error || !milestones) return;

            for (const milestone of milestones) {
                const dueDate = parseISO(milestone.due_date);
                const userId = milestone.project?.user_id;
                const clientEmail = milestone.project?.client?.email;
                const clientName = milestone.project?.client?.name || 'Client';

                let reminderType: '3_day' | '1_day' | 'due_today' | null = null;
                
                if (isSameDay(dueDate, threeDays)) reminderType = '3_day';
                else if (isSameDay(dueDate, oneDay)) reminderType = '1_day';
                else if (isSameDay(dueDate, today)) reminderType = 'due_today';

                if (!reminderType) continue;

                // Notify freelancer
                if (userId) {
                    const daysUntilDue = differenceInDays(dueDate, today);
                    await NotificationService.notifyUser(userId, {
                        title: reminderType === 'due_today' 
                            ? `⚠️ Milestone Due Today!`
                            : `📅 Milestone due ${daysUntilDue === 1 ? 'tomorrow' : `in ${daysUntilDue} days`}`,
                        body: `"${milestone.title}" for ${clientName} - $${milestone.amount}`,
                        data: { type: 'milestone_reminder', milestoneId: milestone.id, reminderType }
                    });
                }

                // Notify client via email
                if (clientEmail) {
                    const daysUntilDue = differenceInDays(dueDate, today);
                    const subject = reminderType === 'due_today'
                        ? `⚠️ Milestone Due Today: ${milestone.title}`
                        : `Reminder: Milestone "${milestone.title}" due ${daysUntilDue === 1 ? 'tomorrow' : `in ${daysUntilDue} days`}`;

                    await EmailService.sendSmartReminder(
                        clientEmail,
                        subject,
                        `Hi ${clientName},\n\nThe milestone "${milestone.title}" for ${milestone.amount} USDC is ${reminderType === 'due_today' ? 'due today' : `due ${daysUntilDue === 1 ? 'tomorrow' : `in ${daysUntilDue} days`}`}.`,
                        'https://hedwig.app',
                        'View Details'
                    );
                }
            }
        } catch (error) {
            logger.error('Error checking milestone due dates');
        }
    },

    async checkAndRemind() {
        try {
            // Fetch documents older than 7 days that are not paid
            const { data: documents, error } = await supabase
                .from('documents')
                .select(`
                    *,
                    user:users(
                        first_name,
                        last_name,
                        email
                    )
                `)
                .in('status', ['SENT', 'DRAFT'])
                .neq('type', 'CONTRACT')
                .lt('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()); // Older than 7 days

            if (error) {
                logger.error('Failed to fetch documents');
                return;
            }

            if (!documents || documents.length === 0) {
                logger.debug('No overdue documents found');
                return;
            }

            logger.debug('Found potentially overdue documents', { count: documents.length });

            for (const doc of documents) {
                await this.processDocumentReminder(doc);
            }

        } catch (error) {
            logger.error('Error in checkAndRemind');
        }
    },

    async processDocumentReminder(doc: any, isManual: boolean = false): Promise<{ sent: boolean; reason?: string }> {
        try {
            const content = doc.content || {};
            const recipientEmail = content.recipient_email || content.client_email;
            const clientName = content.client_name || 'Client';

            // Check if reminders are enabled for this document (default: true for backwards compatibility)
            const remindersEnabled = content.reminders_enabled !== false;
            // If manual, we ignore the enabled flag (user explicitly requested it)
            if (!remindersEnabled && !isManual) {
                logger.debug('Skipping: Reminders disabled');
                return { sent: false, reason: 'Reminders disabled' };
            }

            // If no recipient email, we can't send a reminder
            if (!recipientEmail) {
                logger.debug('Skipping: No recipient email');
                return { sent: false, reason: 'No recipient email' };
            }

            // Check if we already sent a reminder recently (every 7 days)
            // Skip this check for manual reminders
            if (!isManual) {
                const lastReminded = content.last_reminder_sent_at;
                if (lastReminded) {
                    const daysSinceReminder = differenceInDays(new Date(), parseISO(lastReminded));
                    if (daysSinceReminder < 7) {
                        logger.debug('Skipping: Recently reminded');
                        return { sent: false, reason: 'Recently reminded' };
                    }
                }
            }

            // Calculate days since creation
            const createdDate = parseISO(doc.created_at);
            const daysSinceCreation = differenceInDays(new Date(), createdDate);

            // Skip age check for manual reminders
            if (!isManual && daysSinceCreation < 7) {
                // Not old enough for a reminder
                return { sent: false, reason: 'Document too new' };
            }

            logger.debug('Generating reminder', { daysSinceCreation, isManual });

            const senderName = `${doc.user?.first_name || 'Hedwig'} ${doc.user?.last_name || ''}`.trim();

            // Generate AI Content
            const aiResponse = await GeminiService.generatePaymentReminder(
                clientName,
                `${doc.amount} ${doc.currency || 'USDC'}`,
                daysSinceCreation,
                doc.type === 'INVOICE' ? 'Invoice' : 'Payment Link',
                doc.title,
                senderName
            );

            // Determine action link
            const actionLink = doc.type === 'INVOICE'
                ? `https://hedwig.app/invoice/${doc.id}`
                : `https://hedwig.app/pay/${doc.id}`; // Assuming pay link format

            // Send Email
            const sent = await EmailService.sendSmartReminder(
                recipientEmail,
                aiResponse.subject,
                aiResponse.body,
                actionLink,
                "Pay Now"
            );

            if (sent) {
                // Update document with last_reminder_sent_at
                await supabase
                    .from('documents')
                    .update({
                        content: {
                            ...content,
                            last_reminder_sent_at: new Date().toISOString()
                        }
                    })
                    .eq('id', doc.id);

                logger.info('Reminder sent and recorded');
                return { sent: true };
            } else {
                return { sent: false, reason: 'Email service failed' };
            }

        } catch (error) {
            logger.error('Failed to process document', { error: error instanceof Error ? error.message : 'Unknown' });
            return { sent: false, reason: 'Internal error' };
        }
    }
};
