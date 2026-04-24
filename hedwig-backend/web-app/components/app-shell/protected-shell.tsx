import { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/lib/auth/session';
import { hedwigApi } from '@/lib/api/client';
import { ShellLayout } from '@/components/app-shell/shell-layout';

export async function ProtectedShell({ children }: { children: ReactNode }) {
  const session = await getCurrentSession();
  if (!session.accessToken) redirect('/sign-in');

  let shellUser = session.user;
  let unreadCount = 0;

  try {
    const shell = await hedwigApi.shell({ accessToken: session.accessToken });
    shellUser = shell.currentUser;
    unreadCount = shell.unreadCount;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[ProtectedShell] Failed to preload shell data:', message);
  }

  const fallbackEmail = shellUser?.email ?? 'account@hedwig.local';
  const fallbackFullName = `${shellUser?.firstName ?? ''} ${shellUser?.lastName ?? ''}`.trim() || fallbackEmail;

  return (
    <ShellLayout
      unreadCount={unreadCount}
      isDemo={session.isMockSession}
      accessToken={session.accessToken}
      lockedRoutes={[]}
      user={{
        avatarUrl: shellUser?.avatarUrl,
        email: fallbackEmail,
        fullName: fallbackFullName
      }}
    >
      {children}
    </ShellLayout>
  );
}
