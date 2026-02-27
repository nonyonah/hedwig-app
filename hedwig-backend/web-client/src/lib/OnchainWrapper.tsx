import { OnchainKitProvider } from '@coinbase/onchainkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { WagmiProvider } from 'wagmi';
import { baseSepolia } from 'viem/chains';
import { wagmiConfig } from './wagmiConfig';

interface OnchainWrapperProps {
  children: ReactNode;
}

export function OnchainWrapper({ children }: OnchainWrapperProps) {
  const [queryClient] = useState(() => new QueryClient());
  const apiKey = import.meta.env.VITE_ONCHAINKIT_API_KEY;

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <OnchainKitProvider
          apiKey={apiKey}
          chain={baseSepolia}
        >
          {children}
        </OnchainKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
