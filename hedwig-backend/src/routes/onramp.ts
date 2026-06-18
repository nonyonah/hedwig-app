import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { authenticate } from '../middleware/auth';
import { getOrCreateUser } from '../utils/userHelper';
import { supabase } from '../lib/supabase';
import PaycrestService from '../services/paycrest';

const router = Router();

const SUPPORTED_CURRENCIES = ['NGN', 'KES', 'UGX', 'TZS', 'MWK', 'BRL'];

// COMPLIANCE PLACEHOLDER — do not skip or remove
async function checkOnrampCompliance(_userId: string, _currency: string, _amount: string) {
  return { approved: true } as const;
}

async function requireAdmin(workspaceId: string, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('workspace_members').select('role').eq('workspace_id', workspaceId).eq('user_id', userId).maybeSingle();
  return data?.role === 'owner' || data?.role === 'admin';
}

/**
 * POST /api/onramp/orders
 */
router.post('/orders', authenticate, async (req: Request, res: Response, next) => {
  try {
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) { res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' }); return; }

    const { workspaceId, amount, currency, refundAccount } = req.body;
    if (!amount || !currency || !refundAccount) {
      res.status(400).json({ error: 'amount, currency, and refundAccount are required', code: 'MISSING_FIELDS' }); return;
    }

    const compliance = await checkOnrampCompliance(user.id, currency, amount);
    if (!compliance.approved) {
      res.status(403).json({ error: 'Onramp not available. Please contact support.', code: 'COMPLIANCE_HOLD' }); return;
    }

    if (!SUPPORTED_CURRENCIES.includes(currency.toUpperCase())) {
      res.status(400).json({ error: 'Currency not supported', code: 'UNSUPPORTED_CURRENCY' }); return;
    }

    const amountNum = parseFloat(amount);
    if (Number.isNaN(amountNum) || amountNum < 0.10) {
      res.status(400).json({ error: 'Minimum deposit is 0.10 in selected currency', code: 'MINIMUM_AMOUNT' }); return;
    }

    // Verify refund account
    try {
      await PaycrestService.verifyBankAccount(
        refundAccount.accountName,
        refundAccount.accountIdentifier,
        currency.toUpperCase()
      );
    } catch {
      res.status(400).json({ error: 'Could not verify your account. Check your details.', code: 'ACCOUNT_VERIFICATION_FAILED' }); return;
    }

    // Resolve destination address
    let destinationAddress: string;
    let orderWorkspaceId: string | null = null;

    if (workspaceId) {
      const isAdmin = await requireAdmin(workspaceId, user.id);
      if (!isAdmin) { res.status(403).json({ error: 'Not authorised for this workspace', code: 'FORBIDDEN' }); return; }
      const { data: tw } = await supabase.from('treasury_wallets')
        .select('privy_wallet_address').eq('workspace_id', workspaceId).eq('is_active', true).maybeSingle();
      if (!tw?.privy_wallet_address) { res.status(400).json({ error: 'No treasury wallet', code: 'NO_TREASURY' }); return; }
      destinationAddress = tw.privy_wallet_address;
      orderWorkspaceId = workspaceId;
    } else {
      const { data: u } = await supabase.from('users').select('ethereum_wallet_address').eq('id', user.id).single();
      if (!u?.ethereum_wallet_address) { res.status(400).json({ error: 'No wallet address', code: 'NO_WALLET' }); return; }
      destinationAddress = u.ethereum_wallet_address;
    }

    const reference = `hedwig-onramp-${crypto.randomUUID()}`;

    const paycrestOrder = await PaycrestService.createOnrampOrder({
      fiatAmount: parseFloat(amount),
      fiatCurrency: currency.toUpperCase() as any,
      token: 'USDC',
      network: 'base',
      recipientAddress: destinationAddress,
      refundAccount,
      reference,
    });

    const { data: order, error } = await supabase.from('onramp_orders').insert({
      user_id: user.id, workspace_id: orderWorkspaceId,
      paycrest_order_id: paycrestOrder.id, reference, status: 'initiated',
      chain: 'BASE', token: 'USDC', recipient_address: destinationAddress,
      fiat_currency: currency.toUpperCase(), fiat_amount: parseFloat(amount),
      crypto_amount: paycrestOrder.estimatedCryptoAmount,
      exchange_rate: paycrestOrder.exchangeRate,
      provider_account: paycrestOrder.providerAccount, refund_account: refundAccount,
      valid_until: paycrestOrder.providerAccount?.validUntil, direction: 'onramp',
    }).select().single();

    if (error) throw error;

    res.json({ success: true, data: {
      orderId: order.id, paycrestOrderId: paycrestOrder.id,
      providerAccount: paycrestOrder.providerAccount, reference, status: 'initiated',
    }});
  } catch (error: any) {
    if (error.response?.status) {
      res.status(502).json({ error: 'Could not initiate onramp. Please try again.', code: 'PAYCREST_ERROR' }); return;
    }
    next(error);
  }
});

