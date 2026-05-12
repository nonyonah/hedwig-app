export const PRIVY_APP_ID = process.env.EXPO_PUBLIC_PRIVY_APP_ID || '';
const IS_TESTNET = process.env.EXPO_PUBLIC_NETWORK_MODE === 'testnet';

if (!PRIVY_APP_ID) {
    console.warn('⚠️ PRIVY_APP_ID is not set. Please add EXPO_PUBLIC_PRIVY_APP_ID to your .env file.');
}

// Supported chains
export const CHAINS = {
    BASE: IS_TESTNET ? 84532 : 8453,
    ARBITRUM: IS_TESTNET ? 421614 : 42161,
    POLYGON: IS_TESTNET ? 80002 : 137,
    CELO: IS_TESTNET ? 44787 : 42220,
    OPTIMISM: IS_TESTNET ? 11155420 : 10,
    SOLANA: IS_TESTNET ? 'solana:devnet' : 'solana:mainnet',
} as const;

// Define chains directly to avoid Metro loading the whole viem/chains barrel.
// The barrel currently pulls in Tempo/Ox internals that fail to resolve in RN.
const EVM_SUPPORTED_CHAINS = IS_TESTNET
    ? [
        {
            id: 84532,
            name: 'Base Sepolia',
            nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
            rpcUrls: { default: { http: ['https://sepolia.base.org'] } },
            blockExplorers: { default: { name: 'Basescan Sepolia', url: 'https://sepolia.basescan.org' } },
        },
        {
            id: 421614,
            name: 'Arbitrum Sepolia',
            nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
            rpcUrls: { default: { http: ['https://sepolia-rollup.arbitrum.io/rpc'] } },
            blockExplorers: { default: { name: 'Arbiscan Sepolia', url: 'https://sepolia.arbiscan.io' } },
        },
        {
            id: 80002,
            name: 'Polygon Amoy',
            nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
            rpcUrls: { default: { http: ['https://rpc-amoy.polygon.technology'] } },
            blockExplorers: { default: { name: 'PolygonScan Amoy', url: 'https://amoy.polygonscan.com' } },
        },
        {
            id: 44787,
            name: 'Celo Alfajores',
            nativeCurrency: { name: 'Celo', symbol: 'CELO', decimals: 18 },
            rpcUrls: { default: { http: ['https://alfajores-forno.celo-testnet.org'] } },
            blockExplorers: { default: { name: 'CeloScan Alfajores', url: 'https://alfajores.celoscan.io' } },
        },
        {
            id: 11155420,
            name: 'OP Sepolia',
            nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
            rpcUrls: { default: { http: ['https://sepolia.optimism.io'] } },
            blockExplorers: { default: { name: 'OP Etherscan Sepolia', url: 'https://sepolia-optimism.etherscan.io' } },
        },
    ]
    : [
        {
            id: 8453,
            name: 'Base',
            nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
            rpcUrls: { default: { http: ['https://mainnet.base.org'] } },
            blockExplorers: { default: { name: 'Basescan', url: 'https://basescan.org' } },
        },
        {
            id: 42161,
            name: 'Arbitrum One',
            nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
            rpcUrls: { default: { http: ['https://arb1.arbitrum.io/rpc'] } },
            blockExplorers: { default: { name: 'Arbiscan', url: 'https://arbiscan.io' } },
        },
        {
            id: 137,
            name: 'Polygon',
            nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
            rpcUrls: { default: { http: ['https://polygon-rpc.com'] } },
            blockExplorers: { default: { name: 'PolygonScan', url: 'https://polygonscan.com' } },
        },
        {
            id: 42220,
            name: 'Celo',
            nativeCurrency: { name: 'Celo', symbol: 'CELO', decimals: 18 },
            rpcUrls: { default: { http: ['https://forno.celo.org'] } },
            blockExplorers: { default: { name: 'CeloScan', url: 'https://celoscan.io' } },
        },
        {
            id: 10,
            name: 'OP Mainnet',
            nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
            rpcUrls: { default: { http: ['https://mainnet.optimism.io'] } },
            blockExplorers: { default: { name: 'OP Etherscan', url: 'https://optimistic.etherscan.io' } },
        },
    ];

// Privy configuration
export const privyConfig = {
    appId: PRIVY_APP_ID,
    appearance: {
        theme: 'light',
        accentColor: '#3B82F6',
    },
    loginMethods: ['google', 'apple'],
    embedded: {
        ethereum: {
            createOnLogin: 'all-users' as const,
        },
        solana: {
            createOnLogin: 'all-users' as const,
        },
    },
    supportedChains: EVM_SUPPORTED_CHAINS,
};
