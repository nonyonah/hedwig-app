'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getUserback } from '@userback/widget';
import { CurrencyDollar, Question, SidebarSimple } from '@/components/ui/lucide-icons';
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
  const wsType = (activeWorkspace?.type as 'personal' | 'organization' | undefined) ?? 'personal';

  const handleFeedbackClick = () => {
    const widget = getUserback();
    if (widget && typeof widget.openForm === 'function') { widget.openForm(); return; }
    const fallback = (window as any).Userback;
    if (fallback && typeof fallback.openForm === 'function') { fallback.openForm(); return; }
    if (fallback && typeof fallback.open === 'function') fallback.open();
  };

  const NavItems = ({ onNavigate }: { onNavigate?: () => void }) => (
    <nav className="flex flex-1 flex-col gap-0 overflow-y-auto px-2 py-3">
      {navigationGroups.map((group, groupIndex) => (
        <div key={`group-${groupIndex}`} className={groupIndex > 0 ? 'mt-3' : ''}>
          <div className="mb-0.5 px-2.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
              {group.label}
            </span>
          </div>
          <ul className="flex flex-col gap-0.5">
            {group.items.filter(i => !lockedRouteSet.has(i.href) && i.roles.includes(role) && (!i.workspaceTypes || i.workspaceTypes.includes(wsType))).map(item => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link href={item.href} onClick={onNavigate} aria-current={active ? 'page' : undefined}
                    className={cn(
                      'group relative flex w-full select-none items-center rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-all duration-100 ease-linear',
                      active
                        ? 'bg-[var(--color-accent-soft)] text-[var(--color-primary)] font-semibold'
                        : 'text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-foreground)]'
                    )}>
                    {active && (
                      <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-[var(--color-primary)]" />
                    )}
                    <Icon className={cn('mr-2.5 h-4 w-4 shrink-0', active ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-placeholder)] group-hover:text-[var(--color-text-tertiary)]')}
                      weight={active ? 'bold' : 'regular'} />
                    <span className={cn('whitespace-nowrap', active ? 'text-[var(--color-primary)]' : 'group-hover:text-[var(--color-foreground)]')}>
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
  );

  const Footer = ({ onNavigate }: { onNavigate?: () => void }) => (
    <div className="flex shrink-0 flex-col gap-0.5 border-t border-[var(--color-surface-tertiary)] px-2 py-2">
      <a href="https://help.hedwigbot.xyz" target="_blank" rel="noreferrer" onClick={onNavigate}
        className="group flex w-full select-none items-center rounded-md px-2.5 py-1.5 text-[13px] font-medium text-[var(--color-text-placeholder)] transition duration-100 ease-linear hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-text-tertiary)]">
        <Question className="mr-2.5 h-4 w-4 shrink-0" weight="regular" />
        <span>Help Center</span>
      </a>
      <button type="button" title="Give feedback" onClick={handleFeedbackClick}
        className="group flex w-full select-none items-center rounded-md px-2.5 py-1.5 text-[13px] font-medium text-[var(--color-text-placeholder)] transition duration-100 ease-linear hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-text-tertiary)]">
        <Question className="mr-2.5 h-4 w-4 shrink-0" weight="regular" />
        <span>Give feedback</span>
      </button>
      <Link href="/pricing" onClick={onNavigate}
        className="group flex w-full select-none items-center rounded-md px-2.5 py-1.5 text-[13px] font-medium text-[var(--color-text-placeholder)] transition duration-100 ease-linear hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-foreground)]">
        <CurrencyDollar className="mr-2.5 h-4 w-4 shrink-0" weight="regular" />
        <span>Upgrade</span>
      </Link>
    </div>
  );

  return (
    <>
      {/* Desktop: always rendered for CSS transition */}
      <div className={cn(
        'hidden shrink-0 flex-col border-r border-[var(--color-border-light)] bg-[var(--color-background)] transition-all duration-300 ease-out lg:flex lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto',
        open ? 'w-[220px] opacity-100' : 'w-0 overflow-hidden opacity-0 border-r-0'
      )}>
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--color-border-light)] px-3">
          <WorkspaceSwitcher collapsed={false} onOpenCreate={() => {
            window.dispatchEvent(new CustomEvent('hedwig:open-create-workspace'));
          }} />
          <button type="button" onClick={onToggle} aria-label="Close sidebar"
            className="hidden h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-placeholder)] transition hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-text-tertiary)] lg:flex">
            <SidebarSimple className="h-3.5 w-3.5" weight="bold" />
          </button>
        </div>
        <NavItems />
        <Footer />
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <button type="button" aria-label="Close sidebar" className="absolute inset-0 bg-[var(--color-foreground)]/30" onClick={onCloseMobile} />
          <div className="relative h-full shadow-2xl shadow-black/20 animate-in slide-in-from-left-full duration-200">
            <aside className="flex h-full w-[220px] flex-col overflow-y-auto border-r border-[var(--color-border-light)] bg-[var(--color-background)]">
              <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--color-border-light)] px-3">
                <WorkspaceSwitcher collapsed={false} onOpenCreate={() => {
                  window.dispatchEvent(new CustomEvent('hedwig:open-create-workspace'));
                }} />
                <button type="button" onClick={onCloseMobile} aria-label="Close sidebar"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-placeholder)] transition hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-text-tertiary)]">
                  <SidebarSimple className="h-3.5 w-3.5" weight="bold" />
                </button>
              </div>
              <NavItems onNavigate={onCloseMobile} />
              <Footer onNavigate={onCloseMobile} />
            </aside>
          </div>
        </div>
      )}
    </>
  );
}
