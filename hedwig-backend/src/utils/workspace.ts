import type { Request } from 'express';
import { WorkspaceService } from '../services/workspace';

/**
 * Resolve the workspace for this request, validating membership.
 * Falls back to the user's personal workspace when the header is missing or invalid.
 */
export async function getEffectiveWorkspaceId(req: Request, userId: string): Promise<string> {
  const headerWs = req.headers['x-workspace-id'] as string | undefined;
  const resolved = await WorkspaceService.getEffectiveWorkspace(userId, headerWs);
  if (resolved?.id) return resolved.id;
  return `ws_personal_${userId}`;
}
