'use client';

import * as ToastPrimitive from '@radix-ui/react-toast';
import { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle, Info, Warning, XCircle, X } from '@/components/ui/lucide-icons';
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

const typeConfig: Record<ToastType, { icon: typeof CheckCircle; bar: string; iconClass: string }> = {
  success: { icon: CheckCircle, bar: 'bg-[#17b26a]', iconClass: 'text-[#17b26a]' },
  error:   { icon: XCircle,     bar: 'bg-[#f04438]', iconClass: 'text-[#f04438]' },
  warning: { icon: Warning,     bar: 'bg-[#f79009]', iconClass: 'text-[#f79009]' },
  info:    { icon: Info,        bar: 'bg-[#2563eb]', iconClass: 'text-[#2563eb]' },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((opts: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { ...opts, id }]);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      <ToastPrimitive.Provider swipeDirection="right" duration={4500}>
        {children}

        {toasts.map((t) => {
          const { icon: Icon, bar, iconClass } = typeConfig[t.type];
          return (
            <ToastPrimitive.Root
              key={t.id}
              open
              onOpenChange={(open) => { if (!open) dismiss(t.id); }}
              className={cn(
                'group pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden',
                'rounded-xl border border-[#e9eaeb] bg-white px-4 py-3.5 shadow-lg',
                'data-[state=open]:animate-in data-[state=open]:slide-in-from-right-full data-[state=open]:fade-in-0',
                'data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right-full data-[state=closed]:fade-out-0',
                'data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)]',
                'data-[swipe=cancel]:translate-x-0 data-[swipe=cancel]:transition-[transform_200ms_ease-out]',
                'data-[swipe=end]:animate-out data-[swipe=end]:slide-out-to-right-full',
                'duration-300 ease-out'
              )}
            >
              {/* colored accent bar */}
              <span className={cn('absolute left-0 top-0 h-full w-1 rounded-l-xl', bar)} />

              <Icon className={cn('mt-0.5 h-[18px] w-[18px] shrink-0', iconClass)} weight="fill" />

              <div className="min-w-0 flex-1 pl-1">
                <ToastPrimitive.Title className="text-[13px] font-semibold text-[#181d27]">
                  {t.title}
                </ToastPrimitive.Title>
                {t.message ? (
                  <ToastPrimitive.Description className="mt-0.5 text-[12px] leading-5 text-[#717680]">
                    {t.message}
                  </ToastPrimitive.Description>
                ) : null}
              </div>

              <ToastPrimitive.Close
                onClick={() => dismiss(t.id)}
                className="ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[#a4a7ae] transition-colors hover:bg-[#f5f5f5] hover:text-[#717680]"
                aria-label="Dismiss"
              >
                <X className="h-3.5 w-3.5" weight="bold" />
              </ToastPrimitive.Close>
            </ToastPrimitive.Root>
          );
        })}

        <ToastPrimitive.Viewport className="fixed bottom-5 right-5 z-[100] flex max-h-screen w-[360px] flex-col gap-2 outline-none" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
