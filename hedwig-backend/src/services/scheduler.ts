import cron from 'node-cron';
import { supabase } from '../lib/supabase';
import { GeminiService } from './gemini';
import { EmailService } from './email';
import NotificationService from './notifications';
import BackendAnalytics from './analytics';
import { PaycrestService } from './paycrest';
import { differenceInDays, parseISO, addDays, isSameDay, format } from 'date-fns';
import { createLogger } from '../utils/logger';
import { withLock } from '../utils/distributedLock';
import { generateDailyBrief, generateWeeklySummary } from './agent/assistant-runtime';

const logger = createLogger('Scheduler');

// Max users to process in parallel per scheduler run.
// Prevents a single Cloud Run instance from opening hundreds of DB/API connections at once.
const SCHEDULER_CONCURRENCY = Number(process.env.SCHEDULER_CONCURRENCY || '5');
const SCHEDULER_MAX_USERS_PER_RUN = Number(process.env.SCHEDULER_MAX_USERS_PER_RUN || '5000');
const SCHEDULER_MAX_DOCUMENTS_PER_RUN = Number(process.env.SCHEDULER_MAX_DOCUMENTS_PER_RUN || '5000');
const SCHEDULER_MAX_MILESTONES_PER_RUN = Number(process.env.SCHEDULER_MAX_MILESTONES_PER_RUN || '5000');
const SCHEDULER_ONESIGNAL_LAST_SEEN_LIMIT = Number(process.env.SCHEDULER_ONESIGNAL_LAST_SEEN_LIMIT || '10000');

async function processInBatches<T>(
    items: T[],
    concurrency: number,
    fn: (item: T) => Promise<void>,
): Promise<void> {
    for (let i = 0; i < items.length; i += concurrency) {
        await Promise.all(items.slice(i, i + concurrency).map(fn));
    }
}

const DAY_MS = 24 * 60 * 60 * 1000;

function formatUsdBrief(value: number): string {
    if (!Number.isFinite(value)) return '$0.00';
    return value >= 1000 ? `$${(value / 1000).toFixed(1)}k` : `$${value.toFixed(2)}`;
}

function currentUtcDateKey(): string {
    return new Date().toISOString().slice(0, 10);
}

function currentUtcWeekKey(): string {
    const now = new Date();
    const day = now.getUTCDay();
    const diffToMonday = (day + 6) % 7;
    const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diffToMonday));
    return monday.toISOString().slice(0, 10);
}

