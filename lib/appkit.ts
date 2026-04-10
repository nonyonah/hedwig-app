import '@walletconnect/react-native-compat';
import { createAppKit } from '@reown/appkit-react-native';
import { EthersAdapter } from '@reown/appkit-ethers-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Storage } from '@reown/appkit-react-native';
import { safeJsonParse, safeJsonStringify } from '@walletconnect/safe-json';

// Define chains directly to avoid loading broken chains from viem/chains
const base = {
    id: 8453,
    name: 'Base',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: ['https://mainnet.base.org'] } },
    blockExplorers: { default: { name: 'Basescan', url: 'https://basescan.org' } },
} as const;

const baseSepolia = {
    id: 84532,
    name: 'Base Sepolia',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: ['https://sepolia.base.org'] } },
    blockExplorers: { default: { name: 'Basescan Sepolia', url: 'https://sepolia.basescan.org' } },
} as const;

const arbitrum = {
    id: 42161,
    name: 'Arbitrum One',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: ['https://arb1.arbitrum.io/rpc'] } },
    blockExplorers: { default: { name: 'Arbiscan', url: 'https://arbiscan.io' } },
} as const;

const arbitrumSepolia = {
    id: 421614,
    name: 'Arbitrum Sepolia',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: ['https://sepolia-rollup.arbitrum.io/rpc'] } },
    blockExplorers: { default: { name: 'Arbiscan Sepolia', url: 'https://sepolia.arbiscan.io' } },
} as const;

const polygon = {
    id: 137,
    name: 'Polygon',
    nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
    rpcUrls: { default: { http: ['https://polygon-rpc.com'] } },
    blockExplorers: { default: { name: 'PolygonScan', url: 'https://polygonscan.com' } },
} as const;

const polygonAmoy = {
    id: 80002,
    name: 'Polygon Amoy',
    nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
    rpcUrls: { default: { http: ['https://rpc-amoy.polygon.technology'] } },
    blockExplorers: { default: { name: 'PolygonScan Amoy', url: 'https://amoy.polygonscan.com' } },
} as const;

const celo = {
    id: 42220,
    name: 'Celo',
    nativeCurrency: { name: 'Celo', symbol: 'CELO', decimals: 18 },
    rpcUrls: { default: { http: ['https://forno.celo.org'] } },
    blockExplorers: { default: { name: 'CeloScan', url: 'https://celoscan.io' } },
} as const;

const celoAlfajores = {
    id: 44787,
    name: 'Celo Alfajores',
    nativeCurrency: { name: 'Celo', symbol: 'CELO', decimals: 18 },
    rpcUrls: { default: { http: ['https://alfajores-forno.celo-testnet.org'] } },
    blockExplorers: { default: { name: 'CeloScan Alfajores', url: 'https://alfajores.celoscan.io' } },
} as const;

const lisk = {
    id: 1135,
    name: 'Lisk',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: ['https://rpc.api.lisk.com'] } },
    blockExplorers: { default: { name: 'Blockscout', url: 'https://blockscout.lisk.com' } },
} as const;

const liskSepolia = {
    id: 4202,
    name: 'Lisk Sepolia',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: ['https://rpc.sepolia-api.lisk.com'] } },
    blockExplorers: { default: { name: 'Blockscout Sepolia', url: 'https://sepolia-blockscout.lisk.com' } },
} as const;

const IS_TESTNET = process.env.EXPO_PUBLIC_NETWORK_MODE === 'testnet';


const projectId = process.env.EXPO_PUBLIC_REOWN_PROJECT_ID || '';

if (!projectId) {
    console.warn('⚠️ REOWN_PROJECT_ID is not set. Please add EXPO_PUBLIC_REOWN_PROJECT_ID to your .env file.');
    console.warn('Get your project ID at: https://dashboard.reown.com');
}

// Create storage wrapper for AsyncStorage
const storage: Storage = {
    getKeys: async () => {
        const keys = await AsyncStorage.getAllKeys();
        return keys as string[]; // Cast from readonly to mutable
    },
    getEntries: async <T = any>(): Promise<[string, T][]> => {
        const keys = await AsyncStorage.getAllKeys();
        const entries = await AsyncStorage.multiGet(keys);
        return entries.map(([key, value]) => [key, safeJsonParse(value ?? '') as T]);
    },
    setItem: async <T = any>(key: string, value: T) => {
        await AsyncStorage.setItem(key, safeJsonStringify(value));
    },
    getItem: async <T = any>(key: string): Promise<T | undefined> => {
        const item = await AsyncStorage.getItem(key);
        if (typeof item === 'undefined' || item === null) {
            return undefined;
        }
        return safeJsonParse(item) as T;
    },
    removeItem: async (key: string) => {
        await AsyncStorage.removeItem(key);
    },
};

const ethersAdapter = new EthersAdapter();

export const paymentAppKit = createAppKit({
    projectId,
    storage,
    networks: IS_TESTNET
        ? [baseSepolia, arbitrumSepolia, polygonAmoy, celoAlfajores, liskSepolia]
        : [base, arbitrum, polygon, celo, lisk],
    defaultNetwork: IS_TESTNET ? baseSepolia : base,
    adapters: [ethersAdapter],
    metadata: {
        name: 'Hedwig Payments',
        description: 'Secure crypto payments for freelancers',
        url: 'https://hedwig.app',
        icons: ['https://hedwig.app/icon.png'],
        redirect: {
            native: 'hedwig://',
            universal: 'https://hedwig.app',
        },
    },
});
