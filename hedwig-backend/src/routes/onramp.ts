import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import PaycrestService from '../services/paycrest';
import { supabase } from '../lib/supabase';
import { createLogger } from '../utils/logger';

const logger = createLogger('Onramp');

const router = Router();

const ENABLE_PAYCREST_STATUS_POLLING = process.env.PAYCREST_STATUS_POLLING !== 'false';

// Keep this in sync with the mobile onramp country picker. Paycrest may still
// return a provider-specific error when a currency has no active onramp rail.
const SUPPORTED_FIATS = new Set(['NGN', 'KES', 'TZS', 'MWK', 'UGX', 'BRL']);
const SUPPORTED_NETWORKS = new Set(['base', 'polygon', 'celo', 'arbitrum']);
const SUPPORTED_TOKENS = new Set(['USDC']);

const mapPaycrestOnrampStatus = (
    rawStatus?: string
): 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | null => {
    if (!rawStatus) return null;
    const status = rawStatus.toLowerCase();
    if (status === 'initiated') return 'PENDING';
    if (status === 'pending') return 'PROCESSING';
    if (status === 'processing' || status === 'refunding') return 'PROCESSING';
    if (status === 'settled' || status === 'completed' || status === 'success' || status === 'validated') {
        return 'COMPLETED';
    }
    if (status === 'expired' || status === 'failed' || status === 'refunded' || status === 'cancelled') {
        return 'FAILED';
    }
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

    if (status === 'COMPLETED' || status === 'SUCCESS') return 'COMPLETED';
    if (status === 'PENDING') return 'PENDING';
    if (status === 'PROCESSING') return 'PROCESSING';
    if (status === 'CANCELLED' || status === 'CANCELED') {
        return hasCompletionEvidence ? 'COMPLETED' : 'CANCELLED';
    }
    if (status === 'FAILED') return hasCompletionEvidence ? 'COMPLETED' : 'FAILED';
    return hasCompletionEvidence ? 'COMPLETED' : 'PROCESSING';
};

const lookupUser = async (authUserId: string) => {
    const { data, error } = await supabase
        .from('users')
        .select('id, ethereum_wallet_address')
        .or(`supabase_id.eq.${authUserId},privy_id.eq.${authUserId}`)
        .single();

    if (error || !data) {
        return null;
    }
    return data as { id: string; ethereum_wallet_address: string | null };
};

const formatOrder = (order: any) => ({
    id: order.id,
    userId: order.user_id,
    paycrestOrderId: order.paycrest_order_id,
    reference: order.reference,
    status: normalizeStatusForClient(order.status, order.tx_hash, order.completed_at),
    chain: order.chain,
    token: order.token,
    cryptoAmount: order.crypto_amount,
    recipientAddress: order.recipient_address,
    fiatCurrency: order.fiat_currency,
    fiatAmount: order.fiat_amount,
    exchangeRate: order.exchange_rate,
    serviceFee: order.service_fee,
    providerInstitution: order.provider_institution,
    providerAccountNumber: order.provider_account_number,
    providerAccountName: order.provider_account_name,
    providerAmountToTransfer: order.provider_amount_to_transfer,
    validUntil: order.valid_until,
    refundInstitution: order.refund_institution,
    refundAccountNumber: order.refund_account_number,
    refundAccountName: order.refund_account_name,
    txHash: order.tx_hash,
    errorMessage: order.error_message,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    completedAt: order.completed_at,
});

/**
 * GET /api/onramp/quote
 * Query: fiatAmount, fiatCurrency, token, network
 * Returns crypto estimate using Paycrest rates.
 */
