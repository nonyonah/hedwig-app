'use client';

import { ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { AppSidebar } from '@/components/app-shell/sidebar';
import { AppTopbar } from '@/components/app-shell/topbar';
import { TokenRefresher } from '@/components/app-shell/token-refresher';
import { TutorialProvider } from '@/components/tutorial/tutorial-provider';
import { TutorialCard } from '@/components/tutorial/tutorial-card';

const STORAGE_KEY = 'hedwig-web-sidebar-collapsed';

type ShellLayoutProps = {
  children: ReactNode;
  unreadCount: number;
  isDemo?: boolean;
  user: {
    avatarUrl?: string | null;
    email: string;
    fullName: string;
  };
};

export function ShellLayout({ children, unreadCount, user, isDemo }: ShellLayoutProps) {
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
          <div className="flex items-center justify-center gap-3 bg-[#2563eb] px-4 py-2 text-center text-sm font-medium text-white">
            <span>You are viewing a demo. Data shown is sample data only.</span>
            <Link
              href="/sign-in"
              className="rounded-full bg-white px-3 py-0.5 text-xs font-semibold text-[#2563eb] transition-opacity hover:opacity-90"
            >
              Sign in
            </Link>
          </div>
        )}
        <TokenRefresher />
        <div className="flex min-h-screen">
          <AppSidebar collapsed={collapsed} onToggle={toggleSidebar} />
          <div className="flex min-w-0 flex-1 flex-col transition-[padding,width] duration-200 ease-out">
            <AppTopbar
              collapsed={collapsed}
              onToggleSidebar={toggleSidebar}
              unreadCount={unreadCount}
              user={user}
            />
            <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
          </div>
        </div>
        <TutorialCard />
      </div>
    </TutorialProvider>
  );
}
