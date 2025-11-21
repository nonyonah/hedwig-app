import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase';

const router = Router();

/**
 * POST /api/webhooks/paycrest
 * Webhook handler for Paycrest order updates
 */
router.post('/paycrest', async (req: Request, res: Response, next) => {
    try {
        const { orderId, status, txHash } = req.body;

        // Find order in database
        const { data: order, error: findError } = await supabase
            .from('offramp_orders')
            .select('*')
            .eq('paycrest_order_id', orderId)
            .single();

        if (findError || !order) {
            res.status(404).json({
                success: false,
                error: { message: 'Order not found' },
            });
            return;
        }

        // Update order status
        const { error: updateError } = await supabase
            .from('offramp_orders')
            .update({
                status: status.toUpperCase(),
                tx_hash: txHash,
                ...(status === 'completed' && { completed_at: new Date().toISOString() }),
            })
            .eq('id', order.id);

        if (updateError) {
            throw new Error(`Failed to update order: ${updateError.message}`);
        }

        // TODO: Send notification to user

        res.json({
            success: true,
            data: { message: 'Webhook processed successfully' },
        });
    } catch (error) {
        next(error);
    }
});

export default router;
