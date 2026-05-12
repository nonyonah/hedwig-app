import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { supabase } from '../lib/supabase';
import NotificationService from '../services/notifications';
import { createLogger } from '../utils/logger';

const logger = createLogger('CoinbasePayWebhook');
const router = Router();

const COINBASE_PAY_WEBHOOK_SECRET =
    process.env.COINBASE_PAY_WEBHOOK_SECRET ||
    process.env.COINBASE_WEBHOOK_SECRET ||
    '';

const toNumber = (value: any): number | null => {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'object' && value?.value !== undefined) return toNumber(value.value);
    const parsed = typeof value === 'number' ? value : parseFloat(String(value).replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
};

const timingSafeHexEqual = (a: string, b: string): boolean => {
    const left = Buffer.from(a, 'hex');
    const right = Buffer.from(b, 'hex');
    return left.length === right.length && crypto.timingSafeEqual(left, right);
};

const verifyHook0Signature = (rawBody: string, signatureHeader: string | undefined, headers: Request['headers']): boolean => {
    if (!COINBASE_PAY_WEBHOOK_SECRET) {
        logger.warn('Coinbase webhook secret is not configured; skipping signature verification');
        return true;
    }
    if (!signatureHeader) return false;

    try {
        const parts = Object.fromEntries(
            signatureHeader.split(',').map((part) => {
                const [key, ...rest] = part.trim().split('=');
                return [key, rest.join('=')];
            })
        );
        const timestamp = parts.t;
        const headerNames = parts.h;
        const signature = parts.v1;
        if (!timestamp || !headerNames || !signature) return false;

        const ageMs = Date.now() - (parseInt(timestamp, 10) * 1000);
        if (!Number.isFinite(ageMs) || ageMs < -5 * 60 * 1000 || ageMs > 5 * 60 * 1000) {
            logger.warn('Coinbase webhook timestamp outside tolerance', { ageMs });
            return false;
        }

        const headerValues = headerNames
            .split(' ')
            .map((name) => {
                const value = headers[name.toLowerCase()];
                return Array.isArray(value) ? value.join(',') : (value || '');
            })
            .join('.');

        const signedPayload = `${timestamp}.${headerNames}.${headerValues}.${rawBody}`;
        const expected = crypto
            .createHmac('sha256', COINBASE_PAY_WEBHOOK_SECRET)
            .update(signedPayload, 'utf8')
            .digest('hex');

        return timingSafeHexEqual(expected, signature);
    } catch (error: any) {
        logger.warn('Coinbase webhook signature verification failed', { error: error?.message });
        return false;
    }
};

const mapStatus = (event: any): 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' => {
    const eventType = String(event?.eventType || '').toLowerCase();
    const status = String(event?.status || '').toUpperCase();
    if (eventType.endsWith('.success') || status.includes('SUCCESS') || status.includes('COMPLETED')) return 'COMPLETED';
    if (eventType.endsWith('.failed') || status.includes('FAILED')) return 'FAILED';
    if (status.includes('CANCEL')) return 'CANCELLED';
    if (eventType.endsWith('.created') || status.includes('CREATED') || status.includes('PENDING')) return 'PENDING';
    return 'PROCESSING';
};

const inferDirection = (event: any): 'buy' | 'sell' => {
    const eventType = String(event?.eventType || '').toLowerCase();
    if (eventType.startsWith('offramp.')) return 'sell';
    return 'buy';
};

const buildUpdatePayload = (event: any) => {
    const txHash = event?.txHash && event.txHash !== '0x' ? event.txHash : null;
    const completedAt = event?.completedAt && !String(event.completedAt).startsWith('0001-')
        ? event.completedAt
        : null;
    const status = mapStatus(event);

    const payload: Record<string, any> = {
        coinbase_transaction_id: event?.transactionId || event?.transaction_id || event?.orderId || null,
        status,
        chain: event?.purchaseNetwork || event?.destinationNetwork || event?.network || null,
        token: event?.purchaseCurrency || event?.asset || null,
        wallet_address: event?.walletAddress || event?.destinationAddress || null,
        tx_hash: txHash,
        fiat_currency:
            event?.paymentTotal?.currency ||
            event?.paymentCurrency ||
            event?.fiatCurrency ||
            null,
        fiat_amount:
            toNumber(event?.paymentTotal) ??
            toNumber(event?.paymentTotalUsd) ??
            toNumber(event?.paymentSubtotal) ??
            null,
        crypto_amount:
            toNumber(event?.purchaseAmount) ??
            toNumber(event?.cryptoAmount) ??
            null,
        exchange_rate: toNumber(event?.exchangeRate),
        payment_method: event?.paymentMethod || null,
        completed_at: completedAt || (status === 'COMPLETED' ? new Date().toISOString() : null),
        raw_payload: event,
    };

    const fees = Array.isArray(event?.fees)
        ? event.fees.reduce((sum: number, fee: any) => sum + (toNumber(fee?.feeAmount) || 0), 0)
        : null;
    payload.service_fee = fees ?? toNumber(event?.coinbaseFee) ?? toNumber(event?.networkFee);

    return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== null && value !== undefined));
};

