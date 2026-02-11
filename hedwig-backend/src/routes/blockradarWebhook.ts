import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { supabase } from '../lib/supabase';
import { createLogger } from '../utils/logger';
import BlockradarService from '../services/blockradar';
import NotificationService from '../services/notifications';

const router = Router();
const logger = createLogger('BlockradarWebhook');

/**
 * POST /api/webhooks/blockradar
 * Handle Blockradar webhook events for deposits, withdrawals, and sweeps
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    // Verify webhook signature
    // Documentation: https://docs.blockradar.co/en/essentials/webhooks#signature-validation
    // IMPORTANT: Blockradar uses the API KEY (not a separate webhook secret) to sign webhooks
    const signature = req.headers['x-blockradar-signature'] as string;
    const apiKey = process.env.BLOCKRADAR_API_KEY;

    if (!apiKey) {
        logger.error('BLOCKRADAR_API_KEY is not configured');
        return res.status(500).json({ error: 'Server configuration error' });
    }

    if (!signature) {
        logger.warn('Missing x-blockradar-signature header');
        return res.status(401).json({ error: 'Missing signature' });
    }

    // CRITICAL: Use rawBody from the verify middleware
    // Blockradar signs the exact raw bytes of the request body using HMAC-SHA512 with the API KEY
    const rawBody = (req as any).rawBody;
    
    if (!rawBody) {
        logger.error('rawBody not available - body parser middleware issue');
        return res.status(500).json({ error: 'Server configuration error' });
    }

    // Compute HMAC-SHA512 signature using the API KEY as the secret
    const computedSignature = crypto
        .createHmac('sha512', apiKey)
        .update(rawBody, 'utf8')
        .digest('hex');

    if (signature !== computedSignature) {
        logger.warn('Invalid webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
    }

    logger.info('Webhook signature verified successfully');

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
        // Check if this is a payment link deposit
        if (event.data?.metadata?.documentId) {
            await handlePaymentLinkDeposit(event.data);
        } else {
            await handleDeposit(event.data);
        }
        break;

      case 'deposit.pending':
        logger.info('Deposit pending', { 
          addressId: event.data?.addressId,
          amount: event.data?.amount 
        });
        break;

/**
 * Handle successful deposit to a user's address
 */
async function handleDeposit(data: any) {
  // ... (existing implementation)
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

  // Also send push notification
  try {
      await NotificationService.notifyUser(user.id, {
          title: '💰 Payment Received',
          body: `You received ${amount} ${asset.toUpperCase()} on Base`,
          data: { type: 'payment_received', txHash, amount, asset }
      });
  } catch (notifyErr) {
      logger.error('Failed to send push notification', { error: notifyErr });
  }

  logger.info('Deposit processed successfully', { userId: user.id, amount, asset });
}

/**
 * Handle Payment Link Deposit (Auto-Withdrawal flow)
 */
