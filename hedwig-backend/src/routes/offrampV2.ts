import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { getOrCreateUser } from '../utils/userHelper';
import { supabase } from '../lib/supabase';
import PaycrestService from '../services/paycrest';
import { createLogger } from '../utils/logger';
import { getPrivyNodeClient } from '../services/privyWallets';
import crypto from 'crypto';

const logger = createLogger('OfframpV2');
const router = Router();

const IS_TESTNET = process.env.NETWORK_MODE === 'testnet';
const SUPPORTED_CURRENCIES = ['NGN', 'KES', 'UGX', 'TZS', 'MWK', 'BRL'];

const SUPPORTED_CHAINS: ChainKey[] = ['base', 'arbitrum', 'polygon', 'optimism'];

function getChainConfig() {
  const testnet = IS_TESTNET;
  return {
    base: {
      paycrestNetwork: 'base' as const,
      chainId: testnet ? 84532 : 8453,
      usdcAddress: testnet
        ? '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
        : '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      privyChain: (testnet ? 'base_sepolia' : 'base') as 'base' | 'base_sepolia',
    },
    arbitrum: {
      paycrestNetwork: 'arbitrum' as const,
      chainId: testnet ? 421614 : 42161,
      usdcAddress: testnet
        ? '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d'
        : '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      privyChain: (testnet ? 'arbitrum_sepolia' : 'arbitrum') as 'arbitrum' | 'arbitrum_sepolia',
    },
    polygon: {
      paycrestNetwork: 'polygon' as const,
      chainId: testnet ? 80002 : 137,
      usdcAddress: testnet
        ? '0x41e94Eb019Cee2aF7478fC2cB028afE886dA082a'
        : '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
      privyChain: (testnet ? 'polygon_amoy' : 'polygon') as 'polygon' | 'polygon_amoy',
    },
    optimism: {
      paycrestNetwork: 'optimism' as const,
      chainId: testnet ? 11155420 : 10,
      usdcAddress: testnet
        ? '0x5fd84259d66Cd46123540766Be93DFE6D43130D7'
        : '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
      privyChain: (testnet ? 'optimism_sepolia' : 'optimism') as 'optimism' | 'optimism_sepolia',
    },
  } as const;
}

type ChainConfig = ReturnType<typeof getChainConfig>;
type ChainKey = keyof ChainConfig;
const CHAIN_CONFIG = getChainConfig();

async function requireAdmin(workspaceId: string, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('workspace_members').select('role').eq('workspace_id', workspaceId).eq('user_id', userId).maybeSingle();
  return data?.role === 'owner' || data?.role === 'admin';
}

/**
 * POST /offramp/orders
 * Create an offramp order (personal or workspace)
 * Body: { source, workspaceId?, usdcAmount, fiatCurrency, recipient, chain? }
 */
