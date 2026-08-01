'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useToast } from './toast-provider';

if (process.env.NODE_ENV !== 'development') {
  const noop = () => {};
  console.error = noop;
  console.warn  = noop;
  console.log   = noop;
  console.debug = noop;
  console.info  = noop;
}

// Benign browser noise that should never surface as a toast.
// ResizeObserver loop errors fire during scroll while a React Aria
// popover (HeroUI Dropdown) is open inside a scrollable modal — harmless.
const BENIGN_MESSAGE_PATTERNS = [
  'ResizeObserver loop',
  'Script error.',
  'Non-Error promise rejection captured',
];

const isBenign = (msg: string) => BENIGN_MESSAGE_PATTERNS.some((p) => msg.includes(p));

export function GlobalErrorHandler({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  const lastToastRef = useRef<{ message: string; at: number } | null>(null);

  const report = useCallback((msg: string) => {
    const clean = String(msg || '').trim();
    if (!clean || isBenign(clean)) return;
    // Dedupe identical messages within 3s to avoid toast storms.
    const now = Date.now();
    const last = lastToastRef.current;
    if (last && last.message === clean && now - last.at < 3000) return;
    lastToastRef.current = { message: clean, at: now };
    toast({
      type: 'error',
      title: 'Something went wrong',
      message: clean.length > 120 ? clean.slice(0, 120) + '…' : clean,
    });
  }, [toast]);

  useEffect(() => {
    const onRejection = (event: PromiseRejectionEvent) => {
      const msg = event.reason?.message || String(event.reason || '');
      report(msg);
    };

    const onError = (event: ErrorEvent) => {
      const msg = event.error?.message || event.message || '';
      report(msg);
    };

    window.addEventListener('unhandledrejection', onRejection);
    window.addEventListener('error', onError);
    return () => {
      window.removeEventListener('unhandledrejection', onRejection);
      window.removeEventListener('error', onError);
    };
  }, [report]);

  return <>{children}</>;
}
