import crypto from 'crypto';
import { Request, Response, Router } from 'express';
import { supabase } from '../lib/supabase';
import { createLogger } from '../utils/logger';

const logger = createLogger('PaymentWebhooks');
const router = Router();

type Provider = 'polar' | 'revenue_cat';
type SubscriptionStatus = 'active' | 'inactive';
type RawBodyRequest = Request & { rawBody?: string };

type RevenueCatEvent = {
    type?: string;
    app_user_id?: string;
    original_app_user_id?: string;
    aliases?: unknown;
    expiration_at_ms?: unknown;
    [key: string]: unknown;
};

const REVENUECAT_ACTIVE_EVENTS = new Set(['INITIAL_PURCHASE', 'RENEWAL']);
const REVENUECAT_INACTIVE_EVENTS = new Set(['CANCELLATION', 'EXPIRATION']);
const POLAR_ACTIVE_EVENTS = new Set(['subscription.created', 'subscription.updated']);
const POLAR_INACTIVE_EVENTS = new Set(['subscription.deleted', 'subscription.canceled', 'subscription.revoked']);

const normalizeString = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    return normalized ? normalized : null;
};

const normalizeStringArray = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    return value
        .map((item) => normalizeString(item))
        .filter((item): item is string => Boolean(item));
};

const getHeader = (req: Request, names: string[]): string | null => {
    for (const name of names) {
        const header = req.headers[name.toLowerCase()];
        if (typeof header === 'string' && header.trim()) return header.trim();
        if (Array.isArray(header) && header[0]?.trim()) return header[0].trim();
    }
    return null;
};

const splitPath = (path: string): string[] => path.split('.').filter(Boolean);

const getPathValue = (payload: unknown, path: string): unknown => {
    let cursor: unknown = payload;
    for (const key of splitPath(path)) {
        if (!cursor || typeof cursor !== 'object') return undefined;
        cursor = (cursor as Record<string, unknown>)[key];
    }
    return cursor;
};

const collectPathStrings = (payload: unknown, paths: string[]): string[] => {
    const out = new Set<string>();
    for (const path of paths) {
        const normalized = normalizeString(getPathValue(payload, path));
        if (normalized) out.add(normalized);
    }
    return Array.from(out);
};

const toIsoTimestamp = (value: unknown): string | null => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number' && Number.isFinite(value)) {
        const ms = value > 1e12 ? value : value * 1000;
        if (!Number.isFinite(ms) || ms <= 0) return null;
        return new Date(ms).toISOString();
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return null;
        const asNumber = Number(trimmed);
        if (Number.isFinite(asNumber) && asNumber > 0) {
            const ms = asNumber > 1e12 ? asNumber : asNumber * 1000;
            return new Date(ms).toISOString();
        }
        const parsed = Date.parse(trimmed);
        if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
    }
    return null;
};

const parseRevenueCatEvent = (payload: unknown): RevenueCatEvent | null => {
    if (!payload || typeof payload !== 'object') return null;
    const source = (
        'event' in (payload as Record<string, unknown>) &&
        (payload as Record<string, unknown>).event &&
        typeof (payload as Record<string, unknown>).event === 'object'
    )
        ? (payload as Record<string, unknown>).event
        : payload;

    if (!source || typeof source !== 'object') return null;
    return source as RevenueCatEvent;
};

const normalizeBase64 = (value: string): string => {
    const base = value.replace(/-/g, '+').replace(/_/g, '/').trim();
    const padLength = (4 - (base.length % 4)) % 4;
    return `${base}${'='.repeat(padLength)}`;
};

const decodePotentialBase64 = (value: string): Buffer | null => {
    const normalized = normalizeBase64(value);
    if (!normalized) return null;
    try {
        const decoded = Buffer.from(normalized, 'base64');
        if (!decoded.length) return null;
        return decoded;
    } catch {
        return null;
    }
};