async function handlePaymentLinkDeposit(data: any) {
    const { documentId, userId } = data.metadata;
    const amount = parseFloat(data.amount || data.value);
    const asset = data.asset?.symbol?.toUpperCase() || 'USDC';
    const txHash = data.txHash || data.hash;

    logger.info('Processing Payment Link Deposit', { 
        documentId, 
        userId,
        amount, 
        asset,
        txHash,
        assetInfo: {
            id: data.asset?.id || data.assetId,
            symbol: data.asset?.symbol,
            name: data.asset?.name,
            decimals: data.asset?.decimals
        }
    });

    // 1. Mark Document as PAID
    const { data: currentDoc } = await supabase.from('documents').select('*, client_id').eq('id', documentId).single();
    if (currentDoc) {
        await supabase.from('documents').update({
            status: 'PAID',
            content: {
                ...currentDoc.content,
                paid_at: new Date().toISOString(),
                tx_hash: txHash,
                payment_token: asset,
                paid_amount: amount,
                blockradar_tx_id: data.id
            }
        }).eq('id', documentId);
        logger.info('Document marked as PAID', { documentId });

        // Update client total_earnings if document has a client
        if (currentDoc.client_id) {
            try {
                // Use centralized service to update stats
                const { ClientService } = await import('../services/clientService');
                await ClientService.updateClientStats(currentDoc.client_id);
            } catch (err) {
                 logger.error('Failed to update client stats after payment', { error: err, clientId: currentDoc.client_id });
            }
        }

        // Update milestone status to 'paid' if this invoice is linked to a milestone
        if (currentDoc.content?.milestone_id) {
            const milestoneId = currentDoc.content.milestone_id;
            
            await supabase
                .from('milestones')
                .update({ status: 'paid' })
                .eq('id', milestoneId);
            
            logger.info('Updated milestone status to paid', { milestoneId, documentId });
        }

        // Send push notification to user
        if (currentDoc) {
            try {
                await NotificationService.notifyUser(userId, {
                    title: '💰 Payment Link Paid!',
                    body: `You received ${amount} ${asset} for ${currentDoc.title}`,
                    data: { type: 'payment_received', documentId, txHash, amount, asset }
                });
            } catch (notifyErr) {
                logger.error('Failed to send push notification', { error: notifyErr });
            }
        }
    }

    // 2. Calculate Fees
    const PLATFORM_FEE_PERCENT = 0.005; // 0.5%
    const platformFee = amount * PLATFORM_FEE_PERCENT;
    let freelancerAmount = amount - platformFee;

    logger.info('Fee calculation', {
        totalAmount: amount,
        platformFee,
        freelancerAmount,
        feePercent: '0.5%'
    });

    // 3. Get Freelancer Wallet (Privy)
    const { data: user, error: userError } = await supabase
        .from('users')
        .select('id, email, ethereum_wallet_address, solana_wallet_address')
        .eq('id', userId)
        .single();

    if (userError) {
        logger.error('Database error fetching user', { userId, error: userError.message });
        return;
    }

    if (!user) {
        logger.error('User not found for auto-withdrawal', { userId });
        return;
    }

    logger.info('User wallet info', {
        userId: user.id,
        email: user.email,
        ethereumWallet: user.ethereum_wallet_address || 'NOT SET',
        solanaWallet: user.solana_wallet_address || 'NOT SET'
    });

    // Detect Chain from Asset
    // Blockradar assets usually have a 'blockchain' or 'network' field, or we infer from symbol
    // data.asset might look like: { id, symbol, name, blockchain: { name: 'Solana', symbol: 'SOL' } }
    let isSolana = false;
    
    // Check asset metadata from webhook first
    if (data.asset?.blockchain?.name?.toLowerCase()?.includes('solana') || 
        data.asset?.blockchain?.symbol?.toLowerCase() === 'sol' ||
        data.asset?.network?.toLowerCase()?.includes('solana')) {
        isSolana = true;
        logger.info('Detected Solana from webhook asset data');
    }
    
    // We'll re-verify this when we fetch the asset from the wallet below
    let destinationAddress = isSolana ? user.solana_wallet_address : user.ethereum_wallet_address;
    let requiredNetwork = isSolana ? 'Solana' : 'Ethereum/Base';

    if (!destinationAddress) {
        logger.error(`Freelancer ${requiredNetwork} wallet not found - cannot process auto-withdrawal`, { 
            userId,
            email: user.email,
            isSolana,
            message: 'User needs to complete wallet setup in biometrics screen'
        });
        
        // Create notification for user to complete wallet setup
        await supabase.from('notifications').insert({
            user_id: userId,
            type: 'PAYMENT_RECEIVED',
            title: 'Payment Received - Action Required',
            message: `You received ${amount} ${asset} on ${requiredNetwork} but your wallet is not set up. Please complete your profile setup to receive funds.`,
            data: { documentId, amount, asset, txHash, network: requiredNetwork }
        });
        
        return;
    }

    // 4. Get correct asset ID from Blockradar wallet
    let assetId = data.asset?.id || data.assetId;
    
    logger.info('Asset ID from webhook', { 
        assetId, 
        symbol: data.asset?.symbol,
        webhookAssetData: data.asset // Log full webhook asset data
    });
    
    // Always fetch and validate asset ID from wallet to ensure it's correct
    try {
        const assets = await BlockradarService.getAssets();
        logger.info('Available assets in wallet', { 
            count: assets.length,
            assets: assets.map(a => ({ 
                id: a.id, 
                symbol: a.symbol, 
                name: a.name,
                blockchain: a.blockchain,
                network: a.network,
                asset: a.asset // Include nested asset property
            }))
        });
        
        // Find the matching asset by ID from webhook (most reliable)
        // Check both top-level id and nested asset.id
        let matchedAsset = assets.find(a => 
            a.id === assetId || a.asset?.id === assetId
        );
        
        if (!matchedAsset) {
            logger.error('Asset from webhook not found in wallet assets - Solana asset may not be enabled', { 
                webhookAssetId: assetId,
                webhookAssetSymbol: data.asset?.symbol,
                webhookAssetNetwork: data.asset?.network,
                availableAssetIds: assets.map(a => a.id),
                availableNestedAssetIds: assets.map(a => a.asset?.id),
                availableNetworks: assets.map(a => a.asset?.blockchain?.name || 'unknown')
            });
            
            // Check if this is a Solana asset that's not in the wallet
            if (data.asset?.network === 'testnet' && !data.asset?.blockchain) {
                logger.error('Solana asset detected but not available in wallet - Solana support may not be enabled');
                
                await supabase.from('notifications').insert({
                    user_id: userId,
                    type: 'PAYMENT_FAILED',
                    title: 'Solana Payment Received',
                    message: `You received ${amount} ${asset} on Solana, but Solana withdrawals are not yet configured. Please contact support.`,
                    data: { documentId, amount, asset, txHash, network: 'Solana', error: 'Solana not enabled in wallet' }
                });
                
                return;
            }
            
            // Try to find by symbol as fallback for other cases
            matchedAsset = assets.find(a => 
                a.symbol?.toLowerCase() === 'usdc' || 
                a.name?.toLowerCase().includes('usd coin') ||
                a.asset?.symbol?.toLowerCase() === 'usdc' || 
                a.asset?.name?.toLowerCase().includes('usd coin')
            );
            
            if (matchedAsset) {
                logger.warn('Found asset by symbol instead of ID - using matched asset', {
                    webhookAssetId: assetId,
                    matchedAssetId: matchedAsset.id
                });
                // Use the matched asset ID since the webhook asset isn't in the wallet
                assetId = matchedAsset.id;
            }
        }
        
        if (matchedAsset) {
            // If we matched by nested asset.id, we need to use the top-level id for withdrawal
            const walletAssetId = matchedAsset.id;
            
            if (assetId !== walletAssetId) {
                logger.info('Using wallet asset ID instead of webhook asset ID', {
                    webhookAssetId: assetId,
                    walletAssetId: walletAssetId,
                    reason: 'Webhook provides nested asset.id, but withdrawal needs top-level id'
                });
                assetId = walletAssetId;
            }
            
            // CRITICAL: Detect network from the matched asset
            const blockchainName = matchedAsset.blockchain?.name?.toLowerCase() || 
                                   matchedAsset.asset?.blockchain?.name?.toLowerCase() || 
                                   matchedAsset.network?.toLowerCase() || '';
            
            const blockchainSymbol = matchedAsset.blockchain?.symbol?.toLowerCase() || 
                                     matchedAsset.asset?.blockchain?.symbol?.toLowerCase() || '';
            
            logger.info('Blockchain detection from matched asset', {
                assetId: matchedAsset.id,
                blockchainName,
                blockchainSymbol,
                fullBlockchainData: matchedAsset.blockchain,
                fullAssetData: matchedAsset.asset
            });
            
            if (blockchainName.includes('solana') || blockchainSymbol === 'sol') {
                isSolana = true;
                logger.info('Detected Solana network from asset data');
                
                // Update destination address to Solana wallet
                destinationAddress = user.solana_wallet_address;
                requiredNetwork = 'Solana';
                
                // Re-check address requirement if network changed
                if (!user.solana_wallet_address) {
                     logger.error('Freelancer Solana wallet not found after asset verification', { userId });
                     
                     await supabase.from('notifications').insert({
                        user_id: userId,
                        type: 'PAYMENT_RECEIVED',
                        title: 'Payment Received - Action Required',
                        message: `You received ${amount} ${asset} on Solana but your Solana wallet is not set up. Please complete your profile setup to receive funds.`,
                        data: { documentId, amount, asset, txHash, network: 'Solana' }
                    });
                     
                     return;
                }
            } else {
                logger.info('Detected EVM network from asset data');
                // Update destination address to EVM wallet
                destinationAddress = user.ethereum_wallet_address;
                requiredNetwork = 'Ethereum/Base';
            }

            logger.info('Using asset ID from webhook', { 
                assetId, 
                symbol: matchedAsset.symbol || matchedAsset.asset?.symbol || 'unknown',
                isSolana,
                network: requiredNetwork
            });
        } else {
            logger.error('No matching asset found in wallet');
        }
    } catch (assetError: any) {
        logger.error('Failed to fetch assets from wallet', { error: assetError.message });
    }
    
    if (!assetId) {
        logger.error('Cannot determine asset ID for withdrawal');
        await supabase.from('notifications').insert({
            user_id: userId,
            type: 'PAYMENT_FAILED',
            title: 'Payment Processing Error',
            message: `Received ${amount} ${asset} but cannot process withdrawal. Please contact support.`,
            data: { documentId, amount, asset, error: 'Invalid asset ID' }
        });
        return;
    }
    
    // Final validation: Ensure we have the correct destination address for the detected network
    if (!destinationAddress) {
        logger.error(`No ${requiredNetwork} wallet address available for withdrawal`, { 
            userId,
            isSolana,
            requiredNetwork
        });
        
        await supabase.from('notifications').insert({
            user_id: userId,
            type: 'PAYMENT_RECEIVED',
            title: 'Payment Received - Action Required',
            message: `You received ${amount} ${asset} on ${requiredNetwork} but your wallet is not set up. Please complete your profile setup to receive funds.`,
            data: { documentId, amount, asset, txHash, network: requiredNetwork }
        });
        
        return;
    }
    
    logger.info('Final withdrawal parameters', {
        isSolana,
        network: requiredNetwork,
        destinationAddress: destinationAddress.substring(0, 6) + '...' + destinationAddress.substring(destinationAddress.length - 4),
        assetId,
        amount: freelancerAmount
    });

    // 5. Check Wallet Balance & Clamp Amount
    try {
        if (data.walletId) {
            const wallet = await BlockradarService.getWallet(data.walletId);
            const balanceData = wallet.balances?.find((b: any) => b.assetId === assetId);
            
            if (balanceData) {
                const availableBalance = parseFloat(balanceData.balance);
                // If available balance is slightly less than calculated amount (due to gas/fees), clamp it
                // We leave a tiny buffer for gas if needed, but Blockradar usually handles fees
                if (availableBalance < freelancerAmount && availableBalance > 0) {
                     logger.warn('Insufficient balance for full withdrawal, clamping amount', { 
                        calculated: freelancerAmount, 
                        available: availableBalance,
                        diff: freelancerAmount - availableBalance
                     });
                     freelancerAmount = availableBalance;
                }
            }
        }
    } catch (balError) {
        logger.warn('Failed to fetch wallet balance, proceeding with calculated amount', { error: balError });
    }

    if (freelancerAmount <= 0) {
        logger.error('Withdrawal amount is zero or negative after clamping', { freelancerAmount });
        return;
    }

    // 6. Initiate Withdrawal to Freelancer
    try {
        const withdraw = await BlockradarService.withdraw({
            toAddress: destinationAddress,
            amount: freelancerAmount.toString(),
            assetId: assetId,
            isSolana: isSolana,
            metadata: {
                documentId,
                userId,
                type: 'PAYMENT_SETTLEMENT'
            }
        });
        
        logger.info('Auto-withdrawal initiated successfully', { 
            withdrawId: withdraw.id, 
            amount: freelancerAmount,
            toAddress: destinationAddress,
            status: withdraw.status
        });
        
        // Log transaction (Payout)
        await supabase.from('transactions').insert({
            user_id: userId,
            type: 'PAYMENT_RECEIVED',
            status: 'PROCESSING',
            chain: isSolana ? 'SOLANA' : 'BASE',
            tx_hash: withdraw.txHash || 'pending',
            to_address: destinationAddress,
            amount: freelancerAmount,
            token: asset,
            platform_fee: platformFee,
            timestamp: new Date().toISOString(),
            metadata: {
                blockradar_withdrawal_id: withdraw.id,
                source_document_id: documentId
            }
        });
        
        // Create success notification
        await supabase.from('notifications').insert({
            user_id: userId,
            type: 'PAYMENT_RECEIVED',
            title: 'Payment Received',
            message: `${freelancerAmount.toFixed(2)} ${asset} is being sent to your wallet`,
            data: { 
                documentId, 
                amount: freelancerAmount, 
                asset, 
                txHash: withdraw.txHash,
                withdrawalId: withdraw.id
            }
        });

    } catch (error: any) {
        logger.error('Failed to initiate auto-withdrawal', { 
            error: error.message,
            userId,
            amount: freelancerAmount,
            toAddress: destinationAddress
        });
        
        // Create error notification
        await supabase.from('notifications').insert({
            user_id: userId,
            type: 'PAYMENT_FAILED',
            title: 'Payment Processing Error',
            message: `Failed to send ${freelancerAmount.toFixed(2)} ${asset} to your wallet. Please contact support.`,
            data: { documentId, amount, asset, error: error.message }
        });
    }
}

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

    return res.status(200).json({ received: true });
  } catch (error) {
    logger.error('Blockradar webhook processing error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    // Return 200 to prevent webhook retries for processing errors
    return res.status(200).json({ received: true, error: 'Processing error' });
  }
});




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


/**
 * Handle Payment Link Deposit (Auto-Withdrawal flow)
 */
export default router;
