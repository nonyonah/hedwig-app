import { supabase } from '../lib/supabase';
import { createLogger } from '../utils/logger';

const logger = createLogger('UsageService');

export type UsageMetric = 'ai_prompts' | 'emails_sent' | 'document_imports';

/**
 * Get the start of the current monthly period (1st of month, UTC).
 */
function getMonthStart(): string {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01T00:00:00.000Z`;
}

/**
 * Get the start of the next monthly period.
 */
function getNextMonthStart(): string {
    const now = new Date();
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    return next.toISOString();
}

/**
 * Increment a usage counter for a user for the current month.
 * Uses the atomic increment_user_usage RPC. Falls back to read-modify-write
 * if the RPC hasn't been created yet in the current environment.
 */
export async function incrementUsage(
    userId: string,
    metric: UsageMetric,
    amount: number = 1,
): Promise<void> {
    const periodStart = getMonthStart();

    try {
        const { error } = await supabase.rpc('increment_user_usage', {
            p_user_id: userId,
            p_metric: metric,
            p_period_start: periodStart,
            p_amount: amount,
        });

        if (error) {
            logger.warn('increment_user_usage RPC failed, falling back', {
                error: error.message,
                metric,
            });
            await fallbackIncrement(userId, metric, amount, periodStart);
        }
    } catch (err: any) {
        logger.error('Unexpected error incrementing usage', {
            error: err?.message,
            userId,
            metric,
        });
    }
}

/**
 * Fallback read-modify-write increment when the RPC isn't available.
 */
async function fallbackIncrement(
    userId: string,
    metric: UsageMetric,
    amount: number,
    periodStart: string,
): Promise<void> {
    // Try to create the row first (ignore if exists)
    const { error: insertError } = await supabase.from('user_usage').upsert(
        { user_id: userId, metric, period_start: periodStart, count: 0 },
        { onConflict: 'user_id, metric, period_start', ignoreDuplicates: true },
    );

    if (insertError) {
        logger.error('Failed to seed usage row', { error: insertError.message, userId, metric });
        return;
    }

    // Read current count
    const { data: row } = await supabase
        .from('user_usage')
        .select('count')
        .eq('user_id', userId)
        .eq('metric', metric)
        .eq('period_start', periodStart)
        .maybeSingle();

    const newCount = (row?.count ?? 0) + amount;

    // Write updated count
    const { error: updateError } = await supabase
        .from('user_usage')
        .update({ count: newCount, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('metric', metric)
        .eq('period_start', periodStart);

    if (updateError) {
        logger.error('Failed to increment usage (fallback)', {
            error: updateError.message,
            userId,
            metric,
        });
    }
}

/**
 * Get the current month's usage count for a given metric.
 */
export async function getUsage(
    userId: string,
    metric: UsageMetric,
): Promise<number> {
    const periodStart = getMonthStart();

    const { data, error } = await supabase
        .from('user_usage')
        .select('count')
        .eq('user_id', userId)
        .eq('metric', metric)
        .eq('period_start', periodStart)
        .maybeSingle();

    if (error) {
        logger.error('Failed to get usage', { error: error.message, userId, metric });
        return 0;
    }

    return data?.count ?? 0;
}

/**
 * Get all usage metrics for a user for the current period.
 */
export async function getAllUsage(userId: string): Promise<Record<UsageMetric, number>> {
    const periodStart = getMonthStart();

    const { data, error } = await supabase
        .from('user_usage')
        .select('metric, count')
        .eq('user_id', userId)
        .eq('period_start', periodStart);

    if (error) {
        logger.error('Failed to get all usage', { error: error.message, userId });
        return { ai_prompts: 0, emails_sent: 0, document_imports: 0 };
    }

    const result: Record<UsageMetric, number> = {
        ai_prompts: 0,
        emails_sent: 0,
        document_imports: 0,
    };

    for (const row of data ?? []) {
        if (row.metric in result) {
            result[row.metric as UsageMetric] = row.count;
        }
    }

    return result;
}

export type UsageLimitResult = {
    allowed: boolean;
    current: number;
    limit: number;
    remaining: number;
};

/**
 * Check whether a user has remaining usage for a given metric this month.
 * If limit is Infinity or <= 0, always allowed.
 */
export async function checkUsageLimit(
    userId: string,
    metric: UsageMetric,
    limit: number,
): Promise<UsageLimitResult> {
    if (!Number.isFinite(limit) || limit <= 0) {
        return { allowed: true, current: 0, limit, remaining: Infinity };
    }

    const current = await getUsage(userId, metric);
    const remaining = Math.max(limit - current, 0);

    return {
        allowed: current < limit,
        current,
        limit,
        remaining,
    };
}

/**
 * Get the reset date for the current usage period.
 */
export function getPeriodResetDate(): string {
    return getNextMonthStart();
}
