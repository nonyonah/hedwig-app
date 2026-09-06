import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import { resolveRequestIdentity, ownerScope } from '../utils/identity';

const router = Router();

/**
 * Verification review queue — Nche port (ManualReviewCase).
 * Hedwig's Didit sessions + Bridge KYB links stay as-is; ambiguous cases
 * land here for human review instead of blocking onboarding.
 */

router.get('/reviews', authenticate, async (req: Request, res: Response) => {
  const identity = await resolveRequestIdentity(req);
  const { data, error } = await supabase
    .from('manual_review_cases')
    .select('*')
    .in('user_id', ownerScope(identity))
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return res.json({ success: true, data });
});

router.post('/reviews', authenticate, async (req: Request, res: Response) => {
  const identity = await resolveRequestIdentity(req);
  const b = req.body ?? {};
  if (!b.kind) return res.status(400).json({ error: 'kind is required' });
  const { data, error } = await supabase
    .from('manual_review_cases')
    .insert({
      user_id: identity.internalId,
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
  const identity = await resolveRequestIdentity(req);
  const { data: user } = await supabase.from('users').select('kyc_status').eq('id', identity.internalId).maybeSingle();
  const { data: reviews } = await supabase
    .from('manual_review_cases')
    .select('id,status')
    .in('user_id', ownerScope(identity))
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
