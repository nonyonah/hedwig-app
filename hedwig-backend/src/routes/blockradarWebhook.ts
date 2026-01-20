import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { createLogger } from '../utils/logger';
import BlockradarService from '../services/blockradar';

const router = Router();
const logger = createLogger('BlockradarWebhook');

/**
 * POST /api/webhooks/blockradar
 * Handle Blockradar webhook events for deposits, withdrawals, and sweeps
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const signature = req.headers['x-blockradar-signature'] as string;
    const payload = JSON.stringify(req.body);

    // Verify webhook signature
    if (signature && !BlockradarService.verifyWebhookSignature(payload, signature)) {
      logger.warn('Invalid Blockradar webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const event = req.body;
    const eventType = event.event || event.type;

    logger.info('Received Blockradar webhook', {
      type: eventType,
      id: event.id,
    });

    // Log the event for auditing
    await supabase.from('blockradar_events').insert({
      id: event.id || `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      event_type: eventType,
      address_id: event.data?.addressId || event.data?.address?.id,
      transaction_id: event.data?.transactionId || event.data?.id,
      payload: event,
    });

    // Process event based on type
    switch (eventType) {
      case 'deposit.success':
      case 'deposit.confirmed':
        await handleDeposit(event.data);
        break;

      case 'deposit.pending':
        logger.info('Deposit pending', { 
          addressId: event.data?.addressId,
          amount: event.data?.amount 
        });
        break;

      case 'withdrawal.success':
      case 'withdrawal.confirmed':
        await handleWithdrawal(event.data);
        break;

      case 'withdrawal.failed':
        await handleWithdrawalFailed(event.data);
        break;

      case 'sweep.success':
        logger.info('Auto-sweep completed', {
          txHash: event.data?.txHash,
          amount: event.data?.amount,
        });
        break;

      case 'sweep.failed':
        logger.error('Auto-sweep failed', {
          addressId: event.data?.addressId,
          error: event.data?.error,
        });
        break;

      default:
        logger.info('Unhandled webhook event type', { type: eventType });
    }

    res.status(200).json({ received: true });
  } catch (error) {
    logger.error('Blockradar webhook processing error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    // Return 200 to prevent webhook retries for processing errors
    res.status(200).json({ received: true, error: 'Processing error' });
  }
});

/**
 * Handle successful deposit to a user's address
 */
async function handleDeposit(data: any) {
  const addressId = data.addressId || data.address?.id;
  const amount = data.amount || data.value;
  const asset = data.asset?.symbol?.toLowerCase() || 'usdc';
  const txHash = data.txHash || data.hash;

  logger.info('Processing deposit', { addressId, amount, asset, txHash });

  // Find user by Blockradar address ID
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, email')
    .eq('blockradar_address_id', addressId)
    .single();

  if (userError || !user) {
    logger.warn('User not found for Blockradar address', { addressId });
    return;
  }

  // Update or insert user balance
  const { error: balanceError } = await supabase.from('user_balances').upsert(
    {
      id: `bal_${user.id}_base_${asset}`,
      user_id: user.id,
      chain: 'base',
      asset: asset,
      amount: parseFloat(amount) || 0,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,chain,asset' }
  );

  if (balanceError) {
    logger.error('Failed to update user balance', { error: balanceError });
  }

  // Create transaction record
  await supabase.from('transactions').insert({
    user_id: user.id,
    type: 'PAYMENT_RECEIVED',
    status: 'CONFIRMED',
    chain: 'BASE',
    tx_hash: txHash,
    from_address: data.from || data.sender || 'external',
    to_address: data.to || data.address?.address || addressId,
    amount: parseFloat(amount) || 0,
    token: asset.toUpperCase(),
    platform_fee: 0,
    timestamp: new Date().toISOString(),
  });

  // Create notification for user
  await supabase.from('notifications').insert({
    user_id: user.id,
    type: 'PAYMENT_RECEIVED',
    title: 'Payment Received',
    message: `You received ${amount} ${asset.toUpperCase()} on Base`,
    data: { txHash, amount, asset },
  });

  // TODO: Send push notification via APNs/FCM
  logger.info('Deposit processed successfully', { userId: user.id, amount, asset });
}

/**
 * Handle successful withdrawal
 */
async function handleWithdrawal(data: any) {
  const txHash = data.txHash || data.hash;
  const metadata = data.metadata || {};

  logger.info('Processing withdrawal success', { txHash, metadata });

  // If this withdrawal was for an offramp, update the order status
  if (metadata.offrampOrderId) {
    const { error } = await supabase
      .from('offramp_orders')
      .update({
        status: 'PROCESSING',
        tx_hash: txHash,
        updated_at: new Date().toISOString(),
      })
      .eq('id', metadata.offrampOrderId);

    if (error) {
      logger.error('Failed to update offramp order', { error, orderId: metadata.offrampOrderId });
    } else {
      logger.info('Offramp order updated', { orderId: metadata.offrampOrderId });
    }
  }
}

/**
 * Handle failed withdrawal
 */
async function handleWithdrawalFailed(data: any) {
  const metadata = data.metadata || {};
  const errorMessage = data.error || data.message || 'Withdrawal failed';

  logger.error('Withdrawal failed', { metadata, error: errorMessage });

  // If this withdrawal was for an offramp, mark it as failed
  if (metadata.offrampOrderId) {
    await supabase
      .from('offramp_orders')
      .update({
        status: 'FAILED',
        error_message: errorMessage,
        updated_at: new Date().toISOString(),
      })
      .eq('id', metadata.offrampOrderId);

    // Notify user
    const { data: order } = await supabase
      .from('offramp_orders')
      .select('user_id')
      .eq('id', metadata.offrampOrderId)
      .single();

    if (order) {
      await supabase.from('notifications').insert({
        user_id: order.user_id,
        type: 'OFFRAMP_FAILED',
        title: 'Offramp Failed',
        message: 'Your offramp request could not be processed. Please try again.',
        data: { orderId: metadata.offrampOrderId, error: errorMessage },
      });
    }
  }
}

export default router;
