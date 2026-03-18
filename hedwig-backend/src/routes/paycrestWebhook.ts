import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { supabase } from '../lib/supabase';
import NotificationService from '../services/notifications';
import BackendAnalytics from '../services/analytics';
import { createLogger } from '../utils/logger';
import { buildOfframpCopy } from '../utils/notificationCopy';

const logger = createLogger('PaycrestWebhook');

const router = Router();

// Paycrest webhook secret for signature verification
const PAYCREST_WEBHOOK_SECRET = process.env.PAYCREST_WEBHOOK_SECRET || '';

const normalizePaycrestEvent = (rawEvent: unknown, data: any): string => {
    if (typeof rawEvent === 'string' && rawEvent.trim().length > 0) {
        return rawEvent.trim().toLowerCase();
    }
    if (typeof data?.event === 'string' && data.event.trim().length > 0) {
        return data.event.trim().toLowerCase();
    }
    if (typeof data?.order?.status === 'string' && data.order.status.trim().length > 0) {
        const status = data.order.status.trim().toLowerCase();
        if (status.includes('.')) return status;
        return `payment_order.${status}`;
    }
    if (typeof data?.data?.order?.status === 'string' && data.data.order.status.trim().length > 0) {
        const status = data.data.order.status.trim().toLowerCase();
        if (status.includes('.')) return status;
        return `payment_order.${status}`;
    }
    if (typeof data?.data?.status === 'string' && data.data.status.trim().length > 0) {
        const status = data.data.status.trim().toLowerCase();
        if (status.includes('.')) return status;
        return `payment_order.${status}`;
    }
    if (typeof data?.status === 'string' && data.status.trim().length > 0) {
        const status = data.status.trim().toLowerCase();
        if (status.includes('.')) return status;
        return `payment_order.${status}`;
    }
    return 'payment_order.pending';
};

const extractOrderId = (payload: any): string | null => {
    const candidates = [
        payload?.data?.id,
        payload?.data?.order?.id,
        payload?.payload?.id,
        payload?.payload?.order?.id,
        payload?.order?.id,
        payload?.id,
    ];

    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim().length > 0) {
            return candidate.trim();
        }
    }

    return null;
};

const extractTxHash = (payload: any): string | null => {
    const candidates = [
        payload?.data?.txHash,
        payload?.data?.tx_hash,
        payload?.data?.order?.txHash,
        payload?.data?.order?.tx_hash,
        payload?.payload?.txHash,
        payload?.payload?.tx_hash,
        payload?.payload?.order?.txHash,
        payload?.payload?.order?.tx_hash,
        payload?.txHash,
        payload?.tx_hash,
    ];
    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim().length > 0) {
            return candidate.trim();
        }
    }
    return null;
};

/**
 * Map Paycrest order status monitoring events to app status.
 * Supports both new (payment_order.*) and legacy (order.*) event names.
 */
const mapPaycrestStatus = (event: string, data: any): 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' => {
    const normalizedEvent = normalizePaycrestEvent(event, data);
    const tail = normalizedEvent.includes('.') ? normalizedEvent.split('.').pop() : normalizedEvent;

    switch (tail) {
        case 'initiated':
            return 'PENDING';
        case 'pending':
        case 'processing':
            return 'PROCESSING';
        case 'validated':
            // Paycrest treats "validated" as the successful sender-side completion state.
            return 'COMPLETED';
        case 'settled':
        case 'completed':
        case 'success':
            return 'COMPLETED';
        case 'refunded':
        case 'expired':
        case 'failed':
        case 'cancelled':
            return 'FAILED';
        default:
            return 'PROCESSING';
    }
};

/**
 * Verify Paycrest webhook signature (HMAC-SHA256 of raw body with PAYCREST_WEBHOOK_SECRET)
 */
const verifyWebhookSignature = (payload: string, signature: string): boolean => {
    if (!PAYCREST_WEBHOOK_SECRET) {
        logger.warn('No webhook secret configured, skipping signature verification');
        return true;
    }
    if (!signature || typeof signature !== 'string') {
        return false;
    }

    const expectedSignature = crypto
        .createHmac('sha256', PAYCREST_WEBHOOK_SECRET)
        .update(payload, 'utf8')
        .digest('hex');

    const normalizedSignature = signature.trim().replace(/^sha256=/i, '');

    // timingSafeEqual throws if buffers have different lengths; compare length first
    const sigBuf = Buffer.from(normalizedSignature, 'utf8');
    const expectedBuf = Buffer.from(expectedSignature, 'utf8');
    if (sigBuf.length !== expectedBuf.length) {
        logger.warn('Paycrest signature length mismatch');
        return false;
    }
    return crypto.timingSafeEqual(sigBuf, expectedBuf);
};

