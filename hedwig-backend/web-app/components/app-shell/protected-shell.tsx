import { ReactNode, Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/lib/auth/session';
import { hedwigApi } from '@/lib/api/client';
import { getRequestRegionLockDecision } from '@/lib/region-lock';
import { ShellLayout } from '@/components/app-shell/shell-layout';

function ShellSkeleton() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-12 items-center justify-between border-b border-[var(--color-border-light)] bg-[var(--color-background)] px-4">
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 rounded bg-[var(--color-surface-tertiary)] animate-pulse" />
          <div className="h-3 w-24 rounded bg-[var(--color-surface-tertiary)] animate-pulse" />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-7 w-48 rounded-full bg-[var(--color-surface-tertiary)] animate-pulse" />
          <div className="h-7 w-7 rounded-full bg-[var(--color-surface-tertiary)] animate-pulse" />
        </div>
      </header>
      <div className="flex flex-1">
        <aside className="hidden w-[60px] border-r border-[var(--color-border-light)] bg-[var(--color-background)] lg:flex lg:flex-col lg:items-center lg:gap-2 lg:px-3 lg:py-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-4 w-4 rounded bg-[var(--color-surface-tertiary)] animate-pulse" />
          ))}
        </aside>
        <main className="flex-1 p-6">
          <div className="space-y-3">
            <div className="h-5 w-48 rounded bg-[var(--color-surface-tertiary)] animate-pulse" />
            <div className="h-3 w-72 rounded bg-[var(--color-surface-tertiary)] animate-pulse" />
            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-32 rounded-2xl bg-[var(--color-surface)] animate-pulse ring-1 ring-[var(--color-border)]" />
              ))}
            </div>
          </div>
        </main>
      </div>
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
  const lockedRoutes: string[] = [];

  try {
    const [shell, offrampGeo] = await Promise.all([
      hedwigApi.shell({ accessToken: session.accessToken }),
      getRequestRegionLockDecision('offramp').catch(() => ({ allowed: false })),
    ]);
    shellUser = shell.currentUser;
    unreadCount = shell.unreadCount;

    if (!offrampGeo.allowed) {
      lockedRoutes.push('/offramp');
    }
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
      lockedRoutes={lockedRoutes}
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
