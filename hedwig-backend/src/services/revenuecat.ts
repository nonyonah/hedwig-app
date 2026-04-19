import crypto from 'crypto';
import { supabase } from '../lib/supabase';
import { createLogger } from '../utils/logger';

const logger = createLogger('RevenueCat');

export type RevenueCatWebhookEvent = {
    id?: string;
    type?: string;
    app_user_id?: string;
    original_app_user_id?: string;
    aliases?: string[];
    event_timestamp_ms?: number;
    product_id?: string | null;
    entitlement_id?: string | null;
    entitlement_ids?: string[] | null;
    period_type?: string | null;
    store?: string | null;
    environment?: string | null;
    ownership_type?: string | null;
    purchased_at_ms?: number | null;
    expiration_at_ms?: number | null;
    auto_resume_at_ms?: number | null;
    auto_renew_status?: boolean | null;
    [key: string]: unknown;
};

type SubscriptionStateRow = {
    app_user_id: string;
    user_id: string | null;
    entitlement_id: string | null;
    entitlement_ids: string[] | null;
    is_active: boolean | null;
    product_id: string | null;
    store: string | null;
    environment: string | null;
    period_type: string | null;
    ownership_type: string | null;
    will_renew: boolean | null;
    is_trial: boolean | null;
    billing_issue_detected: boolean | null;
    latest_event_type: string | null;
    latest_event_id: string | null;
    event_timestamp_ms: number | null;
    purchased_at: string | null;
    expires_at: string | null;
    raw_event: any;
    updated_at: string | null;
};

export const REVENUECAT_PRIMARY_ENTITLEMENT =
    (process.env.REVENUECAT_PRIMARY_ENTITLEMENT_ID || 'pro').trim() || 'pro';

const BILLING_ACTIVE_EVENT_TYPES = new Set([
    'INITIAL_PURCHASE',
    'RENEWAL',
    'PRODUCT_CHANGE',
    'UNCANCELLATION',
    'NON_RENEWING_PURCHASE',
    'SUBSCRIPTION_EXTENDED',
    'TEMPORARY_ENTITLEMENT_GRANT',
]);

const BILLING_INACTIVE_EVENT_TYPES = new Set([
    'EXPIRATION',
    'SUBSCRIPTION_PAUSED',
]);

const BILLING_ISSUE_EVENT_TYPES = new Set(['BILLING_ISSUE']);

const BILLING_CLEAR_ISSUE_EVENT_TYPES = new Set([
    'INITIAL_PURCHASE',
    'RENEWAL',
    'UNCANCELLATION',
    'PRODUCT_CHANGE',
    'NON_RENEWING_PURCHASE',
    'EXPIRATION',
]);

const normalizeAppUserId = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
};

const parseMsToIso = (value: unknown): string | null => {
    if (value === null || value === undefined) return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return new Date(parsed).toISOString();
};

const parseIsoToMs = (value: unknown): number | null => {
    if (typeof value !== 'string' || !value.trim()) return null;
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
};

export const parseRevenueCatWebhookEvent = (payload: any): RevenueCatWebhookEvent | null => {
    if (!payload || typeof payload !== 'object') return null;
    const candidate = payload.event && typeof payload.event === 'object' ? payload.event : payload;
    if (!candidate || typeof candidate !== 'object') return null;
    return candidate as RevenueCatWebhookEvent;
};

export const getRevenueCatAppUserIdCandidates = (event: RevenueCatWebhookEvent): string[] => {
    const out = new Set<string>();
    const add = (value: unknown) => {
        const normalized = normalizeAppUserId(value);
        if (normalized) out.add(normalized);
    };

    add(event.app_user_id);
    add(event.original_app_user_id);
    if (Array.isArray(event.aliases)) {
        for (const alias of event.aliases) add(alias);
    }

    return Array.from(out);
};

const getSyntheticEventId = (event: RevenueCatWebhookEvent, appUserId: string): string => {
    const raw = JSON.stringify({
        appUserId,
        type: event.type || null,
        event_timestamp_ms: event.event_timestamp_ms || null,
        product_id: event.product_id || null,
        entitlement_id: event.entitlement_id || null,
        entitlement_ids: Array.isArray(event.entitlement_ids) ? event.entitlement_ids : null,
    });
    return crypto.createHash('sha256').update(raw).digest('hex');
};

