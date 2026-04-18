'use client';

import { useEffect } from 'react';

export function PrintTrigger({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => window.print(), 600);
    return () => clearTimeout(timer);
  }, [enabled]);

  return null;
}
