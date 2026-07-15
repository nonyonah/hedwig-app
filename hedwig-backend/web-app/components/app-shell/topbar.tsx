'use client';

import { useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import {
  FileText,
  FolderSimple,
  LinkSimple,
  CaretDown,
  Moon,
  Plus,
  SidebarSimple,
  Sparkle,
  Sun,
  User,
} from '@/components/ui/lucide-icons';
import { AccountMenu } from '@/components/app-shell/account-menu';
import { NotificationBell } from '@/components/app-shell/notification-bell';
import { TopbarTitle } from '@/components/app-shell/topbar-title';
import { GlobalSearch } from '@/components/app-shell/global-search';
import { cn } from '@/lib/utils';
import { useWorkspaceContext } from '@/lib/workspace/workspace-context';

type AppTopbarProps = {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onOpenMobileSidebar: () => void;
  unreadCount: number;
  accessToken?: string | null;
  user: {
    avatarUrl?: string | null;
    email: string;
    fullName: string;
  };
};

export function AppTopbar({ sidebarOpen, onToggleSidebar, onOpenMobileSidebar, unreadCount, accessToken, user }: AppTopbarProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const createRef = useRef<HTMLDivElement | null>(null);
  const { activeWorkspace } = useWorkspaceContext();
  const showCreate = !activeWorkspace || activeWorkspace.role !== 'member';
  const { theme, resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const usingSystem = theme === 'system' || theme === undefined;

  const cycleTheme = () => {
    if (usingSystem) {
      setTheme(isDark ? 'light' : 'dark');
      return;
    }
    if (theme === 'light') {
      setTheme('dark');
      return;
    }
    setTheme('system');
  };

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
    <div className="sticky top-0 z-20 flex h-12 shrink-0 items-center justify-between border-b border-[var(--color-border-light)] bg-[var(--color-background)]/95 px-4 backdrop-blur-sm lg:px-5">
      {/* Left */}
      <div className="flex min-w-0 items-center gap-2.5">
        <button
          type="button"
          onClick={onOpenMobileSidebar}
          aria-label="Open sidebar"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--color-text-tertiary)] transition hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-secondary)] lg:hidden"
        >
          <SidebarSimple className="h-3.5 w-3.5" weight="bold" />
        </button>
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
          className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--color-text-placeholder)] transition hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-tertiary)] lg:flex"
        >
          <SidebarSimple className="h-3.5 w-3.5" weight="bold" />
        </button>
        <TopbarTitle />
      </div>

      {/* Right */}
      <div className="flex items-center gap-1.5">
        {/* Create */}
        {showCreate && (
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
                ? 'border-[var(--color-primary-dark)] bg-[var(--color-primary-dark)] text-white shadow-[var(--color-accent)]/20'
                : 'border-[var(--color-accent)] bg-[var(--color-accent)] text-white shadow-[var(--color-accent)]/20 hover:border-[var(--color-primary-dark)] hover:bg-[var(--color-primary-dark)]'
            )}
          >
            <Plus className="h-4 w-4" weight="bold" />
            <span className="hidden sm:inline">Create</span>
            <CaretDown className={cn('hidden h-3.5 w-3.5 transition sm:block', createOpen && 'rotate-180')} weight="bold" />
          </button>

          {createOpen && (
            <div className="absolute right-0 top-9 z-50 w-44 overflow-hidden rounded-xl border border-[var(--color-border-light)] bg-[var(--color-surface)] py-1 shadow-lg shadow-black/5">
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
                  className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] font-medium text-[var(--color-text-secondary)] transition hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-foreground)]"
                >
                  <Icon className="h-3.5 w-3.5 text-[var(--color-text-placeholder)]" weight="bold" />
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
        )}

        <GlobalSearch accessToken={accessToken} />
        <NotificationBell unreadCount={unreadCount} accessToken={accessToken ?? null} />
        <button
          type="button"
          onClick={cycleTheme}
          title={
            usingSystem
              ? `System theme (${isDark ? 'dark' : 'light'}) — click for ${isDark ? 'light' : 'dark'}`
              : theme === 'light'
                ? 'Light mode — click for dark'
                : 'Dark mode — click to use system theme'
          }
          className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-tertiary)] transition hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-secondary)]"
        >
          {isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </button>
        <AccountMenu
          avatarUrl={user.avatarUrl}
          email={user.email}
          fullName={user.fullName}
        />
      </div>
    </div>
  );
}
