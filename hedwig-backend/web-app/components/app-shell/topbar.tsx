'use client';

import { SidebarSimple } from '@phosphor-icons/react/dist/ssr';
import { AccountMenu } from '@/components/app-shell/account-menu';
import { NotificationBell } from '@/components/app-shell/notification-bell';
import { TopbarTitle } from '@/components/app-shell/topbar-title';
import { GlobalSearch } from '@/components/app-shell/global-search';

type AppTopbarProps = {
  collapsed: boolean;
  onToggleSidebar: () => void;
  unreadCount: number;
  accessToken?: string | null;
  user: {
    avatarUrl?: string | null;
    email: string;
    fullName: string;
  };
};

export function AppTopbar({ collapsed, onToggleSidebar, unreadCount, accessToken, user }: AppTopbarProps) {
  return (
    <div className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between border-b border-[#e9eaeb] bg-white px-4 lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        {collapsed ? (
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label="Expand sidebar"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#e9eaeb] bg-white text-[#8d9096] transition hover:bg-[#fafafa] hover:text-[#525866]"
          >
            <SidebarSimple className="h-4 w-4" weight="bold" />
          </button>
        ) : null}
        <TopbarTitle />
      </div>

      <div className="flex items-center gap-3">
        <GlobalSearch accessToken={accessToken} />
        <div className="flex items-center gap-1">
          <NotificationBell unreadCount={unreadCount} />
          <AccountMenu
            avatarUrl={user.avatarUrl}
            email={user.email}
            fullName={user.fullName}
          />
        </div>
      </div>
    </div>
  );
}
