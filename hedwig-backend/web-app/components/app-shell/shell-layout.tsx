'use client';

import { ReactNode, useEffect, useState } from 'react';
import { AppSidebar } from '@/components/app-shell/sidebar';
import { AppTopbar } from '@/components/app-shell/topbar';
import { TokenRefresher } from '@/components/app-shell/token-refresher';

const STORAGE_KEY = 'hedwig-web-sidebar-collapsed';

type ShellLayoutProps = {
  children: ReactNode;
  unreadCount: number;
  user: {
    avatarUrl?: string | null;
    email: string;
    fullName: string;
  };
};

export function ShellLayout({ children, unreadCount, user }: ShellLayoutProps) {
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
    <div className="min-h-screen bg-[#fafafa] text-foreground">
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
    </div>
  );
}
