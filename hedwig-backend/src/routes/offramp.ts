import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import PaycrestService from '../services/paycrest';
import NotificationService from '../services/notifications';
import { supabase } from '../lib/supabase';
import { createLogger } from '../utils/logger';
import { buildOfframpCopy } from '../utils/notificationCopy';

const logger = createLogger('Offramp');

const router = Router();
// Keep status reconciliation on by default so delayed/missed webhooks do not leave
// active orders stuck in a stale state. Set PAYCREST_STATUS_POLLING=false to disable.
const ENABLE_PAYCREST_STATUS_POLLING = process.env.PAYCREST_STATUS_POLLING !== 'false';

const mapPaycrestOrderStatus = (rawStatus?: string): 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | null => {
    if (!rawStatus) return null;
    const status = rawStatus.toLowerCase();

    if (status === 'initiated') return 'PENDING';
    if (status === 'pending' || status === 'processing') return 'PROCESSING';
    if (status === 'validated') return 'COMPLETED';
    if (status === 'settled' || status === 'completed' || status === 'success') return 'COMPLETED';
    if (status === 'expired' || status === 'failed' || status === 'refunded' || status === 'cancelled') return 'FAILED';
    return null;
};

const normalizeStatusForClient = (
    rawStatus?: string | null,
    txHash?: string | null,
    completedAt?: string | null
): 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' => {
    const status = (rawStatus || '').trim().toUpperCase();
    const hasCompletionEvidence = Boolean(
        (txHash && txHash.trim().length > 0) ||
        (completedAt && completedAt.trim().length > 0)
    );

    if (status === 'COMPLETED' || status === 'SUCCESS' || status === 'VALIDATED' || status === 'SETTLED') {
        return 'COMPLETED';
    }
    if (status === 'PENDING' || status === 'INITIATED') {
        return 'PENDING';
    }
    if (status === 'PROCESSING' || status === 'IN_PROGRESS' || status === 'QUEUED') {
        return 'PROCESSING';
    }
    if (status === 'CANCELLED' || status === 'CANCELED') {
        return hasCompletionEvidence ? 'COMPLETED' : 'CANCELLED';
    }
    if (status === 'FAILED' || status === 'REFUNDED' || status === 'EXPIRED' || status === 'ERROR') {
        return hasCompletionEvidence ? 'COMPLETED' : 'FAILED';
    }
    return hasCompletionEvidence ? 'COMPLETED' : 'PROCESSING';
};

const extractPaycrestStatus = (payload: any): string | undefined =>
    payload?.data?.order?.status ||
    payload?.order?.status ||
    payload?.data?.status ||
    payload?.payload?.order?.status ||
    payload?.payload?.status ||
    payload?.status;

const extractPaycrestTxHash = (payload: any): string | undefined =>
    payload?.txHash ||
    payload?.tx_hash ||
    payload?.data?.txHash ||
    payload?.data?.tx_hash ||
    payload?.order?.txHash ||
    payload?.order?.tx_hash;

const notifyOfframpCompletedIfNeeded = async (userId: string, order: any): Promise<void> => {
    const orderId = String(order?.id || '');
    if (!orderId) return;

    // Prevent duplicate success notifications when both polling and webhook update the same order.
    const { data: existing } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', userId)
        .eq('type', 'offramp_success')
        .eq('metadata->>orderId', orderId)
        .limit(1)
        .maybeSingle();

    if (existing) return;

    const fiatAmount = Number(order?.fiat_amount || order?.fiatAmount || 0);
    const fiatCurrency = String(order?.fiat_currency || order?.fiatCurrency || '');
    const bankName = String(order?.bank_name || order?.bankName || 'your bank');
    const accountNumber = String(order?.account_number || order?.accountNumber || '');
    const maskedAccount = accountNumber ? `****${accountNumber.slice(-4)}` : '';
    const copy = buildOfframpCopy({
        status: 'COMPLETED',
        fiatAmount,
        fiatCurrency,
        bankName,
        accountNumber,
    });

    await supabase.from('notifications').insert({
        user_id: userId,
        title: copy.title,
        message: copy.body,
        type: 'offramp_success',
        metadata: {
            orderId: orderId,
            paycrestOrderId: order?.paycrest_order_id || order?.paycrestOrderId || null,
            status: 'COMPLETED',
            amount: order?.crypto_amount ?? order?.cryptoAmount ?? null,
            token: order?.token ?? 'USDC',
            destination: `${bankName}${maskedAccount ? ` • ${maskedAccount}` : ''}`,
            fiatAmount: order?.fiat_amount ?? order?.fiatAmount ?? null,
            fiatCurrency: fiatCurrency || null,
        },
        is_read: false,
    });

    await NotificationService.notifyUser(userId, {
        title: copy.title,
        body: copy.body,
        data: {
            type: 'offramp_status',
            orderId: orderId,
            status: 'COMPLETED',
            fiatAmount: order?.fiat_amount ?? order?.fiatAmount ?? null,
            fiatCurrency: fiatCurrency || null,
            bankName,
            accountNumber: maskedAccount,
        },
    });
};

