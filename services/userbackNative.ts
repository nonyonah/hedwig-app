import { NativeModules, Platform } from 'react-native';

type UserbackUserData = {
  id: string;
  info: {
    name: string;
    email: string;
  };
};

type UserbackNativeModule = {
  start: (options: { accessToken: string; userData?: UserbackUserData }) => Promise<boolean>;
  openForm: (mode?: string) => Promise<boolean>;
  close: () => Promise<boolean>;
  isAvailable: () => Promise<boolean>;
};

function resolveIdentity(user: any): UserbackUserData | null {
  if (!user) return null;

  const email = String(
    user?.email?.address ||
      user?.google?.email ||
      user?.apple?.email ||
      (Array.isArray(user?.linkedAccounts)
        ? user.linkedAccounts.find((account: any) => account?.type === 'email')?.address
        : '') ||
      user?.email ||
      ''
  ).trim();
  if (!email) return null;

  const name = String(
    user?.google?.name ||
      [user?.apple?.firstName, user?.apple?.lastName].filter(Boolean).join(' ') ||
      [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
      email
  ).trim();

  const id = String(user?.id || email).trim();
  if (!id || !name) return null;

  return {
    id,
    info: {
      name,
      email,
    },
  };
}

function getModule(): UserbackNativeModule | null {
  return (NativeModules.UserbackModule as UserbackNativeModule | undefined) ?? null;
}

export async function openUserbackFeedback(user: any): Promise<boolean> {
  if (Platform.OS === 'web') {
    return false;
  }

  const module = getModule();
  const accessToken = String(process.env.EXPO_PUBLIC_USERBACK_TOKEN || '').trim();

  if (!module || !accessToken) {
    return false;
  }

  try {
    const identity = resolveIdentity(user);
    await module.start({
      accessToken,
      userData: identity ?? undefined,
    });
    await module.openForm('general');
    return true;
  } catch (error) {
    console.error('Failed to open Userback native widget:', error);
    return false;
  }
}
