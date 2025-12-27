import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDING_STORAGE_KEY = '@hedwig_onboarding_state';

export interface OnboardingState {
    hasSeenChatTip: boolean;
    hasSeenProjectsTip: boolean;
    hasSeenClientsTip: boolean;
    hasSeenSidebarTip: boolean;
    hasSeenInvoicesTip: boolean;
    hasSeenPaymentLinksTip: boolean;
    isFirstLaunch: boolean;
}

const DEFAULT_STATE: OnboardingState = {
    hasSeenChatTip: false,
    hasSeenProjectsTip: false,
    hasSeenClientsTip: false,
    hasSeenSidebarTip: false,
    hasSeenInvoicesTip: false,
    hasSeenPaymentLinksTip: false,
    isFirstLaunch: true,
};

export type TipId = keyof Omit<OnboardingState, 'isFirstLaunch'>;

export function useOnboarding() {
    const [state, setState] = useState<OnboardingState>(DEFAULT_STATE);
    const [isLoaded, setIsLoaded] = useState(false);

    // Load onboarding state from storage
    useEffect(() => {
        const loadState = async () => {
            try {
                const stored = await AsyncStorage.getItem(ONBOARDING_STORAGE_KEY);
                if (stored) {
                    const parsed = JSON.parse(stored) as OnboardingState;
                    setState({ ...DEFAULT_STATE, ...parsed, isFirstLaunch: false });
                }
            } catch (error) {
                console.error('[useOnboarding] Failed to load state:', error);
            } finally {
                setIsLoaded(true);
            }
        };
        loadState();
    }, []);

    // Save state to storage whenever it changes
    const saveState = useCallback(async (newState: OnboardingState) => {
        try {
            await AsyncStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(newState));
        } catch (error) {
            console.error('[useOnboarding] Failed to save state:', error);
        }
    }, []);

    // Mark a tip as seen
    const markTipAsSeen = useCallback(async (tipId: TipId) => {
        const newState = { ...state, [tipId]: true, isFirstLaunch: false };
        setState(newState);
        await saveState(newState);
    }, [state, saveState]);

    // Check if a tip should be shown
    const shouldShowTip = useCallback((tipId: TipId) => {
        if (!isLoaded) return false;
        return !state[tipId];
    }, [state, isLoaded]);

    // Reset all onboarding (for testing)
    const resetOnboarding = useCallback(async () => {
        setState(DEFAULT_STATE);
        await AsyncStorage.removeItem(ONBOARDING_STORAGE_KEY);
    }, []);

    return {
        state,
        isLoaded,
        markTipAsSeen,
        shouldShowTip,
        resetOnboarding,
    };
}
