import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { supabase } from '../lib/supabase';
import NotificationService from '../services/notifications';
import BackendAnalytics from '../services/analytics';
import { EmailService } from '../services/email';
import { createLogger } from '../utils/logger';

const logger = createLogger('CircleGatewayWebhook');
const router = Router();

const CIRCLE_WEBHOOK_SECRET = process.env.CIRCLE_GATEWAY_WEBHOOK_SECRET || '';
const CIRCLE_SIGNATURE_HEADERS = ['x-circle-signature', 'x-circle-key-id', 'circle-signature'];

// Map Circle's domain string (chain key) to a user-friendly label. Circle
// emits the chain key (e.g. "baseSepolia") so we mirror what the mobile UI
// shows so users see the same wording across surfaces.
const CHAIN_LABELS: Record<string, string> = {
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

const formatChainLabel = (domain?: string | null): string => {
    if (!domain) return 'unknown chain';
    return CHAIN_LABELS[domain] || domain.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
};

const formatUsdc = (raw?: string | number | null): string => {
    if (raw === null || raw === undefined) return '';
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(n)) return '';
    return (n / 1_000_000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 });
};

const shortHash = (hash?: string | null): string => {
    if (!hash) return '';
    if (hash.length <= 14) return hash;
    return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
};

/**
 * Verifies the HMAC signature Circle stamps on webhook deliveries.
 * Circle publishes the verification recipe under
 * https://developers.circle.com/gateway/webhooks (HMAC-SHA256 over the raw
 * request body keyed with the per-subscription secret). When the secret
 * env var is missing in non-production we skip verification so the dev
 * harness still works.
 */
const verifySignature = (rawBody: string, signature: string | null): boolean => {
    if (!CIRCLE_WEBHOOK_SECRET) {
        if (process.env.NODE_ENV === 'production') {
            logger.error('CRITICAL: CIRCLE_GATEWAY_WEBHOOK_SECRET not configured');
            return false;
        }
        return true;
    }
    if (!signature) return false;

    const expected = crypto
        .createHmac('sha256', CIRCLE_WEBHOOK_SECRET)
        .update(rawBody, 'utf8')
        .digest('hex');
    const normalized = signature.trim().replace(/^sha256=/i, '');
    const a = Buffer.from(normalized, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length) return false;
    try {
        return crypto.timingSafeEqual(a, b);
    } catch {
        return false;
    }
};

const findSignatureHeader = (req: Request): string | null => {
    for (const headerName of CIRCLE_SIGNATURE_HEADERS) {
        const value = req.headers[headerName];
        if (typeof value === 'string' && value.trim().length > 0) return value;
    }
    return null;
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

const sumAttestationAmount = (attestations?: MintAttestation[]): string | null => {
    if (!Array.isArray(attestations) || attestations.length === 0) return null;
    let total = 0n;
    for (const a of attestations) {
        try {
            total += BigInt(a.amount ?? '0');
        } catch {
            /* skip malformed entry */
        }
    }
    return total.toString();
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
    return typeof id === 'string' && UUID_RE.test(id) ? id : null;
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
    const rawBody = (req as any).rawBody ?? JSON.stringify(req.body ?? {});
    const signature = findSignatureHeader(req);

    // Circle pings `webhooks.test` (no signature) when verifying a new
    // subscription endpoint. Acknowledge it with 200 unconditionally,
    // otherwise the permissionless subscription creation aborts with a
    // generic "API parameter invalid".
    const probeType = String((req.body as any)?.notificationType || '').toLowerCase();
    if (probeType === 'webhooks.test') {
        res.status(200).json({ received: true, status: 'preflight_ok' });
        return;
    }

    if (process.env.NODE_ENV === 'production' && !verifySignature(rawBody, signature)) {
        logger.warn('Invalid Circle Gateway webhook signature', { signaturePresent: Boolean(signature) });
        res.status(401).json({ error: 'invalid_signature' });
        return;
    }
    if (process.env.NODE_ENV !== 'production' && signature && !verifySignature(rawBody, signature)) {
        logger.warn('Invalid Circle Gateway webhook signature (dev)');
    }

    const envelope = (req.body || {}) as WebhookEnvelope;
    if (!envelope.notificationId || !envelope.notificationType) {
        res.status(200).json({ received: true, status: 'ignored_missing_fields' });
        return;
    }

    const notification = envelope.notification as any || {};
    const walletAddress = notification.walletAddress ?? notification.to ?? null;
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
        res.status(500).json({ error: insertErr.message });
        return;
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
                        ? notification.attestations.reduce((sum: bigint, a: any) => {
                              try {
                                  return sum + BigInt(a?.amount ?? '0');
                              } catch {
                                  return sum;
                              }
                          }, 0n).toString()
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

    await supabase
        .from('gateway_webhook_events')
        .update({ processed_at: new Date().toISOString(), push_sent_at: new Date().toISOString() })
        .eq('id', inserted.id);

    res.status(200).json({ received: true });
};

// Circle disallows two permissionless subscriptions on the exact same
// endpoint URL, so we keep EVM and Solana on distinct paths and accept both
// on the same handler.
router.post('/', handleWebhook);
router.post('/solana', handleWebhook);
router.post('/evm', handleWebhook);

router.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