const getPolarSecretKey = (secret: string): Buffer => {
    const trimmed = secret.trim();
    if (!trimmed) return Buffer.from('', 'utf8');

    const prefixes = ['whsec_', 'polar_whs_'];
    for (const prefix of prefixes) {
        if (trimmed.startsWith(prefix)) {
            const raw = trimmed.slice(prefix.length);
            const decoded = decodePotentialBase64(raw);
            return decoded || Buffer.from(raw, 'utf8');
        }
    }

    return Buffer.from(trimmed, 'utf8');
};

const parseStandardSignatures = (headerValue: string): string[] => {
    const out = new Set<string>();
    const matches = headerValue.matchAll(/v1,([A-Za-z0-9+/=_-]+)/g);
    for (const match of matches) {
        const candidate = normalizeString(match[1]);
        if (candidate) out.add(candidate);
    }
    return Array.from(out);
};

const safeCompareSignatures = (provided: string, expected: string): boolean => {
    try {
        const providedBuffer = Buffer.from(normalizeBase64(provided), 'base64');
        const expectedBuffer = Buffer.from(normalizeBase64(expected), 'base64');
        if (providedBuffer.length !== expectedBuffer.length) return false;
        return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
    } catch {
        return false;
    }
};

const verifyPolarSignature = (req: RawBodyRequest): { ok: boolean; reason?: string } => {
    const secret = normalizeString(process.env.POLAR_WEBHOOK_SECRET);
    if (!secret) return { ok: false, reason: 'POLAR_WEBHOOK_SECRET is not configured' };

    const rawBody = typeof req.rawBody === 'string' ? req.rawBody : null;
    if (rawBody === null) return { ok: false, reason: 'Missing raw body for signature verification' };

    const webhookId = getHeader(req, ['webhook-id', 'svix-id']);
    const webhookTimestamp = getHeader(req, ['webhook-timestamp', 'svix-timestamp']);
    const signatureHeader = getHeader(req, ['webhook-signature', 'svix-signature']);

    if (!webhookId || !webhookTimestamp || !signatureHeader) {
        return { ok: false, reason: 'Missing Polar signature headers' };
    }

    const timestampSeconds = Number(webhookTimestamp);
    if (Number.isFinite(timestampSeconds)) {
        const skew = Math.abs(Math.floor(Date.now() / 1000) - Math.floor(timestampSeconds));
        if (skew > 300) return { ok: false, reason: 'Stale webhook timestamp' };
    }

    const key = getPolarSecretKey(secret);
    const signedPayload = `${webhookId}.${webhookTimestamp}.${rawBody}`;
    const expectedSignature = crypto
        .createHmac('sha256', key)
        .update(signedPayload)
        .digest('base64');

    const providedSignatures = parseStandardSignatures(signatureHeader);
    if (!providedSignatures.length) return { ok: false, reason: 'Invalid signature header format' };

    const matches = providedSignatures.some((sig) => safeCompareSignatures(sig, expectedSignature));
    return matches ? { ok: true } : { ok: false, reason: 'Signature mismatch' };
};

const verifyRevenueCatAuthorization = (req: Request): { ok: boolean; reason?: string } => {
    const expected = normalizeString(process.env.REVENUECAT_WEBHOOK_AUTH);
    if (!expected) return { ok: false, reason: 'REVENUECAT_WEBHOOK_AUTH is not configured' };

    const authHeader = getHeader(req, ['authorization', 'x-authorization', 'x-webhook-auth']);
    if (!authHeader) return { ok: false, reason: 'Missing authorization header' };

    const provided = authHeader.toLowerCase().startsWith('bearer ')
        ? authHeader.slice(7).trim()
        : authHeader.trim();

    const providedBuffer = Buffer.from(provided);
    const expectedBuffer = Buffer.from(expected);

    if (providedBuffer.length !== expectedBuffer.length) {
        return { ok: false, reason: 'Authorization mismatch' };
    }

    const matches = crypto.timingSafeEqual(providedBuffer, expectedBuffer);
    return matches ? { ok: true } : { ok: false, reason: 'Authorization mismatch' };
};

