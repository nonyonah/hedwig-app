
import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme, Appearance, ColorSchemeName } from 'react-native';
let SystemUI: { setBackgroundColorAsync: (color: string) => Promise<void> } | null = null;
try { SystemUI = require('expo-system-ui'); } catch { /* native module not available in this build */ }

export type Currency = 'USD' | 'NGN' | 'GHS' | 'KES';
export type Theme = 'light' | 'dark' | 'system';

interface SettingsContextType {
    currency: Currency;
    setCurrency: (currency: Currency) => Promise<void>;
    theme: Theme;
    setTheme: (theme: Theme) => Promise<void>;
    toggleTheme: () => Promise<void>;
    currentTheme: 'light' | 'dark'; // Resolved theme (if system)
    hapticsEnabled: boolean;
    setHapticsEnabled: (enabled: boolean) => Promise<void>;
    liveTrackingEnabled: boolean;
    setLiveTrackingEnabled: (enabled: boolean) => Promise<void>;
    lockScreenEnabled: boolean;
    setLockScreenEnabled: (enabled: boolean) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

const resolveToAppTheme = (colorScheme: ColorSchemeName | null | undefined): 'light' | 'dark' =>
    colorScheme === 'dark' ? 'dark' : 'light';

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const systemColorScheme = useColorScheme();
    const [deviceTheme, setDeviceTheme] = useState<'light' | 'dark'>(resolveToAppTheme(Appearance.getColorScheme()));
    const [currency, setCurrencyState] = useState<Currency>('USD');
    const [theme, setThemeState] = useState<Theme>('system');
    const [hapticsEnabled, setHapticsEnabledState] = useState<boolean>(true);
    const [liveTrackingEnabled, setLiveTrackingEnabledState] = useState<boolean>(true);
    const [lockScreenEnabled, setLockScreenEnabledState] = useState<boolean>(true);

    // Listen for system theme changes
    useEffect(() => {
        const subscription = Appearance.addChangeListener(({ colorScheme }) => {
            console.log('[Settings] System theme changed to:', colorScheme);
            setDeviceTheme(resolveToAppTheme(colorScheme));
        });
        return () => subscription.remove();
    }, []);

    // Initial load
    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const storedCurrency = await AsyncStorage.getItem('settings_currency');
            const storedTheme = await AsyncStorage.getItem('settings_theme');
            const storedHaptics = await AsyncStorage.getItem('settings_haptics');
            const storedLiveTracking = await AsyncStorage.getItem('settings_live_tracking');
            const storedLockScreen = await AsyncStorage.getItem('settings_lock_screen');

            if (storedCurrency) setCurrencyState(storedCurrency as Currency);
            if (storedTheme) setThemeState(storedTheme as Theme);
            if (storedHaptics !== null) setHapticsEnabledState(storedHaptics === 'true');
            if (storedLiveTracking !== null) setLiveTrackingEnabledState(storedLiveTracking === 'true');
            if (storedLockScreen !== null) setLockScreenEnabledState(storedLockScreen === 'true');
        } catch (error) {
            console.error('Failed to load settings:', error);
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

    const setTheme = async (newTheme: Theme) => {
        try {
            console.log('[Settings] Setting theme to:', newTheme);
            setThemeState(newTheme);
            await AsyncStorage.setItem('settings_theme', newTheme);
        } catch (error) {
            console.error('Failed to save theme:', error);
        }
    };

    const toggleTheme = async () => {
        const nextTheme = theme === 'light' ? 'dark' : 'light';
        await setTheme(nextTheme);
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

    // Use deviceTheme (from listener) or systemColorScheme (from hook) - prioritize the reactive one
    const resolvedSystemTheme = resolveToAppTheme(deviceTheme || systemColorScheme);
    const currentTheme = theme === 'system' ? resolvedSystemTheme : theme;

    useEffect(() => {
        const targetColorScheme: ColorSchemeName = theme === 'system' ? 'unspecified' : theme;
        if (typeof Appearance.setColorScheme === 'function') {
            Appearance.setColorScheme(targetColorScheme);
        }
    }, [theme]);

    useEffect(() => {
        const targetBackground = currentTheme === 'dark' ? '#000000' : '#FFFFFF';
        SystemUI?.setBackgroundColorAsync(targetBackground).catch(() => {
            // No-op: background color sync is best-effort.
        });
    }, [currentTheme]);

    console.log('[Settings] Theme state:', { storedTheme: theme, deviceTheme, systemColorScheme, currentTheme });

    return (
        <SettingsContext.Provider value={{
            currency,
            setCurrency,
            theme,
            setTheme,
            toggleTheme,
            currentTheme,
            hapticsEnabled,
            setHapticsEnabled,
            liveTrackingEnabled,
            setLiveTrackingEnabled,
            lockScreenEnabled,
            setLockScreenEnabled
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
