'use client';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { DotsThreeOutline } from '@/components/ui/lucide-icons';
import { cn } from '@/lib/utils';

export interface RowActionItem {
  label: string;
  onClick: () => void | Promise<void>;
  destructive?: boolean;
}

export function RowActionsMenu({
  items,
  align = 'right'
}: {
  items: RowActionItem[];
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!ref.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, []);

  useEffect(() => {
    if (!open || !btnRef.current) return;

    const position = () => {
      const rect = btnRef.current!.getBoundingClientRect();
      const menuWidth = 200;
      const menuHeight = Math.min(56 + items.length * 42, 220);
      const dropUp = window.innerHeight - rect.bottom < menuHeight + 12;
      const top = dropUp ? Math.max(8, rect.top - menuHeight - 6) : rect.bottom + 6;
      const left = align === 'right'
        ? Math.min(window.innerWidth - menuWidth - 8, Math.max(8, rect.right - menuWidth))
        : Math.min(window.innerWidth - menuWidth - 8, Math.max(8, rect.left));

      setMenuStyle({ position: 'fixed', top, left, width: menuWidth, zIndex: 9999 });
    };

    position();
    window.addEventListener('scroll', position, true);
    window.addEventListener('resize', position);
    return () => {
      window.removeEventListener('scroll', position, true);
      window.removeEventListener('resize', position);
    };
  }, [align, items.length, open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        ref={btnRef}
        onClick={() => {
          setOpen((current) => !current);
        }}
        className="flex h-8 w-8 items-center justify-center rounded-md text-[#a4a7ae] transition duration-100 hover:bg-[#f5f5f5] hover:text-[#717680]"
      >
        <DotsThreeOutline className="h-4 w-4" weight="fill" />
      </button>

      {open && menuStyle ? createPortal(
        <div
          ref={menuRef}
          className="overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-[#e9eaeb]"
          style={menuStyle}
        >
          <div className="flex flex-col gap-0.5 p-1.5">
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={async () => {
                  setOpen(false);
                  await item.onClick();
                }}
                className={cn(
                  'flex w-full items-center rounded-md px-2.5 py-2 text-left text-[14px] font-medium transition duration-100 hover:bg-[#fafafa]',
                  item.destructive ? 'text-[#717680] hover:bg-[#fef2f2]' : 'text-[#414651]'
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      , document.body) : null}
    </div>
  );
}
