import { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/lib/auth/session';
import { hedwigApi } from '@/lib/api/client';
import { getRequestRegionLockDecision } from '@/lib/region-lock';
import { ShellLayout } from '@/components/app-shell/shell-layout';

export async function ProtectedShell({ children }: { children: ReactNode }) {
  const session = await getCurrentSession();
  if (!session.accessToken) redirect('/sign-in');
  const shell = await hedwigApi.shell({ accessToken: session.accessToken });
  const user = shell.currentUser;
  const offrampAccess = await getRequestRegionLockDecision('offramp');

  return (
    <ShellLayout
      unreadCount={shell.unreadCount}
      isDemo={session.isMockSession}
      accessToken={session.accessToken}
      lockedRoutes={offrampAccess.allowed ? [] : ['/offramp']}
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
