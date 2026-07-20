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
        className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--color-text-muted)] transition duration-100 ease-linear hover:bg-[var(--color-surface-secondary)]"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <Avatar label={fullName || email} src={avatarUrl} />
      </button>

      {open ? (
        /* UUI dropdown: rounded-xl, bg-[var(--color-surface)], shadow-lg, ring-1 ring-[var(--color-border)] */
        <div className="absolute right-0 top-[calc(100%+8px)] z-30 w-[264px] overflow-hidden rounded-xl bg-[var(--color-surface)] shadow-lg ring-1 ring-[var(--color-border-light)]">
          {/* Account header */}
          <div className="border-b border-[var(--color-border-light)] px-4 py-3.5">
            <p className="truncate text-[14px] font-semibold text-[var(--color-foreground)]">{fullName}</p>
            <p className="truncate text-[13px] text-[var(--color-text-tertiary)]">{email}</p>
          </div>

          {/* Menu items — UUI: px-1.5 py-1.5 */}
          <div className="flex flex-col gap-0.5 px-1.5 py-1.5">
            <Link
              className="group flex w-full cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 transition duration-100 ease-linear hover:bg-[var(--color-surface-secondary)]"
              href="https://help.hedwig.riftlabs.xyz"
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
            >
              <Lifebuoy className="h-5 w-5 text-[var(--color-text-muted)]" weight="regular" />
              <span className="text-[14px] font-semibold text-[var(--color-text-secondary)] group-hover:text-[var(--color-foreground)]">Help Center</span>
            </Link>
          </div>

          {/* Divider + sign out */}
          <div className="border-t border-[var(--color-border-light)] px-1.5 py-1.5">
            <Link
              className="group flex w-full cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 transition duration-100 ease-linear hover:bg-[var(--color-danger-soft)]"
              href="/sign-out"
              onClick={() => setOpen(false)}
            >
              <SignOut className="h-5 w-5 text-[var(--color-text-tertiary)]" weight="regular" />
              <span className="text-[14px] font-semibold text-[var(--color-text-tertiary)]">Sign out</span>
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
