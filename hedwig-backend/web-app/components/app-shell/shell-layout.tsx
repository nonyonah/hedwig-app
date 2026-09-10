'use client';

import { ReactNode, useEffect, useState } from 'react';
import { AppSidebar } from '@/components/app-shell/sidebar';
import { AppTopbar } from '@/components/app-shell/topbar';
import { TokenRefresher } from '@/components/app-shell/token-refresher';
import { TutorialProvider } from '@/components/tutorial/tutorial-provider';
import { TutorialCard } from '@/components/tutorial/tutorial-card';
import { CreateMenu } from '@/components/app-shell/create-menu';
import { MoneyActionDialogs } from '@/components/money/money-action-dialogs';
import { WorkspaceProvider } from '@/lib/workspace/workspace-context';
import { CreateWorkspaceDialog } from '@/components/workspace/create-workspace-dialog';

import { InviteMemberDialog } from '@/components/workspace/invite-member-dialog';
import { KycPromptDialog } from '@/components/kyc/kyc-prompt-dialog';
import type { Workspace } from '@/lib/models/entities';

const STORAGE_KEY = 'hedwig-web-sidebar-open';

type ShellLayoutProps = {
  children: ReactNode;
  unreadCount: number;
  isDemo?: boolean;
  accessToken?: string | null;
  lockedRoutes?: string[];
  onrampAllowed?: boolean;
  offrampAllowed?: boolean;
  user: {
    avatarUrl?: string | null;
    email: string;
    fullName: string;
  };
  fallbackWorkspace?: Workspace;
};

export function ShellLayout({ children, unreadCount, user, isDemo, accessToken, lockedRoutes = [], onrampAllowed = true, offrampAllowed = true, fallbackWorkspace }: ShellLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    setSidebarOpen(stored !== 'false');
  }, []);

  const toggleSidebar = () => {
    setSidebarOpen((current) => {
      const next = !current;
      window.localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  };

  return (
    <TutorialProvider isDemo={isDemo}>
        <div className="min-h-screen bg-[var(--color-surface-secondary)] text-foreground">
          <TokenRefresher />
          <WorkspaceProvider
            accessToken={accessToken ?? null}
            fallbackWorkspace={fallbackWorkspace ?? { id: 'ws_personal', name: user.fullName || 'My Workspace', slug: 'my-workspace', type: 'personal', plan: 'beta', timezone: 'UTC' }}
          >
            <div className="flex h-screen overflow-hidden p-[var(--panel-gap)] gap-[var(--panel-gap)]">
              <AppSidebar
                open={sidebarOpen}
                onToggle={toggleSidebar}
                lockedRoutes={lockedRoutes}
                mobileOpen={mobileSidebarOpen}
                onCloseMobile={() => setMobileSidebarOpen(false)}
              />
              <div className="flex min-w-0 flex-1 flex-col overflow-hidden min-h-0 rounded-[var(--panel-radius)] bg-[var(--color-surface)] shadow-lg">
                <AppTopbar
                  sidebarOpen={sidebarOpen}
                  onToggleSidebar={toggleSidebar}
                  onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
                  unreadCount={unreadCount}
                  accessToken={accessToken}
                  user={user}
                  onrampAllowed={onrampAllowed}
                  offrampAllowed={offrampAllowed}
                />
                <main className="flex-1 overflow-y-auto px-5 py-5 lg:px-6 lg:py-6">{children}</main>
              </div>
            </div>
            <CreateWorkspaceDialog />
            <InviteMemberDialog />
          </WorkspaceProvider>
          <TutorialCard />
          <CreateMenu accessToken={accessToken ?? null} />
          <KycPromptDialog accessToken={accessToken ?? null} />
          <MoneyActionDialogs accessToken={accessToken ?? null} workspaceId={fallbackWorkspace?.id ?? null} onrampAllowed={onrampAllowed} offrampAllowed={offrampAllowed} />
        </div>
    </TutorialProvider>
  );
}
