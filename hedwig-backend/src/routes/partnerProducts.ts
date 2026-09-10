import { Router, Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import { resolveRequestIdentity } from '../utils/identity';

const router = Router();

/**
 * Partner products — Nche port (partner-products.routes.ts), scoped to what
 * Hedwig actually provisions: USD_ACCOUNT + CARD via Bridge, STABLECOIN_WALLET
 * via the existing Privy wallet (immediately ACTIVE).
 */

const PRODUCTS = ['USD_ACCOUNT', 'CARD', 'BANK_TRANSFER', 'STABLECOIN_WALLET'] as const;
const PROVIDERS = ['BRIDGE', 'RAIN', 'HEDWIG'] as const;

router.get('/capabilities', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const identity = await resolveRequestIdentity(req);
  const { data } = await supabase.from('partner_accounts').select('*').in('user_id', [identity.internalId, identity.privyDid]);
  const byProduct = new Map((data ?? []).map((r) => [r.product, r]));
  return res.json({
    success: true,
    data: PRODUCTS.map((p) => ({
      product: p,
      status: (byProduct.get(p)?.status as string) ?? 'NOT_STARTED',
      provider: (byProduct.get(p)?.provider as string) ?? null,
      bridge_configured: Boolean(process.env.BRIDGE_API_KEY),
    })),
  });
}));

router.post('/activate', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const identity = await resolveRequestIdentity(req);
  const b = req.body ?? {};
  if (!PRODUCTS.includes(b.product)) return res.status(400).json({ error: 'unknown product' });
  if (b.provider && !PROVIDERS.includes(b.provider)) return res.status(400).json({ error: 'unknown provider' });
  const provider = b.provider ?? 'BRIDGE';

  // The stablecoin wallet is the existing Privy wallet — no partner step.
  if (b.product === 'STABLECOIN_WALLET') {
    const { data, error } = await supabase
      .from('partner_accounts')
      .upsert(
        { user_id: identity.internalId, workspace_id: identity.workspaceId, product: b.product, provider: 'HEDWIG', status: 'ACTIVE', provider_ref: identity.internalId },
        { onConflict: 'user_id,product,provider' }
      )
      .select('*')
      .single();
    if (error) throw error;
    return res.status(202).json({ success: true, product: data.product, provider: data.provider, status: data.status, message: 'Stablecoin wallet is ready.' });
  }

  const { data, error } = await supabase
    .from('partner_accounts')
    .upsert(
      { user_id: identity.internalId, workspace_id: identity.workspaceId, product: b.product, provider, status: 'PENDING' },
      { onConflict: 'user_id,product,provider' }
    )
    .select('*')
    .single();
  if (error) throw error;
  return res.status(202).json({
    success: true,
    product: data.product,
    provider: data.provider,
    status: data.status,
    provider_ref: data.provider_ref,
    message: 'Partner onboarding started. We will notify you when the partner approves.',
  });
}));

export default router;
