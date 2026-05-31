'use client';

import { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
import { backendConfig } from '@/lib/auth/config';
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
  createWorkspace: (name: string) => Promise<WorkspaceWithMembership>;
  refresh: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

const STORAGE_KEY = 'hedwig-web-active-workspace';

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

  useEffect(() => { tokenRef.current = accessToken; }, [accessToken]);

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

      const storedId = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
      const target = storedId ? list.find((w) => w.id === storedId) : null;
      const next = target || list[0];
      setActiveWorkspace(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load workspaces');
    } finally {
      setLoading(false);
    }
  }, []);

  const switchWorkspace = useCallback(async (id: string) => {
    const found = workspaces.find((w) => w.id === id);
    if (found) {
      window.localStorage.setItem(STORAGE_KEY, id);
      setActiveWorkspace(found);
    }
  }, [workspaces]);

  const createWorkspace = useCallback(async (name: string): Promise<WorkspaceWithMembership> => {
    if (!tokenRef.current) throw new Error('No access token');
    const res = await fetch(`${backendConfig.apiBaseUrl}/api/workspaces`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenRef.current}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error('Failed to create workspace');
    const body = await res.json();
    const ws: WorkspaceWithMembership = body.data?.workspace;
    setWorkspaces((prev) => {
      const exists = prev.some((w) => w.id === ws.id);
      return exists ? prev : [...prev, ws];
    });
    window.localStorage.setItem(STORAGE_KEY, ws.id);
    setActiveWorkspace(ws);
    return ws;
  }, []);

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
