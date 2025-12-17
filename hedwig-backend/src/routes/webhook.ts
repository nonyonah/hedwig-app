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
 * Endpoint for Stacks Chainhook events from Hiro
 * Payload structure: { event: { apply: [...], rollback: [...] }, chainhook: { name, uuid } }
 */
router.post('/chainhook', async (req: Request, res: Response) => {
    try {
        const payload = req.body;

        console.log('[Chainhook] Received event from:', payload.chainhook?.name || 'unknown');

        // Validate payload structure (Hiro format)
        if (!payload.event) {
            console.log('[Chainhook] Invalid payload: missing event section');
            res.status(200).json({ received: true });
            return;
        }

        const { apply, rollback } = payload.event;

        // Handle rollbacks (chain reorganizations)
        if (rollback && rollback.length > 0) {
            console.log(`[Chainhook] Processing ${rollback.length} rollback blocks`);
            // TODO: Handle rollback logic (reverse any database updates)
        }

        // Process applied blocks
        if (apply && apply.length > 0) {
            for (const block of apply) {
                const blockHeight = block.block_identifier?.index;
                const transactions = block.transactions || [];

                console.log(`[Chainhook] Processing block ${blockHeight} with ${transactions.length} transactions`);

                for (const tx of transactions) {
                    const txId = tx.transaction_identifier?.hash;
                    const success = tx.metadata?.success;

                    if (!success) {
                        console.log(`[Chainhook] Skipping failed transaction: ${txId}`);
                        continue;
                    }

                    // Process operations in the transaction
                    const operations = tx.operations || [];
                    for (const op of operations) {
                        // Look for contract_call operations (pay-invoice or pay)
                        if (op.type === 'contract_call') {
                            const contractId = op.contract_identifier;
                            const functionName = op.function_name;
                            const args = op.function_args || [];

                            console.log(`[Chainhook] Contract call: ${contractId}.${functionName}`);

                            // Handle hedwig-payment contract calls
                            if (functionName === 'pay-invoice' || functionName === 'pay') {
                                await processPaymentEvent({
                                    txId,
                                    blockHeight,
                                    contractId,
                                    functionName,
                                    args,
                                    sender: tx.metadata?.sender,
                                });
                            }
                        }
                    }
                }
            }
        }

        res.status(200).json({ received: true });
    } catch (error) {
        console.error('[Chainhook] Error processing event:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Process a payment event from the hedwig-payment contract
 */
async function processPaymentEvent(data: {
    txId: string;
    blockHeight: number;
    contractId: string;
    functionName: string;
    args: any[];
    sender: string;
}) {
    console.log('[Chainhook] Processing payment event:', data);

    try {
        // Extract payment details from function arguments
        // pay-invoice(recipient, amount, invoice-id)
        // pay(recipient, amount)
        const recipient = data.args[0]?.value;
        const amount = data.args[1]?.value;
        const invoiceId = data.args[2]?.value; // Optional for pay-invoice

        if (!recipient || !amount) {
            console.log('[Chainhook] Missing payment details in args');
            return;
        }

        // Convert microSTX to STX
        const amountStx = parseInt(amount) / 1_000_000;

        console.log(`[Chainhook] Payment: ${amountStx} STX to ${recipient}`);

        // Update invoice status if we have an invoice ID
        if (invoiceId) {
            const { error: updateError } = await supabase
                .from('invoices')
                .update({
                    status: 'PAID',
                    paid_at: new Date().toISOString(),
                    tx_hash: data.txId,
                })
                .eq('id', invoiceId);

            if (updateError) {
                console.error('[Chainhook] Failed to update invoice:', updateError);
            } else {
                console.log(`[Chainhook] Invoice ${invoiceId} marked as PAID`);
            }
        }

        // Record the payment transaction
        const { error: insertError } = await supabase
            .from('transactions')
            .upsert({
                tx_hash: data.txId,
                type: 'PAYMENT',
                status: 'CONFIRMED',
                amount: amountStx.toString(),
                token: 'STX',
                network: 'stacks',
                from_address: data.sender,
                to_address: recipient,
                block_height: data.blockHeight,
                confirmed_at: new Date().toISOString(),
            }, { onConflict: 'tx_hash' });

        if (insertError) {
            console.error('[Chainhook] Failed to record transaction:', insertError);
        } else {
            console.log(`[Chainhook] Transaction ${data.txId} recorded`);
        }
    } catch (error) {
        console.error('[Chainhook] Error processing payment:', error);
    }
}

export default router;
