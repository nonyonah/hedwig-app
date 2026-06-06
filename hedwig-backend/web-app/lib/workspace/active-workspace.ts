import { ACTIVE_WORKSPACE_COOKIE_MAX_AGE, ACTIVE_WORKSPACE_STORAGE_KEY } from '@/lib/workspace/constants';

/** Persist active workspace for client fetches (localStorage) and SSR (cookie). */
export function persistActiveWorkspaceId(workspaceId: string) {
  if (typeof window === 'undefined') return;

  window.localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, workspaceId);
  document.cookie = `${ACTIVE_WORKSPACE_STORAGE_KEY}=${encodeURIComponent(workspaceId)}; path=/; max-age=${ACTIVE_WORKSPACE_COOKIE_MAX_AGE}; SameSite=Lax`;
}

export function readActiveWorkspaceIdFromStorage(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY);
}
