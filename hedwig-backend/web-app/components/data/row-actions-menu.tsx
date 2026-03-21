'use client';

import { useEffect, useRef, useState } from 'react';
import { DotsThreeOutline } from '@phosphor-icons/react/dist/ssr';
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
  const [dropUp, setDropUp] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) {
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

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        ref={btnRef}
        onClick={() => {
          if (!open && btnRef.current) {
            const rect = btnRef.current.getBoundingClientRect();
            setDropUp(window.innerHeight - rect.bottom < 220);
          }
          setOpen((current) => !current);
        }}
        className="flex h-8 w-8 items-center justify-center rounded-md text-[#a4a7ae] transition duration-100 hover:bg-[#f5f5f5] hover:text-[#717680]"
      >
        <DotsThreeOutline className="h-4 w-4" weight="fill" />
      </button>

      {open ? (
        <div
          className={cn(
            `absolute z-[9999] min-w-[200px] overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-[#e9eaeb] ${dropUp ? 'bottom-[calc(100%+6px)]' : 'top-[calc(100%+6px)]'}`,
            align === 'right' ? 'right-0' : 'left-0'
          )}
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
                  item.destructive ? 'text-[#d92d20] hover:bg-[#fef2f2]' : 'text-[#414651]'
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
