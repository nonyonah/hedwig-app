
import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';

export type Currency = 'USD' | 'NGN' | 'GHS' | 'KES';
export type Theme = 'light' | 'dark' | 'system';

interface SettingsContextType {
    currency: Currency;
    setCurrency: (currency: Currency) => Promise<void>;
    theme: Theme;
    setTheme: (theme: Theme) => Promise<void>;
    toggleTheme: () => Promise<void>;
    currentTheme: 'light' | 'dark'; // Resolved theme (if system)
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const systemColorScheme = useColorScheme();
    const [currency, setCurrencyState] = useState<Currency>('USD');
    const [theme, setThemeState] = useState<Theme>('system');

    // Initial load
    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const storedCurrency = await AsyncStorage.getItem('settings_currency');
            const storedTheme = await AsyncStorage.getItem('settings_theme');

            if (storedCurrency) setCurrencyState(storedCurrency as Currency);
            if (storedTheme) setThemeState(storedTheme as Theme);
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

    const currentTheme = theme === 'system' ? (systemColorScheme || 'light') : theme;

    return (
        <SettingsContext.Provider value={{
            currency,
            setCurrency,
            theme,
            setTheme,
            toggleTheme,
            currentTheme
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