router.post('/orders', authenticate, async (req: Request, res: Response, next) => {
  try {
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) { res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' }); return; }

    if (user.kyc_status !== 'approved') {
      res.status(403).json({ error: 'KYC verification required', code: 'KYC_REQUIRED' }); return;
    }

    const { source, workspaceId, usdcAmount, fiatCurrency, recipient, chain: rawChain } = req.body;
    const chain: ChainKey = (rawChain && SUPPORTED_CHAINS.includes(rawChain) ? rawChain : 'base') as ChainKey;

    if (!source || !usdcAmount || !fiatCurrency || !recipient) {
      res.status(400).json({ error: 'source, usdcAmount, fiatCurrency, and recipient are required', code: 'MISSING_FIELDS' }); return;
    }

    if (!SUPPORTED_CURRENCIES.includes(fiatCurrency.toUpperCase())) {
      res.status(400).json({ error: 'Currency not supported', code: 'UNSUPPORTED_CURRENCY' }); return;
    }

    const amountNum = parseFloat(usdcAmount);
    if (Number.isNaN(amountNum) || amountNum < 0.10) {
      res.status(400).json({ error: 'Minimum withdrawal is 0.10 USDC', code: 'MINIMUM_AMOUNT' }); return;
    }

    const chainCfg = CHAIN_CONFIG[chain];

    // Resolve source wallet
    let sourceWalletAddress: string;

    if (source === 'workspace') {
      if (!workspaceId) { res.status(400).json({ error: 'workspaceId required for workspace offramp', code: 'MISSING_WORKSPACE' }); return; }
      const isAdmin = await requireAdmin(workspaceId, user.id);
      if (!isAdmin) { res.status(403).json({ error: 'Not authorised', code: 'FORBIDDEN' }); return; }
      const { data: tw } = await supabase.from('treasury_wallets')
        .select('privy_wallet_address').eq('workspace_id', workspaceId).eq('is_active', true).maybeSingle();
      if (!tw?.privy_wallet_address) { res.status(400).json({ error: 'No treasury wallet', code: 'NO_TREASURY_WALLET' }); return; }
      sourceWalletAddress = tw.privy_wallet_address;
    } else {
      if (!user.ethereum_wallet_address) { res.status(400).json({ error: 'No wallet address', code: 'NO_WALLET' }); return; }
      sourceWalletAddress = user.ethereum_wallet_address;
    }

    // Verify recipient account
    const verifyResult = await PaycrestService.verifyBankAccount(
      recipient.institution,
      recipient.accountIdentifier,
      fiatCurrency.toUpperCase()
    );
    if (!verifyResult.verified) {
      res.status(400).json({ error: 'Could not verify recipient account', code: 'VERIFICATION_FAILED' }); return;
    }

    // Check balance on the selected chain
    let balance: number;
    try {
      const privy = getPrivyNodeClient();
      let foundWallet: any = null;
      for await (const w of privy.wallets().list({ chain_type: 'ethereum' })) {
        if ((w.address as string).toLowerCase() === sourceWalletAddress.toLowerCase()) {
          foundWallet = w;
          break;
        }
      }
      if (!foundWallet) { res.status(400).json({ error: 'Wallet not found', code: 'WALLET_NOT_FOUND' }); return; }

      const response = await privy.wallets().balance.get(foundWallet.id, { asset: 'usdc', chain: chainCfg.privyChain }) as any;
      logger.info('Offramp balance check', {
        walletId: foundWallet.id?.slice(0, 10),
        address: sourceWalletAddress,
        chain: chainCfg.privyChain,
        balances: response?.balances,
      });
      const usdcEntry = response?.balances?.find((b: any) => b.asset === 'usdc');
      const rawValue = usdcEntry?.raw_value || '0';
      const decimals = usdcEntry?.raw_value_decimals ?? 6;
      balance = Number(rawValue) / Math.pow(10, decimals);
    } catch (e: any) {
      logger.error('Balance check failed', { error: e?.message, address: sourceWalletAddress, chain: chainCfg.privyChain });
      res.status(502).json({ error: 'Could not check balance', code: 'BALANCE_CHECK_FAILED' }); return;
    }

    // Fetch rate
    let rate: string;
    try {
      rate = await PaycrestService.getExchangeRate('USDC', amountNum, fiatCurrency.toUpperCase(), chainCfg.paycrestNetwork);
    } catch {
      res.status(502).json({ error: 'Could not fetch rate', code: 'RATE_FETCH_FAILED' }); return;
    }

    const reference = `hedwig-offramp-${crypto.randomUUID()}`;

    // Create Paycrest order with the correct network
    const paycrestOrder = await PaycrestService.createOfframpOrder({
      amount: amountNum,
      token: 'USDC',
      network: chainCfg.paycrestNetwork,
      rate,
      recipient: {
        institution: recipient.institution,
        accountIdentifier: recipient.accountIdentifier,
        accountName: recipient.accountName || verifyResult.accountName,
        currency: fiatCurrency.toUpperCase(),
        memo: recipient.memo,
      },
      returnAddress: sourceWalletAddress,
      reference,
    });

    // Check balance covers totalAmount (including fees)
    const totalAmount = amountNum + paycrestOrder.senderFee + paycrestOrder.transactionFee;
    if (Math.round(balance * 100) < Math.round(totalAmount * 100)) {
      res.status(402).json({
        error: 'Insufficient balance',
        code: 'INSUFFICIENT_BALANCE',
        data: { balance: Math.round(balance * 100) / 100, required: totalAmount }
      }); return;
    }

    // Insert into DB (status PENDING — transfer happens client-side)
    const { data: dbOrder, error } = await supabase.from('offramp_orders').insert({
      user_id: user.id,
      workspace_id: workspaceId || null,
      paycrest_order_id: paycrestOrder.id,
      status: 'PENDING',
      chain: chain.toUpperCase(),
      token: 'USDC',
      crypto_amount: amountNum,
      fiat_currency: fiatCurrency.toUpperCase(),
      fiat_amount: paycrestOrder.fiatAmount,
      exchange_rate: paycrestOrder.exchangeRate,
      service_fee: paycrestOrder.senderFee + paycrestOrder.transactionFee,
      receive_address: paycrestOrder.receiveAddress,
      bank_name: recipient.institution,
      account_number: recipient.accountIdentifier,
      account_name: recipient.accountName || verifyResult.accountName,
      memo: recipient.memo || null,
    }).select().single();

    if (error) throw error;

    res.json({ success: true, data: {
      orderId: dbOrder.id,
      paycrestOrderId: paycrestOrder.id,
      receiveAddress: paycrestOrder.receiveAddress,
      totalAmount,
      usdcAddress: chainCfg.usdcAddress,
      chainId: chainCfg.chainId,
      chain,
      fiatAmount: paycrestOrder.fiatAmount,
      fiatCurrency: fiatCurrency.toUpperCase(),
      exchangeRate: paycrestOrder.exchangeRate,
      validUntil: paycrestOrder.validUntil,
      senderFee: paycrestOrder.senderFee,
      transactionFee: paycrestOrder.transactionFee,
    }});
  } catch (error: any) {
    if (error?.response?.status) {
      res.status(502).json({ error: 'Could not create offramp order', code: 'PAYCREST_ERROR' }); return;
    }
    next(error);
  }
});

