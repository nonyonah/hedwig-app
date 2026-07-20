'use client';

import { useEffect } from 'react';

export function SWRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') return;
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Service worker registration failed (e.g. file protocol)
      });
    }
  }, []);

  return null;
}
