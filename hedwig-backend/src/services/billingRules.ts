import { supabase } from '../lib/supabase';
import { getRevenueCatStateForUser } from './revenuecat';

export type HedwigPlan = 'free' | 'pro';
export type LimitedDocumentType = 'INVOICE' | 'PAYMENT_LINK' | 'CONTRACT';
export type ProFeature =
    | 'assistant'
    | 'assistant_chat'
    | 'attachment_ai'
    | 'creation_box'
    | 'recurring_automation'
    | 'milestone_invoice_automation'
    | 'composio_integrations'
    | 'multi_bank_accounts'
    | 'revenue_history';

export const FREE_PLAN_LIMITS = {
    invoicesPerMonth: 10,
    paymentLinksPerMonth: 10,
    contractsPerMonth: 3,
    bankAccounts: 1,
    revenueHistoryDays: 30,
} as const;

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

function getFeatureMessage(feature: ProFeature): string {
    switch (feature) {
        case 'assistant':
        case 'assistant_chat':
            return 'Hedwig Assistant is a Pro feature.';
        case 'attachment_ai':
            return 'AI document import (OCR + classification) is a Pro feature.';
        case 'creation_box':
            return 'Natural-language invoice and payment link creation is a Pro feature.';
        case 'recurring_automation':
            return 'Recurring invoice automation is a Pro feature.';
        case 'milestone_invoice_automation':
            return 'Automatic milestone invoice creation is a Pro feature.';
        case 'composio_integrations':
            return 'Connecting Gmail, Calendar, Drive, and Docs is a Pro feature.';
        case 'multi_bank_accounts':
            return `The free plan includes ${FREE_PLAN_LIMITS.bankAccounts} payout bank account. Upgrade to Pro to add more.`;
        case 'revenue_history':
            return `Free plan revenue history covers the last ${FREE_PLAN_LIMITS.revenueHistoryDays} days. Upgrade to Pro for full history.`;
    }
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

    if (unifiedIsActive === true) return 'pro';

    const state = await getRevenueCatStateForUser(user);
    return state?.is_active ? 'pro' : 'free';
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
    if (plan === 'pro') {
        return { allowed: true, plan, count: 0, limit: null, remaining: null };
    }

    const limit = getFreePlanLimit(params.type);
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
