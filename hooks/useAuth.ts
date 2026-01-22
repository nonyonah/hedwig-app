
import { useEffect, useState, useCallback } from 'react';
import { usePrivy, useLoginWithEmail } from '@privy-io/expo';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Demo user object for when in demo mode
const DEMO_USER = {
    id: 'demo-user-hedwig-app-review',
    email: 'demo@hedwig.app',
};

export const useAuth = () => {
    const { user: privyUser, isReady: isPrivyReady, getAccessToken, logout: privyLogout } = usePrivy();
    const [user, setUser] = useState<any>(null);
    const [isReady, setIsReady] = useState(false);
    const [isDemo, setIsDemo] = useState(false);

    // Sync Privy user to our user state
    useEffect(() => {
        const checkDemo = async () => {
            const demoFlag = await AsyncStorage.getItem('isDemo');
            const demoToken = await AsyncStorage.getItem('demoToken');

            if (demoFlag === 'true' && demoToken) {
                setIsDemo(true);
                setUser(DEMO_USER);
                setIsReady(true);
                return;
            }

            if (isPrivyReady) {
                setUser(privyUser);
                setIsReady(true);
            }
        };

        checkDemo();
    }, [isPrivyReady, privyUser]);

    const logout = useCallback(async () => {
        const demoFlag = await AsyncStorage.getItem('isDemo');
        if (demoFlag === 'true') {
            await AsyncStorage.removeItem('isDemo');
            await AsyncStorage.removeItem('demoToken');
            setIsDemo(false);
            setUser(null);
            return;
        }

        await privyLogout();
        setUser(null);
    }, [privyLogout]);

    const getAuthToken = useCallback(async () => {
        const demoFlag = await AsyncStorage.getItem('isDemo');
        if (demoFlag === 'true') {
            return await AsyncStorage.getItem('demoToken');
        }
        return await getAccessToken();
    }, [getAccessToken]);

    return {
        user,
        isReady,
        isDemo,
        logout,
        getAccessToken: getAuthToken,
    };
};
