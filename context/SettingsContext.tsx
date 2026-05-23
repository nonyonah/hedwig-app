import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme, Appearance } from 'react-native';
let SystemUI: { setBackgroundColorAsync: (color: string) => Promise<void> } | null = null;
try { SystemUI = require('expo-system-ui'); } catch { /* native module not available in this build */ }

export type Currency = 'USD' | 'NGN' | 'GHS' | 'KES';

interface SettingsContextType {
    currency: Currency;
    setCurrency: (currency: Currency) => Promise<void>;
    currentTheme: 'light' | 'dark';
    hapticsEnabled: boolean;
    setHapticsEnabled: (enabled: boolean) => Promise<void>;
    liveTrackingEnabled: boolean;
    setLiveTrackingEnabled: (enabled: boolean) => Promise<void>;
    lockScreenEnabled: boolean;
    setLockScreenEnabled: (enabled: boolean) => Promise<void>;
    gatewayAutoDepositEnabled: boolean;
    setGatewayAutoDepositEnabled: (enabled: boolean) => Promise<void>;
    hideMicrotransactions: boolean;
    setHideMicrotransactions: (enabled: boolean) => Promise<void>;
    hideUnusualActivity: boolean;
    setHideUnusualActivity: (enabled: boolean) => Promise<void>;
    cameraSoundEnabled: boolean;
    setCameraSoundEnabled: (enabled: boolean) => Promise<void>;
    settingsLoaded: boolean;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const systemColorScheme = useColorScheme();
    const [currency, setCurrencyState] = useState<Currency>('USD');
    const [hapticsEnabled, setHapticsEnabledState] = useState<boolean>(true);
    const [liveTrackingEnabled, setLiveTrackingEnabledState] = useState<boolean>(true);
    const [lockScreenEnabled, setLockScreenEnabledState] = useState<boolean>(false);
    // Gateway auto-deposit is opt-in. When OFF, the app leaves USDC on each
    // chain at the EOA so users can manage liquidity manually. Existing
    // Gateway balances stay regardless — only future deposits are gated.
    const [gatewayAutoDepositEnabled, setGatewayAutoDepositEnabledState] = useState<boolean>(false);
    const [hideMicrotransactions, setHideMicrotransactionsState] = useState<boolean>(false);
    const [hideUnusualActivity, setHideUnusualActivityState] = useState<boolean>(false);
    const [cameraSoundEnabled, setCameraSoundEnabledState] = useState<boolean>(true);
    const [settingsLoaded, setSettingsLoaded] = useState<boolean>(false);

    // Always follow system color scheme
    const currentTheme: 'light' | 'dark' = systemColorScheme === 'dark' ? 'dark' : 'light';

    // Initial load
    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const storedCurrency = await AsyncStorage.getItem('settings_currency');
            const storedHaptics = await AsyncStorage.getItem('settings_haptics');
            const storedLiveTracking = await AsyncStorage.getItem('settings_live_tracking');
            const storedHideMicrotransactions = await AsyncStorage.getItem('wallet_hide_microtransactions');
            const storedHideUnusualActivity = await AsyncStorage.getItem('wallet_hide_unusual_activity');
            const storedCameraSound = await AsyncStorage.getItem('settings_camera_sound');

            if (storedCurrency) setCurrencyState(storedCurrency as Currency);
            if (storedHaptics !== null) setHapticsEnabledState(storedHaptics === 'true');
            if (storedLiveTracking !== null) setLiveTrackingEnabledState(storedLiveTracking === 'true');
            if (storedHideMicrotransactions !== null) setHideMicrotransactionsState(storedHideMicrotransactions === 'true');
            if (storedHideUnusualActivity !== null) setHideUnusualActivityState(storedHideUnusualActivity === 'true');
            if (storedCameraSound !== null) setCameraSoundEnabledState(storedCameraSound === 'true');
            const storedLockScreen = await AsyncStorage.getItem('settings_lock_screen');
            if (storedLockScreen !== null) setLockScreenEnabledState(storedLockScreen === 'true');
        } catch (error) {
            console.error('Failed to load settings:', error);
        } finally {
            setSettingsLoaded(true);
        }
    };

    const setCurrency = async (newCurrency: Currency) => {
        try {
            setCurrencyState(newCurrency);
            await AsyncStorage.setItem('settings_currency', newCurrency);
        } catch (error) {
            console.error('Failed to save currency:', error);
        }
    };

    const setHapticsEnabled = async (enabled: boolean) => {
        try {
            setHapticsEnabledState(enabled);
            await AsyncStorage.setItem('settings_haptics', enabled ? 'true' : 'false');
        } catch (error) {
            console.error('Failed to save haptics setting:', error);
        }
    };

    const setLiveTrackingEnabled = async (enabled: boolean) => {
        try {
            setLiveTrackingEnabledState(enabled);
            await AsyncStorage.setItem('settings_live_tracking', enabled ? 'true' : 'false');
        } catch (error) {
            console.error('Failed to save live tracking setting:', error);
        }
    };

    const setLockScreenEnabled = async (enabled: boolean) => {
        try {
            setLockScreenEnabledState(enabled);
            await AsyncStorage.setItem('settings_lock_screen', enabled ? 'true' : 'false');
        } catch (error) {
            console.error('Failed to save lock screen setting:', error);
        }
    };

    const setGatewayAutoDepositEnabled = useCallback(async (enabled: boolean) => {
        try {
            setGatewayAutoDepositEnabledState(enabled);
        } catch (error) {
            console.error('Failed to save gateway auto-deposit setting:', error);
        }
    }, []);

    const setHideMicrotransactions = useCallback(async (enabled: boolean) => {
        try {
            setHideMicrotransactionsState(enabled);
            await AsyncStorage.setItem('wallet_hide_microtransactions', enabled ? 'true' : 'false');
        } catch (error) {
            console.error('Failed to save wallet microtransaction filter:', error);
        }
    }, []);

    const setHideUnusualActivity = useCallback(async (enabled: boolean) => {
        try {
            setHideUnusualActivityState(enabled);
            await AsyncStorage.setItem('wallet_hide_unusual_activity', enabled ? 'true' : 'false');
        } catch (error) {
            console.error('Failed to save wallet unusual activity filter:', error);
        }
    }, []);

    const setCameraSoundEnabled = useCallback(async (enabled: boolean) => {
        try {
            setCameraSoundEnabledState(enabled);
            await AsyncStorage.setItem('settings_camera_sound', enabled ? 'true' : 'false');
        } catch (error) {
            console.error('Failed to save camera sound setting:', error);
        }
    }, []);

    useEffect(() => {
        const targetBackground = currentTheme === 'dark' ? '#000000' : '#FFFFFF';
        SystemUI?.setBackgroundColorAsync(targetBackground).catch(() => {
            // No-op: background color sync is best-effort.
        });
    }, [currentTheme]);

    return (
        <SettingsContext.Provider value={{
            currency,
            setCurrency,
            currentTheme,
            hapticsEnabled,
            setHapticsEnabled,
            liveTrackingEnabled,
            setLiveTrackingEnabled,
            lockScreenEnabled,
            setLockScreenEnabled,
            gatewayAutoDepositEnabled,
            setGatewayAutoDepositEnabled,
            hideMicrotransactions,
            setHideMicrotransactions,
            hideUnusualActivity,
            setHideUnusualActivity,
            cameraSoundEnabled,
            setCameraSoundEnabled,
            settingsLoaded,
        }}>
            {children}
        </SettingsContext.Provider>
    );
};

export const useSettings = () => {
    const context = useContext(SettingsContext);
    if (context === undefined) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }
    return context;
};
