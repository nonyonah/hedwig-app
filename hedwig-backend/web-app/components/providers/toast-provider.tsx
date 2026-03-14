'use client';

import { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle, Info, Warning, XCircle, X } from '@phosphor-icons/react/dist/ssr';
import { cn } from '@/lib/utils';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
}

interface ToastContextValue {
  toast: (opts: Omit<Toast, 'id'>) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

const toastConfig: Record<
  ToastType,
  { icon: typeof CheckCircle; iconClass: string; borderClass: string; bgClass: string }
> = {
  success: {
    icon: CheckCircle,
    iconClass: 'text-[#17b26a]',
    borderClass: 'border-l-[#17b26a]',
    bgClass: 'bg-white'
  },
  error: {
    icon: XCircle,
    iconClass: 'text-[#f04438]',
    borderClass: 'border-l-[#f04438]',
    bgClass: 'bg-white'
  },
  warning: {
    icon: Warning,
    iconClass: 'text-[#f79009]',
    borderClass: 'border-l-[#f79009]',
    bgClass: 'bg-white'
  },
  info: {
    icon: Info,
    iconClass: 'text-[#2563eb]',
    borderClass: 'border-l-[#2563eb]',
    bgClass: 'bg-white'
  }
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((opts: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { ...opts, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const dismiss = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}

      {/* UUI Toast stack — bottom-right, max 4 visible */}
      <div
        className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2.5"
        aria-live="polite"
        aria-label="Notifications"
      >
        {toasts.slice(-4).map((t) => {
          const { icon: Icon, iconClass, borderClass } = toastConfig[t.type];
          return (
            <div
              key={t.id}
              className={cn(
                'flex w-[360px] items-start gap-3 rounded-xl border border-[#e9eaeb] border-l-4 bg-white px-4 py-3.5 shadow-lg',
                borderClass,
                'animate-in slide-in-from-right-5 fade-in-0 duration-200'
              )}
            >
              <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', iconClass)} weight="fill" />
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-[#181d27]">{t.title}</p>
                {t.message ? <p className="mt-0.5 text-[13px] leading-5 text-[#717680]">{t.message}</p> : null}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                className="ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[#a4a7ae] transition duration-100 hover:bg-[#f5f5f5] hover:text-[#717680]"
                aria-label="Dismiss"
              >
                <X className="h-3.5 w-3.5" weight="bold" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
