import { supabase } from '../lib/supabase';
import { getRevenueCatStateForUser } from './revenuecat';

export type HedwigPlan = 'free' | 'starter' | 'pro';
export type LimitedDocumentType = 'INVOICE' | 'PAYMENT_LINK' | 'CONTRACT';
export type UsageMetric = 'ai_prompts' | 'emails_sent' | 'document_imports';
export type ProFeature =
    | 'assistant'
    | 'assistant_chat'
    | 'attachment_ai'
    | 'recurring_automation'
    | 'milestone_invoice_automation'
    | 'composio_integrations'
    | 'multi_bank_accounts'
    | 'revenue_history'
    | 'creation_box'
    | 'team_member_limit'
    | 'payroll'
    | 'multi_workspace';

/**
 * Free-plan caps. Volume caps are Infinity — document creation is unlimited on
 * all plans. Paid plans differentiate via bank accounts, revenue history,
 * AI features, and integrations.
 */
export const FREE_PLAN_LIMITS = {
    invoicesPerMonth: Infinity,
    paymentLinksPerMonth: Infinity,
    contractsPerMonth: Infinity,
    bankAccounts: 1,
    revenueHistoryDays: 30,
    teamMembers: 3,
    orgWorkspaces: 1,
} as const;

/**
 * Monthly usage caps per plan for cost-controlled features.
 */
export const USAGE_LIMITS: Record<HedwigPlan, Record<UsageMetric, number>> = {
    free: {
        ai_prompts: 200,
        emails_sent: 500,
        document_imports: 50,
    },
    starter: {
        ai_prompts: 1000,
        emails_sent: 2000,
        document_imports: 200,
    },
    pro: {
        ai_prompts: 5000,
        emails_sent: 10000,
        document_imports: 1000,
    },
};

export function getUsageLimit(plan: HedwigPlan, metric: UsageMetric): number {
    return USAGE_LIMITS[plan]?.[metric] ?? Infinity;
}

const normalizeString = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    return normalized || null;
};

const resolveUnifiedStatus = (user: any): 'active' | 'inactive' | null => {
    const raw = normalizeString(user?.subscription_status ?? user?.subscriptionStatus);
    if (!raw) return null;
    const normalized = raw.toLowerCase();
    if (normalized === 'active') return 'active';
    if (normalized === 'inactive') return 'inactive';
    return null;
};

const resolveUnifiedExpiry = (user: any): string | null => (
    normalizeString(user?.subscription_expiry ?? user?.subscriptionExpiry)
);

const isNotExpired = (isoDate: string | null): boolean => {
    if (!isoDate) return true;
    const parsed = Date.parse(isoDate);
    if (!Number.isFinite(parsed)) return true;
    return parsed > Date.now();
};

const normalizeAccessKey = (value: unknown): string | null => (
    normalizeString(value)?.toLowerCase() || null
);

const getProTestAllowlist = (): Set<string> => new Set(
    String(process.env.HEDWIG_PRO_TEST_USERS || '')
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
);

export function hasProTestAccess(user: {
    id?: string | null;
    email?: string | null;
    privy_id?: string | null;
    privyId?: string | null;
} | null | undefined): boolean {
    if (!user) return false;

    if (String(process.env.HEDWIG_PRO_TEST_ACCESS_ALL || '').trim().toLowerCase() === 'true') {
        return true;
    }

    const allowlist = getProTestAllowlist();
    if (allowlist.size === 0) return false;

    const candidates = [
        normalizeAccessKey(user.id),
        normalizeAccessKey(user.email),
        normalizeAccessKey(user.privy_id),
        normalizeAccessKey(user.privyId),
    ].filter(Boolean) as string[];

    return candidates.some((candidate) => allowlist.has(candidate));
}

function getFreePlanLimit(type: LimitedDocumentType): number {
    switch (type) {
        case 'INVOICE':
            return FREE_PLAN_LIMITS.invoicesPerMonth;
        case 'PAYMENT_LINK':
            return FREE_PLAN_LIMITS.paymentLinksPerMonth;
        case 'CONTRACT':
            return FREE_PLAN_LIMITS.contractsPerMonth;
    }
}