export const SchedulerService = {
    initScheduler() {
        // When SCHEDULER_MODE=cloud, cron jobs are driven by Cloud Scheduler HTTP calls
        // (see the /internal/scheduler/:job route). Skip in-process cron to avoid duplicates.
        if (process.env.SCHEDULER_MODE === 'cloud') {
            logger.info('Scheduler mode: cloud (driven by GCP Cloud Scheduler HTTP calls)');
            return;
        }

        logger.info('Initializing in-process Scheduler (with distributed lock for multi-instance safety)');

        // Lock TTL slightly shorter than the cron interval so the lock expires
        // before the next scheduled run even if the holder crashed.
        const dailyLockTtl = 23 * 60 * 60;     // 23 h
        const hourlyLockTtl = 50 * 60;           // 50 min

        cron.schedule('0 10 * * *', () => {
            withLock('check-and-remind', dailyLockTtl, () => this.checkAndRemind())
                .catch((e) => logger.error('check-and-remind lock error', { error: e?.message }));
        });

        cron.schedule('0 9 * * *', () => {
            withLock('due-date-reminders', dailyLockTtl, () => this.checkDueDateReminders())
                .catch((e) => logger.error('due-date-reminders lock error', { error: e?.message }));
        });

        cron.schedule('30 3 * * *', () => {
            withLock('token-cleanup', dailyLockTtl, async () => { await NotificationService.cleanupExpoDeviceTokens(); })
                .catch((e) => logger.error('token-cleanup lock error', { error: e?.message }));
        });

        cron.schedule('0 8 * * *', () => {
            withLock('recurring-invoices', dailyLockTtl, () => this.checkRecurringInvoices())
                .catch((e) => logger.error('recurring-invoices lock error', { error: e?.message }));
        });

        cron.schedule('30 8 * * *', () => {
            withLock('assistant-daily-briefs', dailyLockTtl, () => this.sendAssistantDailyBriefs())
                .catch((e) => logger.error('assistant-daily-briefs lock error', { error: e?.message }));
        });

        cron.schedule('0 9 * * 1', () => {
            withLock('assistant-weekly-summaries', 6 * 24 * 60 * 60, () => this.sendAssistantWeeklySummaries())
                .catch((e) => logger.error('assistant-weekly-summaries lock error', { error: e?.message }));
        });

        cron.schedule('15 * * * *', () => {
            withLock('dormant-nudges', hourlyLockTtl, () => this.sendDormantUserNudges())
                .catch((e) => logger.error('dormant-nudges lock error', { error: e?.message }));
        });

        cron.schedule('20 * * * *', () => {
            withLock('kyc-nudges', hourlyLockTtl, () => this.sendKycReminderNudges())
                .catch((e) => logger.error('kyc-nudges lock error', { error: e?.message }));
        });

        cron.schedule('25 * * * *', () => {
            withLock('feature-nudges', hourlyLockTtl, () => this.sendFeatureHighlightNudges())
                .catch((e) => logger.error('feature-nudges lock error', { error: e?.message }));
        });

        // Payout rate nudges disabled — paycrest rate updates paused
        // cron.schedule('35 * * * *', () => {
        //     withLock('paycrest-rate-nudges', hourlyLockTtl, () => this.sendPaycrestRateNudges())
        //         .catch((e) => logger.error('paycrest-rate-nudges lock error', { error: e?.message }));
        // });

        cron.schedule('45 * * * *', () => {
            withLock('onboarding-nudges', hourlyLockTtl, () => this.sendOnboardingIncompleteNudges())
                .catch((e) => logger.error('onboarding-nudges lock error', { error: e?.message }));
        });

        // Invoice viewed but unpaid — hourly follow-up nudge to freelancer
        cron.schedule('5 * * * *', () => {
            withLock('viewed-followup-nudges', hourlyLockTtl, () => this.sendViewedDocumentFollowUpNudges())
                .catch((e) => logger.error('viewed-followup-nudges lock error', { error: e?.message }));
        });

        // Client reactivation — daily at 11am
        cron.schedule('0 11 * * *', () => {
            withLock('client-reactivation-nudges', dailyLockTtl, () => this.sendClientReactivationNudges())
                .catch((e) => logger.error('client-reactivation-nudges lock error', { error: e?.message }));
        });

        // Recurring invoice upsell — daily at 2pm
        cron.schedule('0 14 * * *', () => {
            withLock('recurring-upsell-nudges', dailyLockTtl, () => this.sendRecurringInvoiceUpsellNudges())
                .catch((e) => logger.error('recurring-upsell-nudges lock error', { error: e?.message }));
        });

        // Integration teaser (Gmail) — every Monday at 3am
        cron.schedule('0 3 * * 1', () => {
            withLock('integration-teaser-nudges', 6 * 24 * 60 * 60, () => this.sendIntegrationTeaserNudges())
                .catch((e) => logger.error('integration-teaser-nudges lock error', { error: e?.message }));
        });

        // Payment link unshared boost — hourly at :30
        cron.schedule('30 * * * *', () => {
            withLock('payment-link-boost-nudges', hourlyLockTtl, () => this.sendPaymentLinkBoostNudges())
                .catch((e) => logger.error('payment-link-boost-nudges lock error', { error: e?.message }));
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
            .limit(SCHEDULER_ONESIGNAL_LAST_SEEN_LIMIT);

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

    async hasAssistantNotification(userId: string, assistantType: string, periodKey: string): Promise<boolean> {
        const { data, error } = await supabase
            .from('notifications')
            .select('id')
            .eq('user_id', userId)
            .eq('type', 'assistant')
            .eq('metadata->>assistant_type', assistantType)
            .eq('metadata->>period_key', periodKey)
            .limit(1);

        if (error) {
            logger.warn('Failed to check assistant notification duplicate', {
                userId,
                assistantType,
                periodKey,
                error: error.message,
            });
            return false;
        }

        return Boolean(data && data.length > 0);
    },

    async sendAssistantDailyBriefs() {
        try {
            const periodKey = currentUtcDateKey();
            const { data: users, error } = await supabase
                .from('users')
                .select('id, email, first_name, asst_daily_brief_email')
                .eq('asst_daily_brief_email', true)
                .limit(SCHEDULER_MAX_USERS_PER_RUN);

            if (error) {
                logger.error('Failed to fetch users for assistant daily briefs', { error: error.message });
                return;
            }

            const candidates = users || [];
            if (candidates.length === 0) {
                logger.debug('No users opted in for assistant daily briefs');
                return;
            }

            await processInBatches(candidates, SCHEDULER_CONCURRENCY, async (user: any) => {
                const userId = String(user.id || '');
                if (!userId) return;
                if (await this.hasAssistantNotification(userId, 'daily_brief', periodKey)) return;

                try {
                    const brief = await generateDailyBrief(userId);
                    const title = 'Your daily Hedwig brief';
                    const message = brief.summary || 'Your workspace brief is ready.';

                    await supabase.from('notifications').insert({
                        user_id: userId,
                        type: 'assistant',
                        title,
                        message,
                        metadata: {
                            assistant_type: 'daily_brief',
                            period_key: periodKey,
                            generated_at: brief.generatedAt,
                            metrics: brief.metrics,
                            highlights: brief.highlights,
                        },
                        is_read: false,
                    });

                    await NotificationService.notifyUser(userId, {
                        title,
                        body: message,
                        data: { type: 'assistant_daily_brief', periodKey },
                    }).catch((err) => logger.warn('Daily brief push failed', { userId, error: err?.message }));

                    if (user.email) {
                        await EmailService.sendAssistantBriefEmail({
                            to: user.email,
                            subject: 'Your daily Hedwig brief',
                            eyebrow: 'Daily brief',
                            heading: user.first_name ? `Good morning, ${user.first_name}` : 'Good morning',
                            summary: message,
                            highlights: brief.highlights,
                            stats: [
                                { label: 'Unpaid', value: `${brief.metrics.unpaidCount}` },
                                { label: 'Overdue', value: `${brief.metrics.overdueCount}` },
                                { label: 'Outstanding', value: formatUsdBrief(brief.metrics.unpaidAmountUsd) },
                                { label: 'Deadlines', value: `${brief.metrics.upcomingDeadlines}` },
                            ],
                            ctaPath: '/dashboard',
                        });
                    }
                } catch (err: any) {
                    logger.error('Failed to send assistant daily brief', { userId, error: err?.message });
                }
            });

            logger.info('Assistant daily briefs processed', { count: candidates.length });
        } catch (error: any) {
            logger.error('Assistant daily briefs job failed', { error: error?.message });
        }
    },

    async sendAssistantWeeklySummaries() {
        try {
            const periodKey = currentUtcWeekKey();
            const { data: users, error } = await supabase
                .from('users')
                .select('id, email, first_name, asst_weekly_summary_email')
                .eq('asst_weekly_summary_email', true)
                .limit(SCHEDULER_MAX_USERS_PER_RUN);

            if (error) {
                logger.error('Failed to fetch users for assistant weekly summaries', { error: error.message });
                return;
            }

            const candidates = users || [];
            if (candidates.length === 0) {
                logger.debug('No users opted in for assistant weekly summaries');
                return;
            }

            await processInBatches(candidates, SCHEDULER_CONCURRENCY, async (user: any) => {
                const userId = String(user.id || '');
                if (!userId) return;
                if (await this.hasAssistantNotification(userId, 'weekly_summary', periodKey)) return;

                try {
                    const summary = await generateWeeklySummary(userId);
                    const title = 'Your weekly Hedwig summary';
                    const topClient = summary.topClients?.[0];
                    const message = summary.aiInsight || `${formatUsdBrief(summary.revenueUsd)} collected this week${topClient ? `, led by ${topClient.name}` : ''}.`;

                    await supabase.from('notifications').insert({
                        user_id: userId,
                        type: 'assistant',
                        title,
                        message,
                        metadata: {
                            assistant_type: 'weekly_summary',
                            period_key: periodKey,
                            week_label: summary.weekLabel,
                            revenue_usd: summary.revenueUsd,
                            top_clients: summary.topClients,
                        },
                        is_read: false,
                    });

                    await NotificationService.notifyUser(userId, {
                        title,
                        body: message,
                        data: { type: 'assistant_weekly_summary', periodKey },
                    }).catch((err) => logger.warn('Weekly summary push failed', { userId, error: err?.message }));

                    if (user.email) {
                        await EmailService.sendAssistantBriefEmail({
                            to: user.email,
                            subject: 'Your weekly Hedwig summary',
                            eyebrow: 'Weekly summary',
                            heading: summary.weekLabel || 'Your week in Hedwig',
                            summary: message,
                            highlights: topClient ? [`Top client: ${topClient.name} (${formatUsdBrief(topClient.amountUsd)})`] : [],
                            stats: [
                                { label: 'Revenue', value: formatUsdBrief(summary.revenueUsd) },
                                { label: 'Paid invoices', value: `${summary.paidInvoiceCount}` },
                                { label: 'New invoices', value: `${summary.newInvoiceCount}` },
                                { label: 'Overdue', value: `${summary.overdueCount}` },
                            ],
                            ctaPath: '/dashboard',
                        });
                    }
                } catch (err: any) {
                    logger.error('Failed to send assistant weekly summary', { userId, error: err?.message });
                }
            });

            logger.info('Assistant weekly summaries processed', { count: candidates.length });
        } catch (error: any) {
            logger.error('Assistant weekly summaries job failed', { error: error?.message });
        }
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
                .select('id, privy_id, email, first_name, last_name, last_app_opened_at, last_dormant_nudge_at, last_login')
                .limit(SCHEDULER_MAX_USERS_PER_RUN);

            if (error) {
                logger.error('Failed to fetch dormant users', { error: error.message });
                return;
            }
            if ((users || []).length >= SCHEDULER_MAX_USERS_PER_RUN) {
                logger.warn('Dormant user nudge query reached max per run cap', { cap: SCHEDULER_MAX_USERS_PER_RUN });
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

            await processInBatches(candidates, SCHEDULER_CONCURRENCY, async (user) => {
                try {
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
                        metadata: { nudge_type: 'dormant_3day' },
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
                } catch (err: any) {
                    logger.error('Failed to process dormant nudge for user', { userId: user.id, error: err?.message });
                }
            });
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
                .in('kyc_status', ['not_started', 'pending', 'retry_required'])
                .limit(SCHEDULER_MAX_USERS_PER_RUN);

            if (error) {
                logger.error('Failed to fetch KYC nudge users', { error: error.message });
                return;
            }
            if ((users || []).length >= SCHEDULER_MAX_USERS_PER_RUN) {
                logger.warn('KYC nudge query reached max per run cap', { cap: SCHEDULER_MAX_USERS_PER_RUN });
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

            await processInBatches(candidates, SCHEDULER_CONCURRENCY, async (user) => {
                try {
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
                        data: { type: 'kyc_nudge_24h', route: '/settings/index', variant },
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
                        metadata: { nudge_type: 'kyc_24h', variant },
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
                } catch (err: any) {
                    logger.error('Failed to process KYC nudge for user', { userId: user.id, error: err?.message });
                }
            });
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
                .select('id, privy_id, email, first_name, last_app_opened_at, last_login, last_feature_nudge_at, last_dormant_nudge_at')
                .limit(SCHEDULER_MAX_USERS_PER_RUN);

            if (error) {
                logger.error('Failed to fetch users for feature-highlight nudges', { error: error.message });
                return;
            }
            if ((users || []).length >= SCHEDULER_MAX_USERS_PER_RUN) {
                logger.warn('Feature nudge query reached max per run cap', { cap: SCHEDULER_MAX_USERS_PER_RUN });
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

            await processInBatches(candidates, SCHEDULER_CONCURRENCY, async (user) => {
                try {
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
                        data: { type: 'feature_highlight_reengagement', route: '/(drawer)/(tabs)', variant },
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
                        metadata: { nudge_type: `feature_highlight_every_${cadenceDays}d`, variant },
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
                } catch (err: any) {
                    logger.error('Failed to process feature nudge for user', { userId: user.id, error: err?.message });
                }
            });
        } catch (error: any) {
            logger.error('Error sending feature-highlight nudges', { error: error?.message });
        }
    },

    async sendPaycrestRateNudges() {
        try {
            const cadenceDays = Math.max(Number(process.env.PAYCREST_RATE_NUDGE_INTERVAL_DAYS || '2'), 1);
            const activeLookbackDays = Math.max(Number(process.env.PAYCREST_RATE_ACTIVE_LOOKBACK_DAYS || '30'), 1);
            const cadenceCutoffMs = Date.now() - (cadenceDays * DAY_MS);
            const activeCutoffMs = Date.now() - (activeLookbackDays * DAY_MS);
            const baseToken = String(process.env.PAYCREST_RATE_TOKEN || 'USDC').trim().toUpperCase() || 'USDC';
            const baseNetwork = String(process.env.PAYCREST_RATE_NETWORK || 'base').trim() || 'base';
            const baseAmount = Math.max(Number(process.env.PAYCREST_RATE_USD_AMOUNT || '1') || 1, 1);
            const ghsSymbol = 'GH₵';
            const ngnSymbol = '₦';

            const { data: users, error } = await supabase
                .from('users')
                .select('id, privy_id, email, first_name, last_app_opened_at, last_login, last_rate_nudge_at')
                .limit(SCHEDULER_MAX_USERS_PER_RUN);

            if (error) {
                logger.error('Failed to fetch users for Paycrest rate nudges', { error: error.message });
                return;
            }
            if ((users || []).length >= SCHEDULER_MAX_USERS_PER_RUN) {
                logger.warn('Paycrest rate nudge query reached max per run cap', { cap: SCHEDULER_MAX_USERS_PER_RUN });
            }

            const oneSignalLastSeenMap = await this.getOneSignalLastSeenMap();
            await this.backfillLastAppOpenedAt(users || [], oneSignalLastSeenMap);

            const candidates = (users || []).filter((user: any) => {
                const effectiveActivityAt = this.getEffectiveLastActivityAt(user, oneSignalLastSeenMap);
                const effectiveActivityMs = this.timestampMs(effectiveActivityAt);
                if (effectiveActivityMs === null) return false;
                if (effectiveActivityMs < activeCutoffMs) return false;

                const lastRateNudgeMs = this.timestampMs(user?.last_rate_nudge_at);
                if (lastRateNudgeMs !== null && lastRateNudgeMs > cadenceCutoffMs) return false;
                return true;
            });

            if (candidates.length === 0) {
                logger.debug('No users eligible for Paycrest rate nudges');
                return;
            }

            // Fetch each rate independently — if one currency is unsupported by Paycrest
            // we still send a nudge for the currencies that are available.
            const [ngnResult, ghsResult] = await Promise.allSettled([
                PaycrestService.getExchangeRate(baseToken, baseAmount, 'NGN', baseNetwork),
                PaycrestService.getExchangeRate(baseToken, baseAmount, 'GHS', baseNetwork),
            ]);

            const ngnRateNum = ngnResult.status === 'fulfilled'
                ? Number.parseFloat(String(ngnResult.value || '0'))
                : 0;
            const ghsRateNum = ghsResult.status === 'fulfilled'
                ? Number.parseFloat(String(ghsResult.value || '0'))
                : 0;

            if (ngnResult.status === 'rejected') {
                logger.warn('Paycrest NGN rate unavailable', { error: ngnResult.reason?.message });
            }
            if (ghsResult.status === 'rejected') {
                logger.warn('Paycrest GHS rate unavailable', { error: ghsResult.reason?.message });
            }

            const hasNgn = Number.isFinite(ngnRateNum) && ngnRateNum > 0;
            const hasGhs = Number.isFinite(ghsRateNum) && ghsRateNum > 0;

            if (!hasNgn && !hasGhs) {
                logger.warn('Skipping Paycrest rate nudges — no supported rates available');
                return;
            }

            const fmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
            const rateParts: string[] = [];
            const emailRateParts: string[] = [];
            const emailHtmlParts: string[] = [];
            if (hasNgn) {
                const ngnRate = fmt.format(ngnRateNum);
                rateParts.push(`${ngnSymbol}${ngnRate}`);
                emailRateParts.push(`NGN ${ngnSymbol}${ngnRate}`);
                emailHtmlParts.push(`<strong style="color:#181d27;">${ngnSymbol}${ngnRate}</strong> (NGN)`);
            }
            if (hasGhs) {
                const ghsRate = fmt.format(ghsRateNum);
                rateParts.push(`${ghsSymbol}${ghsRate}`);
                emailRateParts.push(`GHS ${ghsSymbol}${ghsRate}`);
                emailHtmlParts.push(`<strong style="color:#181d27;">${ghsSymbol}${ghsRate}</strong> (GHS)`);
            }

            const title = 'USD rates update';
            const body = `${baseAmount} USD ≈ ${rateParts.join(' · ')}`;
            const emailSubject = `USD rates: ${emailRateParts.join(' · ')}`;
            const emailHtml = `<p class="eyebrow">Market update</p><h1 class="heading">Latest USD payout rates</h1><p class="description">${baseAmount} USD is currently around ${emailHtmlParts.join(' and ')}</p><p class="description">Use Hedwig to create payouts with the latest pricing.</p>`;

            logger.info('Sending Paycrest rate nudges', {
                count: candidates.length,
                cadenceDays,
                activeLookbackDays,
                baseToken,
                baseNetwork,
                baseAmount,
                ngnRateNum,
                ghsRateNum,
            });

            await processInBatches(candidates, SCHEDULER_CONCURRENCY, async (user) => {
                try {
                    const firstName = String(user.first_name || '').trim();
                    const personalizedBody = firstName ? `${firstName}, ${body}` : body;

                    await NotificationService.notifyUser(user.id, {
                        title,
                        body: personalizedBody,
                        data: {
                            type: 'paycrest_rate_update',
                            route: '/offramp-history/create',
                            source: 'paycrest',
                            baseAmount,
                            ngnRate: ngnRateNum,
                            ghsRate: ghsRateNum,
                        },
                    });

                    if (user.email) {
                        await EmailService.sendSmartReminder(
                            user.email,
                            emailSubject,
                            emailHtml,
                            'https://hedwigbot.xyz/offramp-history/create',
                            'Open Hedwig'
                        );
                    }

                    await supabase.from('notifications').insert({
                        user_id: user.id,
                        type: 'announcement',
                        title,
                        message: personalizedBody,
                        metadata: {
                            nudge_type: `paycrest_rate_every_${cadenceDays}d`,
                            source: 'paycrest',
                            baseAmount,
                            ngnRate: ngnRateNum,
                            ghsRate: ghsRateNum,
                            token: baseToken,
                            network: baseNetwork,
                        },
                        is_read: false,
                    });

                    await supabase
                        .from('users')
                        .update({ last_rate_nudge_at: new Date().toISOString() })
                        .eq('id', user.id);

                    await BackendAnalytics.capture(String(user.privy_id || user.id), 'rate_nudge_sent', {
                        user_id: user.id,
                        cadence_days: cadenceDays,
                        channels: user.email ? ['push', 'email'] : ['push'],
                        source: 'paycrest',
                        base_amount: baseAmount,
                        ngn_rate: ngnRateNum,
                        ghs_rate: ghsRateNum,
                    });
                } catch (err: any) {
                    logger.error('Failed to process Paycrest rate nudge for user', { userId: user.id, error: err?.message });
                }
            });
        } catch (error: any) {
            logger.error('Error sending Paycrest rate nudges', { error: error?.message });
        }
    },

    /**
     * Nudge users who signed up but haven't completed any key action yet:
     * no clients created and no invoices/payment links sent.
     *
     * Timing:
     *  - First nudge: 24 h after registration
     *  - Second nudge (if still inactive): 72 h after registration
     *  - No further nudges after 7 days
     *
     * Requires DB column: users.last_onboarding_nudge_at (timestamptz, nullable)
     * Migration: ALTER TABLE users ADD COLUMN IF NOT EXISTS last_onboarding_nudge_at timestamptz;
     */
    async sendOnboardingIncompleteNudges() {
        try {
            const now = Date.now();
            const ONE_HOUR_MS = 60 * 60 * 1000;
            const ONE_DAY_MS = 24 * ONE_HOUR_MS;
            const THREE_DAYS_MS = 3 * ONE_DAY_MS;
            const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;
            const NUDGE_CADENCE_MS = 48 * ONE_HOUR_MS; // min gap between nudges per user

            // Users who registered between 1 h and 7 days ago — still in the onboarding window
            const windowStart = new Date(now - SEVEN_DAYS_MS).toISOString();
            const windowEnd   = new Date(now - ONE_HOUR_MS).toISOString();

            const { data: users, error } = await supabase
                .from('users')
                .select('id, privy_id, email, first_name, created_at, last_login, last_onboarding_nudge_at')
                .gte('created_at', windowStart)
                .lte('created_at', windowEnd)
                .limit(SCHEDULER_MAX_USERS_PER_RUN);

            if (error) {
                logger.error('Failed to fetch users for onboarding nudges', { error: error.message });
                return;
            }
            if (!users || users.length === 0) {
                logger.debug('No users in onboarding window');
                return;
            }

            // Filter: skip users who were nudged recently
            const eligible = users.filter((user: any) => {
                const lastNudgeMs = this.timestampMs(user.last_onboarding_nudge_at);
                if (lastNudgeMs !== null && (now - lastNudgeMs) < NUDGE_CADENCE_MS) return false;
                return true;
            });

            if (eligible.length === 0) {
                logger.debug('No users eligible for onboarding nudges after cadence filter');
                return;
            }

            // For each candidate, check if they have any clients or documents
            const inactive: any[] = [];
            await processInBatches(eligible, SCHEDULER_CONCURRENCY, async (user) => {
                const [{ count: clientCount }, { count: docCount }] = await Promise.all([
                    supabase.from('clients').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
                    supabase.from('documents').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
                ]);
                if ((clientCount ?? 0) === 0 && (docCount ?? 0) === 0) {
                    inactive.push(user);
                }
            });

            if (inactive.length === 0) {
                logger.debug('All onboarding-window users have activity — no nudges needed');
                return;
            }

            logger.info('Sending onboarding incomplete nudges', { count: inactive.length });

            await processInBatches(inactive, SCHEDULER_CONCURRENCY, async (user) => {
                try {
                    const firstName = String(user.first_name || '').trim();
                    const ageMs = now - (this.timestampMs(user.created_at) ?? now);
                    const isSecondNudge = ageMs > THREE_DAYS_MS;

                    const pushTitle = isSecondNudge
                        ? 'Your workspace is waiting'
                        : 'Get started with Hedwig';
                    const pushBody = isSecondNudge
                        ? (firstName ? `${firstName}, you're one step away from sending your first invoice.` : 'You\'re one step away from sending your first invoice.')
                        : (firstName ? `${firstName}, add a client and send your first invoice in minutes.` : 'Add a client and send your first invoice in minutes.');

                    // Push notification
                    await NotificationService.notifyUser(user.id, {
                        title: pushTitle,
                        body: pushBody,
                        data: {
                            type: 'onboarding_incomplete',
                            route: '/(drawer)/(tabs)',
                        },
                    });

                    // Email
                    if (user.email) {
                        await EmailService.sendOnboardingIncompleteEmail({
                            to: user.email,
                            firstName,
                            isSecondNudge,
                        });
                    }

                    // In-app notification
                    await supabase.from('notifications').insert({
                        user_id: user.id,
                        type: 'announcement',
                        title: pushTitle,
                        message: pushBody,
                        metadata: { nudge_type: 'onboarding_incomplete', nudge_number: isSecondNudge ? 2 : 1 },
                        is_read: false,
                    });

                    // Record nudge timestamp
                    await supabase
                        .from('users')
                        .update({ last_onboarding_nudge_at: new Date().toISOString() })
                        .eq('id', user.id);

                    await BackendAnalytics.capture(String(user.privy_id || user.id), 'onboarding_nudge_sent', {
                        user_id: user.id,
                        nudge_number: isSecondNudge ? 2 : 1,
                        channels: user.email ? ['push', 'email', 'in_app'] : ['push', 'in_app'],
                    });
                } catch (err: any) {
                    logger.error('Failed to send onboarding nudge for user', { userId: user.id, error: err?.message });
                }
            });
        } catch (error: any) {
            logger.error('Error in sendOnboardingIncompleteNudges', { error: error?.message });
        }
    },

    /**
     * Nudge freelancers when a client opened their invoice or payment link but hasn't paid yet.
     * Fires 4–48h after the first view. Tracked via content.follow_up_nudge_sent.
     */
    async sendViewedDocumentFollowUpNudges() {
        try {
            const now = Date.now();
            const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
            const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

            const { data: docs, error } = await supabase
                .from('documents')
                .select('id, user_id, type, title, amount, currency, content')
                .eq('status', 'VIEWED')
                .in('type', ['INVOICE', 'PAYMENT_LINK'])
                .limit(SCHEDULER_MAX_DOCUMENTS_PER_RUN);

            if (error) {
                logger.error('Failed to fetch viewed documents for follow-up nudges', { error: error.message });
                return;
            }
            if (!docs || docs.length === 0) return;

            // Filter: viewed in the 4–48h window, not yet nudged
            const eligible = (docs as any[]).filter((doc) => {
                const viewedAt = (doc.content as any)?.viewed_at;
                if (!viewedAt) return false;
                const viewedMs = Date.parse(viewedAt);
                if (!Number.isFinite(viewedMs)) return false;
                if (viewedMs < now - FORTY_EIGHT_HOURS_MS) return false;
                if (viewedMs > now - FOUR_HOURS_MS) return false;
                return !(doc.content as any)?.follow_up_nudge_sent;
            });

            if (eligible.length === 0) return;

            // Group by user — one nudge per user, lead with first doc
            const byUser = new Map<string, any>();
            for (const doc of eligible) {
                const uid = String(doc.user_id);
                if (!byUser.has(uid)) byUser.set(uid, doc);
            }

            const userIds = Array.from(byUser.keys());
            const { data: users } = await supabase
                .from('users')
                .select('id, privy_id, email, first_name')
                .in('id', userIds);

            const userMap = new Map(((users as any[]) || []).map((u) => [String(u.id), u]));

            logger.info('Sending viewed-document follow-up nudges', { count: byUser.size });

            for (const [userId, doc] of byUser) {
                try {
                    const user = userMap.get(userId);
                    if (!user) continue;

                    const isInvoice = String(doc.type || '').toUpperCase() === 'INVOICE';
                    const content = (doc.content as any) || {};
                    const clientName = content.client_name || content.recipient_name || 'your client';
                    const amount = doc.amount ? `${doc.amount} ${doc.currency || 'USDC'}` : '';
                    const firstName = String(user.first_name || '').trim();

                    const title = isInvoice ? 'Invoice opened — follow up now' : 'Payment link opened';
                    const pushBody = firstName
                        ? `${firstName}, ${clientName} viewed your ${isInvoice ? 'invoice' : 'payment link'}${amount ? ` for ${amount}` : ''}. A quick follow-up can close the deal.`
                        : `${clientName} viewed your ${isInvoice ? 'invoice' : 'payment link'}${amount ? ` for ${amount}` : ''}. Follow up while it's fresh.`;

                    await NotificationService.notifyUser(userId, {
                        title,
                        body: pushBody,
                        data: { type: 'invoice_viewed_followup', documentId: doc.id, route: '/(drawer)/(tabs)/payments' },
                    });

                    if (user.email) {
                        await EmailService.sendSmartReminder(
                            user.email,
                            isInvoice ? 'Your invoice was opened — follow up?' : 'Your payment link was opened',
                            `<p class="eyebrow">Payment update</p><h1 class="heading">${title}</h1><p class="description">${clientName} ${isInvoice ? 'viewed your invoice' : 'opened your payment link'}${amount ? ` for ${amount}` : ''}. Reach out while you're top of mind to close the deal.</p>`,
                            isInvoice ? `https://hedwigbot.xyz/invoice/${doc.id}` : `https://hedwigbot.xyz/pay/${doc.id}`,
                            'Follow Up'
                        );
                    }

                    await supabase.from('documents').update({
                        content: { ...content, follow_up_nudge_sent: new Date().toISOString() },
                    }).eq('id', doc.id);

                    await supabase.from('notifications').insert({
                        user_id: userId,
                        type: 'announcement',
                        title,
                        message: pushBody,
                        metadata: { nudge_type: 'viewed_followup', documentId: doc.id },
                        is_read: false,
                    });

                    await BackendAnalytics.capture(String(user.privy_id || userId), 'reengagement_nudge_sent', {
                        user_id: userId,
                        nudge_type: 'viewed_followup',
                        channels: user.email ? ['push', 'email', 'in_app'] : ['push', 'in_app'],
                    });
                } catch (err: any) {
                    logger.error('Failed to send viewed follow-up nudge', { userId, error: err?.message });
                }
            }
        } catch (error: any) {
            logger.error('Error in sendViewedDocumentFollowUpNudges', { error: error?.message });
        }
    },

    /**
     * Re-engage freelancers who have clients but haven't created a document in 30+ days.
     * Personalizes with the most recently created client's name.
     */
    async sendClientReactivationNudges() {
        try {
            const CADENCE_DAYS = 14;
            const cadenceCutoffMs = Date.now() - (CADENCE_DAYS * DAY_MS);
            const thirtyDaysAgo = new Date(Date.now() - 30 * DAY_MS).toISOString();

            const { data: users, error } = await supabase
                .from('users')
                .select('id, privy_id, email, first_name, last_client_reactivation_nudge_at')
                .limit(SCHEDULER_MAX_USERS_PER_RUN);

            if (error) {
                logger.error('Failed to fetch users for client reactivation nudges', { error: error.message });
                return;
            }

            const candidates = ((users as any[]) || []).filter((user) => {
                const lastNudgeMs = this.timestampMs(user.last_client_reactivation_nudge_at);
                return lastNudgeMs === null || lastNudgeMs <= cadenceCutoffMs;
            });

            if (candidates.length === 0) return;

            const eligible: Array<{ user: any; clientName: string }> = [];

            await processInBatches(candidates, SCHEDULER_CONCURRENCY, async (user) => {
                const { count: clientCount } = await supabase
                    .from('clients')
                    .select('*', { count: 'exact', head: true })
                    .eq('user_id', user.id);

                if (!clientCount || clientCount === 0) return;

                const { count: recentDocCount } = await supabase
                    .from('documents')
                    .select('*', { count: 'exact', head: true })
                    .eq('user_id', user.id)
                    .gte('created_at', thirtyDaysAgo);

                if (recentDocCount !== null && recentDocCount > 0) return;

                const { data: client } = await supabase
                    .from('clients')
                    .select('name')
                    .eq('user_id', user.id)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                eligible.push({ user, clientName: (client as any)?.name || 'your clients' });
            });

            if (eligible.length === 0) {
                logger.debug('No users eligible for client reactivation nudges');
                return;
            }

            logger.info('Sending client reactivation nudges', { count: eligible.length });

            for (const { user, clientName } of eligible) {
                try {
                    const firstName = String(user.first_name || '').trim();
                    const copy = await GeminiService.generateReengagementNudge({
                        kind: 'client_reactivation',
                        context: { clientName },
                    });

                    const personalizedBody = firstName
                        ? `${firstName}, ${copy.pushBody}`
                        : copy.pushBody;

                    await NotificationService.notifyUser(user.id, {
                        title: copy.pushTitle,
                        body: personalizedBody,
                        data: { type: 'client_reactivation', route: '/(drawer)/clients' },
                    });

                    if (user.email) {
                        await EmailService.sendSmartReminder(
                            user.email,
                            copy.emailSubject,
                            `<p class="eyebrow">Client update</p><h1 class="heading">${copy.emailHeading}</h1><p class="description">${copy.emailBody}</p>`,
                            'https://hedwigbot.xyz/clients',
                            copy.ctaText || 'View Clients'
                        );
                    }

                    await supabase.from('notifications').insert({
                        user_id: user.id,
                        type: 'announcement',
                        title: copy.pushTitle,
                        message: personalizedBody,
                        metadata: { nudge_type: 'client_reactivation', clientName },
                        is_read: false,
                    });

                    await supabase.from('users')
                        .update({ last_client_reactivation_nudge_at: new Date().toISOString() })
                        .eq('id', user.id);

                    await BackendAnalytics.capture(String(user.privy_id || user.id), 'reengagement_nudge_sent', {
                        user_id: user.id,
                        nudge_type: 'client_reactivation',
                        channels: user.email ? ['push', 'email', 'in_app'] : ['push', 'in_app'],
                    });
                } catch (err: any) {
                    logger.error('Failed to send client reactivation nudge', { userId: user.id, error: err?.message });
                }
            }
        } catch (error: any) {
            logger.error('Error in sendClientReactivationNudges', { error: error?.message });
        }
    },

    /**
     * Encourage freelancers with 3+ invoices and no recurring setup to automate billing.
     */
    async sendRecurringInvoiceUpsellNudges() {
        try {
            const CADENCE_DAYS = 21;
            const MIN_INVOICE_COUNT = 3;
            const cadenceCutoffMs = Date.now() - (CADENCE_DAYS * DAY_MS);

            const { data: users, error } = await supabase
                .from('users')
                .select('id, privy_id, email, first_name, last_recurring_upsell_nudge_at')
                .limit(SCHEDULER_MAX_USERS_PER_RUN);

            if (error) {
                logger.error('Failed to fetch users for recurring upsell nudges', { error: error.message });
                return;
            }

            const candidates = ((users as any[]) || []).filter((user) => {
                const lastNudgeMs = this.timestampMs(user.last_recurring_upsell_nudge_at);
                return lastNudgeMs === null || lastNudgeMs <= cadenceCutoffMs;
            });

            if (candidates.length === 0) return;

            const eligible: any[] = [];

            await processInBatches(candidates, SCHEDULER_CONCURRENCY, async (user) => {
                const { count: recurringCount } = await supabase
                    .from('recurring_invoices')
                    .select('*', { count: 'exact', head: true })
                    .eq('user_id', user.id)
                    .eq('status', 'active');

                if (recurringCount !== null && recurringCount > 0) return;

                const { count: invoiceCount } = await supabase
                    .from('documents')
                    .select('*', { count: 'exact', head: true })
                    .eq('user_id', user.id)
                    .eq('type', 'INVOICE');

                if (!invoiceCount || invoiceCount < MIN_INVOICE_COUNT) return;
                eligible.push(user);
            });

            if (eligible.length === 0) {
                logger.debug('No users eligible for recurring upsell nudges');
                return;
            }

            logger.info('Sending recurring invoice upsell nudges', { count: eligible.length });

            const copy = await GeminiService.generateReengagementNudge({ kind: 'recurring_setup' });

            await processInBatches(eligible, SCHEDULER_CONCURRENCY, async (user) => {
                try {
                    const firstName = String(user.first_name || '').trim();
                    const personalizedBody = firstName ? `${firstName}, ${copy.pushBody}` : copy.pushBody;

                    await NotificationService.notifyUser(user.id, {
                        title: copy.pushTitle,
                        body: personalizedBody,
                        data: { type: 'recurring_upsell', route: '/(drawer)/recurring' },
                    });

                    if (user.email) {
                        await EmailService.sendSmartReminder(
                            user.email,
                            copy.emailSubject,
                            `<p class="eyebrow">Pro tip</p><h1 class="heading">${copy.emailHeading}</h1><p class="description">${copy.emailBody}</p>`,
                            'https://hedwigbot.xyz/recurring',
                            copy.ctaText || 'Set Up Recurring'
                        );
                    }

                    await supabase.from('notifications').insert({
                        user_id: user.id,
                        type: 'announcement',
                        title: copy.pushTitle,
                        message: personalizedBody,
                        metadata: { nudge_type: 'recurring_upsell' },
                        is_read: false,
                    });

                    await supabase.from('users')
                        .update({ last_recurring_upsell_nudge_at: new Date().toISOString() })
                        .eq('id', user.id);

                    await BackendAnalytics.capture(String(user.privy_id || user.id), 'reengagement_nudge_sent', {
                        user_id: user.id,
                        nudge_type: 'recurring_upsell',
                        channels: user.email ? ['push', 'email', 'in_app'] : ['push', 'in_app'],
                    });
                } catch (err: any) {
                    logger.error('Failed to send recurring upsell nudge', { userId: user.id, error: err?.message });
                }
            });
        } catch (error: any) {
            logger.error('Error in sendRecurringInvoiceUpsellNudges', { error: error?.message });
        }
    },

    /**
     * Weekly teaser for upcoming Gmail integrations.
     */
    async sendIntegrationTeaserNudges() {
        try {
            const CADENCE_DAYS = 14;
            const cadenceCutoffMs = Date.now() - (CADENCE_DAYS * DAY_MS);
            const activeCutoffMs = Date.now() - (45 * DAY_MS);

            const { data: users, error } = await supabase
                .from('users')
                .select('id, privy_id, email, first_name, last_integration_teaser_at, last_app_opened_at, last_login')
                .limit(SCHEDULER_MAX_USERS_PER_RUN);

            if (error) {
                logger.error('Failed to fetch users for integration teaser nudges', { error: error.message });
                return;
            }

            const oneSignalLastSeenMap = await this.getOneSignalLastSeenMap();

            const candidates = ((users as any[]) || []).filter((user) => {
                const effectiveMs = this.timestampMs(this.getEffectiveLastActivityAt(user, oneSignalLastSeenMap));
                if (effectiveMs === null || effectiveMs < activeCutoffMs) return false;
                const lastTeaserMs = this.timestampMs(user.last_integration_teaser_at);
                return lastTeaserMs === null || lastTeaserMs <= cadenceCutoffMs;
            });

            if (candidates.length === 0) {
                logger.debug('No users eligible for integration teaser nudges');
                return;
            }

            const integrations = [
                {
                    name: 'Gmail',
                    context: { integration: 'Gmail', description: 'send invoices directly from Gmail' },
                },
            ];
            const integration = integrations[0];

            logger.info('Sending integration teaser nudges', { count: candidates.length, integration: integration.name });

            const copy = await GeminiService.generateReengagementNudge({
                kind: 'integration_teaser',
                context: integration.context,
            });

            await processInBatches(candidates, SCHEDULER_CONCURRENCY, async (user) => {
                try {
                    const firstName = String(user.first_name || '').trim();
                    const personalizedBody = firstName ? `${firstName}, ${copy.pushBody}` : copy.pushBody;

                    await NotificationService.notifyUser(user.id, {
                        title: copy.pushTitle,
                        body: personalizedBody,
                        data: { type: 'integration_teaser', integration: integration.name },
                    });

                    if (user.email) {
                        await EmailService.sendSmartReminder(
                            user.email,
                            copy.emailSubject,
                            `<p class="eyebrow">Coming soon</p><h1 class="heading">${copy.emailHeading}</h1><p class="description">${copy.emailBody}</p>`,
                            'https://hedwigbot.xyz',
                            copy.ctaText || 'Learn More'
                        );
                    }

                    await supabase.from('notifications').insert({
                        user_id: user.id,
                        type: 'announcement',
                        title: copy.pushTitle,
                        message: personalizedBody,
                        metadata: { nudge_type: 'integration_teaser', integration: integration.name },
                        is_read: false,
                    });

                    await supabase.from('users')
                        .update({ last_integration_teaser_at: new Date().toISOString() })
                        .eq('id', user.id);

                    await BackendAnalytics.capture(String(user.privy_id || user.id), 'reengagement_nudge_sent', {
                        user_id: user.id,
                        nudge_type: 'integration_teaser',
                        integration: integration.name,
                        channels: user.email ? ['push', 'email', 'in_app'] : ['push', 'in_app'],
                    });
                } catch (err: any) {
                    logger.error('Failed to send integration teaser nudge', { userId: user.id, error: err?.message });
                }
            });
        } catch (error: any) {
            logger.error('Error in sendIntegrationTeaserNudges', { error: error?.message });
        }
    },

    /**
     * Nudge freelancers about payment links created 3–7 days ago that haven't been viewed yet.
     * One nudge per user per unviewed link.
     */
    async sendPaymentLinkBoostNudges() {
        try {
            const THREE_DAYS_MS = 3 * DAY_MS;
            const SEVEN_DAYS_MS = 7 * DAY_MS;

            const { data: docs, error } = await supabase
                .from('documents')
                .select('id, user_id, title, amount, currency, content, created_at')
                .eq('type', 'PAYMENT_LINK')
                .in('status', ['DRAFT', 'SENT'])
                .gte('created_at', new Date(Date.now() - SEVEN_DAYS_MS).toISOString())
                .lte('created_at', new Date(Date.now() - THREE_DAYS_MS).toISOString())
                .limit(SCHEDULER_MAX_DOCUMENTS_PER_RUN);

            if (error) {
                logger.error('Failed to fetch payment links for boost nudges', { error: error.message });
                return;
            }
            if (!docs || docs.length === 0) return;

            // Filter: not yet viewed, not already nudged
            const eligible = (docs as any[]).filter((doc) => {
                const content = (doc.content as any) || {};
                return !content.viewed_at && !content.first_viewed_at && !content.payment_link_boost_nudge_sent;
            });

            if (eligible.length === 0) return;

            // One nudge per user, lead with first eligible doc
            const byUser = new Map<string, any>();
            for (const doc of eligible) {
                const uid = String(doc.user_id);
                if (!byUser.has(uid)) byUser.set(uid, doc);
            }

            const userIds = Array.from(byUser.keys());
            const { data: users } = await supabase
                .from('users')
                .select('id, privy_id, email, first_name')
                .in('id', userIds);

            const userMap = new Map(((users as any[]) || []).map((u) => [String(u.id), u]));

            logger.info('Sending payment link boost nudges', { count: byUser.size });

            for (const [userId, doc] of byUser) {
                try {
                    const user = userMap.get(userId);
                    if (!user) continue;

                    const firstName = String(user.first_name || '').trim();
                    const content = (doc.content as any) || {};
                    const linkTitle = doc.title || 'Your payment link';
                    const amount = doc.amount ? `${doc.amount} ${doc.currency || 'USDC'}` : '';

                    const title = 'Your payment link is waiting to be shared';
                    const pushBody = firstName
                        ? `${firstName}, share "${linkTitle}"${amount ? ` (${amount})` : ''} to start getting paid.`
                        : `Share "${linkTitle}"${amount ? ` (${amount})` : ''} with your client to get paid.`;

                    await NotificationService.notifyUser(userId, {
                        title,
                        body: pushBody,
                        data: { type: 'payment_link_boost', documentId: doc.id, route: '/(drawer)/(tabs)/payments' },
                    });

                    if (user.email) {
                        await EmailService.sendSmartReminder(
                            user.email,
                            `"${linkTitle}" hasn't been shared yet`,
                            `<p class="eyebrow">Payment link</p><h1 class="heading">Share your link to get paid</h1><p class="description">Your payment link "${linkTitle}"${amount ? ` for ${amount}` : ''} hasn't been opened yet. Share it with your client — they pay in seconds, no invoice needed.</p>`,
                            `https://hedwigbot.xyz/pay/${doc.id}`,
                            'Share Link'
                        );
                    }

                    await supabase.from('documents').update({
                        content: { ...content, payment_link_boost_nudge_sent: new Date().toISOString() },
                    }).eq('id', doc.id);

                    await supabase.from('notifications').insert({
                        user_id: userId,
                        type: 'announcement',
                        title,
                        message: pushBody,
                        metadata: { nudge_type: 'payment_link_boost', documentId: doc.id },
                        is_read: false,
                    });

                    await BackendAnalytics.capture(String(user.privy_id || userId), 'reengagement_nudge_sent', {
                        user_id: userId,
                        nudge_type: 'payment_link_boost',
                        channels: user.email ? ['push', 'email', 'in_app'] : ['push', 'in_app'],
                    });
                } catch (err: any) {
                    logger.error('Failed to send payment link boost nudge', { userId, error: err?.message });
                }
            }
        } catch (error: any) {
            logger.error('Error in sendPaymentLinkBoostNudges', { error: error?.message });
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
                .lte('next_due_date', today)
                .limit(SCHEDULER_MAX_DOCUMENTS_PER_RUN);

            if (error) { logger.error('Failed to fetch recurring invoices'); return; }
            if (!templates || templates.length === 0) { logger.debug('No recurring invoices due'); return; }
            if (templates.length >= SCHEDULER_MAX_DOCUMENTS_PER_RUN) {
                logger.warn('Recurring invoice query reached max per run cap', { cap: SCHEDULER_MAX_DOCUMENTS_PER_RUN });
            }

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
                    user:users(id, first_name, last_name, email, client_reminders_enabled)
                `)
                .in('status', ['DRAFT', 'SENT', 'PENDING'])
                .not('content->due_date', 'is', null)
                .limit(SCHEDULER_MAX_DOCUMENTS_PER_RUN);

            if (error) {
                logger.error('Failed to fetch documents for due date reminders');
                return;
            }

            if (!documents || documents.length === 0) {
                logger.debug('No documents with due dates found');
                return;
            }
            if (documents.length >= SCHEDULER_MAX_DOCUMENTS_PER_RUN) {
                logger.warn('Due-date document query reached max per run cap', { cap: SCHEDULER_MAX_DOCUMENTS_PER_RUN });
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

            // Check if reminders are enabled (document-level and global user toggle)
            if (content.reminders_enabled === false) return;
            if (doc.user?.client_reminders_enabled === false) return;

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

                const BASE_URL = (process.env.WEB_CLIENT_URL || process.env.PUBLIC_BASE_URL || 'https://hedwigbot.xyz').replace(/\/+$/, '');
                const actionLink = doc.type === 'INVOICE'
                    ? `${BASE_URL}/invoice/${doc.id}`
                    : `${BASE_URL}/pay/${doc.id}`;

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
                .not('due_date', 'is', null)
                .limit(SCHEDULER_MAX_MILESTONES_PER_RUN);

            if (error || !milestones) return;
            if (milestones.length >= SCHEDULER_MAX_MILESTONES_PER_RUN) {
                logger.warn('Milestone reminder query reached max per run cap', { cap: SCHEDULER_MAX_MILESTONES_PER_RUN });
            }

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
                        (process.env.WEB_CLIENT_URL || process.env.PUBLIC_BASE_URL || 'https://hedwigbot.xyz').replace(/\/+$/, ''),
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
                        email,
                        client_reminders_enabled
                    )
                `)
                .in('status', ['SENT', 'DRAFT'])
                .neq('type', 'CONTRACT')
                .lt('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()) // Older than 7 days
                .limit(SCHEDULER_MAX_DOCUMENTS_PER_RUN);

            if (error) {
                logger.error('Failed to fetch documents');
                return;
            }

            if (!documents || documents.length === 0) {
                logger.debug('No overdue documents found');
                return;
            }
            if (documents.length >= SCHEDULER_MAX_DOCUMENTS_PER_RUN) {
                logger.warn('Overdue document query reached max per run cap', { cap: SCHEDULER_MAX_DOCUMENTS_PER_RUN });
            }

            logger.debug('Found potentially overdue documents', { count: documents.length });

            await processInBatches(documents, SCHEDULER_CONCURRENCY, async (doc) => {
                await this.processDocumentReminder(doc).catch((e) =>
                    logger.error('Failed to process document reminder', { docId: doc?.id, error: e?.message })
                );
            });

        } catch (error) {
            logger.error('Error in checkAndRemind');
        }
    },

    async processDocumentReminder(doc: any, isManual: boolean = false): Promise<{ sent: boolean; reason?: string }> {
        try {
            const content = doc.content || {};
            const recipientEmail = content.recipient_email || content.client_email;
            const clientName = content.client_name || 'Client';

            // Check global user toggle (manual reminders bypass both checks)
            if (!isManual && doc.user?.client_reminders_enabled === false) {
                logger.debug('Skipping: Global reminders disabled by user');
                return { sent: false, reason: 'Global reminders disabled' };
            }

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
            const BASE_URL = (process.env.WEB_CLIENT_URL || process.env.PUBLIC_BASE_URL || 'https://hedwigbot.xyz').replace(/\/+$/, '');
            const actionLink = doc.type === 'INVOICE'
                ? `${BASE_URL}/invoice/${doc.id}`
                : `${BASE_URL}/pay/${doc.id}`;

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
