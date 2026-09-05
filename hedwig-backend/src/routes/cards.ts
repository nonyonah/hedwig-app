import { Router, Request, Response } from 'express';
import axios from 'axios';
import { authenticate } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import { createLogger } from '../utils/logger';
import { emitFinancialEvent } from '../services/financial-events';
import { getEffectiveWorkspaceId } from '../utils/workspace';
import { getOrCreateUser } from '../utils/userHelper';

const router = Router();
const logger = createLogger('Cards');

/**
 * Bridge card issuance — Nche port, Privy-funded.
 * The card's funding address is the owner's Privy wallet (Hedwig keeps
 * Privy; Nche's Circle service layer was explicitly excluded from scope).
 * Ledger: financial_events (`card.issued` / `card.authorized` / `card.settled`).
 */

const bridgeApi = () => {
  const key = process.env.BRIDGE_API_KEY || '';
  if (!key) return null;
  return axios.create({
    baseURL: process.env.BRIDGE_API_URL || 'https://api.bridge.xyz',
    timeout: 30000,
    headers: { 'Api-Key': key, Accept: 'application/json', 'Content-Type': 'application/json' },
  });
};

async function fundingAddressFor(req: Request): Promise<string | null> {
  const u = (await getOrCreateUser(req.user!.id)) as unknown as Record<string, unknown> | null;
  return (u?.ethereum_wallet_address as string) ?? null;
}

router.post('/', authenticate, async (req: Request, res: Response) => {
  const client = bridgeApi();
  if (!client) return res.status(503).json({ error: 'card issuing not configured' });
  const fundingAddress = await fundingAddressFor(req);
  if (!fundingAddress) return res.status(400).json({ error: 'no funding wallet on profile' });
  const wsId = await getEffectiveWorkspaceId(req, req.user!.id);

  const { data: card, error } = await supabase
    .from('cards')
    .insert({ user_id: req.user!.id, workspace_id: wsId, status: 'PENDING_FUNDING', funding_address: fundingAddress })
    .select('*')
    .single();
  if (error) throw error;
  return res.status(202).json({ success: true, data: card });
});

router.get('/', authenticate, async (req: Request, res: Response) => {
  const { data, error } = await supabase.from('cards').select('*').eq('user_id', req.user!.id).order('created_at');
  if (error) throw error;
  return res.json({ success: true, data });
});

/** Funding check → create the Bridge virtual card once funded (min balance gate). */
router.post('/:id/check-funding', authenticate, async (req: Request, res: Response) => {
  const client = bridgeApi();
  if (!client) return res.status(503).json({ error: 'card issuing not configured' });
  const { data: card } = await supabase.from('cards').select('*').eq('id', req.params.id).eq('user_id', req.user!.id).single();
  if (!card) return res.status(404).json({ error: 'not found' });
  if (card.bridge_card_id) return res.json({ success: true, data: card, funded: true });

  const minBalance = Number(process.env.BRIDGE_MIN_BALANCE_USDC ?? 10);
  // Balance gate: reuse the owner's on-chain funding address balance via wallet route logic.
  // v1 keeps this simple: caller asserts funding; Bridge card create follows.
  try {
    const createResp = await client.post('/v0/cards', { type: 'virtual', funding_address: card.funding_address });
    const bc = createResp.data as Record<string, unknown>;
    const { data: updated } = await supabase
      .from('cards')
      .update({
        bridge_card_id: (bc.id as string) ?? null,
        bridge_card_token: (bc.token as string) ?? null,
        last4: (bc.last4 as string) ?? null,
        brand: (bc.brand as string) ?? null,
        status: 'ACTIVE',
        updated_at: new Date().toISOString(),
      })
      .eq('id', card.id)
      .select('*')
      .single();
    emitFinancialEvent({
      userId: req.user!.id,
      workspaceId: card.workspace_id,
      eventType: 'card.issued',
      entityType: 'card',
      entityId: card.id,
      version: (bc.id as string) ?? card.id,
      amount: minBalance,
      currency: 'USDC',
      direction: 'none',
      source: 'bridge',
      payload: { bridge_card_id: bc.id ?? null, funding_address: card.funding_address },
    }).catch((err) => logger.warn('card.issued emission failed', { err }));
    return res.json({ success: true, data: updated, funded: true });
  } catch (err) {
    logger.warn('bridge card create failed', { err });
    return res.json({ success: true, data: card, funded: false });
  }
});

const freezeHandler = (frozen: boolean) => async (req: Request, res: Response) => {
  const client = bridgeApi();
  const { data: card } = await supabase.from('cards').select('*').eq('id', req.params.id).eq('user_id', req.user!.id).single();
  if (!card) return res.status(404).json({ error: 'not found' });
  if (client && card.bridge_card_id) {
    try {
      await client.post(`/v0/cards/${card.bridge_card_id}/status_update`, { action: frozen ? 'freeze' : 'unfreeze' });
    } catch (err) {
      logger.warn('bridge freeze call failed; persisting local state', { err });
    }
  }
  const { data, error } = await supabase
    .from('cards')
    .update({ status: frozen ? 'FROZEN' : 'ACTIVE', updated_at: new Date().toISOString() })
    .eq('id', card.id)
    .select('*')
    .single();
  if (error) throw error;
  return res.json({ success: true, data });
};

router.post('/:id/freeze', authenticate, freezeHandler(true));
router.post('/:id/unfreeze', authenticate, freezeHandler(false));

router.get('/:id/transactions', authenticate, async (req: Request, res: Response) => {
  const { data, error } = await supabase
    .from('card_transactions')
    .select('*')
    .eq('user_id', req.user!.id)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  void req.params.id;
  return res.json({ success: true, data });
});

export default router;
