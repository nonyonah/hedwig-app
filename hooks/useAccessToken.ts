import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePrivy } from '@privy-io/expo';
import { useCallback, useState, useEffect } from 'react';

/**
 * Hook to get the access token for API calls
 * Handles both regular Privy tokens and demo mode tokens
 */
export const useAccessToken = () => {
    const { getAccessToken: getPrivyToken, user } = usePrivy();
    const [isDemo, setIsDemo] = useState(false);

    // Check if we're in demo mode on mount
    useEffect(() => {
        const checkDemoMode = async () => {
            const demoFlag = await AsyncStorage.getItem('isDemo');
            setIsDemo(demoFlag === 'true');
        };
        checkDemoMode();
    }, []);

    const getAccessToken = useCallback(async (): Promise<string | null> => {
        // First check if we're in demo mode
        const demoFlag = await AsyncStorage.getItem('isDemo');
        if (demoFlag === 'true') {
            const demoToken = await AsyncStorage.getItem('demoToken');
            if (demoToken) {
                return demoToken;
            }
        }

        // Otherwise get the regular Privy token
        if (user) {
            return await getPrivyToken();
        }

        return null;
    }, [getPrivyToken, user]);

    const clearDemoMode = useCallback(async () => {
        await AsyncStorage.removeItem('isDemo');
        await AsyncStorage.removeItem('demoToken');
        setIsDemo(false);
    }, []);

    return {
        getAccessToken,
        isDemo,
        clearDemoMode,
        user,
    };
};

/**
 * Check if currently in demo mode
 */
export const checkIsDemoMode = async (): Promise<boolean> => {
    const demoFlag = await AsyncStorage.getItem('isDemo');
    return demoFlag === 'true';
};

/**
 * Get demo token if in demo mode
 */
export const getDemoToken = async (): Promise<string | null> => {
    const demoFlag = await AsyncStorage.getItem('isDemo');
    if (demoFlag === 'true') {
        return await AsyncStorage.getItem('demoToken');
    }
    return null;
};