function getDocumentLimitMessage(type: LimitedDocumentType, limit: number): string {
    switch (type) {
        case 'INVOICE':
            return `Free plan includes up to ${limit} invoices per month. Upgrade to Pro for more invoice volume and automation.`;
        case 'PAYMENT_LINK':
            return `Free plan includes up to ${limit} payment links per month. Upgrade to Pro for higher volume and assistant workflows.`;
        case 'CONTRACT':
            return `Free plan includes up to ${limit} contracts per month. Upgrade to Pro for unlimited contract generation.`;
    }
}

/**
 * Resolve plan from a subscription product ID.
 * Checks new Starter/Pro env vars, then falls back to legacy Pro IDs for
 * backward compatibility with existing subscribers.
 */
export function resolvePlanFromProductId(productId: string | null): HedwigPlan {
    if (!productId) return 'free';
    const normalized = productId.trim();

    const proMonthly = normalizeString(process.env.POLAR_PRO_MONTHLY_ID);
    const proAnnual = normalizeString(process.env.POLAR_PRO_ANNUAL_ID);
    if ((proMonthly && normalized === proMonthly) || (proAnnual && normalized === proAnnual)) {
        return 'pro';
    }

    const starterMonthly = normalizeString(process.env.POLAR_STARTER_MONTHLY_ID);
    const starterAnnual = normalizeString(process.env.POLAR_STARTER_ANNUAL_ID);
    if ((starterMonthly && normalized === starterMonthly) || (starterAnnual && normalized === starterAnnual)) {
        return 'starter';
    }

    // Legacy Polar product IDs (old $5 Pro → 'pro' for backward compat)
    const legacyMonthly = normalizeString(process.env.POLAR_PRODUCT_ID_MONTHLY);
    const legacyAnnual = normalizeString(process.env.POLAR_PRODUCT_ID_ANNUAL);
    if ((legacyMonthly && normalized === legacyMonthly) || (legacyAnnual && normalized === legacyAnnual)) {
        return 'pro';
    }

    const lower = normalized.toLowerCase();
    if (lower.includes('pro') || lower.includes('premium')) return 'pro';
    if (lower.includes('starter')) return 'starter';

    return 'starter';
}

function getFeatureMessage(feature: ProFeature): string {
    switch (feature) {
        case 'assistant':
        case 'assistant_chat':
            return 'Hedwig Assistant is a Pro feature.';
        case 'attachment_ai':
            return 'AI document import (OCR + classification) is a Pro feature.';
        case 'recurring_automation':
            return 'Recurring invoice automation is a Pro feature. Upgrade to Starter or Pro.';
        case 'milestone_invoice_automation':
            return 'Automatic milestone invoice creation is a Pro feature.';
        case 'composio_integrations':
            return 'Connecting Gmail, Calendar, Drive, and Docs is a Pro feature.';
        case 'multi_bank_accounts':
            return `Unlock more payout bank accounts by upgrading. Free: 1, Starter: 3, Pro: unlimited.`;
        case 'revenue_history':
            return `Free plan revenue history covers the last ${FREE_PLAN_LIMITS.revenueHistoryDays} days. Upgrade to Starter or Pro for full history.`;
        case 'creation_box':
            return 'Creation Box (AI invoice creation) is a Pro feature.';
        case 'team_member_limit':
            return `Free plan is limited to ${FREE_PLAN_LIMITS.teamMembers} team members. Upgrade to Pro for unlimited members.`;
        case 'payroll':
            return 'Scheduled/recurring payroll is a Pro feature. One-time payroll runs are free.';
        case 'multi_workspace':
            return `Free plan includes ${FREE_PLAN_LIMITS.orgWorkspaces} organization workspace. Upgrade to Pro for multiple organization workspaces.`;
    }
}

export function getTeamMemberLimit(plan: HedwigPlan): number {
    if (plan === 'pro') return Infinity;
    if (plan === 'starter') return 10;
    return FREE_PLAN_LIMITS.teamMembers;
}

