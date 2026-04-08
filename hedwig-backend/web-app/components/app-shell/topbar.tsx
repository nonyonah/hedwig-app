'use client';

import { useEffect, useRef, useState } from 'react';
import {
  FileText,
  FolderSimple,
  LinkSimple,
  SidebarSimple,
  User,
} from '@/components/ui/lucide-icons';
import { AccountMenu } from '@/components/app-shell/account-menu';
import { NotificationBell } from '@/components/app-shell/notification-bell';
import { TopbarTitle } from '@/components/app-shell/topbar-title';
import { GlobalSearch } from '@/components/app-shell/global-search';
import { cn } from '@/lib/utils';

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
  const [createOpen, setCreateOpen] = useState(false);
  const createRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!createOpen) return;
    const close = (e: MouseEvent) => {
      if (!createRef.current?.contains(e.target as Node)) setCreateOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [createOpen]);

  const openCreateFlow = (flow: 'invoice' | 'payment-link' | 'client' | 'project') => {
    window.dispatchEvent(new CustomEvent('hedwig:open-create-menu', { detail: { flow } }));
    setCreateOpen(false);
  };

  return (
    <div className="sticky top-0 z-20 flex h-12 shrink-0 items-center justify-between border-b border-[#f2f4f7] bg-white px-4 lg:px-5">
      {/* Left */}
      <div className="flex min-w-0 items-center gap-2.5">
        {collapsed && (
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label="Expand sidebar"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#c1c5cd] transition hover:bg-[#f5f5f5] hover:text-[#717680]"
          >
            <SidebarSimple className="h-3.5 w-3.5" weight="bold" />
          </button>
        )}
        <TopbarTitle />
      </div>

      {/* Right */}
      <div className="flex items-center gap-1.5">
        {/* Create */}
        <div className="relative" ref={createRef}>
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={createOpen}
            aria-label="Create"
            onClick={() => setCreateOpen((p) => !p)}
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-md text-[13px] font-semibold transition',
              createOpen
                ? 'bg-[#f5f5f5] text-[#181d27]'
                : 'text-[#8d9096] hover:bg-[#f5f5f5] hover:text-[#414651]'
            )}
          >
            <span className="text-[16px] leading-none">+</span>
          </button>

          {createOpen && (
            <div className="absolute right-0 top-9 z-50 w-44 overflow-hidden rounded-xl border border-[#f2f4f7] bg-white py-1 shadow-lg shadow-black/5">
              {[
                { flow: 'invoice' as const, label: 'Invoice', Icon: FileText },
                { flow: 'payment-link' as const, label: 'Payment link', Icon: LinkSimple },
                { flow: 'client' as const, label: 'Client', Icon: User },
                { flow: 'project' as const, label: 'Project', Icon: FolderSimple },
              ].map(({ flow, label, Icon }) => (
                <button
                  key={flow}
                  type="button"
                  onClick={() => openCreateFlow(flow)}
                  className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] font-medium text-[#414651] transition hover:bg-[#f9fafb] hover:text-[#181d27]"
                >
                  <Icon className="h-3.5 w-3.5 text-[#c1c5cd]" weight="bold" />
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        <GlobalSearch accessToken={accessToken} />
        <NotificationBell unreadCount={unreadCount} />
        <AccountMenu
          avatarUrl={user.avatarUrl}
          email={user.email}
          fullName={user.fullName}
        />
      </div>
    </div>
  );
}
