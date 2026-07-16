import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { getOrCreateUser } from '../utils/userHelper';
import { WorkspaceService } from '../services/workspace';
import { PayrollService } from '../services/payroll';
import { supabase } from '../lib/supabase';
import { requireProFeatureAccess } from '../services/billingRules';

const router = Router({ mergeParams: true });

function getParam(req: Request, name: string): string {
  const v = req.params[name];
  if (Array.isArray(v)) return v[0];
  return v;
}

async function requireAdmin(workspaceId: string, userId: string): Promise<boolean> {
  const membership = await WorkspaceService.getMembership(workspaceId, userId);
  return membership?.role === 'owner' || membership?.role === 'admin';
}

/**
 * POST /api/workspaces/:id/payroll/preview
 * Preview a payroll run. Admin only.
 */
router.post('/preview', authenticate, async (req: Request, res: Response, next) => {
  try {
    const workspaceId = getParam(req, 'id');
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) { res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' }); return; }

    const isAdmin = await requireAdmin(workspaceId, user.id);
    if (!isAdmin) { res.status(403).json({ error: 'Not authorised', code: 'FORBIDDEN' }); return; }

    const { runType, items, paymentRail } = req.body;
    if (!runType || !['fixed', 'project'].includes(runType)) {
      res.status(400).json({ error: 'Run type must be "fixed" or "project"', code: 'INVALID_RUN_TYPE' });
      return;
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'At least one payroll item is required', code: 'INVALID_ITEMS' });
      return;
    }
    if (paymentRail && !['base', 'stellar'].includes(paymentRail)) {
      res.status(400).json({ error: 'paymentRail must be "base" or "stellar"', code: 'INVALID_PAYMENT_RAIL' });
      return;
    }

    const result = await PayrollService.preview(workspaceId, user.id, runType, items, paymentRail);

    if (result.code === 'INSUFFICIENT_FUNDS') {
      res.status(402).json({ error: result.error, code: result.code, required: result.required, available: result.available, deficit: result.deficit });
      return;
    }

    res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.message?.includes('not a member')) {
      res.status(400).json({ error: error.message, code: 'NOT_MEMBER' });
      return;
    }
    next(error);
  }
});

/**
 * POST /api/workspaces/:id/payroll/run
 * Execute a previewed payroll. Admin only.
 */
router.post('/run', authenticate, async (req: Request, res: Response, next) => {
  try {
    const workspaceId = getParam(req, 'id');
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) { res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' }); return; }

    const isAdmin = await requireAdmin(workspaceId, user.id);
    if (!isAdmin) { res.status(403).json({ error: 'Not authorised', code: 'FORBIDDEN' }); return; }

    const paywall = await requireProFeatureAccess(user, 'payroll');
    if (!paywall.allowed) {
      res.status(403).json({ error: paywall.message, code: 'UPGRADE_REQUIRED' });
      return;
    }

    const { previewToken } = req.body;
    if (!previewToken) {
      res.status(400).json({ error: 'previewToken is required', code: 'MISSING_TOKEN' });
      return;
    }

    const result = await PayrollService.run(workspaceId, user.id, previewToken);

    if (result.code === 'PREVIEW_EXPIRED') {
      res.status(400).json({ error: result.error, code: result.code });
      return;
    }
    if (result.code === 'INSUFFICIENT_FUNDS') {
      res.status(402).json({ error: result.error, code: result.code });
      return;
    }

    res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.message?.includes('Invalid preview token')) {
      res.status(400).json({ error: error.message, code: 'INVALID_TOKEN' });
      return;
    }
    next(error);
  }
});

/**
 * GET /api/workspaces/:id/payroll/history
 * Get payroll run history. Admin only.
 */
