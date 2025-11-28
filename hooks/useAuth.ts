import { Platform } from 'react-native';
import { usePrivy as usePrivyNative } from '@privy-io/expo';

// Mock for web
const usePrivyWeb = () => ({
    user: null,
    isReady: true,
    login: async () => { console.log('Login not supported on web viewer'); },
    logout: async () => { console.log('Logout not supported on web viewer'); },
    getAccessToken: async () => null,
});

export const useAuth = () => {
    if (Platform.OS === 'web') {
        return usePrivyWeb();
    }
    return usePrivyNative();
};
