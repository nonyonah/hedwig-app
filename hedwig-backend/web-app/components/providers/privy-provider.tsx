'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { ReactNode, useMemo } from 'react';
import { privyConfig } from '@/lib/auth/config';
import { getPrivySolanaRpcs } from '@/lib/gateway/privy-solana-rpc';

export function HedwigPrivyProvider({ children }: { children: ReactNode }) {
  const solanaRpcs = useMemo(() => getPrivySolanaRpcs(), []);

  if (!privyConfig.appId) {
    return <>{children}</>;
  }

  return (
    <PrivyProvider
      appId={privyConfig.appId}
      config={{
        loginMethods: [...privyConfig.loginMethods],
        embeddedWallets: privyConfig.embeddedWallets,
        solana: { rpcs: solanaRpcs as any },
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
