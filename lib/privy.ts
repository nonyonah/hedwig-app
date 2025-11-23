// Privy configuration for Hedwig App
export const PRIVY_APP_ID = process.env.EXPO_PUBLIC_PRIVY_APP_ID || '';

if (!PRIVY_APP_ID) {
    console.warn('⚠️ PRIVY_APP_ID is not set. Please add EXPO_PUBLIC_PRIVY_APP_ID to your .env file.');
}

// Supported chains
export const CHAINS = {
    BASE: 8453,
    CELO: 42220,
    SOLANA: 'solana:mainnet',
} as const;

// Privy configuration
export const privyConfig = {
    appId: PRIVY_APP_ID,
    appearance: {
        theme: 'light',
        accentColor: '#3B82F6',
    },
    loginMethods: ['google', 'apple'],
    embeddedWallets: {
        createOnLogin: 'all-users', // Automatically create wallets for all users on login
        requireUserPasswordOnCreate: false,
    },
    supportedChains: [CHAINS.BASE, CHAINS.CELO],
};
