import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import PaycrestService from '../services/paycrest';
import { supabase } from '../lib/supabase';

const router = Router();

/**
 * GET /api/offramp/rates
 * Get current exchange rates
 */
router.get('/rates', authenticate, async (req: Request, res: Response, next) => {
    try {
        const { token = 'USDC', currency = 'NGN' } = req.query;

        const rate = await PaycrestService.getExchangeRate(
            token as 'USDC' | 'CUSD',
            currency as string
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
        const { amount, token, network, bankName, accountNumber, accountName, returnAddress } =
            req.body;
        const userId = req.user!.id;

        // Create order with Paycrest
        const order = await PaycrestService.createOfframpOrder({
            amount,
            token,
            network,
            recipientBankDetails: {
                bankName,
                accountNumber,
                accountName,
            },
            returnAddress,
        });

        // Save order to database
        const { data: dbOrder, error } = await supabase
            .from('offramp_orders')
            .insert({
                user_id: userId,
                paycrest_order_id: order.orderId,
                status: 'PENDING',
                chain: network.toUpperCase(),
                token,
                crypto_amount: parseFloat(amount),
                fiat_currency: order.fiatCurrency,
                fiat_amount: order.fiatAmount,
                exchange_rate: order.exchangeRate,
                service_fee: order.serviceFee,
                bank_name: bankName,
                account_number: accountNumber,
                account_name: accountName,
            })
            .select()
            .single();

        if (error) {
            throw new Error(`Failed to save offramp order: ${error.message}`);
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
            fiatCurrency: dbOrder.fiat_currency,
            fiatAmount: dbOrder.fiat_amount,
            exchangeRate: dbOrder.exchange_rate,
            serviceFee: dbOrder.service_fee,
            bankName: dbOrder.bank_name,
            accountNumber: dbOrder.account_number,
            accountName: dbOrder.account_name,
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
        const userId = req.user!.id;

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
        const userId = req.user!.id;

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
            if (paycrestOrder.status !== order.status.toLowerCase()) {
                const { data: updatedOrder } = await supabase
                    .from('offramp_orders')
                    .update({
                        status: paycrestOrder.status.toUpperCase(),
                        tx_hash: paycrestOrder.txHash,
                    })
                    .eq('id', order.id)
                    .select()
                    .single();

                if (updatedOrder) {
                    Object.assign(order, updatedOrder);
                }
            }
        } catch (error) {
            console.error('Failed to fetch Paycrest order status:', error);
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

export default router;
