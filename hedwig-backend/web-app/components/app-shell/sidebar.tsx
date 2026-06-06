'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getUserback } from '@userback/widget';
import { Question, SidebarSimple } from '@/components/ui/lucide-icons';
import { navigationGroups, type WorkspaceRole } from '@/lib/utils/navigation';
import { cn } from '@/lib/utils';
import { WorkspaceSwitcher } from '@/components/workspace/workspace-switcher';
import { useWorkspaceContext } from '@/lib/workspace/workspace-context';

export function AppSidebar({
  open,
  onToggle,
  lockedRoutes = [],
  mobileOpen = false,
  onCloseMobile
}: {
  open: boolean;
  onToggle: () => void;
  lockedRoutes?: string[];
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}) {
  const pathname = usePathname();
  const lockedRouteSet = new Set(lockedRoutes);
  const { activeWorkspace } = useWorkspaceContext();
  const role: WorkspaceRole = (activeWorkspace?.role as WorkspaceRole) ?? 'owner';

  const handleFeedbackClick = () => {
    const widget = getUserback();
    if (widget && typeof widget.openForm === 'function') {
      widget.openForm();
      return;
    }
    const fallback = (window as Window & { Userback?: { openForm?: () => void; open?: () => void } }).Userback;
    if (fallback && typeof fallback.openForm === 'function') {
      fallback.openForm();
      return;
    }
    if (fallback && typeof fallback.open === 'function') {
      fallback.open();
    }
  };

  const renderSidebar = (forceExpanded = false, onNavigate?: () => void) => (
    <aside className="flex h-full w-[220px] shrink-0 flex-col overflow-y-auto border-r border-[var(--color-border-light)] bg-[var(--color-background)]">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--color-border-light)] px-3">
        <WorkspaceSwitcher collapsed={false} onOpenCreate={() => {
          window.dispatchEvent(new CustomEvent('hedwig:open-create-workspace'));
        }} />
        <button
          type="button"
          onClick={forceExpanded ? onCloseMobile : onToggle}
          aria-label="Close sidebar"
          className="hidden h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-placeholder)] transition hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-text-tertiary)] lg:flex"
        >
          <SidebarSimple className="h-3.5 w-3.5" weight="bold" />
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-0 overflow-y-auto px-3 py-3">
        {navigationGroups.map((group, groupIndex) => (
          <div key={`group-${groupIndex}`}>
            {groupIndex > 0 && <div className="my-1.5 h-px bg-[var(--color-surface-tertiary)]" />}
            <ul className="flex flex-col gap-0.5">
              {group.items.filter((item) => !lockedRouteSet.has(item.href) && item.roles.includes(role)).map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'group flex w-full select-none items-center rounded-md px-2.5 py-1.5 transition duration-100 ease-linear',
                        active
                          ? 'bg-[var(--color-surface-tertiary)] text-[var(--color-foreground)]'
                          : 'text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-text-secondary)]'
                      )}
                    >
                      <Icon
                        className={cn('mr-2.5 h-4 w-4 shrink-0', active ? 'text-[var(--color-text-secondary)]' : 'text-[var(--color-text-placeholder)] group-hover:text-[var(--color-text-tertiary)]')}
                        weight={active ? 'bold' : 'regular'}
                      />
                      <span className={cn('flex-1 truncate text-[13px] font-medium', active ? 'font-semibold text-[var(--color-foreground)]' : 'text-[var(--color-text-tertiary)] group-hover:text-[var(--color-foreground)]')}>
                        {item.title}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="flex shrink-0 flex-col gap-0.5 border-t border-[var(--color-border-light)] px-3 py-2">
        <a href="https://help.hedwigbot.xyz" target="_blank" rel="noreferrer" onClick={onNavigate}
          className="group flex w-full select-none items-center rounded-md px-2.5 py-1.5 text-[var(--color-text-placeholder)] transition duration-100 ease-linear hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-text-tertiary)]">
          <Question className="mr-2.5 h-4 w-4 shrink-0" weight="regular" />
          <span className="text-[13px] font-medium">Help Center</span>
        </a>
        <button type="button" title="Give feedback" onClick={handleFeedbackClick}
          className="group flex w-full select-none items-center rounded-md px-2.5 py-1.5 text-[var(--color-text-placeholder)] transition duration-100 ease-linear hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-text-tertiary)]">
          <Question className="mr-2.5 h-4 w-4 shrink-0" weight="regular" />
          <span className="text-[13px] font-medium">Give feedback</span>
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop: no fixed positioning — takes natural space in flex row */}
      <div className="hidden lg:block">
        {open ? renderSidebar() : null}
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <button type="button" aria-label="Close sidebar" className="absolute inset-0 bg-[var(--color-foreground)]/30" onClick={onCloseMobile} />
          <div className="relative h-full shadow-2xl shadow-black/20">
            {renderSidebar(true, onCloseMobile)}
          </div>
        </div>
      )}
    </>
  );
}
