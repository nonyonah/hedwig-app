'use client';

import { useEffect, useRef, useState } from 'react';
import {
  FileText,
  FolderSimple,
  LinkSimple,
  CaretDown,
  Plus,
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
    <div className="sticky top-0 z-20 flex h-12 shrink-0 items-center justify-between border-b border-[#f3f4f6] bg-[#fcfcfd]/95 px-4 backdrop-blur-sm lg:px-5">
      {/* Left */}
      <div className="flex min-w-0 items-center gap-2.5">
        {collapsed && (
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label="Expand sidebar"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#c1c5cd] transition hover:bg-[#f4f5f7] hover:text-[#717680]"
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
              'flex h-9 items-center justify-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold shadow-sm transition',
              createOpen
                ? 'border-[#1d4ed8] bg-[#1d4ed8] text-white shadow-[#2563eb]/20'
                : 'border-[#2563eb] bg-[#2563eb] text-white shadow-[#2563eb]/20 hover:border-[#1d4ed8] hover:bg-[#1d4ed8]'
            )}
          >
            <Plus className="h-4 w-4" weight="bold" />
            <span className="hidden sm:inline">Create</span>
            <CaretDown className={cn('hidden h-3.5 w-3.5 transition sm:block', createOpen && 'rotate-180')} weight="bold" />
          </button>

          {createOpen && (
            <div className="absolute right-0 top-9 z-50 w-44 overflow-hidden rounded-xl border border-[#f3f4f6] bg-white py-1 shadow-lg shadow-black/5">
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
                  className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] font-medium text-[#414651] transition hover:bg-[#f8f9fb] hover:text-[#181d27]"
                >
                  <Icon className="h-3.5 w-3.5 text-[#c1c5cd]" weight="bold" />
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        <GlobalSearch accessToken={accessToken} />
        <NotificationBell unreadCount={unreadCount} accessToken={accessToken ?? null} />
        <AccountMenu
          avatarUrl={user.avatarUrl}
          email={user.email}
          fullName={user.fullName}
        />
      </div>
    </div>
  );
}
