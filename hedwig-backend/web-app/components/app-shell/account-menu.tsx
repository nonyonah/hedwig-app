'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Lifebuoy, SignOut } from '@/components/ui/lucide-icons';
import { Avatar } from '@/components/ui/avatar';

export function AccountMenu({
  fullName,
  email,
  avatarUrl
}: {
  fullName: string;
  email: string;
  avatarUrl?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

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

  return (
    <div className="relative" ref={menuRef}>
      {/* UUI trigger: rounded-md, hover:bg-primary_hover, fg-quaternary */}
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-9 w-9 items-center justify-center rounded-md text-[#a4a7ae] transition duration-100 ease-linear hover:bg-[#f8f9fb]"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <Avatar label={fullName || email} src={avatarUrl} />
      </button>

      {open ? (
        /* UUI dropdown: rounded-xl, bg-white, shadow-lg, ring-1 ring-[#e9eaeb] */
        <div className="absolute right-0 top-[calc(100%+8px)] z-30 w-[264px] overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-[#eef0f3]">
          {/* Account header */}
          <div className="border-b border-[#f3f4f6] px-4 py-3.5">
            <p className="truncate text-[14px] font-semibold text-[#181d27]">{fullName}</p>
            <p className="truncate text-[13px] text-[#717680]">{email}</p>
          </div>

          {/* Menu items — UUI: px-1.5 py-1.5 */}
          <div className="flex flex-col gap-0.5 px-1.5 py-1.5">
            <Link
              className="group flex w-full cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 transition duration-100 ease-linear hover:bg-[#f8f9fb]"
              href="https://help.hedwigbot.xyz"
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
            >
              <Lifebuoy className="h-5 w-5 text-[#a4a7ae]" weight="regular" />
              <span className="text-[14px] font-semibold text-[#414651] group-hover:text-[#252b37]">Help Center</span>
            </Link>
          </div>

          {/* Divider + sign out */}
          <div className="border-t border-[#f3f4f6] px-1.5 py-1.5">
            <Link
              className="group flex w-full cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 transition duration-100 ease-linear hover:bg-[#fef2f2]"
              href="/sign-out"
              onClick={() => setOpen(false)}
            >
              <SignOut className="h-5 w-5 text-[#717680]" weight="regular" />
              <span className="text-[14px] font-semibold text-[#717680]">Sign out</span>
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
