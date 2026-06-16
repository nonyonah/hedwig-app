import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { getOrCreateUser } from '../utils/userHelper';
import { supabase } from '../lib/supabase';
import { isAddress, getAddress } from 'viem';

const router = Router({ mergeParams: true });

async function requireAdmin(workspaceId: string, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('workspace_members').select('role').eq('workspace_id', workspaceId).eq('user_id', userId).maybeSingle();
  return data?.role === 'owner' || data?.role === 'admin';
}

/**
 * POST /workspaces/:id/external-recipients
 */
router.post('/', authenticate, async (req: Request, res: Response, next) => {
  try {
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) { res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' }); return; }

    const workspaceId = req.params.id as string;
    const isAdmin = await requireAdmin(workspaceId, user.id);
    if (!isAdmin) { res.status(403).json({ error: 'Not authorised', code: 'FORBIDDEN' }); return; }

    const { displayName, walletAddress, notes } = req.body;
    if (!displayName || !walletAddress) {
      res.status(400).json({ error: 'displayName and walletAddress required', code: 'MISSING_FIELDS' }); return;
    }

    // Validate address
    if (!isAddress(walletAddress)) {
      res.status(400).json({ error: 'Invalid wallet address', code: 'INVALID_ADDRESS' }); return;
    }

    const checksummed = getAddress(walletAddress);

    // Check for duplicate
    const { data: existing } = await supabase.from('external_payroll_recipients')
      .select('id').eq('workspace_id', workspaceId).eq('wallet_address', checksummed).maybeSingle();
    if (existing) {
      res.status(409).json({ error: 'Wallet address already added', code: 'DUPLICATE_ADDRESS' }); return;
    }

    const { data, error } = await supabase.from('external_payroll_recipients').insert({
      workspace_id: workspaceId,
      created_by: user.id,
      display_name: displayName,
      wallet_address: checksummed,
      notes: notes || null,
    }).select().single();

    if (error) throw error;

    res.status(201).json({ success: true, data });
  } catch (error) { next(error); }
});

/**
 * GET /workspaces/:id/external-recipients
 */
router.get('/', authenticate, async (req: Request, res: Response, next) => {
  try {
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) { res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' }); return; }

    const workspaceId = req.params.id;
    const includeInactive = req.query.includeInactive === 'true';

    let query = supabase.from('external_payroll_recipients').select('*').eq('workspace_id', workspaceId);
    if (!includeInactive) query = query.eq('is_active', true);

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;

    res.json({ success: true, data: data || [] });
  } catch (error) { next(error); }
});

/**
 * PATCH /workspaces/:id/external-recipients/:recipientId
 */
router.patch('/:recipientId', authenticate, async (req: Request, res: Response, next) => {
  try {
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) { res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' }); return; }

    const workspaceId = req.params.id as string;
    const isAdmin = await requireAdmin(workspaceId, user.id);
    if (!isAdmin) { res.status(403).json({ error: 'Not authorised', code: 'FORBIDDEN' }); return; }

    const updates: Record<string, any> = {};
    if (req.body.displayName) updates.display_name = req.body.displayName;
    if (req.body.walletAddress) {
      if (!isAddress(req.body.walletAddress)) {
        res.status(400).json({ error: 'Invalid wallet address', code: 'INVALID_ADDRESS' }); return;
      }
      updates.wallet_address = getAddress(req.body.walletAddress);
    }
    if (req.body.notes !== undefined) updates.notes = req.body.notes;
    if (req.body.isActive !== undefined) updates.is_active = req.body.isActive;

    const { data, error } = await supabase.from('external_payroll_recipients')
      .update(updates).eq('id', req.params.recipientId).eq('workspace_id', workspaceId)
      .select().single();

    if (error) { res.status(404).json({ error: 'Recipient not found', code: 'NOT_FOUND' }); return; }

    res.json({ success: true, data });
  } catch (error) { next(error); }
});

/**
 * DELETE /workspaces/:id/external-recipients/:recipientId
 */
router.delete('/:recipientId', authenticate, async (req: Request, res: Response, next) => {
  try {
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) { res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' }); return; }

    const workspaceId = req.params.id as string;
    const isAdmin = await requireAdmin(workspaceId, user.id);
    if (!isAdmin) { res.status(403).json({ error: 'Not authorised', code: 'FORBIDDEN' }); return; }

    const { error } = await supabase.from('external_payroll_recipients')
      .delete().eq('id', req.params.recipientId).eq('workspace_id', workspaceId);

    if (error) { res.status(404).json({ error: 'Recipient not found', code: 'NOT_FOUND' }); return; }

    res.json({ success: true });
  } catch (error) { next(error); }
});

export default router;
