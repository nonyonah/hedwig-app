import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import AlchemyWebhooksService, { AlchemyActivity, AlchemySolanaAddressActivityEvent } from '../services/alchemyWebhooks';
import NotificationService from '../services/notifications';
import BackendAnalytics from '../services/analytics';
import { createLogger } from '../utils/logger';

const logger = createLogger('Webhook');

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

        logger.info('Received chainhook event', { hookName: payload.chainhook?.name || 'unknown' });

        // Validate payload structure (Hiro format)
        if (!payload.event) {
            logger.warn('Invalid chainhook payload: missing event section');
            res.status(200).json({ received: true });
            return;
        }

        const { apply, rollback } = payload.event;

        // Handle rollbacks (chain reorganizations)
        if (rollback && rollback.length > 0) {
            logger.debug('Processing rollback blocks', { count: rollback.length });
            // TODO: Handle rollback logic (reverse any database updates)
        }

        // Process applied blocks
        if (apply && apply.length > 0) {
            for (const block of apply) {
                const blockHeight = block.block_identifier?.index;
                const transactions = block.transactions || [];

                logger.debug('Processing block', { blockHeight, transactionCount: transactions.length });

                for (const tx of transactions) {
                    const txId = tx.transaction_identifier?.hash;
                    const success = tx.metadata?.success;

                    if (!success) {
                        logger.debug('Skipping failed transaction');
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

                            logger.debug('Contract call detected', { functionName });

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
        logger.error('Error processing chainhook event', { error: error instanceof Error ? error.message : 'Unknown' });
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
    logger.debug('Processing payment event');

    try {
        // Extract payment details from function arguments
        // pay-invoice(recipient, amount, invoice-id)
        // pay(recipient, amount)
        const recipient = data.args[0]?.value;
        const amount = data.args[1]?.value;
        const invoiceId = data.args[2]?.value; // Optional for pay-invoice

        if (!recipient || !amount) {
            logger.warn('Missing payment details in args');
            return;
        }

        // Convert microSTX to STX
        const amountStx = parseInt(amount) / 1_000_000;

        logger.info('Payment processed', { amountStx });

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
                logger.error('Failed to update invoice', { error: updateError.message });
            } else {
                logger.info('Invoice marked as paid');
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

            logger.info('Notification sent for invoice payment');
        }

        // Record the payment transaction
        const { error: insertError } = await supabase
            .from('transactions')
            .upsert({
                user_id: invoiceDetails?.user_id,
                tx_hash: data.txId,
                type: 'PAYMENT_RECEIVED',
                status: 'CONFIRMED',
                chain: 'STACKS' as any,
                amount: amountStx,
                token: 'STX',
                from_address: data.sender,
                to_address: recipient,
                block_number: data.blockHeight,
                timestamp: new Date().toISOString(),
                platform_fee: 0,
                document_id: invoiceId || null,
            }, { onConflict: 'tx_hash' });

        if (insertError) {
            logger.error('Failed to record transaction', { error: insertError.message });
        } else {
            logger.info('Transaction recorded');
        }
    } catch (error) {
        logger.error('Error processing payment event', { error: error instanceof Error ? error.message : 'Unknown' });
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
            logger.warn('Missing X-Alchemy-Signature header');
            res.status(401).json({ error: 'Missing signature' });
            return;
        }

        // Parse and validate the webhook
        const { valid, event, error } = AlchemyWebhooksService.parseAndValidate(rawBody, signature);

        if (!valid || !event) {
            logger.warn('Invalid webhook', { error });
            res.status(401).json({ error: error || 'Invalid webhook' });
            return;
        }

        logger.info('Received Alchemy event', { type: event.type });

        // Check if this is a Solana event
        if (AlchemyWebhooksService.isSolanaEvent(event)) {
            const solanaEvent = event.event as AlchemySolanaAddressActivityEvent;
            logger.debug('Processing Solana event', { network: solanaEvent.network });
            await processSolanaActivity(solanaEvent);
        }
        // Process EVM Address Activity events
        else if (event.type === 'ADDRESS_ACTIVITY' && 'activity' in event.event) {
            await processAlchemyActivity(event.event.network, event.event.activity);
        }

        res.status(200).json({ received: true });
    } catch (error) {
        logger.error('Error processing Alchemy webhook', { error: error instanceof Error ? error.message : 'Unknown' });
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Process Alchemy Address Activity events
 */
async function processAlchemyActivity(network: string, activities: AlchemyActivity[]) {
    logger.info('Processing Alchemy activities', { network, count: activities.length });

    for (const activity of activities) {
        const transfer = AlchemyWebhooksService.extractTransferInfo(activity);
        logger.info('Processing EVM transfer', { 
            network, 
            asset: transfer.asset,
            from: transfer.from,
            to: transfer.to,
            value: transfer.value,
            txHash: transfer.txHash
        });

        try {
            // Track document for transaction recording
            let document: any = null;
            
            // Normalize wallet addresses to lowercase for comparison
            const toAddressLower = transfer.to.toLowerCase();
            const fromAddressLower = transfer.from.toLowerCase();

            // Find user by wallet address (recipient)
            // Try explicit match first to avoid potentially buggy complex OR queries with ilike strings
            logger.debug('Looking for recipient user', { toAddress: toAddressLower });
            
            // First try evm_address
            let { data: recipientUser, error: recipientError } = await supabase
                .from('users')
                .select('id, privy_id, evm_address, wallet_address')
                .ilike('evm_address', toAddressLower)
                .single();

            // If not found, try wallet_address
            if (!recipientUser) {
                const { data: altRecipient, error: altError } = await supabase
                    .from('users')
                    .select('id, privy_id, evm_address, wallet_address')
                    .ilike('wallet_address', toAddressLower)
                    .single();
                
                if (altRecipient) {
                    recipientUser = altRecipient;
                    recipientError = null;
                } else if (altError) {
                    // Keep the error from the second attempt if neither succeeded
                   recipientError = altError; 
                }
            }

            if (recipientError) {
                logger.debug('Recipient lookup error or not found', { error: recipientError.message });
            }

            if (recipientUser) {
                logger.info('Found recipient user', { 
                    userId: recipientUser.id, 
                    evmAddress: recipientUser.evm_address,
                    walletAddress: recipientUser.wallet_address
                });

                // Check if this payment is for an invoice or payment link
                const { data: foundDoc, error: docError } = await supabase
                    .from('documents')
                    .select('*')
                    .eq('user_id', recipientUser.id)
                    .eq('status', 'PENDING')
                    .or(`type.eq.invoice,type.eq.payment_link`)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .single();

                if (docError) {
                    logger.debug('Document lookup info', { error: docError.message });
                }

                document = foundDoc;
                logger.debug('Document found', { documentId: document?.id, type: document?.type });

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
                    const { error: updateError } = await supabase
                        .from('documents')
                        .update({ status: 'PAID', paid_at: new Date().toISOString(), tx_hash: transfer.txHash })
                        .eq('id', document.id);
                    
                    if (updateError) {
                        logger.error('Failed to update document status', { error: updateError.message });
                    } else {
                        logger.info('Document status updated to PAID', { documentId: document.id });
                    }
                }

                // Send push notification
                logger.info('Sending push notification to user', { userId: recipientUser.id });
                const notifyResult = await NotificationService.notifyUser(recipientUser.id, {
                    title: notificationTitle,
                    body: notificationMessage,
                    data: { type: 'payment_received', txHash: transfer.txHash, documentId: document?.id },
                });
                logger.info('Push notification result', { tickets: notifyResult.length });

                // Create in-app notification
                const { error: notifError } = await supabase.from('notifications').insert({
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

                if (notifError) {
                    logger.error('Failed to create in-app notification', { error: notifError.message });
                } else {
                    logger.info('In-app notification created');
                }

                // Track payment_received analytics event
                BackendAnalytics.paymentReceived(
                    recipientUser.id,
                    parseFloat(transfer.value.toString()),
                    transfer.asset,
                    transfer.txHash,
                    document?.id,
                    undefined,
                    undefined
                );

                logger.info('User notified of received payment');
            } else {
                logger.warn('No recipient user found for address', { toAddress: toAddressLower });
            }

            // Find user by wallet address (sender)
            logger.debug('Looking for sender user', { fromAddress: fromAddressLower });
            
            // First try evm_address
            let { data: senderUser, error: senderError } = await supabase
                .from('users')
                .select('id, privy_id')
                .ilike('evm_address', fromAddressLower)
                .single();

            // If not found, try wallet_address
            if (!senderUser) {
                const { data: altSender, error: altError } = await supabase
                    .from('users')
                    .select('id, privy_id')
                    .ilike('wallet_address', fromAddressLower)
                    .single();
                
                if (altSender) {
                    senderUser = altSender;
                    senderError = null;
                } else if (altError) {
                    senderError = altError;
                }
            }

            if (senderError) {
                logger.debug('Sender lookup error or not found', { error: senderError.message });
            }

            if (senderUser) {
                logger.info('Found sender user, sending notification', { userId: senderUser.id });
                // Send push notification for sent payment
                await NotificationService.notifyTransaction(senderUser.id, {
                    type: 'sent',
                    amount: transfer.value.toString(),
                    token: transfer.asset,
                    network: network,
                    txHash: transfer.txHash,
                });

                logger.info('User notified of sent payment');
            }

            // Record the transaction
            const txUserId = recipientUser?.id || senderUser?.id;
            if (txUserId) {
                logger.info('Recording transaction to database', { userId: txUserId, txHash: transfer.txHash });
                const { error: txError } = await supabase
                    .from('transactions')
                    .upsert({
                        user_id: txUserId,
                        document_id: document?.id || null,
                        tx_hash: transfer.txHash,
                        type: recipientUser ? 'PAYMENT_RECEIVED' : 'PAYMENT_SENT',
                        status: 'CONFIRMED',
                        chain: network.toUpperCase() === 'BASE' ? 'BASE' : 'BASE' as any,
                        amount: parseFloat(transfer.value.toString()),
                        token: transfer.asset,
                        from_address: transfer.from,
                        to_address: transfer.to,
                        block_number: parseInt(transfer.blockNumber, 16),
                        timestamp: new Date().toISOString(),
                        platform_fee: 0,
                    }, { onConflict: 'tx_hash' });

                if (txError) {
                    logger.error('Failed to record transaction', { error: txError.message });
                } else {
                    logger.info('Transaction recorded successfully');
                }
            } else {
                logger.warn('No user found for transaction, skipping record', { from: transfer.from, to: transfer.to });
            }

        } catch (err) {
            logger.error('Error processing Alchemy activity', { error: err instanceof Error ? err.message : 'Unknown' });
        }
    }
}

/**
 * Process Solana Address Activity events (Beta - Devnet)
 */
async function processSolanaActivity(event: AlchemySolanaAddressActivityEvent) {
    const { network, transaction: transactions, slot } = event;

    logger.debug('Processing Solana transactions', { count: transactions.length, network, slot });

    for (const tx of transactions) {
        // Skip vote transactions
        if (tx.is_vote) {
            continue;
        }

        const transfer = AlchemyWebhooksService.extractSolanaTransferInfo(tx, slot);
        logger.debug('Processing Solana transfer', { asset: transfer.asset, value: transfer.value });

        try {
            // Track users and document for transaction recording
            let recipientUser: { id: string; privy_id: string } | null = null;
            let senderUser: { id: string; privy_id: string } | null = null;
            let document: any = null;

            // Find user by Solana wallet address (recipient)
            if (transfer.to) {
                const { data: foundRecipient } = await supabase
                    .from('users')
                    .select('id, privy_id')
                    .or(`solana_address.eq.${transfer.to},wallet_address.eq.${transfer.to}`)
                    .single();

                recipientUser = foundRecipient;

                if (recipientUser) {
                    // Check if this payment is for an invoice or payment link
                    const { data: foundDoc } = await supabase
                        .from('documents')
                        .select('*')
                        .eq('user_id', recipientUser.id)
                        .eq('status', 'PENDING')
                        .or(`type.eq.invoice,type.eq.payment_link`)
                        .order('created_at', { ascending: false })
                        .limit(1)
                        .single();

                    document = foundDoc;

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

                    logger.info('User notified of received SOL payment');
                }
            }

            // Find user by Solana wallet address (sender)
            if (transfer.from) {
                const { data: foundSender } = await supabase
                    .from('users')
                    .select('id, privy_id')
                    .or(`solana_address.eq.${transfer.from},wallet_address.eq.${transfer.from}`)
                    .single();

                senderUser = foundSender;

                if (senderUser) {
                    await NotificationService.notifyTransaction(senderUser.id, {
                        type: 'sent',
                        amount: transfer.value.toFixed(6),
                        token: transfer.asset,
                        network: network,
                        txHash: transfer.signature,
                    });

                    logger.info('User notified of sent SOL payment');
                }
            }

            // Record the transaction
            const txUserId = recipientUser?.id || senderUser?.id;
            if (txUserId) {
                await supabase
                    .from('transactions')
                    .upsert({
                        user_id: txUserId,
                        document_id: document?.id || null,
                        tx_hash: transfer.signature,
                        type: recipientUser ? 'PAYMENT_RECEIVED' : 'PAYMENT_SENT',
                        status: 'CONFIRMED',
                        chain: 'SOLANA',
                        amount: transfer.value,
                        token: transfer.asset,
                        from_address: transfer.from,
                        to_address: transfer.to || '',
                        block_number: slot,
                        timestamp: new Date().toISOString(),
                        platform_fee: 0,
                    }, { onConflict: 'tx_hash' });
            }

        } catch (err) {
            logger.error('Error processing Solana activity', { error: err instanceof Error ? err.message : 'Unknown' });
        }
    }
}

export default router;