router.get('/history', authenticate, async (req: Request, res: Response, next) => {
  try {
    const workspaceId = getParam(req, 'id');
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) { res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' }); return; }

    const isAdmin = await requireAdmin(workspaceId, user.id);
    if (!isAdmin) { res.status(403).json({ error: 'Not authorised', code: 'FORBIDDEN' }); return; }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const result = await PayrollService.getHistory(workspaceId, page, limit);

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/workspaces/:id/payroll/:runId/retry
 * Retry failed payroll items. Admin only.
 */
router.post('/:runId/retry', authenticate, async (req: Request, res: Response, next) => {
  try {
    const workspaceId = getParam(req, 'id');
    const runId = getParam(req, 'runId');
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) { res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' }); return; }

    const isAdmin = await requireAdmin(workspaceId, user.id);
    if (!isAdmin) { res.status(403).json({ error: 'Not authorised', code: 'FORBIDDEN' }); return; }

    const result = await PayrollService.retryFailed(workspaceId, user.id, runId);

    if (result.code === 'INSUFFICIENT_FUNDS') {
      res.status(402).json({ error: result.error, code: result.code });
      return;
    }

    res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.message?.includes('not found') || error.message?.includes('not in partial_failed')) {
      res.status(400).json({ error: error.message, code: 'INVALID_STATE' });
      return;
    }
    next(error);
  }
});

// ─── Scheduled Payroll ──────────────────────────────────────────────────────

router.post('/schedule', authenticate, async (req: Request, res: Response, next) => {
  try {
    const workspaceId = getParam(req, 'id');
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) { res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' }); return; }

    const isAdmin = await requireAdmin(workspaceId, user.id);
    if (!isAdmin) { res.status(403).json({ error: 'Not authorised', code: 'FORBIDDEN' }); return; }

    // Payroll is a Pro feature
    const paywall = await requireProFeatureAccess(user, 'payroll');
    if (!paywall.allowed) {
      res.status(403).json({ error: paywall.message, code: 'UPGRADE_REQUIRED' });
      return;
    }

    const { frequency, dayOfMonth, dayOfWeek, items } = req.body;
    if (!frequency || !['weekly', 'biweekly', 'monthly'].includes(frequency)) {
      res.status(400).json({ error: 'Invalid frequency', code: 'INVALID_FREQUENCY' }); return;
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'At least one item required', code: 'INVALID_ITEMS' }); return;
    }

    const result = await PayrollService.createSchedule(workspaceId, user.id, { frequency, dayOfMonth, dayOfWeek, items });
    res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.message?.includes('not a workspace member')) {
      res.status(400).json({ error: error.message, code: 'NOT_MEMBER' }); return;
    }
    next(error);
  }
});

router.get('/schedules', authenticate, async (req: Request, res: Response, next) => {
  try {
    const workspaceId = getParam(req, 'id');
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) { res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' }); return; }

    const isAdmin = await requireAdmin(workspaceId, user.id);
    if (!isAdmin) { res.status(403).json({ error: 'Not authorised', code: 'FORBIDDEN' }); return; }

    const result = await PayrollService.listSchedules(workspaceId);
    res.json({ success: true, data: { schedules: result } });
  } catch (error) { next(error); }
});

router.patch('/schedule/:scheduleId', authenticate, async (req: Request, res: Response, next) => {
  try {
    const workspaceId = getParam(req, 'id');
    const scheduleId = getParam(req, 'scheduleId');
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) { res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' }); return; }

    const isAdmin = await requireAdmin(workspaceId, user.id);
    if (!isAdmin) { res.status(403).json({ error: 'Not authorised', code: 'FORBIDDEN' }); return; }

    const { items, frequency, dayOfMonth, dayOfWeek, status } = req.body;
    const result = await PayrollService.updateSchedule(workspaceId, scheduleId, { items, frequency, dayOfMonth, dayOfWeek, status });
    res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.message?.includes('not found')) {
      res.status(404).json({ error: error.message, code: 'NOT_FOUND' }); return;
    }
    next(error);
  }
});

router.delete('/schedule/:scheduleId', authenticate, async (req: Request, res: Response, next) => {
  try {
    const workspaceId = getParam(req, 'id');
    const scheduleId = getParam(req, 'scheduleId');
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) { res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' }); return; }
    const isAdmin = await requireAdmin(workspaceId, user.id);
    if (!isAdmin) { res.status(403).json({ error: 'Not authorised', code: 'FORBIDDEN' }); return; }
    const result = await PayrollService.deleteSchedule(workspaceId, scheduleId);
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
});

router.delete('/history/:runId', authenticate, async (req: Request, res: Response, next) => {
  try {
    const workspaceId = getParam(req, 'id');
    const runId = getParam(req, 'runId');
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) { res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' }); return; }
    const isAdmin = await requireAdmin(workspaceId, user.id);
    if (!isAdmin) { res.status(403).json({ error: 'Not authorised', code: 'FORBIDDEN' }); return; }
    const { error } = await supabase.from('payroll_runs').delete().eq('id', runId).eq('workspace_id', workspaceId);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) { next(error); }
});



export default router;
