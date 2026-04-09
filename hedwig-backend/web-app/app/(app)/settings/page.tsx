import { getCurrentSession } from '@/lib/auth/session';
import { SettingsClient } from '@/components/preferences/settings-page-client';

export default async function SettingsPage() {
  const session = await getCurrentSession();
  const user = session.user;

  return (
    <SettingsClient
      accessToken={session.accessToken}
      initialUser={{
        firstName: user?.firstName ?? '',
        lastName: user?.lastName ?? '',
        email: user?.email ?? '',
        avatarUrl: user?.avatarUrl ?? null
      }}
    />
  );
}
