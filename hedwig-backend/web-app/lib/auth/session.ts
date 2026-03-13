import { cache } from 'react';
import { cookies } from 'next/headers';
import { backendConfig } from '@/lib/auth/config';
import type { User } from '@/lib/models/entities';
import { currentUser } from '@/lib/mock/data';

export interface HedwigSession {
  user: User | null;
  workspaceId: string | null;
  accessToken: string | null;
  isMockSession: boolean;
}

const parseUserCookie = (rawValue: string | undefined): User | null => {
  if (!rawValue) return null;

  try {
    const parsed = JSON.parse(rawValue) as Partial<User>;
    if (!parsed?.id || !parsed?.email) return null;

    return {
      id: parsed.id,
      privyId: parsed.privyId ?? '',
      workspaceId: parsed.workspaceId ?? 'hedwig',
      email: parsed.email,
      firstName: parsed.firstName ?? '',
      lastName: parsed.lastName ?? '',
      role: parsed.role ?? 'owner',
      avatarUrl: parsed.avatarUrl
    };
  } catch {
    return null;
  }
};

export const getCurrentSession = cache(async (): Promise<HedwigSession> => {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get('hedwig_access_token')?.value ?? null;
  const cookieUser = parseUserCookie(cookieStore.get('hedwig_user')?.value);

  if (backendConfig.useMockAuth) {
    return {
      user: currentUser,
      workspaceId: currentUser.workspaceId,
      accessToken,
      isMockSession: true
    };
  }

  return {
    user: cookieUser,
    workspaceId: cookieUser?.workspaceId ?? null,
    accessToken,
    isMockSession: false
  };
});
