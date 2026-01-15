import { PrivyProvider } from '@privy-io/react-auth';
import type { ReactNode } from 'react';

interface PrivyWrapperProps {
    children: ReactNode;
}

export function PrivyWrapper({ children }: PrivyWrapperProps) {
    const appId = import.meta.env.VITE_PRIVY_APP_ID;

    if (!appId) {
        console.error('VITE_PRIVY_APP_ID not configured');
        // Show error UI instead of just rendering children (which would cause usePrivy to fail)
        return (
            <div className="container">
                <div className="card" style={{ textAlign: 'center', padding: '48px' }}>
                    <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '16px', color: '#ef4444' }}>
                        Configuration Error
                    </h1>
                    <p style={{ color: '#666', marginBottom: '24px' }}>
                        Privy is not configured. Please contact support.
                    </p>
                    <code style={{
                        fontSize: '12px',
                        background: '#f3f4f6',
                        padding: '8px 16px',
                        borderRadius: '4px',
                        color: '#6b7280'
                    }}>
                        VITE_PRIVY_APP_ID is missing
                    </code>
                </div>
            </div>
        );
    }

    return (
        <PrivyProvider
            appId={appId}
            config={{
                appearance: {
                    theme: 'dark',
                    accentColor: '#7c3aed',
                    logo: '/hedwig-logo.png',
                },
                loginMethods: ['email', 'google', 'apple'],
                embeddedWallets: {
                    ethereum: {
                        createOnLogin: 'all-users',
                    },
                    solana: {
                        createOnLogin: 'all-users',
                    },
                },
            }}
        >
            {children}
        </PrivyProvider>
    );
}