const lookupUserByIdLikeCandidate = async (candidate: string): Promise<string | null> => {
    const attempts: Array<{ column: 'id' | 'privy_id' | 'email'; value: string }> = [
        { column: 'id', value: candidate },
        { column: 'privy_id', value: candidate },
        { column: 'email', value: candidate },
    ];

    for (const attempt of attempts) {
        const query = supabase.from('users').select('id').limit(1);
        const { data, error } = attempt.column === 'email'
            ? await query.ilike(attempt.column, attempt.value).maybeSingle()
            : await query.eq(attempt.column, attempt.value).maybeSingle();

        if (error) continue;
        if (data?.id) return String(data.id);
    }

    return null;
};

const lookupUserByEmail = async (email: string): Promise<string | null> => {
    const { data, error } = await supabase
        .from('users')
        .select('id')
        .ilike('email', email)
        .limit(1)
        .maybeSingle();
    if (error || !data?.id) return null;
    return String(data.id);
};

const resolveUserFromPolarPayload = async (payload: unknown): Promise<string | null> => {
    const customerIdCandidates = collectPathStrings(payload, [
        'data.customer_id',
        'data.customer.id',
        'data.customer.external_id',
        'data.customer.external_customer_id',
        'data.customer.external_reference',
        'data.customer.metadata.user_id',
        'data.metadata.user_id',
        'customer_id',
        'customer.id',
    ]);

    for (const candidate of customerIdCandidates) {
        const userId = await lookupUserByIdLikeCandidate(candidate);
        if (userId) return userId;
    }

    const emailCandidates = collectPathStrings(payload, [
        'data.customer_email',
        'data.customer.email',
        'data.email',
        'data.user.email',
        'customer.email',
        'email',
    ]);

    for (const email of emailCandidates) {
        const userId = await lookupUserByEmail(email);
        if (userId) return userId;
    }

    return null;
};

const resolveUserFromRevenueCatEvent = async (event: RevenueCatEvent): Promise<string | null> => {
    const primary = normalizeString(event.app_user_id);
    if (primary) {
        const primaryMatch = await lookupUserByIdLikeCandidate(primary);
        if (primaryMatch) return primaryMatch;
    }

    const candidates = Array.from(
        new Set([
            ...normalizeStringArray(event.aliases),
            normalizeString(event.original_app_user_id),
        ].filter((value): value is string => Boolean(value)))
    );

    for (const candidate of candidates) {
        const userId = await lookupUserByIdLikeCandidate(candidate);
        if (userId) return userId;
    }

    return null;
};

const detectProvider = (req: Request, payload: unknown): Provider | null => {
    const hasPolarHeaders = Boolean(
        getHeader(req, ['webhook-id', 'webhook-signature', 'webhook-timestamp']) ||
        getHeader(req, ['svix-id', 'svix-signature', 'svix-timestamp'])
    );
    if (hasPolarHeaders) return 'polar';

    const revenueCatEvent = parseRevenueCatEvent(payload);
    if (revenueCatEvent) {
        const type = normalizeString(revenueCatEvent.type);
        const hasUserId = Boolean(normalizeString(revenueCatEvent.app_user_id));
        if (hasUserId && type && /^[A-Z_]+$/.test(type)) return 'revenue_cat';
    }

    const topLevelType = normalizeString(getPathValue(payload, 'type'));
    if (topLevelType && topLevelType.startsWith('subscription.')) return 'polar';

    return null;
};

const updateUserSubscription = async (params: {
    userId: string;
    status: SubscriptionStatus;
    provider: Provider;
    expiry: string | null;
}) => {
    const { error } = await supabase
        .from('users')
        .update({
            subscription_status: params.status,
            subscription_provider: params.provider,
            subscription_expiry: params.expiry,
        })
        .eq('id', params.userId);

    if (error) {
        throw new Error(`Failed to update user subscription: ${error.message}`);
    }
};

const resolvePolarSubscriptionStatus = (payload: unknown, eventType: string): SubscriptionStatus | null => {
    if (POLAR_INACTIVE_EVENTS.has(eventType)) return 'inactive';
    if (!POLAR_ACTIVE_EVENTS.has(eventType)) return null;

    if (eventType === 'subscription.updated') {
        const status = normalizeString(getPathValue(payload, 'data.status'))
            || normalizeString(getPathValue(payload, 'data.subscription.status'));

        if (status) {
            const normalized = status.toLowerCase();
            if (['canceled', 'cancelled', 'revoked', 'inactive', 'deleted', 'expired'].includes(normalized)) {
                return 'inactive';
            }
        }
    }

    return 'active';
};

