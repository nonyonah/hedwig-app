import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { supabase } from '../lib/supabase';
import NotificationService from '../services/notifications';
import BackendAnalytics from '../services/analytics';
import { EmailService } from '../services/email';
import { createLogger } from '../utils/logger';

const logger = createLogger('CircleGatewayWebhook');
const router = Router();

const CIRCLE_NOTIFICATIONS_API_BASE_URL = (
    process.env.CIRCLE_NOTIFICATIONS_API_BASE_URL ||
    process.env.CIRCLE_DEVELOPER_API_BASE_URL ||
    'https://api.circle.com'
).replace(/\/+$/, '');
const CIRCLE_API_KEY = String(process.env.CIRCLE_API_KEY || '').trim();
const CIRCLE_PUBLIC_KEY_CACHE_MS = 1000 * 60 * 60 * 6;

type CirclePublicKeyCacheEntry = {
    publicKey: crypto.KeyObject;
    expiresAt: number;
};

const circlePublicKeyCache = new Map<string, CirclePublicKeyCacheEntry>();

// Map Circle's domain string (chain key) to a user-friendly label. Circle
// emits the chain key (e.g. "baseSepolia") so we mirror what the mobile UI
// shows so users see the same wording across surfaces.
const CHAIN_LABELS: Record<string, string> = {
    '0': 'Ethereum',
    '2': 'Optimism',
    '3': 'Arbitrum',
    '5': 'Solana',
    '6': 'Base',
    '7': 'Polygon',
    '10': 'Unichain',
    '13': 'Sonic',
    '14': 'World Chain',
    '16': 'Sei',
    '19': 'HyperEVM',
    '26': 'Arc Testnet',
    base: 'Base',
    baseSepolia: 'Base Sepolia',
    arbitrum: 'Arbitrum',
    arbitrumSepolia: 'Arbitrum Sepolia',
    polygon: 'Polygon',
    polygonAmoy: 'Polygon Amoy',
    optimism: 'Optimism',
    optimismSepolia: 'OP Sepolia',
    solana: 'Solana',
    solanaDevnet: 'Solana Devnet',
};

const formatChainLabel = (domain?: string | number | null): string => {
    if (domain === null || domain === undefined || domain === '') return 'unknown chain';
    const key = String(domain).trim();
    return CHAIN_LABELS[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
};

const formatUsdc = (raw?: string | number | null): string => {
    if (raw === null || raw === undefined) return '';
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(n)) return '';
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 });
};

const shortHash = (hash?: string | null): string => {
    if (!hash) return '';
    if (hash.length <= 14) return hash;
    return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
};

const headerValue = (req: Request, name: string): string | null => {
    const value = req.headers[name.toLowerCase()];
    if (typeof value === 'string') return value.trim() || null;
    if (Array.isArray(value)) return value.find((item) => item.trim().length > 0)?.trim() || null;
    return null;
};

