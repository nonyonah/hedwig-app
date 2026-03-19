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

export async function verifyAccessToken(token: string): Promise<User | null> {
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

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as AuthMeResponse;

    if (!payload?.success) {
      return null;
    }

    return mapVerifiedUser(payload);
  } catch {
    return null;
  }
}
