import '@walletconnect/react-native-compat';
import { createAppKit } from '@reown/appkit-react-native';
import { EthersAdapter } from '@reown/appkit-ethers-react-native';
import { base, celo, arbitrum, optimism } from 'viem/chains';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Storage } from '@reown/appkit-react-native';
import { safeJsonParse, safeJsonStringify } from '@walletconnect/safe-json';

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
    networks: [base, celo, arbitrum, optimism],
    defaultNetwork: base,
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