router.get('/quote', authenticate, async (req: Request, res: Response, next) => {
    try {
        const fiatAmountRaw = String(req.query.fiatAmount ?? '0');
        const fiatCurrency = String(req.query.fiatCurrency ?? 'NGN').toUpperCase();
        const token = String(req.query.token ?? 'USDC').toUpperCase();
        const network = String(req.query.network ?? req.query.Network ?? 'base').toLowerCase();

        const fiatAmount = parseFloat(fiatAmountRaw);
        if (!Number.isFinite(fiatAmount) || fiatAmount <= 0) {
            res.status(400).json({ success: false, error: 'Invalid fiatAmount' });
            return;
        }
        if (!SUPPORTED_FIATS.has(fiatCurrency)) {
            res.status(400).json({ success: false, error: 'Unsupported fiat currency' });
            return;
        }
        if (!SUPPORTED_TOKENS.has(token)) {
            res.status(400).json({ success: false, error: 'Unsupported token' });
            return;
        }
        if (!SUPPORTED_NETWORKS.has(network)) {
            res.status(400).json({ success: false, error: 'Unsupported network' });
            return;
        }

        // Paycrest v2 /rates returns buy + sell quotes for the requested fiat
        // amount. We ask for the buy-side rate at 1 unit so the response stays
        // small; the actual crypto estimate is derived locally from fiatAmount.
        const rateString = await PaycrestService.getOnrampBuyRate(token, 1, fiatCurrency, network);
        const rate = parseFloat(rateString);
        if (!Number.isFinite(rate) || rate <= 0) {
            res.status(502).json({ success: false, error: 'Invalid rate from provider' });
            return;
        }

        const grossCrypto = fiatAmount / rate;
        const platformFee = grossCrypto * 0.01;
        const netCryptoAmount = Math.max(0, grossCrypto - platformFee);

        res.json({
            success: true,
            data: {
                rate: rateString,
                fiatAmount,
                fiatCurrency,
                token,
                network,
                grossCryptoAmount: grossCrypto,
                platformFee,
                netCryptoAmount,
            },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/onramp/institutions
 * Query: currency
 */
router.get('/institutions', authenticate, async (req: Request, res: Response, next) => {
    try {
        const currency = String(req.query.currency ?? 'NGN').toUpperCase();
        if (!SUPPORTED_FIATS.has(currency)) {
            res.status(400).json({ success: false, error: 'Unsupported currency' });
            return;
        }
        const banks = await PaycrestService.getSupportedInstitutions(currency);
        res.json({ success: true, data: { banks } });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/onramp/verify-account
 * Body: { bankName, accountNumber, currency }
 */
router.post('/verify-account', authenticate, async (req: Request, res: Response, next) => {
    try {
        const { bankName, accountNumber, currency } = req.body ?? {};
        const fiat = String(currency ?? 'NGN').toUpperCase();
        if (!bankName || !accountNumber) {
            res.status(400).json({ success: false, error: 'bankName and accountNumber are required' });
            return;
        }
        if (!SUPPORTED_FIATS.has(fiat)) {
            res.status(400).json({ success: false, error: 'Unsupported currency' });
            return;
        }
        const result = await PaycrestService.verifyBankAccount(bankName, accountNumber, fiat);
        res.json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/onramp/create
 * Body: { fiatAmount, fiatCurrency, token, network, refundAccount: { bankName, accountNumber, accountName } }
 */
router.post('/create', authenticate, async (req: Request, res: Response, next) => {
    try {
        const authUserId = req.user!.id;
        const userRecord = await lookupUser(authUserId);
        if (!userRecord) {
            res.status(404).json({ success: false, error: 'User not found' });
            return;
        }
        const recipientAddress = userRecord.ethereum_wallet_address;
        if (!recipientAddress) {
            res.status(409).json({
                success: false,
                error: { message: 'No primary wallet on file. Initialize wallet first.' },
            });
            return;
        }

        const {
            fiatAmount,
            fiatCurrency = 'NGN',
            token = 'USDC',
            network = 'base',
            refundAccount,
        } = req.body ?? {};

        const fiat = String(fiatCurrency).toUpperCase();
        const tokenUpper = String(token).toUpperCase();
        const networkLower = String(network).toLowerCase();
        const fiatAmountNum = parseFloat(String(fiatAmount));

        if (!Number.isFinite(fiatAmountNum) || fiatAmountNum <= 0) {
            res.status(400).json({ success: false, error: 'Invalid fiatAmount' });
            return;
        }
        if (!SUPPORTED_FIATS.has(fiat)) {
            res.status(400).json({ success: false, error: 'Unsupported fiat currency' });
            return;
        }
        if (!SUPPORTED_TOKENS.has(tokenUpper)) {
            res.status(400).json({ success: false, error: 'Unsupported token' });
            return;
        }
        if (!SUPPORTED_NETWORKS.has(networkLower)) {
            res.status(400).json({ success: false, error: 'Unsupported network' });
            return;
        }
        if (!refundAccount?.bankName || !refundAccount?.accountNumber || !refundAccount?.accountName) {
            res.status(400).json({
                success: false,
                error: 'refundAccount.bankName, accountNumber, accountName are required',
            });
            return;
        }

        const order = await PaycrestService.createOnrampOrder({
            fiatAmount: fiatAmountNum,
            fiatCurrency: fiat as 'NGN' | 'KES' | 'TZS' | 'MWK' | 'UGX' | 'BRL',
            token: tokenUpper as 'USDC',
            network: networkLower as 'base' | 'polygon' | 'celo' | 'arbitrum',
            recipientAddress,
            refundAccount: {
                institution: refundAccount.bankName,
                accountIdentifier: refundAccount.accountNumber,
                accountName: refundAccount.accountName,
            },
        });

        const chainEnum = networkLower.toUpperCase();

        const { data: dbOrder, error } = await supabase
            .from('onramp_orders')
            .insert({
                user_id: userRecord.id,
                paycrest_order_id: order.id,
                reference: order.reference,
                status: mapPaycrestOnrampStatus(order.status) ?? 'PENDING',
                chain: chainEnum,
                token: tokenUpper,
                crypto_amount: order.estimatedCryptoAmount,
                recipient_address: recipientAddress,
                fiat_currency: fiat,
                fiat_amount: fiatAmountNum,
                exchange_rate: order.exchangeRate,
                provider_institution: order.providerAccount.institution,
                provider_account_number: order.providerAccount.accountIdentifier,
                provider_account_name: order.providerAccount.accountName,
                provider_amount_to_transfer: order.providerAccount.amountToTransfer,
                valid_until: order.providerAccount.validUntil,
                refund_institution: refundAccount.bankName,
                refund_account_number: refundAccount.accountNumber,
                refund_account_name: refundAccount.accountName,
            })
            .select()
            .single();

        if (error) {
            throw new Error(`Failed to save onramp order: ${error.message}`);
        }

        res.json({ success: true, data: { order: formatOrder(dbOrder) } });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/onramp/orders
 */
router.get('/orders', authenticate, async (req: Request, res: Response, next) => {
    try {
        const authUserId = req.user!.id;
        const userRecord = await lookupUser(authUserId);
        if (!userRecord) {
            res.status(404).json({ success: false, error: 'User not found' });
            return;
        }

        const { data: orders, error } = await supabase
            .from('onramp_orders')
            .select('*')
            .eq('user_id', userRecord.id)
            .order('created_at', { ascending: false });

        if (error) {
            throw new Error(`Failed to fetch onramp orders: ${error.message}`);
        }

        if (ENABLE_PAYCREST_STATUS_POLLING) {
            const active = (orders || [])
                .filter(o => o.status === 'PENDING' || o.status === 'PROCESSING')
                .slice(0, 10);

            await Promise.all(active.map(async (order) => {
                try {
                    const remote = await PaycrestService.getOrderStatus(order.paycrest_order_id);
                    const remoteStatus =
                        remote?.data?.order?.status ||
                        remote?.order?.status ||
                        remote?.data?.status ||
                        remote?.status;
                    const mapped = mapPaycrestOnrampStatus(remoteStatus);
                    if (mapped && mapped !== order.status) {
                        const updatePayload: Record<string, any> = { status: mapped };
                        if (mapped === 'COMPLETED') {
                            updatePayload.completed_at = new Date().toISOString();
                        }
                        const { data: updated } = await supabase
                            .from('onramp_orders')
                            .update(updatePayload)
                            .eq('id', order.id)
                            .select()
                            .single();
                        if (updated) Object.assign(order, updated);
                    }
                } catch (pollError) {
                    logger.warn('Failed to poll Paycrest onramp order', { orderId: order.id });
                }
            }));
        }

        res.json({
            success: true,
            data: { orders: (orders || []).map(formatOrder) },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/onramp/orders/:id
 */
router.get('/orders/:id', authenticate, async (req: Request, res: Response, next) => {
    try {
        const authUserId = req.user!.id;
        const userRecord = await lookupUser(authUserId);
        if (!userRecord) {
            res.status(404).json({ success: false, error: 'User not found' });
            return;
        }

        const { data: order, error } = await supabase
            .from('onramp_orders')
            .select('*')
            .eq('id', req.params.id)
            .eq('user_id', userRecord.id)
            .single();

        if (error || !order) {
            res.status(404).json({ success: false, error: { message: 'Order not found' } });
            return;
        }

        if (ENABLE_PAYCREST_STATUS_POLLING && (order.status === 'PENDING' || order.status === 'PROCESSING')) {
            try {
                const remote = await PaycrestService.getOrderStatus(order.paycrest_order_id);
                const remoteStatus =
                    remote?.data?.order?.status ||
                    remote?.order?.status ||
                    remote?.data?.status ||
                    remote?.status;
                const mapped = mapPaycrestOnrampStatus(remoteStatus);
                if (mapped && mapped !== order.status) {
                    const updatePayload: Record<string, any> = { status: mapped };
                    if (mapped === 'COMPLETED') {
                        updatePayload.completed_at = new Date().toISOString();
                    }
                    const { data: updated } = await supabase
                        .from('onramp_orders')
                        .update(updatePayload)
                        .eq('id', order.id)
                        .select()
                        .single();
                    if (updated) Object.assign(order, updated);
                }
            } catch (pollError) {
                logger.warn('Failed to fetch Paycrest onramp order', {
                    error: pollError instanceof Error ? pollError.message : 'Unknown',
                });
            }
        }

        res.json({ success: true, data: { order: formatOrder(order) } });
    } catch (error) {
        next(error);
    }
});

export default router;
