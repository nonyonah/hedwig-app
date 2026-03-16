'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { ReactNode, useEffect } from 'react';
import { privyConfig } from '@/lib/auth/config';

// Privy SDK passes `isActive` to native DOM elements in React 19 which now
// forwards unknown props instead of silently dropping them. Suppress just this
// warning until Privy ships a fix.
function useSuppressPrivyDomPropWarning() {
  useEffect(() => {
    const original = console.error.bind(console);
    console.error = (...args: unknown[]) => {
      if (
        typeof args[0] === 'string' &&
        args[0].includes('isActive') &&
        args[0].includes('DOM element')
      ) return;
      original(...args);
    };
    return () => { console.error = original; };
  }, []);
}

export function HedwigPrivyProvider({ children }: { children: ReactNode }) {
  useSuppressPrivyDomPropWarning();

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
