import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import CoinbasePayService from '../services/coinbasePay';
import { createLogger } from '../utils/logger';

const logger = createLogger('CoinbasePayRoutes');
const router = Router();

const COINBASE_PAY_ENABLED = process.env.COINBASE_PAY_ENABLED === 'true';
const SUPPORTED_DIRECTIONS = new Set(['buy', 'sell']);
const SUPPORTED_ASSETS = new Set(['USDC']);
const SUPPORTED_NETWORKS = new Set(['base', 'ethereum', 'polygon', 'arbitrum', 'solana']);
const COINBASE_LOCAL_TEST_IP = '192.0.2.1';

const normalizeStatusForClient = (rawStatus?: string | null): 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' => {
    const status = String(rawStatus || '').trim().toUpperCase();
    if (status === 'COMPLETED' || status === 'SUCCESS') return 'COMPLETED';
    if (status === 'FAILED') return 'FAILED';
    if (status === 'CANCELLED' || status === 'CANCELED') return 'CANCELLED';
    if (status === 'PENDING') return 'PENDING';
    return 'PROCESSING';
};

const formatSession = (session: any) => ({
    id: session.id,
    userId: session.user_id,
    direction: session.direction,
    provider: 'coinbase' as const,
    partnerUserRef: session.partner_user_ref,
    coinbaseTransactionId: session.coinbase_transaction_id,
    status: normalizeStatusForClient(session.status),
    chain: session.chain,
    token: session.token,
    walletAddress: session.wallet_address,
    txHash: session.tx_hash,
    fiatCurrency: session.fiat_currency,
    fiatAmount: session.fiat_amount,
    cryptoAmount: session.crypto_amount,
    exchangeRate: session.exchange_rate,
    serviceFee: session.service_fee,
    paymentMethod: session.payment_method,
    launchUrl: session.launch_url,
    errorMessage: session.error_message,
    createdAt: session.created_at,
    updatedAt: session.updated_at,
    completedAt: session.completed_at,
});

const toNumber = (value: any): number | null => {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'object' && value?.value !== undefined) return toNumber(value.value);
    const parsed = typeof value === 'number' ? value : parseFloat(String(value).replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
};

const mapCoinbaseTransactionStatus = (transaction: any): 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | null => {
    const eventType = String(transaction?.eventType || '').toLowerCase();
    const status = String(transaction?.status || '').toUpperCase();
    if (eventType.endsWith('.success') || status.includes('SUCCESS') || status.includes('COMPLETED')) return 'COMPLETED';
    if (eventType.endsWith('.failed') || status.includes('FAILED')) return 'FAILED';
    if (status.includes('CANCEL')) return 'CANCELLED';
    if (eventType.endsWith('.created') || status.includes('CREATED') || status.includes('PENDING')) return 'PENDING';
    if (eventType.endsWith('.updated') || status.includes('IN_PROGRESS') || status.includes('PROCESS')) return 'PROCESSING';
    return null;
};

const extractTransactionUpdate = (transaction: any) => {
    const fiatAmount =
        toNumber(transaction?.paymentTotal) ??
        toNumber(transaction?.payment_total) ??
        toNumber(transaction?.paymentTotalUsd) ??
        toNumber(transaction?.fiatAmount);
    const cryptoAmount =
        toNumber(transaction?.purchaseAmount) ??
        toNumber(transaction?.cryptoAmount) ??
        toNumber(transaction?.sellAmount);
    const fee =
        toNumber(transaction?.coinbaseFee) ??
        toNumber(transaction?.networkFee) ??
        toNumber(transaction?.serviceFee);

    return {
        coinbase_transaction_id: transaction?.transactionId || transaction?.transaction_id || transaction?.orderId || null,
        status: mapCoinbaseTransactionStatus(transaction),
        chain: transaction?.purchaseNetwork || transaction?.destinationNetwork || transaction?.network || null,
        token: transaction?.purchaseCurrency || transaction?.asset || null,
        wallet_address: transaction?.walletAddress || transaction?.destinationAddress || null,
        tx_hash: transaction?.txHash && transaction.txHash !== '0x' ? transaction.txHash : null,
        fiat_currency:
            transaction?.paymentTotal?.currency ||
            transaction?.paymentCurrency ||
            transaction?.fiatCurrency ||
            null,
        fiat_amount: fiatAmount,
        crypto_amount: cryptoAmount,
        exchange_rate: toNumber(transaction?.exchangeRate),
        service_fee: fee,
        payment_method: transaction?.paymentMethod || transaction?.payment_method || null,
        completed_at: transaction?.completedAt && !String(transaction.completedAt).startsWith('0001-')
            ? transaction.completedAt
            : null,
        raw_payload: transaction,
    };
};

