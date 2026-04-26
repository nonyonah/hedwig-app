import type { User } from '@/lib/models/entities';

export const AUTH_CHECK_COOKIE = 'hedwig_auth_checked_at';
export const AUTH_SESSION_REVALIDATE_MS = 10 * 60 * 1000;
export const AUTH_SESSION_REVALIDATE_SECONDS = Math.floor(AUTH_SESSION_REVALIDATE_MS / 1000);
export const AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export const authCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: AUTH_COOKIE_MAX_AGE_SECONDS,
  path: '/'
};

export const authCheckCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: AUTH_SESSION_REVALIDATE_SECONDS,
  path: '/'
};

export const clearAuthCookieOptions = {
  expires: new Date(0),
  path: '/',
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const
};

export function isRecentAuthCheck(rawValue?: string | null, now = Date.now()): boolean {
  const checkedAt = Number(rawValue);

  if (!Number.isFinite(checkedAt) || checkedAt <= 0) {
    return false;
  }

  return now - checkedAt < AUTH_SESSION_REVALIDATE_MS;
}

export function parseStoredUser(rawValue?: string | null): User | null {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<User>;

    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    if (typeof parsed.id !== 'string' || typeof parsed.email !== 'string') {
      return null;
    }

    return {
      id: parsed.id,
      privyId: typeof parsed.privyId === 'string' ? parsed.privyId : '',
      workspaceId: typeof parsed.workspaceId === 'string' ? parsed.workspaceId : 'hedwig',
      email: parsed.email,
      firstName: typeof parsed.firstName === 'string' ? parsed.firstName : '',
      lastName: typeof parsed.lastName === 'string' ? parsed.lastName : '',
      role: parsed.role === 'member' ? 'member' : 'owner',
      avatarUrl: typeof parsed.avatarUrl === 'string' ? parsed.avatarUrl : undefined,
      ethereumWalletAddress:
        typeof parsed.ethereumWalletAddress === 'string' ? parsed.ethereumWalletAddress : undefined,
      solanaWalletAddress:
        typeof parsed.solanaWalletAddress === 'string' ? parsed.solanaWalletAddress : undefined,
      monthlyTarget: typeof parsed.monthlyTarget === 'number' ? parsed.monthlyTarget : undefined
    };
  } catch {
    return null;
  }
}
