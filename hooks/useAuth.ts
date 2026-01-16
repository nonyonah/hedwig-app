import { Platform } from 'react-native';
import { usePrivy as usePrivyNative } from '@privy-io/expo';
import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Mock for web
const usePrivyWeb = () => ({
    user: null,
    isReady: true,
    login: async () => { console.log('Login not supported on web viewer'); },
    logout: async () => { console.log('Logout not supported on web viewer'); },
    getAccessToken: async () => null,
});

// Demo user object for when in demo mode
const DEMO_USER = {
    id: 'demo-privy-id-hedwig-app-review',
    email: { address: 'demo@hedwig.app' },
};

export const useAuth = () => {
    const [isDemo, setIsDemo] = useState(false);
    const [isCheckingDemo, setIsCheckingDemo] = useState(true);

    if (Platform.OS === 'web') {
        return usePrivyWeb();
    }

    // Get Privy hook (always called, regardless of demo mode)
    const privyHook = usePrivyNative();

    // Check for demo mode on mount
    useEffect(() => {
        const checkDemoMode = async () => {
            try {
                const demoFlag = await AsyncStorage.getItem('isDemo');
                const token = await AsyncStorage.getItem('demoToken');
                if (demoFlag === 'true' && token) {
                    setIsDemo(true);
                }
            } catch (error) {
                console.error('Error checking demo mode:', error);
            } finally {
                setIsCheckingDemo(false);
            }
        };
        checkDemoMode();
    }, []);

    // CRITICAL: getAccessToken ALWAYS checks AsyncStorage first
    // This ensures demo tokens are used even before React state updates
    const getAccessToken = useCallback(async (): Promise<string | null> => {
        // Always check AsyncStorage for demo mode (not React state)
        const demoFlag = await AsyncStorage.getItem('isDemo');
        if (demoFlag === 'true') {
            const demoToken = await AsyncStorage.getItem('demoToken');
            if (demoToken) {
                return demoToken;
            }
        }
        // Fall back to Privy token
        if (privyHook.user) {
            return await privyHook.getAccessToken();
        }
        return null;
    }, [privyHook.user, privyHook.getAccessToken]);

    // Handle demo logout
    const logout = useCallback(async () => {
        // Check if we're in demo mode
        const demoFlag = await AsyncStorage.getItem('isDemo');
        if (demoFlag === 'true') {
            await AsyncStorage.removeItem('isDemo');
            await AsyncStorage.removeItem('demoToken');
            setIsDemo(false);
            return;
        }
        // Otherwise use Privy logout
        await privyHook.logout();
    }, [privyHook.logout]);

    // Still checking demo mode? Return isReady: false to prevent redirects
    // This is critical - we need to wait until we know if we're in demo mode
    if (isCheckingDemo) {
        return {
            ...privyHook,
            isReady: false, // IMPORTANT: Block redirects until demo check completes
            getAccessToken, // Use our wrapper
            logout,
            isDemo: false,
        };
    }

    // Demo mode is active
    if (isDemo) {
        return {
            ...privyHook,
            user: DEMO_USER,
            isReady: true,
            getAccessToken,
            logout,
            isDemo: true,
        };
    }

    // Normal Privy mode
    return {
        ...privyHook,
        getAccessToken, // Always use our wrapper
        logout,
        isDemo: false,
    };
};
