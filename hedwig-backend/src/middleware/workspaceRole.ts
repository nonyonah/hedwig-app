import { Request } from 'express';
import { WorkspaceService } from '../services/workspace';
import { supabase } from '../lib/supabase';

function getEffectiveWorkspaceId(req: Request, userId: string): string {
  return (req.headers['x-workspace-id'] as string) || `ws_personal_${userId}`;
}

export async function getWorkspaceRole(req: Request, userId: string): Promise<string | null> {
  const wsId = getEffectiveWorkspaceId(req, userId);
  const membership = await WorkspaceService.getMembership(wsId, userId);
  return membership?.role || null;
}

export function requireRole(actual: string | null, ...roles: string[]): boolean {
  return !!actual && roles.includes(actual);
}

export function isOwnerOrAdmin(role: string | null): boolean {
  return role === 'owner' || role === 'admin';
}

export async function getMemberAssignedProjectIds(
  userId: string,
  workspaceRole: string | null,
  workspaceId: string
): Promise<string[] | null> {
  if (isOwnerOrAdmin(workspaceRole)) return null;

  const { data } = await supabase
    .from('workspace_project_assignments')
    .select('project_id')
    .eq('user_id', userId)
    .eq('workspace_id', workspaceId);

  return (data || []).map((r) => r.project_id);
}