/**
 * POST /api/webhooks/paycrest
 * Handle Paycrest order status webhooks
 * 
 * Events:
 * - payment_order.initiated / order.initiated
 * - payment_order.pending / order.pending
 * - payment_order.validated / order.validated
 * - payment_order.failed / order.failed
 * - payment_order.expired / order.expired
 */
router.post('/', async (req: Request, res: Response) => {
    try {
        const signature = (req.headers['x-paycrest-signature'] || req.headers['x-signature']) as string;
        // Use exact raw body for HMAC verification. Fallback to JSON.stringify only for dev if rawBody missing.
        const rawBody = (req as any).rawBody;
        const bodyForVerification = rawBody ?? JSON.stringify(req.body);

        if (!rawBody && process.env.NODE_ENV === 'production') {
            logger.error('Paycrest webhook: rawBody not available in production - body parser verify middleware must set req.rawBody');
            res.status(500).json({ error: 'Webhook not configured' });
            return;
        }

        // In production, require webhook secret and signature
        if (process.env.NODE_ENV === 'production') {
            if (!PAYCREST_WEBHOOK_SECRET) {
                logger.error('CRITICAL: No webhook secret configured in production');
                res.status(500).json({ error: 'Webhook not configured' });
                return;
            }
            if (!signature) {
                logger.warn('Missing signature in production');
                res.status(401).json({ error: 'Missing signature' });
                return;
            }
            if (!verifyWebhookSignature(bodyForVerification, signature)) {
                logger.warn('Invalid webhook signature (verify PAYCREST_WEBHOOK_SECRET and that Paycrest sends x-paycrest-signature)');
                res.status(401).json({ error: 'Invalid signature' });
                return;
            }
        } else {
            // In development, verify if both secret and signature are present
            if (PAYCREST_WEBHOOK_SECRET && signature) {
                if (!verifyWebhookSignature(bodyForVerification, signature)) {
                    logger.warn('Invalid webhook signature (check PAYCREST_WEBHOOK_SECRET and raw body)');
                    res.status(401).json({ error: 'Invalid signature' });
                    return;
                }
            }
        }

        const payload = req.body?.payload ?? req.body;
        const rawEvent = req.body?.event ?? payload?.event;
        const event = normalizePaycrestEvent(rawEvent, payload);
        logger.info('Received webhook event', {
            event,
            rawEvent,
            topLevelKeys: Object.keys(req.body || {}),
            payloadKeys: payload && typeof payload === 'object' ? Object.keys(payload) : [],
        });

        const paycrestOrderId = extractOrderId(req.body) || extractOrderId(payload);

        if (!event || !paycrestOrderId) {
            logger.warn('Paycrest webhook missing event/order id', {
                hasEvent: Boolean(event),
                hasOrderId: Boolean(paycrestOrderId),
                bodyKeys: Object.keys(req.body || {}),
            });
            // Acknowledge to prevent noisy retries, but do not process.
            res.status(200).json({ received: true, status: 'ignored_missing_fields' });
            return;
        }
        const newStatus = mapPaycrestStatus(event, payload);
        const txHash = extractTxHash(req.body) || extractTxHash(payload);

        // 1. Find the order in our database
        const { data: order, error: findError } = await supabase
            .from('offramp_orders')
            .select('*, users!inner(id, privy_id, email)')
            .eq('paycrest_order_id', String(paycrestOrderId))
            .single();

        let resolvedOrder = order;
        if (findError || !resolvedOrder) {
            // Fallback: some integrations may send internal Hedwig order id.
            const { data: orderByInternalId } = await supabase
                .from('offramp_orders')
                .select('*, users!inner(id, privy_id, email)')
                .eq('id', String(paycrestOrderId))
                .maybeSingle();
            resolvedOrder = orderByInternalId || null;
        }

        if (!resolvedOrder) {
            logger.warn('Order not found for webhook', { paycrestOrderId });
            // Still return 200 to acknowledge webhook
            res.status(200).json({ received: true, status: 'order_not_found' });
            return;
        }

        logger.info('Processing order status update', {
            currentStatus: resolvedOrder.status,
            newStatus,
            paycrestOrderId,
            orderId: resolvedOrder.id,
        });

        const previousStatus = resolvedOrder.status as string;

        // Ignore stale status regressions once terminal state is reached.
        const terminalStatuses = new Set(['COMPLETED', 'FAILED']);
        if (terminalStatuses.has(previousStatus) && previousStatus !== newStatus) {
            logger.info('Ignoring stale Paycrest status update for terminal order', {
                orderId: resolvedOrder.id,
                previousStatus,
                incomingStatus: newStatus,
            });
            res.status(200).json({ received: true, orderId: resolvedOrder.id, status: previousStatus, ignored: true });
            return;
        }

        // 2. Update order status
        const updateData: any = {
            status: newStatus,
            updated_at: new Date().toISOString(),
        };

        // Add tx_hash if provided
        if (txHash) {
            updateData.tx_hash = txHash;
        }

        // Mark completion time
        if (newStatus === 'COMPLETED') {
            updateData.completed_at = new Date().toISOString();
            
            // Track withdrawal_completed analytics event
            BackendAnalytics.withdrawalCompleted(
                (resolvedOrder as any).users?.id || resolvedOrder.user_id,
                resolvedOrder.crypto_amount,
                resolvedOrder.crypto_currency || 'USDC',
                resolvedOrder.fiat_amount,
                resolvedOrder.fiat_currency,
                txHash || undefined
            );
        }

        // Add error message for failed orders
        if (newStatus === 'FAILED') {
            updateData.error_message =
                payload?.reason ||
                payload?.error ||
                payload?.message ||
                payload?.data?.reason ||
                payload?.data?.error ||
                `Order ${event.replace('payment_order.', '').replace('order.', '')}`;
        }

        const { error: updateError } = await supabase
            .from('offramp_orders')
            .update(updateData)
            .eq('id', resolvedOrder.id);

        if (updateError) {
            logger.error('Failed to update order status', { error: updateError.message });
        }

        const statusChanged = previousStatus !== newStatus;

        // 3. Notify user when status changes so withdrawal UI stays in sync.
        const internalUserId = (resolvedOrder as any).users?.id;

        if (internalUserId && statusChanged) {
            const destination = `${resolvedOrder.bank_name} • ****${resolvedOrder.account_number?.slice(-4) || ''}`;
            const copy = buildOfframpCopy({
                status: newStatus,
                fiatAmount: Number(resolvedOrder.fiat_amount || 0),
                fiatCurrency: String(resolvedOrder.fiat_currency || ''),
                bankName: String(resolvedOrder.bank_name || 'your bank'),
                accountNumber: resolvedOrder.account_number || null,
            });

            const notificationType = newStatus === 'COMPLETED' ? 'offramp_success' : 'offramp';

            // Prevent duplicate status notifications for the same order/state.
            const { data: existingStatusNotification } = await supabase
                .from('notifications')
                .select('id')
                .eq('user_id', internalUserId)
                .eq('type', notificationType)
                .eq('metadata->>orderId', String(resolvedOrder.id))
                .eq('metadata->>status', newStatus)
                .limit(1)
                .maybeSingle();

            if (!existingStatusNotification) {
                await supabase.from('notifications').insert({
                    user_id: internalUserId,
                    title: copy.title,
                    message: copy.body,
                    type: notificationType,
                    metadata: {
                        orderId: resolvedOrder.id,
                        paycrestOrderId: paycrestOrderId,
                        event,
                        status: newStatus,
                        amount: resolvedOrder.crypto_amount,
                        token: resolvedOrder.token,
                        destination,
                        fiatAmount: resolvedOrder.fiat_amount,
                        fiatCurrency: resolvedOrder.fiat_currency,
                        txHash,
                    },
                    is_read: false,
                });
            }

            try {
                await NotificationService.notifyUser(internalUserId, {
                    title: copy.title,
                    body: copy.body,
                    data: {
                        type: 'offramp_status',
                        orderId: resolvedOrder.id,
                        status: newStatus,
                        fiatAmount: resolvedOrder.fiat_amount,
                        fiatCurrency: resolvedOrder.fiat_currency,
                        bankName: resolvedOrder.bank_name,
                        accountNumber: resolvedOrder.account_number ? `****${resolvedOrder.account_number.slice(-4)}` : '',
                        event,
                        paycrestOrderId,
                        txHash,
                    }
                });
                logger.info('Push notification sent for order update');
            } catch (pushError) {
                logger.error('Failed to send push notification', { error: pushError instanceof Error ? pushError.message : 'Unknown' });
            }
        }

        // 4. Return success
        res.status(200).json({
            received: true,
            orderId: resolvedOrder.id,
            status: newStatus
        });

    } catch (error: any) {
        logger.error('Error processing webhook', { error: error.message });
        // Always return 200 to acknowledge receipt
        res.status(200).json({ received: true, error: error.message });
    }
});

/**
 * GET /api/webhooks/paycrest/health
 * Health check endpoint
 */
router.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
