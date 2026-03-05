import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { supabase } from '../lib/supabase';
import NotificationService from '../services/notifications';
import BackendAnalytics from '../services/analytics';
import { createLogger } from '../utils/logger';

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
    if (typeof data?.status === 'string' && data.status.trim().length > 0) {
        const status = data.status.trim().toLowerCase();
        if (status.includes('.')) return status;
        return `payment_order.${status}`;
    }
    return 'payment_order.pending';
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
            // "validated" is an in-progress state; final settlement comes later.
            return 'PROCESSING';
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
        const signature = req.headers['x-paycrest-signature'] as string;
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

        const { event: rawEvent, data } = req.body;
        const event = normalizePaycrestEvent(rawEvent, data);
        logger.info('Received webhook event', { event, rawEvent });

        if (!event || !data?.id) {
            res.status(400).json({ error: 'Missing event or order ID' });
            return;
        }

        const paycrestOrderId = data.id;
        const newStatus = mapPaycrestStatus(event, data);

        // 1. Find the order in our database
        const { data: order, error: findError } = await supabase
            .from('offramp_orders')
            .select('*, users!inner(id, privy_id, email)')
            .eq('paycrest_order_id', paycrestOrderId)
            .single();

        if (findError || !order) {
            logger.warn('Order not found for webhook');
            // Still return 200 to acknowledge webhook
            res.status(200).json({ received: true, status: 'order_not_found' });
            return;
        }

        logger.info('Processing order status update', { currentStatus: order.status, newStatus });

        // 2. Update order status
        const updateData: any = {
            status: newStatus,
            updated_at: new Date().toISOString(),
        };

        // Add tx_hash if provided
        if (data.txHash) {
            updateData.tx_hash = data.txHash;
        }

        // Mark completion time
        if (newStatus === 'COMPLETED') {
            updateData.completed_at = new Date().toISOString();
            
            // Track withdrawal_completed analytics event
            BackendAnalytics.withdrawalCompleted(
                (order as any).users?.id || order.user_id,
                order.crypto_amount,
                order.crypto_currency || 'USDC',
                order.fiat_amount,
                order.fiat_currency,
                data.txHash
            );
        }

        // Add error message for failed orders
        if (newStatus === 'FAILED') {
            updateData.error_message = data.reason || `Order ${event.replace('payment_order.', '').replace('order.', '')}`;
        }

        const { error: updateError } = await supabase
            .from('offramp_orders')
            .update(updateData)
            .eq('id', order.id);

        if (updateError) {
            logger.error('Failed to update order status', { error: updateError.message });
        }

        // 3. Send user notification only when withdrawal is successfully completed.
        // The withdrawal history screen tracks in-progress states.
        const internalUserId = (order as any).users?.id;

        if (internalUserId && newStatus === 'COMPLETED') {
            const title = 'Withdrawal Successful';
            const body = `${Number(order.fiat_amount || 0).toFixed(2)} ${order.fiat_currency} has been sent to your bank account.`;

            // Create in-app success notification (uses expected frontend type)
            await supabase
                .from('notifications')
                .insert({
                    user_id: internalUserId,
                    title,
                    message: body,
                    type: 'offramp_success',
                    metadata: {
                        orderId: order.id,
                        paycrestOrderId: paycrestOrderId,
                        event: event,
                        status: newStatus,
                        amount: order.crypto_amount,
                        token: order.token,
                        destination: `${order.bank_name} • ****${order.account_number?.slice(-4) || ''}`,
                        fiatAmount: order.fiat_amount,
                        fiatCurrency: order.fiat_currency,
                    },
                    is_read: false,
                });

            // Send push notification with full data for Live Activities/Updates
            try {
                await NotificationService.notifyUser(internalUserId, {
                    title,
                    body,
                    data: {
                        type: 'offramp_status',
                        orderId: order.id,
                        status: newStatus,
                        // Additional fields for Live Activities/Updates
                        fiatAmount: order.fiat_amount,
                        fiatCurrency: order.fiat_currency,
                        bankName: order.bank_name,
                        accountNumber: order.account_number ? `****${order.account_number.slice(-4)}` : '',
                        event: event,
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
            orderId: order.id,
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
