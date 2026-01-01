import { PrivyProvider } from '@privy-io/react-auth';
import { ReactNode } from 'react';

interface PrivyWrapperProps {
    children: ReactNode;
}

export function PrivyWrapper({ children }: PrivyWrapperProps) {
    const appId = import.meta.env.VITE_PRIVY_APP_ID;

    if (!appId) {
        console.error('VITE_PRIVY_APP_ID not configured');
        return <>{children}</>;
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
                    createOnLogin: 'all-users',
                },
            }}
        >
            {children}
        </PrivyProvider>
    );
}
