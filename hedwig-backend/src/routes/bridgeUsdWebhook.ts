import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { bridgeUsdService } from '../services/bridgeUsd';
import NotificationService from '../services/notifications';
import { createLogger } from '../utils/logger';

const logger = createLogger('BridgeUsdWebhook');
const router = Router();

const isCompletedStatus = (status: string): boolean => {
    const normalized = status.toLowerCase();
    return normalized === 'completed' || normalized === 'settled' || normalized === 'success';
};

router.post('/', async (req: Request, res: Response) => {
    try {
        const signature =
            (req.headers['x-webhook-signature'] as string | undefined) ||
            (req.headers['x-bridge-signature'] as string | undefined) ||
            undefined;
        const rawBody = ((req as any).rawBody as string | undefined) || JSON.stringify(req.body || {});
        const signatureValid = bridgeUsdService.verifyWebhookSignature(rawBody, signature);

        if (process.env.NODE_ENV === 'production' && !signatureValid) {
            logger.warn('Bridge USD webhook rejected due to invalid signature');
            res.status(401).json({ success: false, error: 'Invalid signature' });
            return;
        }

        const payload = (req.body || {}) as Record<string, unknown>;
        const event = bridgeUsdService.parseTransferEvent(payload);
        if (!event.transferId) {
            res.status(400).json({ success: false, error: 'Missing transfer ID in event payload' });
            return;
        }

        const { error: webhookInsertError } = await supabase
            .from('bridge_webhook_events')
            .insert({
                provider_event_id: event.eventId,
                event_type: event.eventType,
                signature_valid: signatureValid,
                processed: false,
                raw_payload: payload,
            });

        if (webhookInsertError && webhookInsertError.code !== '23505') {
            throw new Error(`Failed to store webhook event: ${webhookInsertError.message}`);
        }
        if (webhookInsertError && webhookInsertError.code === '23505') {
            res.status(200).json({ success: true, status: 'duplicate_event' });
            return;
        }

        const { data: usdAccount, error: usdAccountError } = await supabase
            .from('user_usd_accounts')
            .select('id, user_id, bridge_customer_id')
            .eq('bridge_customer_id', event.customerId)
            .maybeSingle();

        if (usdAccountError) {
            throw new Error(`Failed to resolve USD account: ${usdAccountError.message}`);
        }
        if (!usdAccount) {
            logger.warn('No USD account found for Bridge event', { customerId: event.customerId });
            await supabase
                .from('bridge_webhook_events')
                .update({
                    processed: true,
                    processed_at: new Date().toISOString(),
                    processing_error: 'usd_account_not_found',
                })
                .eq('provider_event_id', event.eventId);
            res.status(200).json({ success: true, status: 'usd_account_not_found' });
            return;
        }

        const userId = usdAccount.user_id as string;
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id, ethereum_wallet_address')
            .eq('id', userId)
            .single();
        if (userError || !user) throw new Error('Failed to load user for transfer event');

        const destinationWallet = user.ethereum_wallet_address || '';
        const feeCalc = bridgeUsdService.calculateFees(event.amountUsd, event.providerFeeUsd);
        const computedUsdcSettled = event.usdcAmountSettled > 0 ? event.usdcAmountSettled : feeCalc.netSettlementUsd;
        const completedAt = isCompletedStatus(event.status) ? new Date().toISOString() : null;

        const { data: transfer, error: upsertError } = await supabase
            .from('bridge_usd_transfers')
            .upsert(
                {
                    user_id: userId,
                    bridge_transfer_id: event.transferId,
                    bridge_event_id: event.eventId,
                    direction: 'inbound',
                    status: event.status.toLowerCase(),
                    usd_amount_gross: event.amountUsd,
                    hedwig_fee_usd: feeCalc.hedwigFeeUsd,
                    provider_fee_usd: feeCalc.providerFeeUsd,
                    usd_amount_net: feeCalc.netSettlementUsd,
                    usdc_amount_settled: computedUsdcSettled,
                    usdc_tx_hash: event.usdcTxHash,
                    settlement_wallet_address: destinationWallet,
                    raw_payload: event.payload,
                    completed_at: completedAt,
                },
                { onConflict: 'bridge_transfer_id' }
            )
            .select('*')
            .single();

        if (upsertError || !transfer) {
            throw new Error(`Failed to upsert transfer: ${upsertError?.message || 'unknown error'}`);
        }

        if (completedAt) {
            const { error: feeLedgerError } = await supabase
                .from('usd_fee_ledger')
                .upsert(
                    {
                        user_id: userId,
                        transfer_id: transfer.id,
                        fee_percent: feeCalc.feePercent,
                        fee_usd: feeCalc.hedwigFeeUsd,
                        gross_usd: event.amountUsd,
                        net_usd: feeCalc.netSettlementUsd,
                    },
                    { onConflict: 'transfer_id' }
                );
            if (feeLedgerError) {
                throw new Error(`Failed to write fee ledger: ${feeLedgerError.message}`);
            }

            await supabase
                .from('notifications')
                .insert({
                    user_id: userId,
                    title: 'USD Deposit Settled',
                    message: `$${event.amountUsd.toFixed(2)} received. ${computedUsdcSettled.toFixed(2)} USDC settled to Base wallet.`,
                    type: 'usd_deposit_settled',
                    metadata: {
                        transferId: transfer.id,
                        bridgeTransferId: event.transferId,
                        grossUsd: event.amountUsd,
                        hedwigFeeUsd: feeCalc.hedwigFeeUsd,
                        providerFeeUsd: feeCalc.providerFeeUsd,
                        netUsd: feeCalc.netSettlementUsd,
                        usdcAmountSettled: computedUsdcSettled,
                        settlementWallet: destinationWallet,
                        txHash: event.usdcTxHash,
                    },
                    is_read: false,
                });

            await supabase
                .from('transactions')
                .insert({
                    user_id: userId,
                    type: 'PAYMENT_RECEIVED',
                    status: 'CONFIRMED',
                    chain: 'BASE',
                    tx_hash: event.usdcTxHash || null,
                    from_address: 'bridge_usd_account',
                    to_address: destinationWallet || 'unknown',
                    amount: computedUsdcSettled,
                    token: 'USDC',
                    platform_fee: feeCalc.hedwigFeeUsd,
                    network_fee: feeCalc.providerFeeUsd,
                    timestamp: new Date().toISOString(),
                });

            try {
                await NotificationService.notifyUser(userId, {
                    title: 'USD Deposit Settled',
                    body: `${computedUsdcSettled.toFixed(2)} USDC has been sent to your Base wallet.`,
                    data: {
                        type: 'usd_deposit_settled',
                        transferId: transfer.id,
                        txHash: event.usdcTxHash,
                        usdcAmountSettled: computedUsdcSettled,
                    },
                });
            } catch (notifyError) {
                logger.error('Failed to send push notification', {
                    error: notifyError instanceof Error ? notifyError.message : 'Unknown',
                });
            }
        }

        await supabase
            .from('bridge_webhook_events')
            .update({
                processed: true,
                processed_at: new Date().toISOString(),
            })
            .eq('provider_event_id', event.eventId);

        res.status(200).json({ success: true });
    } catch (error: any) {
        logger.error('Bridge USD webhook processing failed', {
            error: error?.message || 'Unknown',
        });
        res.status(500).json({ success: false, error: error?.message || 'Webhook error' });
    }
});

export default router;