router.get('/orders', authenticate, async (req: Request, res: Response, next) => {
  try {
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) { res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' }); return; }
    const workspaceId = req.query.workspaceId as string | undefined;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const offset = (page - 1) * limit;
    let query = supabase.from('onramp_orders').select('*', { count: 'exact' });
    if (workspaceId) { query = query.eq('workspace_id', workspaceId); }
    else { query = query.eq('user_id', user.id).is('workspace_id', null); }
    const { data, error, count } = await query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
    if (error) throw error;
    res.json({ success: true, data: { orders: data || [], total: count || 0, page, limit } });
  } catch (error) { next(error); }
});

router.get('/orders/:orderId', authenticate, async (req: Request, res: Response, next) => {
  try {
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) { res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' }); return; }
    const { data, error } = await supabase.from('onramp_orders').select('*').eq('id', req.params.orderId).eq('user_id', user.id).single();
    if (error || !data) { res.status(404).json({ error: 'Order not found', code: 'NOT_FOUND' }); return; }
    res.json({ success: true, data });
  } catch (error) { next(error); }
});

/**
 * POST /api/onramp/verify-account
 */
router.post('/verify-account', authenticate, async (req: Request, res: Response, next) => {
  try {
    const { institution, accountIdentifier, currency } = req.body;
    if (!institution || !accountIdentifier) {
      res.status(400).json({ error: 'institution and accountIdentifier are required', code: 'MISSING_FIELDS' }); return;
    }
    const result = await PaycrestService.verifyBankAccount(institution, accountIdentifier, (currency || 'NGN').toUpperCase());
    if (!result.verified) {
      res.status(400).json({ error: 'Could not verify account', code: 'VERIFICATION_FAILED' }); return;
    }
    res.json({ success: true, data: { accountName: result.accountName } });
  } catch (error: any) {
    if (error.response?.status) {
      res.status(502).json({ error: 'Verification service unavailable', code: 'VERIFICATION_UNAVAILABLE' }); return;
    }
    next(error);
  }
});

router.get('/institutions/:currency', async (req: Request, res: Response, next) => {
  try {
    const currency = Array.isArray(req.params.currency) ? req.params.currency[0] : req.params.currency;
    const institutions = await PaycrestService.getSupportedInstitutions(currency.toUpperCase());
    res.json({ success: true, data: institutions });
  } catch (error) { next(error); }
});

router.get('/rate/:network/:token/:amount/:currency', async (req: Request, res: Response, next) => {
  try {
    const get = (v: string | string[]): string => Array.isArray(v) ? v[0] : v;
    const rate = await PaycrestService.getOnrampBuyRate(
      get(req.params.token), parseFloat(get(req.params.amount)), get(req.params.currency), get(req.params.network));
    res.json({ success: true, data: { rate } });
  } catch (error) { next(error); }
});

export default router;
