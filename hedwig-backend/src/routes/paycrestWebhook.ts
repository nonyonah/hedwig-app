import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { supabase } from '../lib/supabase';
import NotificationService from '../services/notifications';
import { createLogger } from '../utils/logger';

const logger = createLogger('PaycrestWebhook');

const router = Router();

// Paycrest webhook secret for signature verification
const PAYCREST_WEBHOOK_SECRET = process.env.PAYCREST_WEBHOOK_SECRET || '';

/**
 * Map Paycrest status events to our status
 */
const mapPaycrestStatus = (event: string): string => {
    switch (event) {
        case 'order.initiated':
            return 'PENDING';
        case 'order.pending':
            return 'PENDING';
        case 'order.validated':
            return 'PROCESSING';
        case 'order.settled':
            return 'COMPLETED';
        case 'order.refunded':
            return 'FAILED';
        case 'order.expired':
            return 'FAILED';
        default:
            return 'PENDING';
    }
};

/**
 * Get user-friendly status message
 */
const getStatusMessage = (event: string, amount: number, currency: string): { title: string; body: string } => {
    switch (event) {
        case 'order.initiated':
            return {
                title: '💰 Withdrawal Started',
                body: `Your withdrawal of ${amount.toFixed(2)} ${currency} has been initiated.`
            };
        case 'order.pending':
            return {
                title: '⏳ Processing Withdrawal',
                body: `Your withdrawal is being processed by our provider.`
            };
        case 'order.validated':
            return {
                title: '✅ Withdrawal Validated',
                body: `Your withdrawal has been validated and will be settled shortly.`
            };
        case 'order.settled':
            return {
                title: '🎉 Withdrawal Complete!',
                body: `${amount.toFixed(2)} ${currency} has been sent to your bank account.`
            };
        case 'order.refunded':
            return {
                title: '↩️ Withdrawal Refunded',
                body: `Your withdrawal was refunded. Funds have been returned to your wallet.`
            };
        case 'order.expired':
            return {
                title: '⏰ Withdrawal Expired',
                body: `Your withdrawal order has expired. Please try again.`
            };
        default:
            return {
                title: 'Withdrawal Update',
                body: `Status: ${event}`
            };
    }
};

/**
 * Verify Paycrest webhook signature
 */
const verifyWebhookSignature = (payload: string, signature: string): boolean => {
    if (!PAYCREST_WEBHOOK_SECRET) {
        logger.warn('No webhook secret configured, skipping signature verification');
        return true;
    }

    const expectedSignature = crypto
        .createHmac('sha256', PAYCREST_WEBHOOK_SECRET)
        .update(payload)
        .digest('hex');

    return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
    );
};

/**
 * POST /api/webhooks/paycrest
 * Handle Paycrest order status webhooks
 * 
 * Events:
 * - order.initiated: Order created
 * - order.pending: Awaiting provider
 * - order.validated: Ready for settlement
 * - order.settled: Successfully completed
 * - order.refunded: Refunded to sender
 * - order.expired: Timed out
 */
router.post('/', async (req: Request, res: Response) => {
    try {
        const signature = req.headers['x-paycrest-signature'] as string;
        const rawBody = JSON.stringify(req.body);

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
            if (!verifyWebhookSignature(rawBody, signature)) {
                logger.warn('Invalid webhook signature');
                res.status(401).json({ error: 'Invalid signature' });
                return;
            }
        } else {
            // In development, verify if both secret and signature are present
            if (PAYCREST_WEBHOOK_SECRET && signature) {
                if (!verifyWebhookSignature(rawBody, signature)) {
                    logger.warn('Invalid webhook signature');
                    res.status(401).json({ error: 'Invalid signature' });
                    return;
                }
            }
        }

        const { event, data } = req.body;
        logger.info('Received webhook event', { event });

        if (!event || !data?.id) {
            res.status(400).json({ error: 'Missing event or order ID' });
            return;
        }

        const paycrestOrderId = data.id;
        const newStatus = mapPaycrestStatus(event);

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
        }

        // Add error message for failed orders
        if (newStatus === 'FAILED') {
            updateData.error_message = data.reason || `Order ${event.replace('order.', '')}`;
        }

        const { error: updateError } = await supabase
            .from('offramp_orders')
            .update(updateData)
            .eq('id', order.id);

        if (updateError) {
            logger.error('Failed to update order status', { error: updateError.message });
        }

        // 3. Send push notification
        // Use internal user ID (UUID) for device_tokens lookup, not email or privy_id
        const internalUserId = (order as any).users?.id;

        if (internalUserId) {
            const notification = getStatusMessage(event, order.fiat_amount, order.fiat_currency);

            // Create in-app notification (uses internal user ID)
            await supabase
                .from('notifications')
                .insert({
                    user_id: internalUserId,
                    title: notification.title,
                    message: notification.body,
                    type: 'offramp',
                    metadata: {
                        orderId: order.id,
                        paycrestOrderId: paycrestOrderId,
                        event: event,
                        status: newStatus,
                        fiatAmount: order.fiat_amount,
                        fiatCurrency: order.fiat_currency,
                    },
                    is_read: false,
                });

            // Send push notification with full data for Live Activities/Updates
            try {
                await NotificationService.notifyUser(internalUserId, {
                    title: notification.title,
                    body: notification.body,
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
