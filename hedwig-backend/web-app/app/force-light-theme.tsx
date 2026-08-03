'use client';

export function ForceLightTheme({ children }: { children: React.ReactNode }) {
  return <div data-theme="light">{children}</div>;
}