import { cache } from 'react';
import { cookies } from 'next/headers';
import { AUTH_CHECK_COOKIE, isRecentAuthCheck, parseStoredUser } from '@/lib/auth/cookies';
import { backendConfig } from '@/lib/auth/config';
import type { User } from '@/lib/models/entities';
import { currentUser } from '@/lib/mock/data';
import { verifyAccessToken } from '@/lib/auth/verify';

export interface HedwigSession {
  user: User | null;
  workspaceId: string | null;
  accessToken: string | null;
  isMockSession: boolean;
}

export const getCurrentSession = cache(async (): Promise<HedwigSession> => {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get('hedwig_access_token')?.value ?? null;
  const storedUser = parseStoredUser(cookieStore.get('hedwig_user')?.value ?? null);
  const recentAuthCheck = isRecentAuthCheck(cookieStore.get(AUTH_CHECK_COOKIE)?.value ?? null);
  const isDemo = cookieStore.get('hedwig_demo')?.value === 'true';

  if (isDemo || backendConfig.useMockAuth) {
    return {
      user: currentUser,
      workspaceId: currentUser.workspaceId,
      accessToken: isDemo ? 'demo' : accessToken,
      isMockSession: true
    };
  }

  if (!accessToken) {
    return {
      user: null,
      workspaceId: null,
      accessToken: null,
      isMockSession: false
    };
  }

  if (storedUser && recentAuthCheck) {
    return {
      user: storedUser,
      workspaceId: storedUser.workspaceId ?? null,
      accessToken,
      isMockSession: false
    };
  }

  const verifiedUser = await verifyAccessToken(accessToken);

  // Backend unreachable — keep the token alive so the user isn't kicked out
  // during transient outages or right after a deployment restart.
  if (verifiedUser === 'network_error') {
    return {
      user: storedUser,
      workspaceId: storedUser?.workspaceId ?? null,
      accessToken,
      isMockSession: false
    };
  }

  // Definitively rejected (401/403) — clear the token
  if (!verifiedUser) {
    return {
      user: null,
      workspaceId: null,
      accessToken: null,
      isMockSession: false
    };
  }

  return {
    user: verifiedUser,
    workspaceId: verifiedUser.workspaceId ?? null,
    accessToken,
    isMockSession: false
  };
});
