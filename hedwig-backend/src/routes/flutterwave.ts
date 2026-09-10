import { Router, Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import { createLogger } from '../utils/logger';
import flutterwave from '../services/flutterwave';
import { resolveRequestIdentity, ownerScope, workspaceScope } from '../utils/identity';

const logger = createLogger('FlutterwaveRoutes');
const router = Router();

/**
 * POST /api/flutterwave/virtual-account
 * Provision the user's permanent NGN collection account (static VA).
 * BVN or NIN is passed through transiently to Flutterwave and NEVER stored.
 *
 * Body: { bvn?: string (11 digits), nin?: string (11 digits), firstname?, lastname?, narration? }
 */
router.post('/virtual-account', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const identity = await resolveRequestIdentity(req);
  if (!flutterwave.isConfigured()) {
    return res.status(503).json({ error: 'NGN accounts are not configured yet' });
  }
  const cleanDoc = (v: unknown) => String(v ?? '').replace(/\D/g, '');
  const bvn = cleanDoc(req.body?.bvn);
  const nin = cleanDoc(req.body?.nin);
  if (bvn.length !== 11 && nin.length !== 11) {
    return res.status(400).json({ error: 'a valid 11-digit BVN or NIN is required' });
  }

  const user = identity.user;
  const email = String(user?.email ?? '');
  if (!email) return res.status(400).json({ error: 'profile email is required' });

  // Idempotent: an active NGN row is the provisioned account.
  const { data: existing } = await supabase
    .from('virtual_accounts')
    .select('*')
    .in('user_id', ownerScope(identity))
    .eq('currency', 'NGN')
    .eq('status', 'active')
    .maybeSingle();
  if (existing) {
    return res.json({
      success: true,
      data: {
        accountNumber: `••••${String(existing.account_number_masked ?? '').slice(-4)}`,
        bankName: existing.bank_name,
        status: 'active',
      },
      duplicate: true,
    });
  }

  const txRef = `hedwig-ngn-${identity.internalId.slice(0, 12)}-${Date.now()}`;
  let va;
  try {
    va = await flutterwave.createStaticVirtualAccount({
      email,
      txRef,
      phone: (user?.phone as string) ?? null,
      firstName: (user?.first_name as string) ?? null,
      lastName: (user?.last_name as string) ?? null,
      narration: req.body?.narration ?? 'Hedwig NGN collection account',
      bvn: bvn.length === 11 ? bvn : undefined,
      nin: nin.length === 11 ? nin : undefined,
    });
  } catch (err) {
    logger.warn('static VA creation failed', { message: err instanceof Error ? err.message : String(err) });
    return res.status(502).json({ error: 'could not provision NGN account, try again' });
  }

  const { data: row, error } = await supabase
    .from('virtual_accounts')
    .upsert(
      {
        user_id: identity.internalId,
        workspace_id: identity.workspaceId,
        currency: 'NGN',
        account_type: 'checking',
        provider: 'flutterwave',
        provider_ref: va.flwRef,
        status: 'active',
        label: 'NGN Collection',
        balance: 0,
        balance_usd: 0,
        account_number: va.accountNumber,
        account_number_masked: va.accountNumber.slice(-4),
        bank_name: va.bankName,
      },
      { onConflict: 'user_id,workspace_id,currency,account_type' }
    )
    .select('*')
    .single();
  if (error) throw error;

  return res.status(201).json({
    success: true,
    data: {
      accountNumber: va.accountNumber,
      bankName: va.bankName,
      flwRef: va.flwRef,
      testMode: flutterwave.isTestMode(),
      accountId: row.id,
    },
  });
}));

/**
 * GET /api/flutterwave/virtual-account — current NGN account (masked).
 */
router.get('/virtual-account', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const identity = await resolveRequestIdentity(req);
  const { data } = await supabase
    .from('virtual_accounts')
    .select('*')
    .in('user_id', ownerScope(identity))
    .in('workspace_id', workspaceScope(identity))
    .eq('currency', 'NGN')
    .eq('provider', 'flutterwave')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return res.json({ success: true, data: { enrolled: false } });
  return res.json({
    success: true,
    data: {
      enrolled: true,
      accountNumber: (data as Record<string, unknown>).account_number ?? null,
      accountName: (data as Record<string, unknown>).label ?? 'NGN Collection',
      accountNumberMasked: data.account_number_masked,
      bankName: data.bank_name,
      status: data.status,
      testMode: flutterwave.isTestMode(),
    },
  });
}));

