'use client';

import { useEffect } from 'react';

export function SWRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    if (process.env.NODE_ENV === 'development') {
      // Dev mode: unregister any stale SW left from a production build.
      // Without this, a previously-installed SW intercepts dev requests and
      // serves stale cached chunks, requiring Cmd+Shift+R to fix.
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg) reg.unregister();
      });
      return;
    }

    // Production: register with cleanup of any prior stale version
    navigator.serviceWorker.register('/sw.js').catch(() => {});
    navigator.serviceWorker.getRegistration().then((reg) => {
      if (reg?.active && !reg.waiting && !reg.installing) {
        reg.unregister();
        navigator.serviceWorker.register('/sw.js').catch(() => {});
      }
    });
  }, []);

  return null;
}
