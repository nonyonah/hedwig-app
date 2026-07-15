import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { getOrCreateUser } from '../utils/userHelper';
import { WorkspaceService } from '../services/workspace';
import { TimeEntriesService } from '../services/timeEntries';

const router = Router();

function getParam(req: Request, name: string): string {
  return (req.params as any)[name] || '';
}

router.use(authenticate);

router.post('/', async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) { res.status(404).json({ success: false, error: { message: 'User not found' } }); return; }

    const workspaceId = req.headers['x-workspace-id'] as string || '';
    if (!workspaceId) { res.status(400).json({ success: false, error: { message: 'x-workspace-id header required' } }); return; }

    const membership = await WorkspaceService.getMembership(workspaceId, user.id);
    if (!membership) { res.status(403).json({ success: false, error: { message: 'Not a member' } }); return; }

    const entry = await TimeEntriesService.create(user.id, workspaceId, req.body);
    res.json({ success: true, data: { entry } });
  } catch (error: any) {
    res.status(400).json({ success: false, error: { message: error.message || 'Failed to create time entry' } });
  }
});

// ── List ─────────────────────────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) { res.status(404).json({ success: false, error: { message: 'User not found' } }); return; }

    const workspaceId = req.headers['x-workspace-id'] as string || '';
    if (!workspaceId) { res.status(400).json({ success: false, error: { message: 'x-workspace-id header required' } }); return; }

    const entries = await TimeEntriesService.list(user.id, workspaceId, {
      from: req.query.from as string,
      to: req.query.to as string,
      projectId: req.query.projectId as string,
      status: req.query.status as string,
    });
    res.json({ success: true, data: { entries } });
  } catch (error) {
    next(error);
  }
});

// ── Active Timer ─────────────────────────────────────────────────────────────

router.get('/active', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) { res.status(404).json({ success: false, error: { message: 'User not found' } }); return; }

    const workspaceId = req.headers['x-workspace-id'] as string || '';
    if (!workspaceId) { res.status(400).json({ success: false, error: { message: 'x-workspace-id header required' } }); return; }

    const projectId = req.query.projectId as string | undefined;
    const active = await TimeEntriesService.getActive(user.id, workspaceId, projectId);
    res.json({ success: true, data: { entry: active } });
  } catch (error) {
    next(error);
  }
});

// ── All Active Timers ────────────────────────────────────────────────────────

router.get('/active-all', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) { res.status(404).json({ success: false, error: { message: 'User not found' } }); return; }

    const workspaceId = req.headers['x-workspace-id'] as string || '';
    if (!workspaceId) { res.status(400).json({ success: false, error: { message: 'x-workspace-id header required' } }); return; }

    const entries = await TimeEntriesService.getAllActive(user.id, workspaceId);
    res.json({ success: true, data: { entries } });
  } catch (error) {
    next(error);
  }
});

// ── Summary ──────────────────────────────────────────────────────────────────

router.get('/summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) { res.status(404).json({ success: false, error: { message: 'User not found' } }); return; }

    const workspaceId = req.headers['x-workspace-id'] as string || '';
    if (!workspaceId) { res.status(400).json({ success: false, error: { message: 'x-workspace-id header required' } }); return; }

    const summary = await TimeEntriesService.getSummary(user.id, workspaceId);
    res.json({ success: true, data: { summary } });
  } catch (error) {
    next(error);
  }
});

// ── Stop / Update ────────────────────────────────────────────────────────────

router.patch('/:id', async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) { res.status(404).json({ success: false, error: { message: 'User not found' } }); return; }

    const entryId = getParam(req, 'id');
    const { action } = req.body;

    let entry;
    if (action === 'stop') {
      entry = await TimeEntriesService.stop(entryId, user.id);
    } else {
      entry = await TimeEntriesService.update(entryId, user.id, req.body);
    }

    res.json({ success: true, data: { entry } });
  } catch (error: any) {
    res.status(400).json({ success: false, error: { message: error.message || 'Update failed' } });
  }
});

// ── Delete ───────────────────────────────────────────────────────────────────

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) { res.status(404).json({ success: false, error: { message: 'User not found' } }); return; }

    const entryId = getParam(req, 'id');
    await TimeEntriesService.remove(entryId, user.id);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
