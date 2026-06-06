import { cookies } from 'next/headers';
import { ACTIVE_WORKSPACE_STORAGE_KEY } from '@/lib/workspace/constants';
import type { ApiOptions } from '@/lib/api/client';

/** Workspace-aware API options for React Server Components. */
export async function workspaceApiOptions(accessToken: string | null | undefined): Promise<ApiOptions> {
  const cookieStore = await cookies();
  const workspaceId = cookieStore.get(ACTIVE_WORKSPACE_STORAGE_KEY)?.value ?? undefined;

  return {
    accessToken,
    workspaceId,
  };
}