const normalizeEntitlementIds = (event: RevenueCatWebhookEvent, existing?: SubscriptionStateRow | null): string[] => {
    const incoming = Array.isArray(event.entitlement_ids)
        ? event.entitlement_ids.map((item) => String(item).trim()).filter(Boolean)
        : [];
    if (incoming.length > 0) {
        return Array.from(new Set(incoming));
    }

    if (event.entitlement_id && String(event.entitlement_id).trim()) {
        return [String(event.entitlement_id).trim()];
    }

    const prev = Array.isArray(existing?.entitlement_ids)
        ? existing!.entitlement_ids!.map((item) => String(item).trim()).filter(Boolean)
        : [];
    return Array.from(new Set(prev));
};

const resolveWillRenew = (eventType: string, event: RevenueCatWebhookEvent, existing?: SubscriptionStateRow | null): boolean | null => {
    if (typeof event.auto_renew_status === 'boolean') {
        return event.auto_renew_status;
    }
    if (eventType === 'CANCELLATION') return false;
    if (eventType === 'UNCANCELLATION' || eventType === 'RENEWAL' || eventType === 'INITIAL_PURCHASE') return true;
    return existing?.will_renew ?? null;
};

const resolveBillingIssueDetected = (eventType: string, existing?: SubscriptionStateRow | null): boolean => {
    if (BILLING_ISSUE_EVENT_TYPES.has(eventType)) return true;
    if (BILLING_CLEAR_ISSUE_EVENT_TYPES.has(eventType)) return false;
    return Boolean(existing?.billing_issue_detected);
};

const resolveActiveState = (params: {
    eventType: string;
    entitlementIds: string[];
    entitlementId: string | null;
    expiresAtMs: number | null;
    existing?: SubscriptionStateRow | null;
}): boolean => {
    const { eventType, entitlementIds, entitlementId, expiresAtMs, existing } = params;

    if (BILLING_INACTIVE_EVENT_TYPES.has(eventType)) return false;
    if (BILLING_ISSUE_EVENT_TYPES.has(eventType)) return Boolean(existing?.is_active);

    const hasTargetEntitlement =
        entitlementIds.includes(REVENUECAT_PRIMARY_ENTITLEMENT) ||
        entitlementId === REVENUECAT_PRIMARY_ENTITLEMENT;

    if (!hasTargetEntitlement) {
        return Boolean(existing?.is_active);
    }

    if (expiresAtMs && expiresAtMs <= Date.now()) {
        return false;
    }

    if (BILLING_ACTIVE_EVENT_TYPES.has(eventType)) {
        return true;
    }

    return Boolean(existing?.is_active) || hasTargetEntitlement;
};

export const isRevenueCatWebhookAuthorized = (authorizationHeader: string | undefined): boolean => {
    const expected = (process.env.REVENUECAT_WEBHOOK_AUTH || '').trim();
    if (!expected) {
        return process.env.NODE_ENV !== 'production';
    }

    const provided = (authorizationHeader || '').trim();
    if (!provided) return false;
    if (provided === expected) return true;

    if (provided.toLowerCase().startsWith('bearer ')) {
        const token = provided.slice(7).trim();
        return token === expected;
    }

    return false;
};

const findUserByAppUserIdCandidate = async (candidate: string): Promise<string | null> => {
    const lookups: Array<{ column: 'id' | 'email' | 'privy_id'; value: string }> = [
        { column: 'id', value: candidate },
        { column: 'email', value: candidate },
        { column: 'privy_id', value: candidate },
    ];

    for (const lookup of lookups) {
        const { data, error } = await supabase
            .from('users')
            .select('id')
            .eq(lookup.column, lookup.value)
            .maybeSingle();
        if (error) {
            logger.debug('RevenueCat user lookup failed', { column: lookup.column, error: error.message });
            continue;
        }
        if (data?.id) return String(data.id);
    }

    return null;
};

export const resolveRevenueCatUserId = async (candidates: string[]): Promise<string | null> => {
    for (const candidate of candidates) {
        const userId = await findUserByAppUserIdCandidate(candidate);
        if (userId) return userId;
    }
    return null;
};

export const syncRevenueCatStateForUser = async (user: {
    id: string;
    email?: string | null;
    privy_id?: string | null;
}) => {
    const candidates = Array.from(
        new Set(
            [user.id, user.email || null, user.privy_id || null]
                .map((value) => normalizeAppUserId(value))
                .filter((value): value is string => Boolean(value))
        )
    );

    if (!candidates.length) return;

    await supabase
        .from('billing_subscription_states')
        .update({ user_id: user.id })
        .is('user_id', null)
        .in('app_user_id', candidates);
};