const isPrivateOrLocalIp = (ip: string): boolean => {
    const normalized = ip.trim().toLowerCase().replace(/^::ffff:/, '');
    if (!normalized) return true;
    if (normalized === '::1' || normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '0.0.0.0') {
        return true;
    }
    if (/^10\./.test(normalized) || /^192\.168\./.test(normalized) || /^169\.254\./.test(normalized)) {
        return true;
    }
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(normalized)) {
        return true;
    }
    if (normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:')) {
        return true;
    }
    return false;
};

const getClientIp = (req: Request): string => {
    const forwarded = req.headers['x-forwarded-for'];
    const firstForwarded = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const candidate = firstForwarded?.split(',')[0]?.trim() || req.ip || req.socket.remoteAddress || '';
    const normalized = candidate.replace(/^::ffff:/, '');
    return isPrivateOrLocalIp(normalized) ? COINBASE_LOCAL_TEST_IP : normalized;
};

const lookupUser = async (authUserId: string) => {
    const { data, error } = await supabase
        .from('users')
        .select('id, ethereum_wallet_address, solana_wallet_address')
        .or(`supabase_id.eq.${authUserId},privy_id.eq.${authUserId}`)
        .single();

    if (error || !data) return null;
    return data as {
        id: string;
        ethereum_wallet_address: string | null;
        solana_wallet_address: string | null;
    };
};

router.post('/session', authenticate, async (req: Request, res: Response, next) => {
    try {
        if (!COINBASE_PAY_ENABLED) {
            res.status(503).json({
                success: false,
                error: { message: 'Coinbase Pay is temporarily disabled.' },
            });
            return;
        }

        const authUserId = req.user!.id;
        const userRecord = await lookupUser(authUserId);
        if (!userRecord) {
            res.status(404).json({ success: false, error: 'User not found' });
            return;
        }

        const {
            direction = 'buy',
            amount,
            asset = 'USDC',
            network = 'base',
            fiatCurrency = 'USD',
            country = 'US',
            subdivision,
            redirectUrl,
        } = req.body ?? {};

        const directionValue = String(direction).toLowerCase();
        const assetValue = String(asset).toUpperCase();
        const networkValue = String(network).toLowerCase();
        const countryValue = String(country).toUpperCase();
        const fiatCurrencyValue = String(fiatCurrency).toUpperCase();
        const amountValue = amount === undefined || amount === null || amount === ''
            ? undefined
            : parseFloat(String(amount));

        if (!SUPPORTED_DIRECTIONS.has(directionValue)) {
            res.status(400).json({ success: false, error: 'Unsupported Coinbase Pay direction' });
            return;
        }
        if (!SUPPORTED_ASSETS.has(assetValue)) {
            res.status(400).json({ success: false, error: 'Unsupported Coinbase Pay asset' });
            return;
        }
        if (!SUPPORTED_NETWORKS.has(networkValue)) {
            res.status(400).json({ success: false, error: 'Unsupported Coinbase Pay network' });
            return;
        }
        if (countryValue !== 'US' || fiatCurrencyValue !== 'USD') {
            res.status(400).json({ success: false, error: 'Coinbase Pay is currently enabled for US/USD only' });
            return;
        }
        if (amountValue !== undefined && (!Number.isFinite(amountValue) || amountValue <= 0)) {
            res.status(400).json({ success: false, error: 'Invalid amount' });
            return;
        }

        const walletAddress =
            networkValue === 'solana'
                ? userRecord.solana_wallet_address
                : userRecord.ethereum_wallet_address;

        if (!walletAddress) {
            res.status(409).json({
                success: false,
                error: {
                    message: networkValue === 'solana'
                        ? 'No Solana wallet on file. Initialize wallet first.'
                        : 'No EVM wallet on file. Initialize wallet first.',
                },
            });
            return;
        }

        const session = await CoinbasePayService.createHostedFlow({
            direction: directionValue as 'buy' | 'sell',
            userId: userRecord.id,
            walletAddress,
            network: networkValue,
            asset: assetValue,
            fiatCurrency: fiatCurrencyValue,
            amount: amountValue,
            country: countryValue,
            subdivision: typeof subdivision === 'string' ? subdivision : undefined,
            clientIp: getClientIp(req),
            redirectUrl: typeof redirectUrl === 'string' ? redirectUrl : undefined,
        });

        const { data: dbSession, error: insertError } = await supabase
            .from('coinbase_pay_sessions')
            .insert({
                user_id: userRecord.id,
                direction: directionValue,
                partner_user_ref: session.partnerUserRef,
                status: 'PENDING',
                chain: networkValue,
                token: assetValue,
                wallet_address: walletAddress,
                fiat_currency: fiatCurrencyValue,
                fiat_amount: amountValue ?? null,
                launch_url: session.url,
            })
            .select()
            .single();

        if (insertError) {
            throw new Error(`Failed to save Coinbase Pay session: ${insertError.message}`);
        }

        res.json({
            success: true,
            data: {
                ...session,
                sessionId: dbSession.id,
                session: formatSession(dbSession),
            },
        });
    } catch (error: any) {
        if (/Coinbase CDP credentials/.test(error?.message || '')) {
            logger.warn('Coinbase Pay requested without credentials');
            res.status(503).json({
                success: false,
                error: { message: 'Coinbase Pay is not configured yet.' },
            });
            return;
        }
        next(error);
    }
});

