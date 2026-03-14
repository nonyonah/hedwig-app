'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Lifebuoy, Moon, SignOut, Sun } from '@phosphor-icons/react/dist/ssr';
import { Avatar } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

type ThemeOption = 'light' | 'dark';

const themeOptions: Array<{ value: ThemeOption; label: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Light mode', icon: Sun },
  { value: 'dark', label: 'Dark mode', icon: Moon }
];

const STORAGE_KEY = 'hedwig-web-theme';

export function AccountMenu({
  fullName,
  email
}: {
  fullName: string;
  email: string;
}) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeOption>('light');
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem(STORAGE_KEY) as ThemeOption | null;
    const nextTheme = storedTheme && themeOptions.some((option) => option.value === storedTheme) ? storedTheme : 'light';
    document.documentElement.dataset.theme = nextTheme;
    setTheme(nextTheme);
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const applyTheme = (nextTheme: ThemeOption) => {
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem(STORAGE_KEY, nextTheme);
    setTheme(nextTheme);
  };

  return (
    <div className="relative" ref={menuRef}>
      {/* UUI trigger: rounded-md, hover:bg-primary_hover, fg-quaternary */}
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-9 w-9 items-center justify-center rounded-md text-[#a4a7ae] transition duration-100 ease-linear hover:bg-[#fafafa]"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <Avatar label={fullName || email} />
      </button>

      {open ? (
        /* UUI dropdown: rounded-xl, bg-white, shadow-lg, ring-1 ring-[#e9eaeb] */
        <div className="absolute right-0 top-[calc(100%+8px)] z-30 w-[264px] overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-[#e9eaeb]">
          {/* Account header */}
          <div className="border-b border-[#e9eaeb] px-4 py-3.5">
            <p className="truncate text-[14px] font-semibold text-[#181d27]">{fullName}</p>
            <p className="truncate text-[13px] text-[#717680]">{email}</p>
          </div>

          {/* Menu items — UUI: px-1.5 py-1.5 */}
          <div className="flex flex-col gap-0.5 px-1.5 py-1.5">
            <Link
              className="group flex w-full cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 transition duration-100 ease-linear hover:bg-[#fafafa]"
              href="mailto:support@hedwigbot.xyz"
              onClick={() => setOpen(false)}
            >
              <Lifebuoy className="h-5 w-5 text-[#a4a7ae]" weight="regular" />
              <span className="text-[14px] font-semibold text-[#414651] group-hover:text-[#252b37]">Contact support</span>
            </Link>

            <div className="flex cursor-default items-center justify-between rounded-md px-2.5 py-2">
              <span className="text-[14px] font-semibold text-[#414651]">Theme</span>
              <div className="flex items-center gap-1">
                {themeOptions.map((option) => (
                  <button
                    key={option.value}
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-md border transition duration-100',
                      theme === option.value
                        ? 'border-[#2563eb] bg-[#2563eb] text-white'
                        : 'border-[#e9eaeb] bg-white text-[#a4a7ae] hover:bg-[#fafafa] hover:text-[#717680]'
                    )}
                    aria-label={option.label}
                    title={option.label}
                    onClick={() => applyTheme(option.value)}
                    type="button"
                  >
                    <option.icon className="h-4 w-4" weight="regular" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Divider + sign out */}
          <div className="border-t border-[#e9eaeb] px-1.5 py-1.5">
            <Link
              className="group flex w-full cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 transition duration-100 ease-linear hover:bg-[#fef2f2]"
              href="/sign-out"
              onClick={() => setOpen(false)}
            >
              <SignOut className="h-5 w-5 text-[#f04438]" weight="regular" />
              <span className="text-[14px] font-semibold text-[#d92d20]">Sign out</span>
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
