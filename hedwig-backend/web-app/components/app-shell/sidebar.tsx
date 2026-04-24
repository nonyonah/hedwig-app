'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getUserback } from '@userback/widget';
import { Question, SidebarSimple } from '@/components/ui/lucide-icons';
import { navigationGroups } from '@/lib/utils/navigation';
import { cn } from '@/lib/utils';

export function AppSidebar({
  collapsed,
  onToggle,
  lockedRoutes = []
}: {
  collapsed: boolean;
  onToggle: () => void;
  lockedRoutes?: string[];
}) {
  const pathname = usePathname();
  const lockedRouteSet = new Set(lockedRoutes);
  const sidebarWidth = collapsed ? 'w-[64px]' : 'w-[220px]';
  const placeholderWidth = collapsed ? 'w-[64px]' : 'w-[220px]';

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

  const sidebarContent = (
    <aside className={cn(
      'flex h-full flex-col overflow-y-auto border-r border-[#f3f4f6] bg-[#fcfcfd] transition-[width] duration-200 ease-out',
      sidebarWidth
    )}>
      {/* Workspace header */}
      <div className={cn(
        'flex h-12 shrink-0 items-center border-b border-[#f3f4f6]',
        collapsed ? 'justify-center px-0' : 'justify-between px-4'
      )}>
        <div className={cn('flex min-w-0 items-center gap-2', collapsed && 'justify-center')}>
          <div className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-md ring-1 ring-[#eef0f3]">
            <Image
              src="/hedwig-logo.png"
              alt="Hedwig"
              width={24}
              height={24}
              className="h-full w-full object-cover"
            />
          </div>
          {!collapsed && (
            <span className="truncate text-[13px] font-semibold text-[#181d27]">Hedwig</span>
          )}
        </div>
        {!collapsed && (
          <button
            type="button"
            onClick={onToggle}
            aria-label="Collapse sidebar"
            className="hidden h-7 w-7 items-center justify-center rounded-md text-[#c1c5cd] transition hover:bg-[#f5f5f5] hover:text-[#717680] lg:flex"
          >
            <SidebarSimple className="h-3.5 w-3.5" weight="bold" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className={cn('flex flex-1 flex-col gap-0 overflow-y-auto py-3', collapsed ? 'px-2' : 'px-3')}>
        {navigationGroups.map((group, groupIndex) => (
          <div key={`group-${groupIndex}`}>
            {groupIndex > 0 && (
              <div className={cn('my-1.5 h-px bg-[#f4f5f7]', collapsed ? 'mx-1' : 'mx-0')} />
            )}
            <ul className="flex flex-col gap-0.5">
              {group.items.filter((item) => !lockedRouteSet.has(item.href)).map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      title={collapsed ? item.title : undefined}
                      className={cn(
                        'group flex w-full select-none items-center rounded-md transition duration-100 ease-linear',
                        collapsed ? 'justify-center p-2' : 'px-2.5 py-1.5',
                        active
                          ? 'bg-[#f4f5f7] text-[#181d27]'
                          : 'text-[#8d9096] hover:bg-[#f8f9fb] hover:text-[#414651]'
                      )}
                    >
                      <Icon
                        className={cn(
                          'h-4 w-4 shrink-0',
                          active ? 'text-[#414651]' : 'text-[#c1c5cd] group-hover:text-[#8d9096]',
                          !collapsed && 'mr-2.5'
                        )}
                        weight={active ? 'bold' : 'regular'}
                      />
                      {!collapsed && (
                        <span className={cn(
                          'flex-1 truncate text-[13px] font-medium',
                          active ? 'font-semibold text-[#181d27]' : 'text-[#525866] group-hover:text-[#252b37]'
                        )}>
                          {item.title}
                        </span>
                      )}
                      {!collapsed && typeof item.count === 'number' && (
                        <span className="ml-auto shrink-0 text-[11px] tabular-nums text-[#a4a7ae]">
                          {item.count}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className={cn('shrink-0 border-t border-[#f3f4f6] py-2', collapsed ? 'px-2' : 'px-3')}>
        <button
          type="button"
          title="Give feedback"
          onClick={handleFeedbackClick}
          className={cn(
            'group flex w-full select-none items-center rounded-md text-[#c1c5cd] transition duration-100 ease-linear hover:bg-[#f8f9fb] hover:text-[#717680]',
            collapsed ? 'justify-center p-2' : 'px-2.5 py-1.5'
          )}
        >
          <Question className={cn('h-4 w-4 shrink-0', !collapsed && 'mr-2.5')} weight="regular" />
          {!collapsed && (
            <span className="text-[13px] font-medium text-[#8d9096] group-hover:text-[#525866]">
              Give feedback
            </span>
          )}
        </button>
      </div>
    </aside>
  );

  return (
    <>
      <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:flex">{sidebarContent}</div>
      <div className={cn('invisible hidden shrink-0 transition-[width] duration-200 ease-out lg:block', placeholderWidth)} />
    </>
  );
}
