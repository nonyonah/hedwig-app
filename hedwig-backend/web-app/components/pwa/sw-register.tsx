'use client';

import { useEffect } from 'react';

export function SWRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') return;
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
      // Unregister any previously-activated SW from a stale version
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg?.active && !reg.waiting && !reg.installing) {
          reg.unregister();
          navigator.serviceWorker.register('/sw.js').catch(() => {});
        }
      });
    }
  }, []);

  return null;
}
