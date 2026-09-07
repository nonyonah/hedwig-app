'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
  ArrowsLeftRight,
  ArrowDown,
  Bank,
  CaretDown,
  Moon,
  PaperPlaneTilt,
  ShareNetwork,
  SidebarSimple,
  Sun,
} from '@/components/ui/lucide-icons';
import { AccountMenu } from '@/components/app-shell/account-menu';
import { NotificationBell } from '@/components/app-shell/notification-bell';
import { TopbarTitle } from '@/components/app-shell/topbar-title';
import { GlobalSearch } from '@/components/app-shell/global-search';
import { cn } from '@/lib/utils';
import { useWorkspaceContext } from '@/lib/workspace/workspace-context';
import { Dropdown, Label } from '@heroui/react';

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
  const router = useRouter();
  const [moneyOpen, setMoneyOpen] = useState(false);
  const { activeWorkspace } = useWorkspaceContext();
  const showMoney = !activeWorkspace || activeWorkspace.role !== 'member';
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

  const openMoneyAction = (action: 'send' | 'receive' | 'withdraw' | 'fund') => {
    router.push(`/wallet?action=${action}`);
    setMoneyOpen(false);
  };

  return (
    <div className="sticky top-0 z-20 flex h-12 shrink-0 items-center justify-between border-b border-[var(--color-border-light)] bg-[var(--color-surface)]/95 px-4 backdrop-blur-sm lg:px-5">
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
        {/* Move money */}
        {showMoney && (
          <Dropdown isOpen={moneyOpen} onOpenChange={setMoneyOpen}>
            <Dropdown.Trigger>
              <span
                role="button"
                tabIndex={0}
                aria-label="Move money"
                className={cn(
                  'flex h-9 items-center justify-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold shadow-sm transition',
                  moneyOpen
                    ? 'border-[var(--color-create-dark)] bg-[var(--color-create-dark)] text-white shadow-[var(--color-accent)]/20'
                    : 'border-[var(--color-create)] bg-[var(--color-create)] text-white shadow-[var(--color-accent)]/20 hover:border-[var(--color-create-dark)] hover:bg-[var(--color-create-dark)]'
                )}
              >
                <ArrowsLeftRight className="h-4 w-4" weight="bold" />
                <span className="hidden sm:inline">Move money</span>
                <CaretDown className={cn('hidden h-3.5 w-3.5 transition sm:block', moneyOpen && 'rotate-180')} weight="bold" />
              </span>
            </Dropdown.Trigger>
            <Dropdown.Popover>
              <Dropdown.Menu onAction={(key) => openMoneyAction(key as 'send' | 'receive' | 'withdraw' | 'fund')}>
                <Dropdown.Item id="send" textValue="Send">
                  <PaperPlaneTilt className="size-4 text-[var(--color-text-placeholder)]" />
                  <Label>Send</Label>
                </Dropdown.Item>
                <Dropdown.Item id="receive" textValue="Receive">
                  <ShareNetwork className="size-4 text-[var(--color-text-placeholder)]" />
                  <Label>Receive</Label>
                </Dropdown.Item>
                <Dropdown.Item id="withdraw" textValue="Withdraw">
                  <ArrowDown className="size-4 text-[var(--color-text-placeholder)]" />
                  <Label>Withdraw</Label>
                </Dropdown.Item>
                <Dropdown.Item id="fund" textValue="Fund via bank">
                  <Bank className="size-4 text-[var(--color-text-placeholder)]" />
                  <Label>Fund via bank</Label>
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>
        )}

        <GlobalSearch accessToken={accessToken} />
        <NotificationBell unreadCount={unreadCount} accessToken={accessToken ?? null} />
        <button
          type="button"
          suppressHydrationWarning
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
