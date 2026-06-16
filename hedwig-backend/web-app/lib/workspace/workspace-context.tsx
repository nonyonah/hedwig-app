'use client';

import { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { backendConfig } from '@/lib/auth/config';
import { ACTIVE_WORKSPACE_STORAGE_KEY } from '@/lib/workspace/constants';
import { persistActiveWorkspaceId, readActiveWorkspaceIdFromStorage } from '@/lib/workspace/active-workspace';
import type { Workspace, WorkspaceMember } from '@/lib/models/entities';

export interface WorkspaceWithMembership extends Workspace {
  role: 'owner' | 'admin' | 'member';
  memberCount: number;
}

interface WorkspaceContextValue {
  workspaces: WorkspaceWithMembership[];
  activeWorkspace: WorkspaceWithMembership | null;
  loading: boolean;
  error: string | null;
  accessToken: string | null;
  switchWorkspace: (id: string) => Promise<void>;
  createWorkspace: (name: string, type?: 'personal' | 'organization') => Promise<WorkspaceWithMembership>;
  refresh: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspaceContext() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspaceContext must be used within WorkspaceProvider');
  return ctx;
}

type WorkspaceProviderProps = {
  children: React.ReactNode;
  accessToken: string | null;
  fallbackWorkspace: Workspace;
};

export function WorkspaceProvider({ children, accessToken, fallbackWorkspace }: WorkspaceProviderProps) {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<WorkspaceWithMembership[]>([{
    ...fallbackWorkspace,
    role: 'owner' as const,
    memberCount: 1,
  }]);
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceWithMembership | null>({
    ...fallbackWorkspace,
    role: 'owner' as const,
    memberCount: 1,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef(accessToken);
  const didSetRef = useRef(false);

  // Sync cookie + localStorage before children fetch (client-side).
  if (typeof window !== 'undefined' && !didSetRef.current) {
    didSetRef.current = true;
    const stored = readActiveWorkspaceIdFromStorage();
    if (!stored) {
      persistActiveWorkspaceId(fallbackWorkspace.id);
    }
  }

  useEffect(() => { tokenRef.current = accessToken; }, [accessToken]);

  const applyActiveWorkspace = useCallback((next: WorkspaceWithMembership, reload = false) => {
    persistActiveWorkspaceId(next.id);
    setActiveWorkspace(next);
    if (reload) {
      router.refresh();
      window.dispatchEvent(new CustomEvent('hedwig:workspace-changed', { detail: { workspaceId: next.id } }));
    }
  }, [router]);

  const doFetch = useCallback(async () => {
    if (!tokenRef.current) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${backendConfig.apiBaseUrl}/api/workspaces`, {
        headers: { Authorization: `Bearer ${tokenRef.current}`, 'Content-Type': 'application/json' },
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('Failed to fetch workspaces');
      const body = await res.json();
      const list: WorkspaceWithMembership[] = body.data?.workspaces ?? [];
      if (list.length === 0) return;
      setWorkspaces(list);

      const storedId = readActiveWorkspaceIdFromStorage();
      const target = storedId ? list.find((w) => w.id === storedId) : null;
      const next = target || list.find((w) => w.id === fallbackWorkspace.id) || list[0];
      applyActiveWorkspace(next, false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load workspaces');
    } finally {
      setLoading(false);
    }
  }, [applyActiveWorkspace, fallbackWorkspace.id]);

  useEffect(() => {
    if (accessToken) doFetch();
  }, [accessToken, doFetch]);

  const switchWorkspace = useCallback(async (id: string) => {
    const found = workspaces.find((w) => w.id === id);
    if (!found || found.id === activeWorkspace?.id) return;
    applyActiveWorkspace(found, true);
  }, [workspaces, activeWorkspace?.id, applyActiveWorkspace]);

  const createWorkspace = useCallback(async (name: string, type: 'personal' | 'organization' = 'organization'): Promise<WorkspaceWithMembership> => {
    if (!tokenRef.current) throw new Error('No access token');
    const res = await fetch(`${backendConfig.apiBaseUrl}/api/workspaces`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenRef.current}`,
        'Content-Type': 'application/json',
        'x-workspace-id': readActiveWorkspaceIdFromStorage() ?? fallbackWorkspace.id,
      },
      body: JSON.stringify({ name, type }),
    });
    if (!res.ok) throw new Error('Failed to create workspace');
    const body = await res.json();
    const ws: WorkspaceWithMembership = body.data?.workspace;
    setWorkspaces((prev) => {
      const exists = prev.some((w) => w.id === ws.id);
      return exists ? prev : [...prev, ws];
    });
    applyActiveWorkspace(ws, true);
    return ws;
  }, [applyActiveWorkspace, fallbackWorkspace.id]);

  return (
    <WorkspaceContext.Provider value={{
      workspaces,
      activeWorkspace,
      loading,
      error,
      accessToken: tokenRef.current,
      switchWorkspace,
      createWorkspace,
      refresh: doFetch,
    }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

// Re-export for consumers that still import STORAGE_KEY from context file.
export { ACTIVE_WORKSPACE_STORAGE_KEY as STORAGE_KEY };
