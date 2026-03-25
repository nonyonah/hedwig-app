'use client';

import { useEffect, useRef, useState } from 'react';
import { Bell, BellRinging, CheckCircle, X } from '@/components/ui/lucide-icons';
import { cn } from '@/lib/utils';

interface NotificationItem {
  id: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

/* Placeholder notifications — replace with real API data when endpoint is ready */
const PLACEHOLDER: NotificationItem[] = [];

export function NotificationBell({ unreadCount }: { unreadCount: number }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>(PLACEHOLDER);
  const [localUnread, setLocalUnread] = useState(unreadCount);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setLocalUnread(unreadCount);
  }, [unreadCount]);

  useEffect(() => {
    const handlePointerDown = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const markAllRead = () => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setLocalUnread(0);
  };

  const dismiss = (id: string) => {
    setItems((prev) => prev.filter((n) => n.id !== id));
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        aria-label="Notifications"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-md text-[#a4a7ae] transition duration-100 ease-linear hover:bg-[#fafafa] hover:text-[#717680]"
      >
        {localUnread > 0 ? (
          <BellRinging className="h-5 w-5" weight="regular" />
        ) : (
          <Bell className="h-5 w-5" weight="regular" />
        )}
        {localUnread > 0 ? (
          <span className="absolute right-[9px] top-[9px] flex h-[7px] w-[7px] items-center justify-center rounded-full bg-[#2563eb]" />
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+8px)] z-30 w-[360px] overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-[#e9eaeb]">
          {/* Panel header */}
          <div className="flex items-center justify-between border-b border-[#e9eaeb] px-4 py-3.5">
            <div className="flex items-center gap-2">
              <p className="text-[14px] font-semibold text-[#181d27]">Notifications</p>
              {localUnread > 0 ? (
                <span className="rounded-full bg-[#eff6ff] px-2 py-0.5 text-[11px] font-semibold text-[#2563eb]">
                  {localUnread} new
                </span>
              ) : null}
            </div>
            {localUnread > 0 ? (
              <button
                onClick={markAllRead}
                className="text-[12px] font-semibold text-[#2563eb] transition hover:text-[#1d4ed8]"
              >
                Mark all read
              </button>
            ) : null}
          </div>

          {/* Notification list */}
          <div className="max-h-[400px] overflow-y-auto">
            {items.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f5f5f5]">
                  <CheckCircle className="h-5 w-5 text-[#a4a7ae]" weight="regular" />
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-[#414651]">You're all caught up</p>
                  <p className="mt-0.5 text-[13px] text-[#717680]">No new notifications right now</p>
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-[#f5f5f5]">
                {items.map((n) => (
                  <li
                    key={n.id}
                    className={cn(
                      'relative flex items-start gap-3 px-4 py-3.5 transition hover:bg-[#fafafa]',
                      !n.read && 'bg-[#eff6ff]/40'
                    )}
                  >
                    {!n.read ? (
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#2563eb]" />
                    ) : (
                      <span className="mt-2 h-1.5 w-1.5 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-[#252b37]">{n.title}</p>
                      <p className="mt-0.5 text-[13px] leading-5 text-[#717680]">{n.body}</p>
                      <p className="mt-1 text-[11px] text-[#a4a7ae]">{n.createdAt}</p>
                    </div>
                    <button
                      onClick={() => dismiss(n.id)}
                      className="ml-1 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[#a4a7ae] transition hover:bg-[#f5f5f5] hover:text-[#717680]"
                      aria-label="Dismiss"
                    >
                      <X className="h-3 w-3" weight="bold" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-[#e9eaeb] px-4 py-2.5">
            <p className="text-center text-[12px] text-[#a4a7ae]">
              Push notifications are sent via the Hedwig mobile app
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
