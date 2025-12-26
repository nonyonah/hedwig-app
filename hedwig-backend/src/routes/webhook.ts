import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import AlchemyWebhooksService, { AlchemyActivity, AlchemySolanaAddressActivityEvent } from '../services/alchemyWebhooks';
import NotificationService from '../services/notifications';

const router = Router();

// NOTE: Paycrest webhooks are handled in paycrestWebhook.ts (/api/webhooks/paycrest)

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

        let invoiceDetails: any = null;
        let clientInfo = '';

        // Update invoice status if we have an invoice ID
        if (invoiceId) {
            const { data: invoice, error: updateError } = await supabase
                .from('invoices')
                .update({
                    status: 'PAID',
                    paid_at: new Date().toISOString(),
                    tx_hash: data.txId,
                })
                .eq('id', invoiceId)
                .select('*, user:users(*)')
                .single();

            if (updateError) {
                console.error('[Chainhook] Failed to update invoice:', updateError);
            } else {
                console.log(`[Chainhook] Invoice ${invoiceId} marked as PAID`);
                invoiceDetails = invoice;

                // Get client info from sender address or invoice content
                const invoiceContent = invoice.content as any;
                clientInfo = invoiceContent?.client_name || invoiceContent?.recipient_email || `${data.sender.slice(0, 8)}...${data.sender.slice(-4)}`;
            }
        }

        // Create in-app notification for the freelancer
        if (invoiceDetails && invoiceDetails.user_id) {
            const invoiceNumber = `INV-${invoiceId.slice(0, 8).toUpperCase()}`;
            await supabase.from('notifications').insert({
                user_id: invoiceDetails.user_id,
                type: 'payment_received',
                title: '💰 Invoice Paid!',
                message: `${clientInfo} paid ${invoiceNumber} - ${amountStx} STX received!`,
                metadata: {
                    invoiceId,
                    txHash: data.txId,
                    amount: amountStx.toString(),
                    token: 'STX',
                    network: 'stacks',
                    clientName: clientInfo
                },
            });

            // Also send push notification
            await NotificationService.notifyUser(invoiceDetails.user_id, {
                title: '💰 Invoice Paid!',
                body: `${clientInfo} paid ${invoiceNumber} - ${amountStx} STX received!`,
                data: { type: 'payment_received', invoiceId, txHash: data.txId },
            });

            console.log(`[Chainhook] Notification sent for invoice ${invoiceId}`);
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

/**
 * POST /api/webhooks/alchemy
 * Endpoint for Alchemy Address Activity webhooks (Base Sepolia, Solana Devnet)
 */
router.post('/alchemy', async (req: Request, res: Response) => {
    try {
        // Get raw body for signature validation
        const rawBody = JSON.stringify(req.body);
        const signature = req.headers['x-alchemy-signature'] as string;

        if (!signature) {
            console.warn('[Alchemy] Missing X-Alchemy-Signature header');
            res.status(401).json({ error: 'Missing signature' });
            return;
        }

        // Parse and validate the webhook
        const { valid, event, error } = AlchemyWebhooksService.parseAndValidate(rawBody, signature);

        if (!valid || !event) {
            console.warn('[Alchemy] Invalid webhook:', error);
            res.status(401).json({ error: error || 'Invalid webhook' });
            return;
        }

        console.log(`[Alchemy] Received ${event.type} event: ${event.id}`);

        // Check if this is a Solana event
        if (AlchemyWebhooksService.isSolanaEvent(event)) {
            const solanaEvent = event.event as AlchemySolanaAddressActivityEvent;
            console.log(`[Alchemy] Processing Solana event on ${solanaEvent.network}`);
            await processSolanaActivity(solanaEvent);
        }
        // Process EVM Address Activity events
        else if (event.type === 'ADDRESS_ACTIVITY' && 'activity' in event.event) {
            await processAlchemyActivity(event.event.network, event.event.activity);
        }

        res.status(200).json({ received: true });
    } catch (error) {
        console.error('[Alchemy] Error processing webhook:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Process Alchemy Address Activity events
 */
async function processAlchemyActivity(network: string, activities: AlchemyActivity[]) {
    for (const activity of activities) {
        const transfer = AlchemyWebhooksService.extractTransferInfo(activity);
        console.log(`[Alchemy] Processing transfer on ${network}:`, transfer);

        try {
            // Find user by wallet address (recipient)
            const { data: recipientUser } = await supabase
                .from('users')
                .select('id, privy_id')
                .or(`evm_address.ilike.${transfer.to},wallet_address.ilike.${transfer.to}`)
                .single();

            if (recipientUser) {
                // Check if this payment is for an invoice or payment link
                const { data: document } = await supabase
                    .from('documents')
                    .select('*')
                    .eq('user_id', recipientUser.id)
                    .eq('status', 'PENDING')
                    .or(`type.eq.invoice,type.eq.payment_link`)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .single();

                // Build notification message with client/document details
                const shortAddress = `${transfer.from.slice(0, 6)}...${transfer.from.slice(-4)}`;
                let clientInfo = shortAddress;
                let notificationTitle = 'Payment Received! 🎉';
                let notificationMessage = `You received ${transfer.value} ${transfer.asset} from ${shortAddress} on ${network}.`;

                if (document) {
                    const content = document.content as any;
                    clientInfo = content?.client_name || content?.recipient_email || shortAddress;
                    const docType = document.type === 'invoice' ? 'Invoice' : 'Payment link';
                    const docNumber = document.type === 'invoice'
                        ? `INV-${document.id.slice(0, 8).toUpperCase()}`
                        : document.title || 'Payment';

                    notificationTitle = `💰 ${docType} Paid!`;
                    notificationMessage = `${clientInfo} paid ${docNumber} - ${transfer.value} ${transfer.asset} received!`;

                    // Update document status to PAID
                    await supabase
                        .from('documents')
                        .update({ status: 'PAID', paid_at: new Date().toISOString(), tx_hash: transfer.txHash })
                        .eq('id', document.id);
                }

                // Send push notification
                await NotificationService.notifyUser(recipientUser.id, {
                    title: notificationTitle,
                    body: notificationMessage,
                    data: { type: 'payment_received', txHash: transfer.txHash, documentId: document?.id },
                });

                // Create in-app notification
                await supabase.from('notifications').insert({
                    user_id: recipientUser.id,
                    type: document ? 'payment_received' : 'crypto_received',
                    title: notificationTitle,
                    message: notificationMessage,
                    metadata: {
                        txHash: transfer.txHash,
                        amount: transfer.value.toString(),
                        token: transfer.asset,
                        network,
                        from: transfer.from,
                        documentId: document?.id,
                        clientName: clientInfo,
                    },
                });

                console.log(`[Alchemy] Notified user ${recipientUser.id} of received payment`);
            }

            // Find user by wallet address (sender)
            const { data: senderUser } = await supabase
                .from('users')
                .select('id, privy_id')
                .or(`evm_address.ilike.${transfer.from},wallet_address.ilike.${transfer.from}`)
                .single();

            if (senderUser) {
                // Send push notification for sent payment
                await NotificationService.notifyTransaction(senderUser.id, {
                    type: 'sent',
                    amount: transfer.value.toString(),
                    token: transfer.asset,
                    network: network,
                    txHash: transfer.txHash,
                });

                console.log(`[Alchemy] Notified user ${senderUser.id} of sent payment`);
            }

            // Record the transaction
            await supabase
                .from('transactions')
                .upsert({
                    tx_hash: transfer.txHash,
                    type: 'TRANSFER',
                    status: 'CONFIRMED',
                    amount: transfer.value.toString(),
                    token: transfer.asset,
                    network: network,
                    from_address: transfer.from,
                    to_address: transfer.to,
                    block_height: parseInt(transfer.blockNumber, 16),
                    confirmed_at: new Date().toISOString(),
                }, { onConflict: 'tx_hash' });

        } catch (err) {
            console.error('[Alchemy] Error processing activity:', err);
        }
    }
}

/**
 * Process Solana Address Activity events (Beta - Devnet)
 */
async function processSolanaActivity(event: AlchemySolanaAddressActivityEvent) {
    const { network, transaction: transactions, slot } = event;

    console.log(`[Alchemy] Processing ${transactions.length} Solana transactions on ${network} at slot ${slot}`);

    for (const tx of transactions) {
        // Skip vote transactions
        if (tx.is_vote) {
            continue;
        }

        const transfer = AlchemyWebhooksService.extractSolanaTransferInfo(tx, slot);
        console.log(`[Alchemy] Processing Solana transfer:`, transfer);

        try {
            // Find user by Solana wallet address (recipient)
            if (transfer.to) {
                const { data: recipientUser } = await supabase
                    .from('users')
                    .select('id, privy_id')
                    .or(`solana_address.eq.${transfer.to},wallet_address.eq.${transfer.to}`)
                    .single();

                if (recipientUser) {
                    // Check if this payment is for an invoice or payment link
                    const { data: document } = await supabase
                        .from('documents')
                        .select('*')
                        .eq('user_id', recipientUser.id)
                        .eq('status', 'PENDING')
                        .or(`type.eq.invoice,type.eq.payment_link`)
                        .order('created_at', { ascending: false })
                        .limit(1)
                        .single();

                    // Build notification message with client/document details
                    const shortAddress = `${transfer.from.slice(0, 6)}...${transfer.from.slice(-4)}`;
                    let clientInfo = shortAddress;
                    let notificationTitle = 'Payment Received! 🎉';
                    let notificationMessage = `You received ${transfer.value.toFixed(6)} ${transfer.asset} from ${shortAddress} on Solana.`;

                    if (document) {
                        const content = document.content as any;
                        clientInfo = content?.client_name || content?.recipient_email || shortAddress;
                        const docType = document.type === 'invoice' ? 'Invoice' : 'Payment link';
                        const docNumber = document.type === 'invoice'
                            ? `INV-${document.id.slice(0, 8).toUpperCase()}`
                            : document.title || 'Payment';

                        notificationTitle = `💰 ${docType} Paid!`;
                        notificationMessage = `${clientInfo} paid ${docNumber} - ${transfer.value.toFixed(6)} ${transfer.asset} received!`;

                        // Update document status to PAID
                        await supabase
                            .from('documents')
                            .update({ status: 'PAID', paid_at: new Date().toISOString(), tx_hash: transfer.signature })
                            .eq('id', document.id);
                    }

                    // Send push notification
                    await NotificationService.notifyUser(recipientUser.id, {
                        title: notificationTitle,
                        body: notificationMessage,
                        data: { type: 'payment_received', txHash: transfer.signature, documentId: document?.id },
                    });

                    // Create in-app notification
                    await supabase.from('notifications').insert({
                        user_id: recipientUser.id,
                        type: document ? 'payment_received' : 'crypto_received',
                        title: notificationTitle,
                        message: notificationMessage,
                        metadata: {
                            txHash: transfer.signature,
                            amount: transfer.value.toFixed(6),
                            token: transfer.asset,
                            network: 'solana',
                            from: transfer.from,
                            documentId: document?.id,
                            clientName: clientInfo,
                        },
                    });

                    console.log(`[Alchemy] Notified user ${recipientUser.id} of received SOL payment`);
                }
            }

            // Find user by Solana wallet address (sender)
            if (transfer.from) {
                const { data: senderUser } = await supabase
                    .from('users')
                    .select('id, privy_id')
                    .or(`solana_address.eq.${transfer.from},wallet_address.eq.${transfer.from}`)
                    .single();

                if (senderUser) {
                    await NotificationService.notifyTransaction(senderUser.id, {
                        type: 'sent',
                        amount: transfer.value.toFixed(6),
                        token: transfer.asset,
                        network: network,
                        txHash: transfer.signature,
                    });

                    console.log(`[Alchemy] Notified user ${senderUser.id} of sent SOL payment`);
                }
            }

            // Record the transaction
            await supabase
                .from('transactions')
                .upsert({
                    tx_hash: transfer.signature,
                    type: 'TRANSFER',
                    status: 'CONFIRMED',
                    amount: transfer.value.toString(),
                    token: transfer.asset,
                    network: network,
                    from_address: transfer.from,
                    to_address: transfer.to,
                    block_height: slot,
                    confirmed_at: new Date().toISOString(),
                }, { onConflict: 'tx_hash' });

        } catch (err) {
            console.error('[Alchemy] Error processing Solana activity:', err);
        }
    }
}

export default router;
