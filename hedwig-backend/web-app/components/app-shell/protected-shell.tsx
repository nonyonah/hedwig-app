import { ReactNode } from 'react';
import { getCurrentSession } from '@/lib/auth/session';
import { hedwigApi } from '@/lib/api/client';
import { ShellLayout } from '@/components/app-shell/shell-layout';

export async function ProtectedShell({ children }: { children: ReactNode }) {
  const session = await getCurrentSession();
  const shell = await hedwigApi.shell({ accessToken: session.accessToken });
  const user = shell.currentUser;

  return (
    <ShellLayout
      unreadCount={shell.unreadCount}
      isDemo={session.isMockSession}
      user={{
        avatarUrl: user.avatarUrl,
        email: user.email,
        fullName: `${user.firstName} ${user.lastName}`.trim() || user.email
      }}
    >
      {children}
    </ShellLayout>
  );
}
