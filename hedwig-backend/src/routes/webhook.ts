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

/**
 * POST /api/webhooks/chainhook
 * Endpoint for Stacks Chainhook events
 */
router.post('/chainhook', async (req: Request, res: Response) => {
    try {
        const event = req.body;

        console.log('Received Chainhook event:', JSON.stringify(event, null, 2));

        // Validate basic structure
        if (!event || !event.apply || !event.apply.length) {
            console.log('Invalid or empty chainhook payload');
            res.status(200).json({ received: true });
            return;
        }

        // Process applied blocks
        for (const block of event.apply) {
            const transactions = block.transactions;
            if (!transactions || !transactions.length) continue;

            for (const tx of transactions) {
                const txId = tx.transaction_identifier?.hash;
                const status = tx.metadata?.success;

                if (status) {
                    console.log(`Processing successful transaction: ${txId}`);
                    // Logic to handle payment confirmation would go here
                    // e.g. verify contract call arguments, find matching invoice, update DB
                }
            }
        }

        res.status(200).json({ received: true });
    } catch (error) {
        console.error('Error processing chainhook:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
