'use client';

import { useEffect } from 'react';
import { useTheme } from 'next-themes';

export function ForceLightTheme({ children }: { children: React.ReactNode }) {
  const { setTheme } = useTheme();

  useEffect(() => {
    setTheme('light');
  }, [setTheme]);

  return <div data-theme="light">{children}</div>;
}
