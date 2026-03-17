'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Question, SidebarSimple } from '@phosphor-icons/react/dist/ssr';
import { navigationGroups } from '@/lib/utils/navigation';
import { cn } from '@/lib/utils';

export function AppSidebar({
  collapsed,
  onToggle
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();
  const sidebarWidth = collapsed ? 'w-[88px]' : 'w-[296px]';
  const placeholderWidth = collapsed ? 'w-[88px]' : 'w-[296px]';
  const shellPadding = collapsed ? 'px-3' : 'px-5';
  const navPadding = collapsed ? 'px-3' : 'px-4';

  const sidebarContent = (
    <aside className={cn('flex h-full flex-col justify-between overflow-y-auto border-r border-[#e9eaeb] bg-white py-6 transition-[width] duration-200 ease-out', sidebarWidth)}>
      {/* Workspace header — logo + name (UUI: px-5, gap-5) */}
      <div className={cn('flex flex-col gap-6', shellPadding)}>
        <div className={cn('flex items-center', collapsed ? 'justify-center' : 'justify-between gap-2.5')}>
          <div className={cn('flex min-w-0 items-center gap-2.5', collapsed && 'justify-center')}>
            <div className={cn(
              'flex shrink-0 items-center justify-center overflow-hidden bg-white shadow-xs ring-1 ring-[#e9eaeb]',
              collapsed ? 'h-10 w-10 rounded-xl' : 'h-8 w-8 rounded-lg'
            )}>
              <Image
                src="/hedwig-logo.png"
                alt="Hedwig logo"
                width={32}
                height={32}
                className="h-full w-full object-cover"
              />
            </div>
            {!collapsed ? (
              <div>
                <p className="text-[14px] font-semibold leading-none text-[#181d27]">Hedwig</p>
              </div>
            ) : null}
          </div>
          {!collapsed ? (
            <button
              type="button"
              onClick={onToggle}
              aria-label="Collapse sidebar"
              className="hidden h-8 w-8 items-center justify-center rounded-md border border-[#e9eaeb] bg-white text-[#8d9096] transition hover:bg-[#fafafa] hover:text-[#525866] lg:flex"
            >
              <SidebarSimple className="h-4 w-4" weight="bold" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Nav groups — UUI NavList: mt-4 px-4, each item py-0.5 */}
      <nav className={cn('mt-5 flex flex-1 flex-col gap-4 overflow-y-auto', navPadding)}>
        {navigationGroups.map((group, index) => (
          <div key={`${group.label ?? 'group'}-${index}`}>
            {group.label && !collapsed ? (
              <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#a4a7ae]">
                {group.label}
              </p>
            ) : null}
            <ul className="flex flex-col">
              {group.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;
                return (
                  <li key={item.href} className="py-0.5">
                    {/* UUI NavItemBase: px-3 py-2 rounded-md, icon mr-2 size-5 text-fg-quaternary */}
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      title={collapsed ? item.title : undefined}
                      className={cn(
                        'group flex w-full select-none items-center rounded-md px-3 py-2 transition duration-100 ease-linear',
                        collapsed && 'justify-center rounded-xl px-0 py-2.5',
                        active ? 'bg-[#ececec] hover:bg-[#e7e7e7]' : 'bg-white hover:bg-[#fafafa]'
                      )}
                    >
                      <Icon className={cn('h-5 w-5 shrink-0 text-[#8d9096]', !collapsed && 'mr-2')} weight="bold" />
                      {!collapsed ? (
                        <span
                          className={cn(
                            'flex-1 truncate text-[14px] font-semibold transition duration-100',
                            active ? 'text-[#252b37]' : 'text-[#414651] group-hover:text-[#252b37]'
                          )}
                        >
                          {item.title}
                        </span>
                      ) : null}
                      {!collapsed && typeof item.count === 'number' ? (
                        <span className="ml-2 shrink-0 rounded-full bg-[#f5f5f5] px-1.5 py-0.5 text-[11px] font-medium text-[#717680]">
                          {item.count}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer — UUI: mt-auto px-4 py-6, footer items above account card */}
      <div className={cn('mt-auto flex flex-col pt-4', navPadding)}>
        <div className="mb-2 h-px w-full bg-[#e9eaeb]" />
        <ul className="flex flex-col">
          <li className="py-0.5">
            <button
              type="button"
              title={collapsed ? 'Help & Support' : undefined}
              className={cn(
                'group flex w-full select-none items-center rounded-md bg-white px-3 py-2 transition duration-100 ease-linear hover:bg-[#fafafa]',
                collapsed && 'justify-center rounded-xl px-0 py-2.5'
              )}
            >
              <Question className={cn('h-5 w-5 shrink-0 text-[#8d9096]', !collapsed && 'mr-2')} weight="bold" />
              {!collapsed ? (
                <span className="flex-1 truncate text-left text-[14px] font-semibold text-[#414651] group-hover:text-[#252b37]">
                  Help & Support
                </span>
              ) : null}
            </button>
          </li>
        </ul>
      </div>
    </aside>
  );

  return (
    <>
      {/* Fixed sidebar (desktop) — UUI pattern: lg:fixed lg:inset-y-0 lg:left-0 */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:flex">{sidebarContent}</div>
      {/* Physical space placeholder since sidebar is fixed */}
      <div className={cn('invisible hidden shrink-0 transition-[width] duration-200 ease-out lg:block', placeholderWidth)} />
    </>
  );
}
