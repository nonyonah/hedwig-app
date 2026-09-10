import { Router, Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import { createLogger } from '../utils/logger';
import { buildPolicySnapshot } from '../services/spendPolicy';
import { resolveRequestIdentity, ownerScope } from '../utils/identity';

const router = Router();
const logger = createLogger('Approvals');

const APPROVAL_TTL_MS = Number(process.env.APPROVAL_TTL_MS ?? 30 * 60 * 1000);

async function sweepExpired(userIds: string[]) {
  await supabase
    .from('approval_requests')
    .update({ status: 'EXPIRED', decided_at: new Date().toISOString() })
    .in('user_id', userIds)
    .eq('status', 'PENDING')
    .lte('expires_at', new Date().toISOString());
}

router.get('/', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const identity = await resolveRequestIdentity(req);
  await sweepExpired(ownerScope(identity));
  const { data, error } = await supabase
    .from('approval_requests')
    .select('*')
    .in('user_id', ownerScope(identity))
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return res.json({ success: true, data });
}));

/** Create an approval request (typically called by policy HOLD paths). */
router.post('/', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const identity = await resolveRequestIdentity(req);
  const b = req.body ?? {};
  if (!b.amount || !b.reason) return res.status(400).json({ error: 'amount and reason required' });
  if (b.idempotency_key) {
    const { data: existing } = await supabase
      .from('approval_requests')
      .select('*')
      .in('user_id', ownerScope(identity))
      .eq('idempotency_key', b.idempotency_key)
      .maybeSingle();
    if (existing) return res.json({ success: true, data: existing, duplicate: true });
  }
  const { data, error } = await supabase
    .from('approval_requests')
    .insert({
      user_id: identity.internalId,
      workspace_id: b.workspace_id ?? identity.workspaceId,
      type: b.type ?? 'TRANSACTION',
      agent_id: b.agent_id ?? null,
      invoice_id: b.invoice_id ?? null,
      bridge_auth_id: b.bridge_auth_id ?? null,
      source_type: b.source_type ?? null,
      source_reference: b.source_reference ?? null,
      merchant_name: b.merchant_name ?? null,
      merchant_url: b.merchant_url ?? null,
      intent_metadata: b.intent_metadata ?? null,
      idempotency_key: b.idempotency_key ?? null,
      amount: b.amount,
      currency: b.currency ?? 'USDC',
      reason: b.reason,
      policy_snapshot: b.policy_snapshot ?? buildPolicySnapshot(b.policy ?? null),
      status: 'PENDING',
      expires_at: new Date(Date.now() + APPROVAL_TTL_MS).toISOString(),
    })
    .select('*')
    .single();
  if (error) throw error;
  try {
    const { supabase: sb } = await import('../lib/supabase');
    await sb.from('notifications').insert({
      user_id: identity.internalId,
      type: 'approval_requested',
      title: b.type === 'INVOICE' ? 'Invoice needs approval' : 'Spend needs approval',
      body: `${b.merchant_name ?? 'Unknown merchant'} — ${b.amount} USDC (${String(b.reason).toLowerCase().replace(/_/g, ' ')})`,
      metadata: { approval_request_id: data.id },
    });
  } catch (err) {
    logger.warn('approval notification failed', { err });
  }
  return res.status(201).json({ success: true, data });
}));

router.post('/:id/approve', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const identity = await resolveRequestIdentity(req);
  const { data: existing } = await supabase
    .from('approval_requests')
    .select('*')
    .eq('id', req.params.id)
    .in('user_id', ownerScope(identity))
    .single();
  if (!existing) return res.status(404).json({ error: 'not found' });
  if (existing.status !== 'PENDING') return res.status(409).json({ error: `already ${existing.status.toLowerCase()}` });
  const expired = new Date(existing.expires_at).getTime() <= Date.now();
  const { data, error } = await supabase
    .from('approval_requests')
    .update({
      status: expired ? 'EXPIRED' : 'APPROVED',
      decision: req.body?.decision ?? null,
      decided_by_user_id: identity.internalId,
      decided_at: new Date().toISOString(),
    })
    .eq('id', existing.id)
    .eq('status', 'PENDING')
    .select('*')
    .single();
  if (error) throw error;
  return res.json({ success: true, data });
}));

router.post('/:id/decline', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const identity = await resolveRequestIdentity(req);
  const { data: existing } = await supabase
    .from('approval_requests')
    .select('*')
    .eq('id', req.params.id)
    .in('user_id', ownerScope(identity))
    .single();
  if (!existing) return res.status(404).json({ error: 'not found' });
  if (existing.status !== 'PENDING') return res.status(409).json({ error: `already ${existing.status.toLowerCase()}` });
  const { data, error } = await supabase
    .from('approval_requests')
    .update({
      status: 'DECLINED',
      decision: req.body?.decision ?? 'USER_DECLINED',
      decided_by_user_id: identity.internalId,
      decided_at: new Date().toISOString(),
    })
    .eq('id', existing.id)
    .eq('status', 'PENDING')
    .select('*')
    .single();
  if (error) throw error;
  // Note: if bridge_auth_id is set, the Bridge card webhook path declines the
  // held authorization on next sync (see routes/cards.ts).
  return res.json({ success: true, data });
}));

export default router;