const resolvePolarExpiry = (payload: unknown): string | null => {
    const candidates = [
        getPathValue(payload, 'data.current_period_end'),
        getPathValue(payload, 'data.current_period_end_at'),
        getPathValue(payload, 'data.ends_at'),
        getPathValue(payload, 'data.end_date'),
        getPathValue(payload, 'data.expires_at'),
        getPathValue(payload, 'data.period_end'),
        getPathValue(payload, 'data.subscription.current_period_end'),
        getPathValue(payload, 'data.subscription.current_period_end_at'),
    ];

    for (const candidate of candidates) {
        const iso = toIsoTimestamp(candidate);
        if (iso) return iso;
    }

    return null;
};

router.post('/', async (req: Request, res: Response) => {
    try {
        const payload = req.body;
        const provider = detectProvider(req, payload);

        if (!provider) {
            res.status(400).json({ success: false, error: 'Unknown payment webhook source' });
            return;
        }

        if (provider === 'polar') {
            const verification = verifyPolarSignature(req as RawBodyRequest);
            if (!verification.ok) {
                logger.warn('Polar webhook rejected', { reason: verification.reason });
                res.status(401).json({ success: false, error: verification.reason || 'Invalid signature' });
                return;
            }

            const eventType = (normalizeString(getPathValue(payload, 'type')) || '').toLowerCase();
            const status = resolvePolarSubscriptionStatus(payload, eventType);
            if (!status) {
                res.status(202).json({ success: true, data: { received: true, provider, ignored: true } });
                return;
            }

            const userId = await resolveUserFromPolarPayload(payload);
            if (!userId) {
                logger.warn('Polar webhook user not found', { eventType });
                res.status(202).json({ success: true, data: { received: true, provider, matchedUser: false } });
                return;
            }

            await updateUserSubscription({
                userId,
                status,
                provider,
                expiry: resolvePolarExpiry(payload),
            });

            res.json({
                success: true,
                data: { received: true, provider, eventType, userId, subscriptionStatus: status },
            });
            return;
        }

        const verification = verifyRevenueCatAuthorization(req);
        if (!verification.ok) {
            logger.warn('RevenueCat webhook rejected', { reason: verification.reason });
            res.status(401).json({ success: false, error: verification.reason || 'Unauthorized' });
            return;
        }

        const event = parseRevenueCatEvent(payload);
        if (!event) {
            res.status(400).json({ success: false, error: 'Invalid RevenueCat payload' });
            return;
        }

        const eventType = (normalizeString(event.type) || '').toUpperCase();
        let status: SubscriptionStatus | null = null;
        if (REVENUECAT_ACTIVE_EVENTS.has(eventType)) status = 'active';
        if (REVENUECAT_INACTIVE_EVENTS.has(eventType)) status = 'inactive';
        if (!status) {
            res.status(202).json({ success: true, data: { received: true, provider, ignored: true } });
            return;
        }

        const userId = await resolveUserFromRevenueCatEvent(event);
        if (!userId) {
            logger.warn('RevenueCat webhook user not found', {
                eventType,
                appUserId: normalizeString(event.app_user_id),
            });
            res.status(202).json({ success: true, data: { received: true, provider, matchedUser: false } });
            return;
        }

        await updateUserSubscription({
            userId,
            status,
            provider,
            expiry: toIsoTimestamp(event.expiration_at_ms),
        });

        res.json({
            success: true,
            data: { received: true, provider, eventType, userId, subscriptionStatus: status },
        });
    } catch (error: any) {
        logger.error('Unified payments webhook processing failed', {
            error: error?.message || 'Unknown',
        });
        res.status(400).json({
            success: false,
            error: error?.message || 'Unable to process webhook',
        });
    }
});

export default router;
