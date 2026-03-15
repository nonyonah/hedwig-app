'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { ReactNode } from 'react';
import { privyConfig } from '@/lib/auth/config';

export function HedwigPrivyProvider({ children }: { children: ReactNode }) {
  if (!privyConfig.appId) {
    return <>{children}</>;
  }

  return (
    <PrivyProvider
      appId={privyConfig.appId}
      config={{
        loginMethods: [...privyConfig.loginMethods],
        appearance: {
          theme: 'dark',
          accentColor: '#14b8a6'
        }
      }}
    >
      {children}
    </PrivyProvider>
  );
}
