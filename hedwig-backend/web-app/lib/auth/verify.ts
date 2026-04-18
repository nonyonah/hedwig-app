import type { User } from '@/lib/models/entities';

const BACKEND_DIRECT_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://pay.hedwigbot.xyz';

interface AuthMeResponse {
  success?: boolean;
  data?: {
    user?: {
      id?: string;
      email?: string;
      firstName?: string;
      lastName?: string;
      avatar?: string;
      avatarUrl?: string;
      ethereumWalletAddress?: string;
      solanaWalletAddress?: string;
    };
  };
}

function mapVerifiedUser(payload: AuthMeResponse): User | null {
  const user = payload?.data?.user;

  if (!user?.id || !user?.email) {
    return null;
  }

  return {
    id: user.id,
    privyId: '',
    workspaceId: 'hedwig',
    email: user.email,
    firstName: user.firstName ?? '',
    lastName: user.lastName ?? '',
    role: 'owner',
    avatarUrl: user.avatarUrl ?? user.avatar,
    ethereumWalletAddress: user.ethereumWalletAddress,
    solanaWalletAddress: user.solanaWalletAddress
  };
}

// 'network_error' means the backend was unreachable — don't sign the user out.
// null means the token was definitively rejected (401/403).
export async function verifyAccessToken(token: string): Promise<User | null | 'network_error'> {
  if (!token) {
    return null;
  }

  try {
    const response = await fetch(`${BACKEND_DIRECT_URL}/api/auth/me`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`
      },
      cache: 'no-store'
    });

    // Definitive rejection — token is bad
    if (response.status === 401 || response.status === 403) {
      return null;
    }

    // Server error (5xx) or unexpected status — fail open
    if (!response.ok) {
      return 'network_error';
    }

    const payload = (await response.json()) as AuthMeResponse;

    if (!payload?.success) {
      return null;
    }

    return mapVerifiedUser(payload);
  } catch {
    // Network error (backend unreachable, timeout, DNS failure, etc.) — fail open
    return 'network_error';
  }
}
