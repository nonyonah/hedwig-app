'use client';

import { useEffect } from 'react';
import { useToast } from './toast-provider';

if (process.env.NODE_ENV !== 'development') {
  const noop = () => {};
  console.error = noop;
  console.warn  = noop;
  console.log   = noop;
  console.debug = noop;
  console.info  = noop;
}

export function GlobalErrorHandler({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();

  useEffect(() => {
    const onRejection = (event: PromiseRejectionEvent) => {
      const msg = event.reason?.message || String(event.reason || '');
      if (!msg) return;
      toast({
        type: 'error',
        title: 'Something went wrong',
        message: msg.length > 120 ? msg.slice(0, 120) + '…' : msg,
      });
    };

    const onError = (event: ErrorEvent) => {
      const msg = event.error?.message || event.message || '';
      if (!msg) return;
      toast({
        type: 'error',
        title: 'Unexpected error',
        message: msg.length > 120 ? msg.slice(0, 120) + '…' : msg,
      });
    };

    window.addEventListener('unhandledrejection', onRejection);
    window.addEventListener('error', onError);
    return () => {
      window.removeEventListener('unhandledrejection', onRejection);
      window.removeEventListener('error', onError);
    };
  }, [toast]);

  return <>{children}</>;
}
