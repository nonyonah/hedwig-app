import { Platform } from 'react-native';
import { useEmbeddedEthereumWallet as useWalletNative } from '@privy-io/expo';

// Mock for web
const useWalletWeb = () => ({
    wallets: [],
    createWallet: async () => { console.log('Wallet creation not supported on web viewer'); },
});

export const useWallet = () => {
    if (Platform.OS === 'web') {
        return useWalletWeb();
    }
    return useWalletNative();
};
