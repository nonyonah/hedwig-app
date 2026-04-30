'use client';

import { ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { AppSidebar } from '@/components/app-shell/sidebar';
import { AppTopbar } from '@/components/app-shell/topbar';
import { TokenRefresher } from '@/components/app-shell/token-refresher';
import { TutorialProvider } from '@/components/tutorial/tutorial-provider';
import { TutorialCard } from '@/components/tutorial/tutorial-card';
import { CreateMenu } from '@/components/app-shell/create-menu';
import { AssistantChatLauncher } from '@/components/assistant/assistant-chat-launcher';

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
          <div className="flex items-center justify-center gap-3 border-b border-[#bfdbfe] bg-[#eff6ff] px-4 py-2 text-center text-[13px] font-medium text-[#1d4ed8]">
            <span>Demo mode — sample data only.</span>
            <Link
              href="/sign-in"
              className="rounded-full bg-[#2563eb] px-3 py-0.5 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              Sign in
            </Link>
          </div>
        )}
        <TokenRefresher />
        <div className="flex min-h-screen">
          <AppSidebar collapsed={collapsed} onToggle={toggleSidebar} lockedRoutes={lockedRoutes} />
          <div className="flex min-w-0 flex-1 flex-col transition-[padding,width] duration-200 ease-out">
            <AppTopbar
              collapsed={collapsed}
              onToggleSidebar={toggleSidebar}
              unreadCount={unreadCount}
              accessToken={accessToken}
              user={user}
            />
            <main className="flex-1 px-4 py-5 lg:px-6 lg:py-6">{children}</main>
          </div>
        </div>
        <TutorialCard />
        <CreateMenu accessToken={accessToken ?? null} />
        {!isDemo && <AssistantChatLauncher />}
      </div>
    </TutorialProvider>
  );
}