const notifyUser = async (session: any) => {
    if (!session?.user_id) return;
    const status = String(session.status || '').toUpperCase();
    if (!['COMPLETED', 'FAILED'].includes(status)) return;

    const direction = session.direction === 'sell' ? 'cash out' : 'buy';
    const title = status === 'COMPLETED'
        ? (session.direction === 'sell' ? 'Coinbase cash out complete' : 'USDC purchase complete')
        : (session.direction === 'sell' ? 'Coinbase cash out failed' : 'USDC purchase failed');
    const amount = session.direction === 'sell'
        ? `${session.fiat_currency || 'USD'} ${Number(session.fiat_amount || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
        : `${Number(session.crypto_amount || 0).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${session.token || 'USDC'}`;
    await NotificationService.notifyUser(session.user_id, {
        title,
        body: status === 'COMPLETED' ? `Your Coinbase ${direction} finished: ${amount}.` : `Your Coinbase ${direction} could not be completed.`,
        data: {
            type: 'coinbase_pay_status',
            sessionId: session.id,
            direction: session.direction,
            status,
        },
    });
};

router.post('/', async (req: Request, res: Response) => {
    const rawBody = (req as any).rawBody || JSON.stringify(req.body || {});
    const signature = req.headers['x-hook0-signature'];
    if (!verifyHook0Signature(rawBody, Array.isArray(signature) ? signature[0] : signature, req.headers)) {
        res.status(400).json({ success: false, error: 'Invalid Coinbase webhook signature' });
        return;
    }

    try {
        const event = typeof req.body === 'object' && req.body ? req.body : JSON.parse(rawBody);
        const partnerUserRef = event?.partnerUserRef || event?.partner_user_ref;
        const coinbaseTransactionId = event?.transactionId || event?.transaction_id || event?.orderId;
        const direction = inferDirection(event);
        const updatePayload = buildUpdatePayload(event);

        if (!partnerUserRef && !coinbaseTransactionId) {
            logger.warn('Coinbase webhook missing partnerUserRef and transaction id', {
                eventType: event?.eventType,
            });
            res.json({ success: true, data: { received: true, ignored: true } });
            return;
        }

        let query = supabase.from('coinbase_pay_sessions').select('*');
        if (coinbaseTransactionId) {
            query = query.eq('coinbase_transaction_id', coinbaseTransactionId);
        } else {
            query = query.eq('partner_user_ref', partnerUserRef).eq('direction', direction).order('created_at', { ascending: false }).limit(1);
        }

        const { data: existingRows, error: lookupError } = await query;
        if (lookupError) throw lookupError;

        let session = Array.isArray(existingRows) ? existingRows[0] : existingRows;
        if (!session && partnerUserRef) {
            const userId = String(partnerUserRef).startsWith('hedwig-')
                ? String(partnerUserRef).replace(/^hedwig-/, '')
                : null;
            if (userId) {
                const { data: created, error: createError } = await supabase
                    .from('coinbase_pay_sessions')
                    .insert({
                        user_id: userId,
                        direction,
                        partner_user_ref: partnerUserRef,
                        status: updatePayload.status || 'PROCESSING',
                        chain: updatePayload.chain || 'base',
                        token: updatePayload.token || 'USDC',
                        wallet_address: updatePayload.wallet_address || 'unknown',
                        fiat_currency: updatePayload.fiat_currency || 'USD',
                        ...updatePayload,
                    })
                    .select()
                    .single();
                if (createError) throw createError;
                session = created;
            }
        } else if (session) {
            const { data: updated, error: updateError } = await supabase
                .from('coinbase_pay_sessions')
                .update(updatePayload)
                .eq('id', session.id)
                .select()
                .single();
            if (updateError) throw updateError;
            session = updated;
        }

        await notifyUser(session);
        res.json({ success: true, data: { received: true, sessionId: session?.id || null } });
    } catch (error: any) {
        logger.error('Coinbase webhook processing failed', { error: error?.message });
        res.status(500).json({ success: false, error: 'Failed to process Coinbase webhook' });
    }
});

export default router;