export const ingestRevenueCatWebhook = async (payload: any) => {
    const event = parseRevenueCatWebhookEvent(payload);
    if (!event) {
        throw new Error('Invalid RevenueCat payload: missing event object');
    }

    const candidates = getRevenueCatAppUserIdCandidates(event);
    const appUserId = candidates[0];
    if (!appUserId) {
        throw new Error('RevenueCat payload missing app_user_id');
    }

    const eventType = String(event.type || 'UNKNOWN').toUpperCase();
    const eventId = normalizeAppUserId(event.id) || getSyntheticEventId(event, appUserId);
    const userId = await resolveRevenueCatUserId(candidates);

    const { error: eventInsertError } = await supabase.from('billing_revenuecat_events').insert({
        event_id: eventId,
        app_user_id: appUserId,
        user_id: userId,
        event_type: eventType,
        event_timestamp_ms: Number(event.event_timestamp_ms || Date.now()),
        product_id: event.product_id || null,
        store: event.store || null,
        environment: event.environment || null,
        payload,
    });

    if (eventInsertError && eventInsertError.code === '23505') {
        return { duplicate: true, eventId, appUserId, userId };
    }
    if (eventInsertError) {
        throw new Error(`Failed to store RevenueCat event: ${eventInsertError.message}`);
    }

    const { data: existing } = await supabase
        .from('billing_subscription_states')
        .select('*')
        .eq('app_user_id', appUserId)
        .maybeSingle();

    const entitlementIds = normalizeEntitlementIds(event, existing as SubscriptionStateRow | null);
    const entitlementId = normalizeAppUserId(event.entitlement_id) || entitlementIds[0] || existing?.entitlement_id || null;
    const purchasedAtIso = parseMsToIso(event.purchased_at_ms) || existing?.purchased_at || null;
    const expiresAtIso = parseMsToIso(event.expiration_at_ms) || existing?.expires_at || null;
    const expiresAtMs = parseIsoToMs(expiresAtIso);
    const willRenew = resolveWillRenew(eventType, event, existing as SubscriptionStateRow | null);
    const isActive = resolveActiveState({
        eventType,
        entitlementIds,
        entitlementId,
        expiresAtMs,
        existing: existing as SubscriptionStateRow | null,
    });
    const isTrial = String(event.period_type || '').toUpperCase() === 'TRIAL'
        ? true
        : Boolean(existing?.is_trial);
    const billingIssueDetected = resolveBillingIssueDetected(eventType, existing as SubscriptionStateRow | null);

    const { error: upsertError } = await supabase
        .from('billing_subscription_states')
        .upsert({
            app_user_id: appUserId,
            user_id: userId || existing?.user_id || null,
            entitlement_id: entitlementId,
            entitlement_ids: entitlementIds,
            is_active: isActive,
            product_id: event.product_id || existing?.product_id || null,
            store: event.store || existing?.store || null,
            environment: event.environment || existing?.environment || null,
            period_type: event.period_type || existing?.period_type || null,
            ownership_type: event.ownership_type || existing?.ownership_type || null,
            will_renew: willRenew,
            is_trial: isTrial,
            billing_issue_detected: billingIssueDetected,
            latest_event_type: eventType,
            latest_event_id: eventId,
            event_timestamp_ms: Number(event.event_timestamp_ms || Date.now()),
            purchased_at: purchasedAtIso,
            expires_at: expiresAtIso,
            raw_event: payload,
        }, { onConflict: 'app_user_id' });

    if (upsertError) {
        throw new Error(`Failed to upsert RevenueCat subscription state: ${upsertError.message}`);
    }

    // Mirror the resolved status onto the users table so billing/status reads it correctly.
    // CANCELLATION sets is_active=false via resolveActiveState but expiry may still be in the future;
    // we write 'inactive' immediately so the UI reflects the cancellation intent, not just expiry.
    if (userId) {
        const newStatus = isActive ? 'active' : 'inactive';
        await supabase
            .from('users')
            .update({
                subscription_status:   newStatus,
                subscription_provider: 'revenue_cat',
                subscription_expiry:   expiresAtIso,
                updated_at:            new Date().toISOString(),
            })
            .eq('id', userId);
    }

    return { duplicate: false, eventId, appUserId, userId, isActive };

export const getRevenueCatStateForUser = async (user: {
    id: string;
    email?: string | null;
    privy_id?: string | null;
}) => {
    const candidates = Array.from(
        new Set(
            [user.id, user.email || null, user.privy_id || null]
                .map((value) => normalizeAppUserId(value))
                .filter((value): value is string => Boolean(value))
        )
    );

    const { data: byUserId } = await supabase
        .from('billing_subscription_states')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (byUserId) return byUserId as SubscriptionStateRow;

    if (candidates.length > 0) {
        const { data: byAppUserId } = await supabase
            .from('billing_subscription_states')
            .select('*')
            .in('app_user_id', candidates)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (byAppUserId) return byAppUserId as SubscriptionStateRow;
    }

    return null;
};