const getCircleNotificationPublicKey = async (keyId: string): Promise<crypto.KeyObject | null> => {
    const cached = circlePublicKeyCache.get(keyId);
    if (cached && cached.expiresAt > Date.now()) return cached.publicKey;

    if (!CIRCLE_API_KEY) {
        logger.error('CRITICAL: CIRCLE_API_KEY not configured for Circle webhook verification');
        return null;
    }

    const response = await fetch(`${CIRCLE_NOTIFICATIONS_API_BASE_URL}/v2/notifications/publicKey/${encodeURIComponent(keyId)}`, {
        method: 'GET',
        headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${CIRCLE_API_KEY}`,
        },
    });

    const text = await response.text();
    let payload: any = null;
    try {
        payload = text ? JSON.parse(text) : null;
    } catch {
        payload = null;
    }

    if (!response.ok) {
        logger.warn('Failed to fetch Circle webhook public key', {
            keyId,
            status: response.status,
            message: payload?.message || payload?.error || text || null,
        });
        return null;
    }

    const publicKeyBase64 = payload?.data?.publicKey;
    if (typeof publicKeyBase64 !== 'string' || publicKeyBase64.trim().length === 0) {
        logger.warn('Circle webhook public key response missing publicKey', { keyId });
        return null;
    }

    try {
        const publicKey = crypto.createPublicKey({
            key: Buffer.from(publicKeyBase64, 'base64'),
            format: 'der',
            type: 'spki',
        });
        circlePublicKeyCache.set(keyId, {
            publicKey,
            expiresAt: Date.now() + CIRCLE_PUBLIC_KEY_CACHE_MS,
        });
        return publicKey;
    } catch (error) {
        logger.warn('Failed to parse Circle webhook public key', {
            keyId,
            error: error instanceof Error ? error.message : 'Unknown',
        });
        return null;
    }
};

/**
 * Circle signs webhook notifications with an asymmetric key. The webhook
 * provides X-Circle-Key-Id and X-Circle-Signature; fetch/cache the public key
 * and verify the raw JSON body with ECDSA SHA-256.
 */
const verifySignature = async (rawBody: string, signature: string | null, keyId: string | null): Promise<boolean> => {
    if (!signature || !keyId) return false;

    const publicKey = await getCircleNotificationPublicKey(keyId);
    if (!publicKey) return false;

    try {
        return crypto.verify(
            'sha256',
            Buffer.from(rawBody, 'utf8'),
            publicKey,
            Buffer.from(signature, 'base64'),
        );
    } catch (error) {
        logger.warn('Circle Gateway webhook signature verification threw', {
            keyId,
            error: error instanceof Error ? error.message : 'Unknown',
        });
        return false;
    }
};

interface DepositFinalizedPayload {
    id: string;
    walletAddress: string;
    domain: string;
    env?: string;
    tokenAddress?: string;
    amount?: string;
    from?: string;
    to?: string;
    txHash?: string;
}

interface MintAttestation {
    from?: string;
    to?: string;
    amount?: string;
    transferSpecHash?: string;
}

interface MintFinalizedPayload {
    transferId: string;
    txHash?: string;
    walletAddress: string;
    domain: string;
    env?: string;
    tokenAddress?: string;
    wasForwarded?: boolean;
    attestations?: MintAttestation[];
}

interface WebhookEnvelope {
    subscriptionId?: string;
    notificationId: string;
    notificationType: string;
    notification: DepositFinalizedPayload | MintFinalizedPayload | Record<string, any>;
    timestamp?: string;
    version?: number;
}

const parseDecimalUsdc = (raw?: string | null): bigint => {
    if (!raw) return 0n;
    const [intPart, fracPart = ''] = raw.trim().split('.');
    const padded = (fracPart + '000000').slice(0, 6);
    try { return BigInt(intPart || '0') * 1_000_000n + BigInt(padded); }
    catch { return 0n; }
};

const sumAttestationAmount = (attestations?: MintAttestation[]): string | null => {
    if (!Array.isArray(attestations) || attestations.length === 0) return null;
    let total = 0n;
    for (const a of attestations) {
        total += parseDecimalUsdc(a.amount);
    }
    // Convert back to decimal string so formatUsdc can render it
    const whole = total / 1_000_000n;
    const frac = total % 1_000_000n;
    return `${whole}.${frac.toString().padStart(6, '0')}`;
};

const EVM_ADDRESS_RE = /^0x[a-f0-9]{40}$/i;
const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const resolveUserId = async (walletAddress?: string | null): Promise<string | null> => {
    if (!walletAddress) return null;
    const trimmed = walletAddress.trim();
    const isEvm = EVM_ADDRESS_RE.test(trimmed);
    const isSolana = !isEvm && SOLANA_ADDRESS_RE.test(trimmed);
    if (!isEvm && !isSolana) {
        // Anything that isn't a canonical address (e.g. bytes32-padded value
        // or a stray identifier) can't safely be passed into a PostgREST .or
        // filter — silently skip user lookup.
        return null;
    }
    const column = isEvm ? 'ethereum_wallet_address' : 'solana_wallet_address';
    const value = isEvm ? trimmed.toLowerCase() : trimmed;
    const { data } = await supabase
        .from('users')
        .select('id')
        .ilike(column, value)
        .limit(1)
        .maybeSingle();
    const id = data?.id;
    return typeof id === 'string' && UUID_RE.test(id.trim()) ? id : null;
};

const buildCopy = (envelope: WebhookEnvelope): { title: string; body: string; type: string } => {
    const chain = formatChainLabel((envelope.notification as any)?.domain);
    switch (envelope.notificationType) {
        case 'gateway.deposit.finalized': {
            const p = envelope.notification as DepositFinalizedPayload;
            const amount = formatUsdc(p.amount);
            return {
                title: 'Aggregated USDC topped up',
                body: amount
                    ? `${amount} USDC deposited from ${chain} is now part of your Aggregated USDC balance.`
                    : `Your deposit on ${chain} is now part of your Aggregated USDC balance.`,
                type: 'gateway_deposit_finalized',
            };
        }
        case 'gateway.mint.forwarded': {
            const p = envelope.notification as MintFinalizedPayload;
            const amount = formatUsdc(sumAttestationAmount(p.attestations));
            return {
                title: 'Transfer in flight',
                body: amount
                    ? `${amount} USDC is being delivered to ${chain}. Tracking confirmation…`
                    : `Your transfer to ${chain} is being settled. Tracking confirmation…`,
                type: 'gateway_mint_forwarded',
            };
        }
        case 'gateway.mint.finalized': {
            const p = envelope.notification as MintFinalizedPayload;
            const amount = formatUsdc(sumAttestationAmount(p.attestations));
            const hash = shortHash(p.txHash);
            return {
                title: 'Transfer delivered',
                body: amount
                    ? `${amount} USDC arrived on ${chain}${hash ? ` · ${hash}` : ''}.`
                    : `Your transfer landed on ${chain}${hash ? ` · ${hash}` : ''}.`,
                type: 'gateway_mint_finalized',
            };
        }
        default:
            return {
                title: 'Circle Gateway event',
                body: envelope.notificationType,
                type: 'gateway_event',
            };
    }
};

const handleWebhook = async (req: Request, res: Response, _next: NextFunction) => {
    try {
        const rawBody = (req as any).rawBody ?? JSON.stringify(req.body ?? {});
        const signature = headerValue(req, 'x-circle-signature');
        const keyId = headerValue(req, 'x-circle-key-id');

        // Circle pings `webhooks.test` (no signature) when verifying a new
        // subscription endpoint. Acknowledge it with 200 unconditionally,
        // otherwise the permissionless subscription creation aborts with a
        // generic "API parameter invalid".
        const probeType = String((req.body as any)?.notificationType || '').toLowerCase();
        if (probeType === 'webhooks.test') {
            res.status(200).json({ received: true, status: 'preflight_ok' });
            return;
        }

        if (process.env.NODE_ENV === 'production' && !(await verifySignature(rawBody, signature, keyId))) {
            logger.warn('Invalid Circle Gateway webhook signature', {
                signaturePresent: Boolean(signature),
                keyIdPresent: Boolean(keyId),
            });
            res.status(401).json({ error: 'invalid_signature' });
            return;
        }
        if (process.env.NODE_ENV !== 'production' && signature && keyId && !(await verifySignature(rawBody, signature, keyId))) {
            logger.warn('Invalid Circle Gateway webhook signature (dev)', {
                signaturePresent: true,
                keyIdPresent: true,
            });
        }

        const envelope = (req.body || {}) as WebhookEnvelope;
        if (!envelope.notificationId || !envelope.notificationType) {
            res.status(200).json({ received: true, status: 'ignored_missing_fields' });
            return;
        }

    const notification = envelope.notification as any || {};
    const walletAddress =
        notification.walletAddress ??
        notification.depositorAddress ??
        notification.depositor ??
        notification.sourceDepositor ??
        notification.sourceWalletAddress ??
        notification.to ??
        notification.from ??
        null;
    const transferId = notification.transferId ?? null;
    const txHash = notification.txHash ?? null;
    const domain = notification.domain ?? null;
    const env = notification.env ?? null;
    const userId = await resolveUserId(walletAddress);

    // Persist. Conflict on notification_id is the dedup key — second delivery
    // returns immediately without re-running side effects.
    const { data: inserted, error: insertErr } = await supabase
        .from('gateway_webhook_events')
        .insert({
            notification_id: envelope.notificationId,
            subscription_id: envelope.subscriptionId ?? null,
            notification_type: envelope.notificationType,
            wallet_address: walletAddress,
            transfer_id: transferId,
            tx_hash: txHash,
            domain,
            env,
            user_id: userId,
            payload: envelope,
        })
        .select('id')
        .single();

    if (insertErr) {
        // Postgres unique violation = duplicate delivery. Acknowledge 200.
        if ((insertErr as any).code === '23505') {
            res.status(200).json({ received: true, status: 'duplicate' });
            return;
        }
        logger.error('Failed to persist gateway webhook', { error: insertErr.message });
    }

    BackendAnalytics.capture(
        userId ?? 'anonymous',
        'gateway_webhook_received',
        {
            notification_id: envelope.notificationId,
            notification_type: envelope.notificationType,
            domain,
            env,
        }
    ).catch(() => { /* analytics is best-effort */ });

    if (!userId) {
        res.status(200).json({ received: true, status: 'no_user_match' });
        return;
    }

    const copy = buildCopy(envelope);

    try {
        await supabase.from('notifications').insert({
            user_id: userId,
            title: copy.title,
            message: copy.body,
            type: copy.type,
            metadata: {
                notificationId: envelope.notificationId,
                notificationType: envelope.notificationType,
                transferId,
                txHash,
                domain,
                env,
                walletAddress,
            },
            is_read: false,
        });
    } catch (notifErr) {
        logger.warn('Failed to persist in-app notification', {
            error: notifErr instanceof Error ? notifErr.message : 'Unknown',
        });
    }

    try {
        await NotificationService.notifyUser(userId, {
            title: copy.title,
            body: copy.body,
            data: {
                type: copy.type,
                notificationId: envelope.notificationId,
                transferId: transferId ?? undefined,
                txHash: txHash ?? undefined,
                domain: domain ?? undefined,
                route: '/' /* land on wallet so user can see the unified balance */,
            },
        });
    } catch (pushErr) {
        logger.warn('Failed to push gateway notification', {
            error: pushErr instanceof Error ? pushErr.message : 'Unknown',
        });
    }

    // Email fallback so the user gets confirmation even when push delivery
    // fails. Looks up the user's email + first name and routes through the
    // shared aggregated USDC template (deep-links into the mobile app).
    try {
        const kindMap: Record<string, 'deposit_finalized' | 'mint_forwarded' | 'mint_finalized'> = {
            gateway_deposit_finalized: 'deposit_finalized',
            gateway_mint_forwarded: 'mint_forwarded',
            gateway_mint_finalized: 'mint_finalized',
        };
        const kind = kindMap[copy.type];
        if (kind) {
            const { data: userRow } = await supabase
                .from('users')
                .select('email, first_name')
                .eq('id', userId)
                .maybeSingle();
            const recipient = userRow?.email && typeof userRow.email === 'string' ? userRow.email : null;
            if (recipient) {
                const notification = envelope.notification as any || {};
                const rawAmount =
                    notification.amount ??
                    (Array.isArray(notification.attestations)
                        ? (() => {
                            // Sum attestation amounts (decimal format) and convert back to decimal string
                            let sum = 0n;
                            for (const a of notification.attestations) {
                                sum += parseDecimalUsdc(a?.amount ?? null);
                            }
                            const w = sum / 1_000_000n;
                            const f = sum % 1_000_000n;
                            return `${w}.${f.toString().padStart(6, '0')}`;
                          })()
                        : null);
                const amount = formatUsdc(rawAmount);
                await EmailService.sendAggregatedUsdcEmail({
                    to: recipient,
                    firstName: userRow?.first_name ?? null,
                    kind,
                    amount: amount || null,
                    chain: formatChainLabel(domain),
                    txHash: txHash ?? null,
                });
            }
        }
    } catch (emailErr) {
        logger.warn('Failed to send Aggregated USDC email fallback', {
            error: emailErr instanceof Error ? emailErr.message : 'Unknown',
        });
    }

    if (inserted?.id) {
        await supabase
            .from('gateway_webhook_events')
            .update({ processed_at: new Date().toISOString(), push_sent_at: new Date().toISOString() })
            .eq('id', inserted.id);
    }

    res.status(200).json({ received: true });
    } catch (error) {
        logger.error('Unhandled Circle Gateway webhook error', {
            error: error instanceof Error ? error.message : 'Unknown',
        });
        res.status(200).json({ received: true, status: 'accepted_with_processing_error' });
    }
};

const handleVerificationProbe = (_req: Request, res: Response) => {
    res.status(200).json({
        status: 'ok',
        service: 'circle-gateway-webhook',
        timestamp: new Date().toISOString(),
    });
};

// Circle disallows two permissionless subscriptions on the exact same
// endpoint URL, so we keep EVM and Solana on distinct paths and accept both
// on the same handler.
router.get('/', handleVerificationProbe);
router.get('/solana', handleVerificationProbe);
router.get('/evm', handleVerificationProbe);
router.head('/', handleVerificationProbe);
router.head('/solana', handleVerificationProbe);
router.head('/evm', handleVerificationProbe);
router.options('/', handleVerificationProbe);
router.options('/solana', handleVerificationProbe);
router.options('/evm', handleVerificationProbe);
router.post('/', handleWebhook);
router.post('/solana', handleWebhook);
router.post('/evm', handleWebhook);
router.get('/solana/:batch', handleVerificationProbe);
router.get('/evm/:batch', handleVerificationProbe);
router.head('/solana/:batch', handleVerificationProbe);
router.head('/evm/:batch', handleVerificationProbe);
router.options('/solana/:batch', handleVerificationProbe);
router.options('/evm/:batch', handleVerificationProbe);
router.post('/solana/:batch', handleWebhook);
router.post('/evm/:batch', handleWebhook);

router.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
