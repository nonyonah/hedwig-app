import { Router, Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate } from '../middleware/auth';
import { supabase } from '../lib/supabase';
import { getWorkspaceRole, isOwnerOrAdmin } from '../middleware/workspaceRole';
import { resolveRequestIdentity } from '../utils/identity';

const router = Router();

/**
 * Admin console — Nche port, scoped to Hedwig's schema.
 * Gated on workspace owner/admin (Hedwig's role model).
 * Customer list (masked) + manual-review decisions. No PII reveal endpoints:
 * Hedwig has no identity-data/proof-of-address tables to reveal from.
 */

const requireAdmin = async (req: Request, res: Response, next: () => void) => {
  // Membership rows are keyed by internal user id — resolve it first or every
  // check returns null and the console is permanently 403.
  const identity = await resolveRequestIdentity(req).catch(() => null);
  const userId = identity?.internalId ?? req.user!.id;
  const role = await getWorkspaceRole(req, userId).catch(() => null);
  if (!isOwnerOrAdmin(role)) return res.status(403).json({ error: 'admin only' });
  return next();
};

router.use(authenticate, requireAdmin);

router.get('/customers', asyncHandler(async (req: Request, res: Response) => {
  const search = String(req.query.search ?? '').trim();
  const perPage = Math.min(Number(req.query.per_page ?? 25) || 25, 100);
  const page = Number(req.query.page ?? 0) || 0;
  let q = supabase.from('users').select('id,kyc_status,created_at').order('created_at', { ascending: false }).range(page * perPage, (page + 1) * perPage - 1);
  if (search) q = q.ilike('id', `%${search}%`);
  const { data, error } = await q;
  if (error) throw error;
  const ids = (data ?? []).map((u) => u.id);
  const { data: reviews } = ids.length
    ? await supabase.from('manual_review_cases').select('user_id').eq('status', 'OPEN').in('user_id', ids)
    : { data: [] };
  const reviewSet = new Set((reviews ?? []).map((r) => r.user_id));
  return res.json({
    success: true,
    data: (data ?? []).map((u) => ({
      id: u.id,
      verification_status: (u as { kyc_status?: string }).kyc_status ?? 'NOT_STARTED',
      review_open: reviewSet.has(u.id),
      created_at: (u as { created_at?: string }).created_at,
    })),
  });
}));

router.post('/review/:id/decision', asyncHandler(async (req: Request, res: Response) => {
  const decision = req.body?.decision;
  if (!['APPROVE', 'REJECT'].includes(decision)) return res.status(400).json({ error: 'decision must be APPROVE or REJECT' });
  const { data: review } = await supabase.from('manual_review_cases').select('*').eq('id', req.params.id).eq('status', 'OPEN').single();
  if (!review) return res.status(404).json({ error: 'open review case not found' });
  const { data, error } = await supabase
    .from('manual_review_cases')
    .update({ status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED', decided_by: req.user!.id, decided_at: new Date().toISOString() })
    .eq('id', review.id)
    .select('*')
    .single();
  if (error) throw error;
  return res.json({ success: true, id: data.id, status: data.status });
}));

export default router;
