import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { supabase } from '../lib/supabase';

const router = Router();

/**
 * Verification review queue — Nche port (ManualReviewCase).
 * Hedwig's Didit sessions + Bridge KYB links stay as-is; ambiguous cases
 * land here for human review instead of blocking onboarding.
 */

router.get('/reviews', authenticate, async (req: Request, res: Response) => {
  const { data, error } = await supabase
    .from('manual_review_cases')
    .select('*')
    .eq('user_id', req.user!.id)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return res.json({ success: true, data });
});

router.post('/reviews', authenticate, async (req: Request, res: Response) => {
  const b = req.body ?? {};
  if (!b.kind) return res.status(400).json({ error: 'kind is required' });
  const { data, error } = await supabase
    .from('manual_review_cases')
    .insert({
      user_id: req.user!.id,
      kind: String(b.kind).slice(0, 100),
      reference_id: b.reference_id ?? null,
      payload: b.payload ?? null,
      status: 'OPEN',
    })
    .select('*')
    .single();
  if (error) throw error;
  return res.status(201).json({ success: true, data });
});

/** Unified verification status: Didit session + Bridge KYB + open reviews. */
router.get('/status', authenticate, async (req: Request, res: Response) => {
  const { data: user } = await supabase.from('users').select('kyc_status').eq('id', req.user!.id).maybeSingle();
  const { data: reviews } = await supabase
    .from('manual_review_cases')
    .select('id,status')
    .eq('user_id', req.user!.id)
    .eq('status', 'OPEN');
  return res.json({
    success: true,
    data: {
      kyc_status: (user as { kyc_status?: string } | null)?.kyc_status ?? 'NOT_STARTED',
      open_reviews: (reviews ?? []).length,
      verified: (user as { kyc_status?: string } | null)?.kyc_status === 'approved',
    },
  });
});

export default router;
