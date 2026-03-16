'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Question } from '@phosphor-icons/react/dist/ssr';
import { navigationGroups } from '@/lib/utils/navigation';
import { cn } from '@/lib/utils';

export function AppSidebar() {
  const pathname = usePathname();

  const sidebarContent = (
    <aside className="flex h-full w-[296px] flex-col justify-between overflow-y-auto border-r border-[#e9eaeb] bg-white py-6">
      {/* Workspace header — logo + name (UUI: px-5, gap-5) */}
      <div className="flex flex-col gap-6 px-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white shadow-xs ring-1 ring-[#e9eaeb]">
            <Image
              src="/hedwig-logo.png"
              alt="Hedwig logo"
              width={32}
              height={32}
              className="h-full w-full object-cover"
            />
          </div>
          <div>
            <p className="text-[14px] font-semibold leading-none text-[#181d27]">Hedwig</p>
          </div>
        </div>
      </div>

      {/* Nav groups — UUI NavList: mt-4 px-4, each item py-0.5 */}
      <nav className="mt-5 flex flex-1 flex-col gap-4 overflow-y-auto px-4">
        {navigationGroups.map((group, index) => (
          <div key={`${group.label ?? 'group'}-${index}`}>
            {group.label ? (
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
                      className={cn(
                        'group flex w-full select-none items-center rounded-md px-3 py-2 transition duration-100 ease-linear',
                        active ? 'bg-[#ececec] hover:bg-[#e7e7e7]' : 'bg-white hover:bg-[#fafafa]'
                      )}
                    >
                      <Icon className="mr-2 h-5 w-5 shrink-0 text-[#8d9096]" weight="bold" />
                      <span
                        className={cn(
                          'flex-1 truncate text-[14px] font-semibold transition duration-100',
                          active ? 'text-[#252b37]' : 'text-[#414651] group-hover:text-[#252b37]'
                        )}
                      >
                        {item.title}
                      </span>
                      {typeof item.count === 'number' ? (
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
      <div className="mt-auto flex flex-col px-4 pt-4">
        <div className="mb-2 h-px w-full bg-[#e9eaeb]" />
        <ul className="flex flex-col">
          <li className="py-0.5">
            <button
              type="button"
              className="group flex w-full select-none items-center rounded-md bg-white px-3 py-2 transition duration-100 ease-linear hover:bg-[#fafafa]"
            >
              <Question className="mr-2 h-5 w-5 shrink-0 text-[#8d9096]" weight="bold" />
              <span className="flex-1 truncate text-left text-[14px] font-semibold text-[#414651] group-hover:text-[#252b37]">
                Help & Support
              </span>
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
      <div className="invisible hidden w-[296px] shrink-0 lg:block" />
    </>
  );
}
