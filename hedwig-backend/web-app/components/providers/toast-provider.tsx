'use client';

import { Toast, toast as herouiToast } from '@heroui/react';
import { useCallback } from 'react';

const typeMap: Record<string, (title: string, opts?: { description?: string }) => void> = {
  success: herouiToast.success,
  error: herouiToast.danger,
  warning: herouiToast.warning,
  info: herouiToast.info,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Toast.Provider />
      {children}
    </>
  );
}

export function useToast() {
  const toast = useCallback((opts: { type: string; title: string; message?: string }) => {
    const fn = typeMap[opts.type] ?? herouiToast;
    fn(opts.title, opts.message ? { description: opts.message } : undefined);
  }, []);

  return { toast };
}