/**
 * POST /offramp/v2/orders/:id/confirm
 * Record the user's signed transaction hash for a previously created order
 */
router.post('/orders/:id/confirm', authenticate, async (req: Request, res: Response, next) => {
  try {
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) { res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' }); return; }

    const { txHash } = req.body;
    if (!txHash) {
      res.status(400).json({ error: 'txHash is required', code: 'MISSING_TX_HASH' }); return;
    }

    // Verify the order belongs to this user
    const { data: existing } = await supabase.from('offramp_orders')
      .select('id, status').eq('id', req.params.id)
      .or(`user_id.eq.${user.id},workspace_id.eq.${req.body.workspaceId || ''}`)
      .maybeSingle();

    if (!existing) {
      res.status(404).json({ error: 'Order not found', code: 'NOT_FOUND' }); return;
    }
    if (existing.status !== 'PENDING') {
      res.status(409).json({ error: `Order already ${existing.status}`, code: 'ORDER_CONFIRMED' }); return;
    }

    const { error } = await supabase.from('offramp_orders')
      .update({ tx_hash: txHash, status: 'PROCESSING' })
      .eq('id', req.params.id);

    if (error) throw error;

    res.json({ success: true, data: { orderId: req.params.id, txHash } });
  } catch (error) { next(error); }
});

/**
 * GET /offramp/v2/orders
 * List offramp orders for the user
 */
router.get('/orders', authenticate, async (req: Request, res: Response, next) => {
  try {
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) { res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' }); return; }

    const workspaceId = req.query.workspaceId as string | undefined;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const offset = (page - 1) * limit;

    let query = supabase.from('offramp_orders').select('*', { count: 'exact' });
    if (workspaceId) {
      query = query.eq('workspace_id', workspaceId);
    } else {
      query = query.eq('user_id', user.id).is('workspace_id', null);
    }

    const { data, error, count } = await query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
    if (error) throw error;

    res.json({ success: true, data: { orders: data || [], total: count || 0, page, limit } });
  } catch (error) { next(error); }
});

/**
 * GET /offramp/v2/orders/:id
 * Get a single offramp order
 */
router.get('/orders/:id', authenticate, async (req: Request, res: Response, next) => {
  try {
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) { res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' }); return; }

    const { data, error } = await supabase.from('offramp_orders').select('*').eq('id', req.params.id).or(`user_id.eq.${user.id},workspace_id.eq.${req.query.workspaceId || ''}`).single();
    if (error || !data) { res.status(404).json({ error: 'Order not found', code: 'NOT_FOUND' }); return; }

    res.json({ success: true, data });
  } catch (error) { next(error); }
});

/**
 * GET /offramp/v2/rates
 * Get offramp exchange rate
 */
router.get('/rates', async (req: Request, res: Response, next) => {
  try {
    const { token, amount, currency, network } = req.query;
    if (!amount || !currency) { res.status(400).json({ error: 'amount and currency required', code: 'MISSING_FIELDS' }); return; }
    const rate = await PaycrestService.getExchangeRate(
      String(token || 'USDC'), parseFloat(String(amount)), String(currency).toUpperCase(), String(network || 'base'));
    res.json({ success: true, data: { rate } });
  } catch (error) { next(error); }
});

/**
 * GET /offramp/v2/institutions/:currency
 * Get supported institutions
 */
router.get('/institutions/:currency', async (req: Request, res: Response, next) => {
  try {
    const institutions = await PaycrestService.getSupportedInstitutions(String(req.params.currency).toUpperCase());
    res.json({ success: true, data: institutions });
  } catch (error) { next(error); }
});

/**
 * POST /offramp/v2/verify-account
 * Verify recipient bank account
 */
router.post('/verify-account', async (req: Request, res: Response, next) => {
  try {
    const { institution, accountIdentifier, currency } = req.body;
    if (!institution || !accountIdentifier) {
      res.status(400).json({ error: 'institution and accountIdentifier required', code: 'MISSING_FIELDS' }); return;
    }
    const result = await PaycrestService.verifyBankAccount(institution, accountIdentifier, (currency || 'NGN').toUpperCase());
    if (!result.verified) {
      res.status(400).json({ error: 'Could not verify account', code: 'VERIFICATION_FAILED' }); return;
    }
    res.json({ success: true, data: { accountName: result.accountName } });
  } catch (error: any) { next(error); }
});

export default router;
