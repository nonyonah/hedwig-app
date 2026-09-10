import type { Request } from 'express';
import { getOrCreateUser } from './userHelper';
import { getEffectiveWorkspaceId } from './workspace';

export interface RequestIdentity {
  /** Privy DID from the auth token (req.user.id). */
  privyDid: string;
  /** Internal Supabase users.id — the canonical key used by all legacy routes. */
  internalId: string;
  /** Effective workspace, resolved with the internal id (org UUID or personal bucket). */
  workspaceId: string;
  /**
   * Extra workspace/owner ids to tolerate on reads: rows written before the
   * identity fix used the Privy DID directly (ws_personal_<privyDid>). Only
   * populated on the personal path — org reads stay strictly scoped.
   */
  legacyOwnerIds: string[];
  legacyWorkspaceIds: string[];
  /** Full user row (email, names, phone, wallets) — reuse instead of refetching. */
  user: Record<string, unknown>;
}

/**
 * Resolve the dual identity (Privy DID vs internal user id) the way legacy
 * routes do: convert via getOrCreateUser first, then resolve the workspace
 * with the INTERNAL id. Reads should tolerate legacy DID-keyed rows;
 * all new writes use the internal id + canonical workspace.
 */
export async function resolveRequestIdentity(req: Request): Promise<RequestIdentity> {
  const privyDid = req.user!.id;
  const appUser = (await getOrCreateUser(privyDid)) as unknown as { id: string } & Record<string, unknown>;
  const internalId = appUser.id;

  const headerWs = req.headers['x-workspace-id'] as string | undefined;
  const isOrgPath = !!headerWs && !headerWs.startsWith('ws_personal_');

  const workspaceId = isOrgPath ? headerWs! : await getEffectiveWorkspaceId(req, internalId);

  const legacyOwnerIds: string[] = [];
  const legacyWorkspaceIds: string[] = [];
  if (!isOrgPath) {
    if (privyDid !== internalId) legacyOwnerIds.push(privyDid);
    const legacyWs = await getEffectiveWorkspaceId(req, privyDid);
    if (legacyWs !== workspaceId) legacyWorkspaceIds.push(legacyWs);
  }

  return { privyDid, internalId, workspaceId, legacyOwnerIds, legacyWorkspaceIds, user: appUser };
}

/** Owner ids to match on reads (canonical + legacy). */
export function ownerScope(identity: RequestIdentity): string[] {
  return [identity.internalId, ...identity.legacyOwnerIds];
}

/** Workspace ids to match on reads (canonical + legacy personal buckets). */
export function workspaceScope(identity: RequestIdentity): string[] {
  return [identity.workspaceId, ...identity.legacyWorkspaceIds];
}
