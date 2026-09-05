import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import { getEffectiveWorkspaceId } from '../utils/workspace';

const router = Router();

/** Disputes / support tickets — Nche port (card + invoice). */

router.get('/', authenticate, async (req: Request, res: Response) => {
  const { data, error } = await supabase
    .from('disputes')
    .select('*')
    .eq('user_id', req.user!.id)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return res.json({ success: true, data });
});

router.post('/', authenticate, async (req: Request, res: Response) => {
  const b = req.body ?? {};
  if (!b.reason?.trim()) return res.status(400).json({ error: 'reason is required' });
  const { data, error } = await supabase
    .from('disputes')
    .insert({
      user_id: req.user!.id,
      workspace_id: b.workspace_id ?? await getEffectiveWorkspaceId(req, req.user!.id),
      card_transaction_id: b.card_transaction_id ?? null,
      invoice_id: b.invoice_id ?? null,
      reason: b.reason.trim().slice(0, 200),
      details: b.details ?? null,
      status: 'OPEN',
    })
    .select('*')
    .single();
  if (error) throw error;
  return res.status(201).json({ success: true, data });
});

router.patch('/:id', authenticate, async (req: Request, res: Response) => {
  const { data, error } = await supabase
    .from('disputes')
    .update({ status: req.body?.status ?? 'IN_REVIEW', updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('user_id', req.user!.id)
    .select('*')
    .single();
  if (error) throw error;
  return res.json({ success: true, data });
});

export default router;
