import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SolanaAdapter } from '@reown/appkit-adapter-solana';
import { base } from 'wagmi/chains';
import { wagmiConfig } from './wagmiConfig';
import { appKitConfig } from './appKitConfig';
import type { ReactNode } from 'react';

const queryClient = new QueryClient();

interface AppKitProviderProps {
  children: ReactNode;
}

export function AppKitProvider({ children }: AppKitProviderProps) {
  const projectId = import.meta.env.VITE_REOWN_PROJECT_ID;

  if (!projectId) {
    return (
      <div className="container">
        <div className="card" style={{ textAlign: 'center', padding: '48px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '16px', color: '#ef4444' }}>
            Configuration Error
          </h1>
          <p style={{ color: '#666', marginBottom: '24px' }}>
            Reown AppKit is not configured. Please contact support.
          </p>
          <code style={{
            fontSize: '12px',
            background: '#f3f4f6',
            padding: '8px 16px',
            borderRadius: '4px',
            color: '#6b7280'
          }}>
            VITE_REOWN_PROJECT_ID is missing
          </code>
        </div>
      </div>
    );
  }

  // Initialize AppKit with adapters
  const wagmiAdapter = new WagmiAdapter({
    networks: [base],
    projectId,
  });

  createAppKit({
    adapters: [wagmiAdapter, new SolanaAdapter()],
    networks: [base],
    projectId,
    ...appKitConfig,
  });

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
