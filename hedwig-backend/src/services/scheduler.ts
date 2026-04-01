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

        cron.schedule('35 * * * *', () => {
            withLock('paycrest-rate-nudges', hourlyLockTtl, () => this.sendPaycrestRateNudges())
                .catch((e) => logger.error('paycrest-rate-nudges lock error', { error: e?.message }));
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
            const body = `${baseAmount} USD ≈ ${rateParts.join(' · ')} (Paycrest)`;
            const emailSubject = `USD rates: ${emailRateParts.join(' · ')}`;
            const emailHtml = `<p class="eyebrow">Market update</p><h1 class="heading">Latest USD payout rates</h1><p class="description">${baseAmount} USD is currently around ${emailHtmlParts.join(' and ')} using Paycrest rates.</p><p class="description">Use Hedwig to create payouts with the latest pricing.</p>`;

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
                    user:users(id, first_name, last_name, email)
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
                        email
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