/**
 * GET /api/offramp/rates
 * Get current exchange rates
 * Query params: token, amount, currency, network
 */
router.get('/rates', authenticate, async (req: Request, res: Response, next) => {
    try {
        const { token = 'USDC', amount = '10', currency = 'NGN', network = 'base' } = req.query;

        // Ensure amount is a number
        const amountNum = parseFloat(amount as string);
        if (isNaN(amountNum)) {
            res.status(400).json({ success: false, error: 'Invalid amount' });
            return;
        }

        const platformFee = amountNum * 0.01;
        const netCryptoAmount = Math.max(0, amountNum - platformFee);
        if (netCryptoAmount <= 0) {
            res.status(400).json({ success: false, error: 'Amount too low after fee deduction' });
            return;
        }

        const rate = await PaycrestService.getExchangeRate(
            token as string,
            netCryptoAmount,
            currency as string,
            network as string
        );

        const parsedRate = parseFloat(rate);
        const fiatEstimate = Number.isFinite(parsedRate) ? netCryptoAmount * parsedRate : null;

        res.json({
            success: true,
            data: {
                rate,
                grossCryptoAmount: amountNum,
                platformFee,
                netCryptoAmount,
                fiatEstimate,
            },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/offramp/institutions
 * Get list of supported banks
 */
router.get('/institutions', authenticate, async (req: Request, res: Response, next) => {
    try {
        const { currency = 'NGN' } = req.query;
        const banks = await PaycrestService.getSupportedInstitutions(currency as string);
        
        res.json({
            success: true,
            data: { banks }
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/offramp/verify-account
 * Verify bank account
 */
router.post('/verify-account', authenticate, async (req: Request, res: Response, next) => {
    try {
        const { bankName, accountNumber, currency } = req.body;

        const result = await PaycrestService.verifyBankAccount(bankName, accountNumber, currency);

        res.json({
            success: true,
            data: result,
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/offramp/create
 * Create an offramp order
 */
router.post('/create', authenticate, async (req: Request, res: Response, next) => {
    try {
        const { amount, token, network, bankName, accountNumber, accountName, returnAddress, currency, memo, saveBeneficiary } =
            req.body;
        const authUserId = req.user!.id;

        // Look up the actual user.id from supabase_id or privy_id
        const { data: userRecord, error: userError } = await supabase
            .from('users')
            .select('id, kyc_status')
            .or(`supabase_id.eq.${authUserId},privy_id.eq.${authUserId}`)
            .single();

        if (userError || !userRecord) {
            logger.warn('User not found for order creation');
            res.status(404).json({ success: false, error: 'User not found' });
            return;
        }

        // Check KYC status - must be approved to offramp
        if (userRecord.kyc_status !== 'approved') {
            logger.info('Offramp blocked - KYC not approved', { 
                userId: userRecord.id, 
                kycStatus: userRecord.kyc_status 
            });
            res.status(403).json({
                success: false,
                error: {
                    message: 'KYC verification required',
                    code: 'KYC_REQUIRED',
                },
                kyc_required: true,
                kyc_status: userRecord.kyc_status || 'not_started',
            });
            return;
        }

        const userId = userRecord.id;

        const amountNum = parseFloat(amount);
        if (isNaN(amountNum)) {
            res.status(400).json({ success: false, error: 'Invalid amount' });
            return;
        }

        // Platform fee is 1% and is deducted from the entered amount.
        const platformFee = amountNum * 0.01;
        const netCryptoAmount = amountNum - platformFee;
        if (netCryptoAmount <= 0) {
            res.status(400).json({ success: false, error: 'Amount too low after fee deduction' });
            return;
        }

        // 1. Fetch current rate
        const rate = await PaycrestService.getExchangeRate(
            token,
            netCryptoAmount,
            currency || 'NGN',
            network
        );

        // 2. Create order with Paycrest using net amount after platform fee.
        const order = await PaycrestService.createOfframpOrder({
            amount: netCryptoAmount,
            token: token as 'USDC' | 'USDT',
            network: network as 'base',
            rate,
            recipient: {
                institution: bankName,
                accountIdentifier: accountNumber,
                accountName,
                currency,
                memo,
            },
            returnAddress,
        });

        // 3. Save order to database
        const { data: dbOrder, error } = await supabase
            .from('offramp_orders')
            .insert({
                user_id: userId,
                paycrest_order_id: order.id,
                status: 'PENDING',
                chain: network.toUpperCase(),
                token,
                crypto_amount: netCryptoAmount,
                fiat_currency: order.fiatCurrency!,
                fiat_amount: order.fiatAmount!,
                exchange_rate: order.exchangeRate!,
                service_fee: (order.senderFee || 0) + (order.transactionFee || 0),
                bank_name: bankName,
                account_number: accountNumber,
                account_name: accountName,
                receive_address: order.receiveAddress,
                memo: memo,
            })
            .select()
            .single();

        if (error) {
            throw new Error(`Failed to save offramp order: ${error.message}`);
        }

        // 4. Save beneficiary if requested
        if (saveBeneficiary) {
            // Check if beneficiary already exists
            const { data: existingBeneficiary } = await supabase
                .from('beneficiaries')
                .select('id')
                .eq('user_id', userId)
                .eq('account_number', accountNumber)
                .eq('bank_name', bankName)
                .single();

            if (!existingBeneficiary) {
                await supabase
                    .from('beneficiaries')
                    .insert({
                        user_id: userId,
                        bank_name: bankName,
                        account_number: accountNumber,
                        account_name: accountName,
                        currency: currency || 'NGN',
                        is_default: false,
                    });
                logger.info('Saved new beneficiary for user');
            }
        }

        // Map to camelCase
        const formattedOrder = {
            id: dbOrder.id,
            userId: dbOrder.user_id,
            paycrestOrderId: dbOrder.paycrest_order_id,
            status: dbOrder.status,
            chain: dbOrder.chain,
            token: dbOrder.token,
            cryptoAmount: dbOrder.crypto_amount,
            grossCryptoAmount: amountNum,
            platformFee: platformFee, // Calculated 1% for display
            fiatCurrency: dbOrder.fiat_currency,
            fiatAmount: dbOrder.fiat_amount,
            exchangeRate: dbOrder.exchange_rate,
            serviceFee: dbOrder.service_fee,
            bankName: dbOrder.bank_name,
            accountNumber: dbOrder.account_number,
            accountName: dbOrder.account_name,
            receiveAddress: dbOrder.receive_address,
            memo: dbOrder.memo,
            createdAt: dbOrder.created_at,
            updatedAt: dbOrder.updated_at,
        };

        res.json({
            success: true,
            data: { order: formattedOrder },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/offramp/orders
 * Get user's offramp orders
 */
router.get('/orders', authenticate, async (req: Request, res: Response, next) => {
    try {
        const authUserId = req.user!.id;

        // Look up the actual user.id
        const { data: userRecord, error: userError } = await supabase
            .from('users')
            .select('id')
            .or(`supabase_id.eq.${authUserId},privy_id.eq.${authUserId}`)
            .single();

        if (userError || !userRecord) {
            logger.warn('User not found for orders fetch');
            res.status(404).json({ success: false, error: 'User not found' });
            return;
        }

        const userId = userRecord.id;

        const { data: orders, error } = await supabase
            .from('offramp_orders')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) {
            throw new Error(`Failed to fetch orders: ${error.message}`);
        }

        // Webhook-first lifecycle: only poll Paycrest directly if explicitly enabled.
        if (ENABLE_PAYCREST_STATUS_POLLING) {
            const activeOrders = (orders || []).filter(
                order => order.status === 'PENDING' || order.status === 'PROCESSING'
            ).slice(0, 10);

            await Promise.all(activeOrders.map(async (order) => {
                try {
                    const paycrestOrder = await PaycrestService.getOrderStatus(order.paycrest_order_id);
                    const statusFromPaycrest = extractPaycrestStatus(paycrestOrder);
                    const mappedStatus = mapPaycrestOrderStatus(statusFromPaycrest);
                    const txHash = extractPaycrestTxHash(paycrestOrder);

                    if (mappedStatus && mappedStatus !== order.status) {
                        const previousStatus = order.status;
                        const updatePayload: Record<string, any> = {
                            status: mappedStatus,
                        };
                        if (mappedStatus === 'COMPLETED') {
                            updatePayload.completed_at = new Date().toISOString();
                        }
                        if (mappedStatus === 'FAILED') {
                            updatePayload.error_message = order.error_message || 'Order failed or expired';
                        }
                        if (txHash) {
                            updatePayload.tx_hash = txHash;
                        }

                        const { data: updatedOrder } = await supabase
                            .from('offramp_orders')
                            .update(updatePayload)
                            .eq('id', order.id)
                            .select()
                            .single();

                        if (updatedOrder) {
                            Object.assign(order, updatedOrder);
                            if (mappedStatus === 'COMPLETED' && previousStatus !== 'COMPLETED') {
                                await notifyOfframpCompletedIfNeeded(userId, updatedOrder);
                            }
                        }
                    } else if (txHash && txHash !== order.tx_hash) {
                        await supabase
                            .from('offramp_orders')
                            .update({ tx_hash: txHash })
                            .eq('id', order.id);
                        order.tx_hash = txHash;
                    }
                } catch (pollError) {
                    logger.warn('Failed to poll Paycrest order status', { orderId: order.id });
                }
            }));
        }

        // Map to camelCase
        const formattedOrders = orders.map(order => ({
            id: order.id,
            userId: order.user_id,
            paycrestOrderId: order.paycrest_order_id,
            status: normalizeStatusForClient(order.status, order.tx_hash, order.completed_at),
            chain: order.chain,
            token: order.token,
            cryptoAmount: order.crypto_amount,
            fiatCurrency: order.fiat_currency,
            fiatAmount: order.fiat_amount,
            exchangeRate: order.exchange_rate,
            serviceFee: order.service_fee,
            bankName: order.bank_name,
            accountNumber: order.account_number,
            accountName: order.account_name,
            receiveAddress: order.receive_address,
            txHash: order.tx_hash,
            errorMessage: order.error_message,
            createdAt: order.created_at,
            updatedAt: order.updated_at,
            completedAt: order.completed_at,
        }));

        res.json({
            success: true,
            data: { orders: formattedOrders },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/offramp/orders/:id
 * Get specific offramp order details
 */
router.get('/orders/:id', authenticate, async (req: Request, res: Response, next) => {
    try {
        const { id } = req.params;
        const authUserId = req.user!.id;

        // Look up the actual user.id
        const { data: userRecord, error: userError } = await supabase
            .from('users')
            .select('id')
            .or(`supabase_id.eq.${authUserId},privy_id.eq.${authUserId}`)
            .single();

        if (userError || !userRecord) {
            logger.warn('User not found for order details');
            res.status(404).json({ success: false, error: 'User not found' });
            return;
        }

        const userId = userRecord.id;

        const { data: order, error } = await supabase
            .from('offramp_orders')
            .select('*')
            .eq('id', id)
            .eq('user_id', userId)
            .single();

        if (error || !order) {
            res.status(404).json({
                success: false,
                error: { message: 'Order not found' },
            });
            return;
        }

        // Webhook-first lifecycle: avoid direct provider polling unless explicitly enabled.
        if (ENABLE_PAYCREST_STATUS_POLLING) {
            try {
                const paycrestOrder = await PaycrestService.getOrderStatus(order.paycrest_order_id);
                const statusFromPaycrest = extractPaycrestStatus(paycrestOrder);
                const mappedStatus = mapPaycrestOrderStatus(statusFromPaycrest);
                const txHash = extractPaycrestTxHash(paycrestOrder);

                // Update local status if changed
                if (mappedStatus && mappedStatus !== order.status) {
                    const previousStatus = order.status;
                    const { data: updatedOrder } = await supabase
                        .from('offramp_orders')
                        .update({
                            status: mappedStatus,
                            tx_hash: txHash || order.tx_hash,
                            completed_at: mappedStatus === 'COMPLETED' ? new Date().toISOString() : order.completed_at,
                        })
                        .eq('id', order.id)
                        .select()
                        .single();

                    if (updatedOrder) {
                        Object.assign(order, updatedOrder);
                        if (mappedStatus === 'COMPLETED' && previousStatus !== 'COMPLETED') {
                            await notifyOfframpCompletedIfNeeded(userId, updatedOrder);
                        }
                    }
                } else if (txHash && txHash !== order.tx_hash) {
                    await supabase
                        .from('offramp_orders')
                        .update({ tx_hash: txHash })
                        .eq('id', order.id);
                    order.tx_hash = txHash;
                }
            } catch (error) {
                logger.warn('Failed to fetch Paycrest order status', { error: error instanceof Error ? error.message : 'Unknown' });
            }
        }

        // Map to camelCase
        const formattedOrder = {
            id: order.id,
            userId: order.user_id,
            paycrestOrderId: order.paycrest_order_id,
            status: normalizeStatusForClient(order.status, order.tx_hash, order.completed_at),
            chain: order.chain,
            token: order.token,
            cryptoAmount: order.crypto_amount,
            fiatCurrency: order.fiat_currency,
            fiatAmount: order.fiat_amount,
            exchangeRate: order.exchange_rate,
            serviceFee: order.service_fee,
            bankName: order.bank_name,
            accountNumber: order.account_number,
            accountName: order.account_name,
            receiveAddress: order.receive_address,
            txHash: order.tx_hash,
            errorMessage: order.error_message,
            createdAt: order.created_at,
            updatedAt: order.updated_at,
            completedAt: order.completed_at,
        };

        res.json({
            success: true,
            data: { order: formattedOrder },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * PATCH /api/offramp/orders/:id
 * Update an offramp order (e.g., with transaction hash after token transfer)
 */
router.patch('/orders/:id', authenticate, async (req: Request, res: Response, next) => {
    try {
        const { id } = req.params;
        const { txHash } = req.body;
        const authUserId = req.user!.id;

        // Look up the actual user.id
        const { data: userRecord, error: userError } = await supabase
            .from('users')
            .select('id')
            .or(`supabase_id.eq.${authUserId},privy_id.eq.${authUserId}`)
            .single();

        if (userError || !userRecord) {
            logger.warn('User not found for order update');
            res.status(404).json({ success: false, error: 'User not found' });
            return;
        }

        const userId = userRecord.id;

        // Update order with txHash
        const { data: order, error } = await supabase
            .from('offramp_orders')
            .update({ tx_hash: txHash })
            .eq('id', id)
            .eq('user_id', userId)
            .select()
            .single();

        if (error || !order) {
            res.status(404).json({
                success: false,
                error: { message: 'Order not found or update failed' },
            });
            return;
        }

        logger.info('Updated order with transaction hash', { orderId: id });

        res.json({
            success: true,
            data: { order: { id: order.id, txHash: order.tx_hash } },
        });
    } catch (error) {
        next(error);
    }
});

export default router;
