import { ReactNode, Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/lib/auth/session';
import { hedwigApi } from '@/lib/api/client';
import { ShellLayout } from '@/components/app-shell/shell-layout';

function ShellSkeleton() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-surface-secondary)]">
      <div
        className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-primary)]"
        role="status"
        aria-label="Loading"
      />
    </div>
  );
}

async function ShellDataLoader({
  session,
  children,
}: {
  session: Awaited<ReturnType<typeof getCurrentSession>>;
  children: ReactNode;
}) {
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

  const fallbackWorkspace = {
    id: shellUser?.id ? `ws_personal_${shellUser.id}` : 'ws_personal',
    name: fallbackFullName,
    slug: fallbackFullName.toLowerCase().replace(/\s+/g, '-'),
    type: 'personal' as const,
    plan: 'beta' as const,
    timezone: 'UTC',
  };

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
      fallbackWorkspace={fallbackWorkspace}
    >
      {children}
    </ShellLayout>
  );
}

export async function ProtectedShell({ children }: { children: ReactNode }) {
  const session = await getCurrentSession();
  if (!session.accessToken) redirect('/sign-in');

  return (
    <Suspense fallback={<ShellSkeleton />}>
      <ShellDataLoader session={session}>{children}</ShellDataLoader>
    </Suspense>
  );
}