router.get('/sessions', authenticate, async (req: Request, res: Response, next) => {
    try {
        const authUserId = req.user!.id;
        const userRecord = await lookupUser(authUserId);
        if (!userRecord) {
            res.status(404).json({ success: false, error: 'User not found' });
            return;
        }

        const { data: sessions, error } = await supabase
            .from('coinbase_pay_sessions')
            .select('*')
            .eq('user_id', userRecord.id)
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) {
            throw new Error(`Failed to fetch Coinbase Pay sessions: ${error.message}`);
        }

        const activeSellSessions = (sessions || [])
            .filter((session: any) => session.direction === 'sell' && ['PENDING', 'PROCESSING'].includes(session.status))
            .slice(0, 5);

        await Promise.all(activeSellSessions.map(async (session: any) => {
            try {
                const result = await CoinbasePayService.getOfframpTransactions(session.partner_user_ref, 5);
                const matching = result.transactions.find((tx: any) => {
                    const txId = tx?.transactionId || tx?.transaction_id || tx?.orderId;
                    if (session.coinbase_transaction_id && txId === session.coinbase_transaction_id) return true;
                    return String(tx?.walletAddress || tx?.destinationAddress || '').toLowerCase() ===
                        String(session.wallet_address || '').toLowerCase();
                }) || result.transactions[0];

                if (!matching) return;
                const update = extractTransactionUpdate(matching);
                const updatePayload = Object.fromEntries(
                    Object.entries(update).filter(([, value]) => value !== null && value !== undefined)
                );
                if (!updatePayload.status) return;
                const { data: updated } = await supabase
                    .from('coinbase_pay_sessions')
                    .update(updatePayload)
                    .eq('id', session.id)
                    .select()
                    .single();
                if (updated) Object.assign(session, updated);
            } catch (pollError: any) {
                logger.warn('Failed to poll Coinbase Pay session', {
                    sessionId: session.id,
                    error: pollError?.message,
                });
            }
        }));

        res.json({
            success: true,
            data: { sessions: (sessions || []).map(formatSession) },
        });
    } catch (error) {
        next(error);
    }
});

export default router;
