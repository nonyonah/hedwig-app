import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { getOrCreateUser } from '../utils/userHelper';
import { WorkspaceService } from '../services/workspace';

const router = Router();

function getParam(req: Request, name: string): string {
  const v = req.params[name];
  if (Array.isArray(v)) return v[0];
  return v;
}

/**
 * GET /api/workspaces
 * List all workspaces the user is a member of
 */
router.get('/', authenticate, async (req: Request, res: Response, next) => {
  try {
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) { res.status(404).json({ success: false, error: { message: 'User not found' } }); return; }

    await WorkspaceService.ensurePersonalWorkspace(user.id);
    const workspaces = await WorkspaceService.listWorkspaces(user.id);

    res.json({ success: true, data: { workspaces } });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/workspaces
 * Create a new workspace
 */
router.post('/', authenticate, async (req: Request, res: Response, next) => {
  try {
    const { name } = req.body;
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) { res.status(404).json({ success: false, error: { message: 'User not found' } }); return; }

    if (!name || !name.trim()) {
      res.status(400).json({ success: false, error: { message: 'Workspace name is required' } });
      return;
    }

    const workspace = await WorkspaceService.createWorkspace(user.id, name);

    res.json({ success: true, data: { workspace } });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/workspaces/current
 * Get or resolve the user's current workspace
 */
router.get('/current', authenticate, async (req: Request, res: Response, next) => {
  try {
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) { res.status(404).json({ success: false, error: { message: 'User not found' } }); return; }

    const headerWsId = req.headers['x-workspace-id'] as string | undefined;
    await WorkspaceService.ensurePersonalWorkspace(user.id);
    const active = await WorkspaceService.getEffectiveWorkspace(user.id, headerWsId);
    const workspace = active ? await WorkspaceService.getWorkspace(active.id, user.id) : null;

    res.json({ success: true, data: { workspace } });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/workspaces/:id
 * Get workspace details
 */
router.get('/:id', authenticate, async (req: Request, res: Response, next) => {
  try {
    const id = getParam(req, 'id');
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) { res.status(404).json({ success: false, error: { message: 'User not found' } }); return; }

    const workspace = await WorkspaceService.getWorkspace(id, user.id);
    if (!workspace) {
      res.status(404).json({ success: false, error: { message: 'Workspace not found' } });
      return;
    }

    res.json({ success: true, data: { workspace } });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/workspaces/:id
 * Update workspace
 */
router.patch('/:id', authenticate, async (req: Request, res: Response, next) => {
  try {
    const id = getParam(req, 'id');
    const { name } = req.body;
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) { res.status(404).json({ success: false, error: { message: 'User not found' } }); return; }

    const workspace = await WorkspaceService.updateWorkspace(id, user.id, { name });

    res.json({ success: true, data: { workspace } });
  } catch (error: any) {
    if (error.message?.includes('Only workspace owners')) {
      res.status(403).json({ success: false, error: { message: error.message } });
      return;
    }
    next(error);
  }
});

/**
 * DELETE /api/workspaces/:id
 * Delete workspace
 */
router.delete('/:id', authenticate, async (req: Request, res: Response, next) => {
  try {
    const id = getParam(req, 'id');
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) { res.status(404).json({ success: false, error: { message: 'User not found' } }); return; }

    await WorkspaceService.deleteWorkspace(id, user.id);

    res.json({ success: true, message: 'Workspace deleted' });
  } catch (error: any) {
    if (error.message?.includes('Only workspace owners') || error.message?.includes('Cannot delete')) {
      res.status(403).json({ success: false, error: { message: error.message } });
      return;
    }
    next(error);
  }
});

// ─── Members ────────────────────────────────────────────────────────────────

/**
 * GET /api/workspaces/:id/members
 * List workspace members
 */
router.get('/:id/members', authenticate, async (req: Request, res: Response, next) => {
  try {
    const id = getParam(req, 'id');
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) { res.status(404).json({ success: false, error: { message: 'User not found' } }); return; }

    const workspace = await WorkspaceService.getWorkspace(id, user.id);
    if (!workspace) {
      res.status(404).json({ success: false, error: { message: 'Workspace not found' } });
      return;
    }

    const members = await WorkspaceService.listMembers(id);

    res.json({ success: true, data: { members } });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/workspaces/:id/members/:userId
 * Update member role
 */
router.patch('/:id/members/:userId', authenticate, async (req: Request, res: Response, next) => {
  try {
    const id = getParam(req, 'id');
    const targetUserId = getParam(req, 'userId');
    const { role } = req.body;
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) { res.status(404).json({ success: false, error: { message: 'User not found' } }); return; }

    if (!role || !['admin', 'member'].includes(role)) {
      res.status(400).json({ success: false, error: { message: 'Role must be admin or member' } });
      return;
    }

    await WorkspaceService.updateMemberRole(id, user.id, targetUserId, role);

    res.json({ success: true, message: 'Member role updated' });
  } catch (error: any) {
    if (error.message?.includes('Only workspace owners')) {
      res.status(403).json({ success: false, error: { message: error.message } });
      return;
    }
    next(error);
  }
});

/**
 * DELETE /api/workspaces/:id/members/:userId
 * Remove member from workspace
 */
router.delete('/:id/members/:userId', authenticate, async (req: Request, res: Response, next) => {
  try {
    const id = getParam(req, 'id');
    const targetUserId = getParam(req, 'userId');
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) { res.status(404).json({ success: false, error: { message: 'User not found' } }); return; }

    await WorkspaceService.removeMember(id, user.id, targetUserId);

    res.json({ success: true, message: 'Member removed' });
  } catch (error: any) {
    if (error.message?.includes('Only owners and admins') || error.message?.includes('Transfer ownership')) {
      res.status(403).json({ success: false, error: { message: error.message } });
      return;
    }
    next(error);
  }
});

// ─── Invitations ────────────────────────────────────────────────────────────

/**
 * GET /api/workspaces/:id/invitations
 * List pending invitations
 */
router.get('/:id/invitations', authenticate, async (req: Request, res: Response, next) => {
  try {
    const id = getParam(req, 'id');
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) { res.status(404).json({ success: false, error: { message: 'User not found' } }); return; }

    const workspace = await WorkspaceService.getWorkspace(id, user.id);
    if (!workspace) {
      res.status(404).json({ success: false, error: { message: 'Workspace not found' } });
      return;
    }

    const invitations = await WorkspaceService.listInvitations(id);

    res.json({ success: true, data: { invitations } });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/workspaces/:id/invitations
 * Create invitation
 */
router.post('/:id/invitations', authenticate, async (req: Request, res: Response, next) => {
  try {
    const id = getParam(req, 'id');
    const { email, role } = req.body;
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) { res.status(404).json({ success: false, error: { message: 'User not found' } }); return; }

    if (!email || !email.trim()) {
      res.status(400).json({ success: false, error: { message: 'Email is required' } });
      return;
    }

    const invitation = await WorkspaceService.createInvitation(id, user.id, email, role || 'member');

    res.json({ success: true, data: { invitation } });
  } catch (error: any) {
    if (error.message?.includes('Only owners and admins')) {
      res.status(403).json({ success: false, error: { message: error.message } });
      return;
    }
    next(error);
  }
});

/**
 * DELETE /api/workspaces/:id/invitations/:invitationId
 * Cancel invitation
 */
router.delete('/:id/invitations/:invitationId', authenticate, async (req: Request, res: Response, next) => {
  try {
    const id = getParam(req, 'id');
    const invitationId = getParam(req, 'invitationId');
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) { res.status(404).json({ success: false, error: { message: 'User not found' } }); return; }

    await WorkspaceService.cancelInvitation(id, user.id, invitationId);

    res.json({ success: true, message: 'Invitation cancelled' });
  } catch (error: any) {
    if (error.message?.includes('Only owners and admins')) {
      res.status(403).json({ success: false, error: { message: error.message } });
      return;
    }
    next(error);
  }
});

/**
 * GET /api/workspaces/invitations/:token
 * Get invitation details by token (no auth required — used on sign-up)
 */
router.get('/invitations/:token', async (req: Request, res: Response, next) => {
  try {
    const token = getParam(req, 'token');
    const invitation = await WorkspaceService.getInvitationByToken(token);

    if (!invitation) {
      res.status(404).json({ success: false, error: { message: 'Invalid or expired invitation' } });
      return;
    }

    res.json({
      success: true,
      data: {
        invitation: {
          id: invitation.id,
          workspaceId: invitation.workspace_id,
          workspaceName: invitation.workspace?.name,
          email: invitation.email,
          role: invitation.role,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/workspaces/invitations/:token/accept
 * Accept invitation
 */
router.post('/invitations/:token/accept', authenticate, async (req: Request, res: Response, next) => {
  try {
    const token = getParam(req, 'token');
    const privyId = req.user!.id;
    const user = await getOrCreateUser(privyId);
    if (!user) { res.status(404).json({ success: false, error: { message: 'User not found' } }); return; }

    const invitation = await WorkspaceService.acceptInvitation(token, user.id);

    res.json({
      success: true,
      data: {
        workspaceId: invitation.workspace_id,
        workspaceName: invitation.workspace?.name,
        role: invitation.role,
      },
    });
  } catch (error: any) {
    if (error.message?.includes('Invalid or expired')) {
      res.status(400).json({ success: false, error: { message: error.message } });
      return;
    }
    next(error);
  }
});

export default router;
