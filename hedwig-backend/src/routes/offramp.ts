import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import PaycrestService from '../services/paycrest';
import BlockradarService from '../services/blockradar';
import { supabase } from '../lib/supabase';
import { createLogger } from '../utils/logger';

const logger = createLogger('Offramp');

const router = Router();

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

        const rate = await PaycrestService.getExchangeRate(
            token as string,
            amountNum,
            currency as string,
            network as string
        );

        res.json({
            success: true,
            data: { rate },
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
        const { bankName, accountNumber } = req.body;

        const result = await PaycrestService.verifyBankAccount(bankName, accountNumber);

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
            .select('id, kyc_status, blockradar_address_id')
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

        // Platform fee is 1% (displayed to user, but Paycrest handles actual deduction)
        const platformFee = amountNum * 0.01;

        // 1. Fetch current rate
        const rate = await PaycrestService.getExchangeRate(
            token,
            amountNum,
            currency || 'NGN',
            network
        );

        // 2. Create order with Paycrest (full amount - Paycrest handles fee deduction)
        const order = await PaycrestService.createOfframpOrder({
            amount: amountNum,
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
                crypto_amount: amountNum,
                fiat_currency: order.fiatCurrency!,
                fiat_amount: order.fiatAmount!,
                exchange_rate: order.exchangeRate!,
                service_fee: order.senderFee,
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

        // 4. Withdraw from Blockradar master wallet to Paycrest receive address
        try {
            logger.info('Initiating Blockradar withdrawal for offramp', {
                orderId: dbOrder.id,
                amount: amountNum,
                toAddress: order.receiveAddress
            });

            // Get USDC asset ID (you may need to fetch this from Blockradar assets API)
            const assetId = process.env.BLOCKRADAR_USDC_ASSET_ID || 'USDC';

            await BlockradarService.withdraw({
                toAddress: order.receiveAddress,
                amount: amountNum.toString(),
                assetId: assetId,
                metadata: {
                    offrampOrderId: dbOrder.id,
                    paycrestOrderId: order.id,
                    userId: userRecord.id
                }
            });

            // Update order status to processing
            await supabase
                .from('offramp_orders')
                .update({ status: 'PROCESSING' })
                .eq('id', dbOrder.id);

            dbOrder.status = 'PROCESSING';
            logger.info('Blockradar withdrawal initiated', { orderId: dbOrder.id });
        } catch (withdrawError: any) {
            logger.error('Blockradar withdrawal failed', {
                orderId: dbOrder.id,
                error: withdrawError.message
            });
            // Update order with error but don't fail the request
            // The user needs to know the order was created but withdrawal failed
            await supabase
                .from('offramp_orders')
                .update({ 
                    status: 'FAILED',
                    error_message: `Withdrawal failed: ${withdrawError.message}`
                })
                .eq('id', dbOrder.id);
            
            dbOrder.status = 'FAILED';
            dbOrder.error_message = `Withdrawal failed: ${withdrawError.message}`;
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

        // Map to camelCase
        const formattedOrders = orders.map(order => ({
            id: order.id,
            userId: order.user_id,
            paycrestOrderId: order.paycrest_order_id,
            status: order.status,
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
            createdAt: order.created_at,
            updatedAt: order.updated_at,
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

        // Get latest status from Paycrest
        try {
            const paycrestOrder = await PaycrestService.getOrderStatus(order.paycrest_order_id);

            // Update local status if changed
            if (paycrestOrder.status && paycrestOrder.status.toLowerCase() !== order.status.toLowerCase()) {
                const { data: updatedOrder } = await supabase
                    .from('offramp_orders')
                    .update({
                        status: paycrestOrder.status.toUpperCase(),
                        tx_hash: paycrestOrder.txHash || order.tx_hash,
                    })
                    .eq('id', order.id)
                    .select()
                    .single();

                if (updatedOrder) {
                    Object.assign(order, updatedOrder);
                }
            }
        } catch (error) {
            logger.warn('Failed to fetch Paycrest order status', { error: error instanceof Error ? error.message : 'Unknown' });
        }

        // Map to camelCase
        const formattedOrder = {
            id: order.id,
            userId: order.user_id,
            paycrestOrderId: order.paycrest_order_id,
            status: order.status,
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
            createdAt: order.created_at,
            updatedAt: order.updated_at,
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