export function getOrgWorkspaceLimit(plan: HedwigPlan): number {
    if (plan === 'pro') return Infinity;
    if (plan === 'starter') return 3;
    return FREE_PLAN_LIMITS.orgWorkspaces;
}

/**
 * Maximum bank accounts allowed per plan.
 */
export function getBankAccountLimit(plan: HedwigPlan): number {
    if (plan === 'pro') return Infinity;
    if (plan === 'starter') return 3;
    return FREE_PLAN_LIMITS.bankAccounts;
}

export async function getUserPlan(user: {
    id: string;
    email?: string | null;
    privy_id?: string | null;
    subscription_status?: string | null;
    subscription_expiry?: string | null;
}): Promise<HedwigPlan> {
    if (hasProTestAccess(user)) return 'pro';

    const unifiedStatus = resolveUnifiedStatus(user);
    const unifiedExpiry = resolveUnifiedExpiry(user);
    const unifiedIsActive = unifiedStatus ? (unifiedStatus === 'active' && isNotExpired(unifiedExpiry)) : null;

    if (unifiedIsActive === true) {
        const state = await getRevenueCatStateForUser(user);
        if (state?.product_id) return resolvePlanFromProductId(state.product_id);
        return 'starter';
    }

    const state = await getRevenueCatStateForUser(user);
    if (!state?.is_active) return 'free';
    if (state.product_id) return resolvePlanFromProductId(state.product_id);
    return 'starter';
}

/**
 * Get the user's plan without applying the pro test access override.
 * Used for usage limits — the test flag unlocks features but usage caps
 * still reflect the user's actual subscription tier.
 */
export async function getUserSubscriptionTier(user: {
    id: string;
    email?: string | null;
    privy_id?: string | null;
    subscription_status?: string | null;
    subscription_expiry?: string | null;
}): Promise<HedwigPlan> {
    const unifiedStatus = resolveUnifiedStatus(user);
    const unifiedExpiry = resolveUnifiedExpiry(user);
    const unifiedIsActive = unifiedStatus ? (unifiedStatus === 'active' && isNotExpired(unifiedExpiry)) : null;

    if (unifiedIsActive === true) {
        const state = await getRevenueCatStateForUser(user);
        if (state?.product_id) return resolvePlanFromProductId(state.product_id);
        return 'starter';
    }

    const state = await getRevenueCatStateForUser(user);
    if (!state?.is_active) return 'free';
    if (state.product_id) return resolvePlanFromProductId(state.product_id);
    return 'starter';
}

export async function requireProFeatureAccess(
    user: Parameters<typeof getUserPlan>[0],
    feature: ProFeature
): Promise<{ allowed: boolean; message?: string }> {
    const plan = await getUserPlan(user);
    if (plan === 'pro') return { allowed: true };
    return { allowed: false, message: getFeatureMessage(feature) };
}

export async function checkDocumentCreationLimit(params: {
    user: Parameters<typeof getUserPlan>[0];
    type: LimitedDocumentType;
}): Promise<{ allowed: boolean; plan: HedwigPlan; count: number; limit: number | null; remaining: number | null; message?: string }> {
    const plan = await getUserPlan(params.user);
    if (plan !== 'free') {
        return { allowed: true, plan, count: 0, limit: null, remaining: null };
    }

    const limit = getFreePlanLimit(params.type);
    if (!Number.isFinite(limit)) {
        // No volume cap on Free for this document type anymore.
        return { allowed: true, plan, count: 0, limit: null, remaining: null };
    }
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const { count, error } = await supabase
        .from('documents')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', params.user.id)
        .eq('type', params.type)
        .gte('created_at', monthStart.toISOString());

    if (error) {
        throw new Error(error.message);
    }

    const currentCount = Number(count || 0);
    const allowed = currentCount < limit;

    return {
        allowed,
        plan,
        count: currentCount,
        limit,
        remaining: Math.max(limit - currentCount, 0),
        message: allowed ? undefined : getDocumentLimitMessage(params.type, limit),
    };
}
