'use client';

import { useEffect, useRef, useState } from 'react';
import {
  FileText,
  FolderSimple,
  LinkSimple,
  NotePencil,
  SidebarSimple,
  User,
} from '@/components/ui/lucide-icons';
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
  const [createOpen, setCreateOpen] = useState(false);
  const createRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!createOpen) return;
    const closeOnOutside = (event: MouseEvent) => {
      if (!createRef.current?.contains(event.target as Node)) {
        setCreateOpen(false);
      }
    };
    window.addEventListener('mousedown', closeOnOutside);
    return () => window.removeEventListener('mousedown', closeOnOutside);
  }, [createOpen]);

  const openCreateFlow = (flow: 'invoice' | 'payment-link' | 'client' | 'project') => {
    window.dispatchEvent(new CustomEvent('hedwig:open-create-menu', { detail: { flow } }));
    setCreateOpen(false);
  };

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
        <div className="relative" ref={createRef}>
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={createOpen}
            aria-label="Create"
            onClick={() => setCreateOpen((prev) => !prev)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-[#d5d7da] bg-white text-[#525866] shadow-xs transition hover:bg-[#fafafa] hover:text-[#252b37]"
          >
            <NotePencil className="h-4 w-4" weight="bold" />
          </button>

          {createOpen && (
            <div className="absolute right-0 top-11 z-50 w-56 overflow-hidden rounded-2xl border border-[#e9eaeb] bg-white shadow-xl ring-1 ring-black/5 animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-200">
              <button
                type="button"
                onClick={() => openCreateFlow('invoice')}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[13px] font-medium text-[#181d27] transition hover:bg-[#f9fafb]"
              >
                <FileText className="h-4 w-4 text-[#717680]" weight="bold" />
                Invoice
              </button>
              <button
                type="button"
                onClick={() => openCreateFlow('payment-link')}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[13px] font-medium text-[#181d27] transition hover:bg-[#f9fafb]"
              >
                <LinkSimple className="h-4 w-4 text-[#717680]" weight="bold" />
                Payment Link
              </button>
              <button
                type="button"
                onClick={() => openCreateFlow('client')}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[13px] font-medium text-[#181d27] transition hover:bg-[#f9fafb]"
              >
                <User className="h-4 w-4 text-[#717680]" weight="bold" />
                Client
              </button>
              <button
                type="button"
                onClick={() => openCreateFlow('project')}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[13px] font-medium text-[#181d27] transition hover:bg-[#f9fafb]"
              >
                <FolderSimple className="h-4 w-4 text-[#717680]" weight="bold" />
                Project
              </button>
            </div>
          )}
        </div>
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
