'use client';

import { ReactNode, useEffect, useState } from 'react';
import { AppSidebar } from '@/components/app-shell/sidebar';
import { AppTopbar } from '@/components/app-shell/topbar';
import { TokenRefresher } from '@/components/app-shell/token-refresher';
import { TutorialProvider } from '@/components/tutorial/tutorial-provider';
import { TutorialCard } from '@/components/tutorial/tutorial-card';
import { CreateMenu } from '@/components/app-shell/create-menu';
import { AssistantChatLauncher } from '@/components/assistant/assistant-chat-launcher';
import { GlobalPaymentDetailPanel } from '@/components/payments/global-payment-detail-panel';

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
};

export function ShellLayout({ children, unreadCount, user, isDemo, accessToken, lockedRoutes = [] }: ShellLayoutProps) {
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
      <div className="min-h-screen bg-[#fafafa] text-foreground">
        {isDemo && (
          <div className="flex flex-col items-center justify-center gap-2 border-b border-[#bfdbfe] bg-[#eff6ff] px-4 py-2 text-center text-[13px] font-medium text-[#1d4ed8] sm:flex-row">
            <span>Demo mode — sample data only. Explore freely, then start when you are ready.</span>
            <a
              href="/api/auth/exit-demo"
              className="rounded-full bg-[#2563eb] px-3 py-1 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              Start free when ready
            </a>
          </div>
        )}
        <TokenRefresher />
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
        </div>
        <TutorialCard />
        <CreateMenu accessToken={accessToken ?? null} />
        <GlobalPaymentDetailPanel accessToken={accessToken ?? null} />
        {!isDemo && <AssistantChatLauncher />}
      </div>
    </TutorialProvider>
  );
}