/**
 * POST /api/flutterwave/invoice-va — single-use dynamic VA for one invoice
 * collection. No BVN needed.
 *
 * Body: { amount: number, narration?, txRef? }
 */
router.post('/invoice-va', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const identity = await resolveRequestIdentity(req);
  if (!flutterwave.isConfigured()) {
    return res.status(503).json({ error: 'NGN accounts are not configured yet' });
  }
  const amount = Number(req.body?.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'amount must be greater than zero' });
  }
  const email = String(identity.user?.email ?? '');
  if (!email) return res.status(400).json({ error: 'profile email is required' });

  const txRef = String(req.body?.txRef ?? `hedwig-inv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  try {
    const va = await flutterwave.createDynamicVirtualAccount({
      email,
      txRef,
      amount,
      phone: (identity.user?.phone as string) ?? null,
      narration: req.body?.narration ?? 'Invoice collection',
    });
    return res.status(201).json({
      success: true,
      data: {
        accountNumber: va.accountNumber,
        bankName: va.bankName,
        amount: va.amount,
        expiry: va.expiry,
        flwRef: va.flwRef,
        txRef,
        testMode: flutterwave.isTestMode(),
      },
    });
  } catch (err) {
    logger.warn('dynamic VA creation failed', { message: err instanceof Error ? err.message : String(err) });
    return res.status(502).json({ error: 'could not create invoice account, try again' });
  }
}));

/**
 * POST /api/flutterwave/offramp — NGN bank payout via Flutterwave transfer.
 *
 * Body: { accountBank: string (bank code), accountNumber: string, amount: number, narration?, beneficiaryName? }
 */
router.post('/offramp', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const identity = await resolveRequestIdentity(req);
  if (!flutterwave.isConfigured()) {
    return res.status(503).json({ error: 'NGN payouts are not configured yet' });
  }
  const b = req.body ?? {};
  const amount = Number(b.amount);
  if (!b.accountBank || !b.accountNumber || !Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'accountBank, accountNumber and a positive amount are required' });
  }
  try {
    const t = await flutterwave.initiateTransfer({
      accountBank: String(b.accountBank),
      accountNumber: String(b.accountNumber),
      amount,
      narration: b.narration ?? 'Hedwig payout',
      beneficiaryName: b.beneficiaryName ?? undefined,
    });
    try {
      const { supabase: sb } = await import('../lib/supabase');
      await sb.from('timeline_events').insert({
        user_id: identity.internalId,
        kind: 'TRANSFER',
        entity_type: 'flutterwave_transfer',
        entity_id: t.reference,
        verb: 'INITIATED',
        title: `NGN ${amount.toLocaleString()} payout initiated`,
        context: { reference: t.reference, status: t.status, test_mode: flutterwave.isTestMode() },
      });
    } catch (err) {
      logger.warn('offramp timeline event failed', { err });
    }
    return res.status(202).json({ success: true, data: { ...t, testMode: flutterwave.isTestMode() } });
  } catch (err) {
    logger.warn('flutterwave transfer failed', { message: err instanceof Error ? err.message : String(err) });
    return res.status(502).json({ error: 'payout failed, try again' });
  }
}));

/** GET /api/flutterwave/banks — NGN transfer bank list (for the payout picker). */
router.get('/banks', authenticate, asyncHandler(async (_req: Request, res: Response) => {
  if (!flutterwave.isConfigured()) {
    return res.status(503).json({ error: 'NGN payouts are not configured yet' });
  }
  try {
    const banks = await flutterwave.listBanks();
    return res.json({ success: true, data: banks });
  } catch (err) {
    logger.warn('bank list failed', { message: err instanceof Error ? err.message : String(err) });
    return res.status(502).json({ error: 'could not load banks' });
  }
}));

export default router;
