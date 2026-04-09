'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, BellRinging, CheckCircle, X } from '@/components/ui/lucide-icons';
import { backendConfig } from '@/lib/auth/config';
import { cn } from '@/lib/utils';

interface NotificationItem {
  id: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

function mapNotification(raw: any): NotificationItem {
  return {
    id: String(raw?.id ?? ''),
    title: String(raw?.title || 'Notification'),
    body: String(raw?.message || raw?.body || ''),
    read: Boolean(raw?.is_read ?? raw?.read ?? false),
    createdAt: String(raw?.created_at || raw?.createdAt || new Date().toISOString()),
  };
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Just now';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function NotificationBell({
  unreadCount,
  accessToken,
}: {
  unreadCount: number;
  accessToken?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [localUnread, setLocalUnread] = useState(unreadCount);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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

  const loadNotifications = useCallback(async () => {
    if (!accessToken) {
      setItems([]);
      setLocalUnread(0);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`${backendConfig.apiBaseUrl}/api/notifications?limit=25&offset=0`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error('Failed to load notifications');
      }

      const payload = await response.json().catch(() => ({}));
      const mapped: NotificationItem[] = Array.isArray(payload?.data?.notifications)
        ? payload.data.notifications.map(mapNotification).filter((item: NotificationItem) => item.id)
        : [];

      setItems(mapped);
      setLocalUnread(mapped.filter((item) => !item.read).length);
    } catch {
      setErrorMessage('Could not load notifications.');
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (!open) return;
    void loadNotifications();
  }, [open, loadNotifications]);

  const markAllRead = async () => {
    if (!accessToken) return;

    const previous = items;
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setLocalUnread(0);

    try {
      const response = await fetch(`${backendConfig.apiBaseUrl}/api/notifications/read-all`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to mark all notifications as read');
      }
    } catch {
      setItems(previous);
      setLocalUnread(previous.filter((item) => !item.read).length);
      setErrorMessage('Could not mark all as read.');
    }
  };

  const markOneRead = async (id: string) => {
    if (!accessToken) return;

    const current = items.find((item) => item.id === id);
    if (!current || current.read) return;

    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, read: true } : item)));
    setLocalUnread((prev) => Math.max(0, prev - 1));

    try {
      const response = await fetch(`${backendConfig.apiBaseUrl}/api/notifications/${id}/read`, {
        method: 'PATCH',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to mark notification as read');
      }
    } catch {
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, read: false } : item)));
      setLocalUnread((prev) => prev + 1);
      setErrorMessage('Could not update notification.');
    }
  };

  const dismiss = async (id: string) => {
    if (!accessToken) return;

    const previous = items;
    const removed = previous.find((item) => item.id === id);
    setItems((prev) => prev.filter((n) => n.id !== id));
    if (removed && !removed.read) {
      setLocalUnread((prev) => Math.max(0, prev - 1));
    }

    try {
      const response = await fetch(`${backendConfig.apiBaseUrl}/api/notifications/${id}`, {
        method: 'DELETE',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete notification');
      }
    } catch {
      setItems(previous);
      setLocalUnread(previous.filter((item) => !item.read).length);
      setErrorMessage('Could not dismiss notification.');
    }
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
                <span className="rounded-full bg-[#eff6ff] px-2 py-0.5 text-[11px] font-semibold text-[#717680]">
                  {localUnread} new
                </span>
              ) : null}
            </div>
            {localUnread > 0 ? (
              <button
                onClick={markAllRead}
                className="text-[12px] font-semibold text-[#717680] transition hover:text-[#717680]"
              >
                Mark all read
              </button>
            ) : null}
          </div>

          {/* Notification list */}
          <div className="max-h-[400px] overflow-y-auto">
            {isLoading ? (
              <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#e9eaeb] border-t-[#2563eb]" />
                <p className="text-[13px] text-[#717680]">Loading notifications…</p>
              </div>
            ) : errorMessage ? (
              <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
                <p className="text-[13px] text-[#717680]">{errorMessage}</p>
                <button
                  type="button"
                  onClick={() => void loadNotifications()}
                  className="rounded-full border border-[#d5d7da] bg-white px-3 py-1 text-[12px] font-semibold text-[#414651] transition hover:bg-[#f9fafb]"
                >
                  Retry
                </button>
              </div>
            ) : items.length === 0 ? (
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
                    onClick={() => void markOneRead(n.id)}
                    className={cn(
                      'relative flex cursor-pointer items-start gap-3 px-4 py-3.5 transition hover:bg-[#fafafa]',
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
                      <p className="mt-1 text-[11px] text-[#a4a7ae]">{formatTimestamp(n.createdAt)}</p>
                    </div>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        void dismiss(n.id);
                      }}
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

        </div>
      ) : null}
    </div>
  );
}
