'use client';

import { ReactNode, useEffect, useState } from 'react';
import { AppSidebar } from '@/components/app-shell/sidebar';
import { AppTopbar } from '@/components/app-shell/topbar';
import { TokenRefresher } from '@/components/app-shell/token-refresher';
import { TutorialProvider } from '@/components/tutorial/tutorial-provider';
import { TutorialCard } from '@/components/tutorial/tutorial-card';
import { CreateMenu } from '@/components/app-shell/create-menu';
import { AssistantSidebarProvider } from '@/components/providers/assistant-sidebar-provider';
import { AssistantSidebar } from '@/components/assistant/assistant-sidebar';
import { GlobalPaymentDetailPanel } from '@/components/payments/global-payment-detail-panel';
import { WorkspaceProvider } from '@/lib/workspace/workspace-context';
import { CreateWorkspaceDialog } from '@/components/workspace/create-workspace-dialog';
import { InviteMemberDialog } from '@/components/workspace/invite-member-dialog';
import type { Workspace } from '@/lib/models/entities';

const STORAGE_KEY = 'hedwig-web-sidebar-collapsed';

type ShellLayoutProps = {
  children: ReactNode;
  unreadCount: number;
  isDemo?: boolean;
  accessToken?: string | null;
  lockedRoutes?: string[];
  user: {
    avatarUrl?: string | null;
    email: string;
    fullName: string;
  };
  fallbackWorkspace?: Workspace;
};

export function ShellLayout({ children, unreadCount, user, isDemo, accessToken, lockedRoutes = [], fallbackWorkspace }: ShellLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    setCollapsed(stored === 'true');
  }, []);

  const toggleSidebar = () => {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  };

  return (
    <TutorialProvider isDemo={isDemo}>
      <AssistantSidebarProvider>
        <div className="min-h-screen bg-[var(--color-background)] text-foreground">
          {isDemo && (
            <div className="flex flex-col items-center justify-center gap-2 border-b border-[var(--color-primary-light)] bg-[var(--color-accent-soft)] px-4 py-2 text-center text-[13px] font-medium text-[var(--color-primary-dark)] sm:flex-row">
              <span>Demo mode — sample data only. Explore freely, then start when you are ready.</span>
              <a
                href="/api/auth/exit-demo"
                className="rounded-full bg-[var(--color-accent)] px-3 py-1 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
              >
                Try it for free
              </a>
            </div>
          )}
          <TokenRefresher />
          <WorkspaceProvider
            accessToken={accessToken ?? null}
            fallbackWorkspace={fallbackWorkspace ?? { id: 'ws_personal', name: user.fullName || 'My Workspace', slug: 'my-workspace', type: 'personal', plan: 'beta', timezone: 'UTC' }}
          >
            <div className="flex min-h-screen">
              <AppSidebar
                collapsed={collapsed}
                onToggle={toggleSidebar}
                lockedRoutes={lockedRoutes}
                mobileOpen={mobileSidebarOpen}
                onCloseMobile={() => setMobileSidebarOpen(false)}
              />
              <div className="flex min-w-0 flex-1 flex-col transition-[padding,width] duration-200 ease-out">
                <AppTopbar
                  collapsed={collapsed}
                  onToggleSidebar={toggleSidebar}
                  onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
                  unreadCount={unreadCount}
                  accessToken={accessToken}
                  user={user}
                />
                <main className="flex-1 px-4 py-5 lg:px-6 lg:py-6">{children}</main>
              </div>
              <AssistantSidebar />
            </div>
            <CreateWorkspaceDialog />
            <InviteMemberDialog />
          </WorkspaceProvider>
          <TutorialCard />
          <CreateMenu accessToken={accessToken ?? null} />
          <GlobalPaymentDetailPanel accessToken={accessToken ?? null} />
        </div>
      </AssistantSidebarProvider>
    </TutorialProvider>
  );
}
