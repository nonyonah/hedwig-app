import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TUTORIAL_STEPS, TutorialStep, TOTAL_STEPS } from '../constants/tutorialSteps';

const STORAGE_KEY = '@hedwig_tutorial_v2_completed';

interface TutorialContextType {
    /** Index of the currently active step (0-based) */
    activeStepIndex: number;
    /** The current step object */
    activeStep: TutorialStep | null;
    /** Whether the tutorial card is visible right now */
    isVisible: boolean;
    /** Total number of steps */
    totalSteps: number;
    /** Whether the user has ever completed/skipped the tutorial */
    isCompleted: boolean;
    /** Whether the context has finished loading from AsyncStorage */
    isLoaded: boolean;
    /** Start or restart the tutorial from step 0 */
    startTutorial: () => void;
    /** Advance to the next step (or finish if on last) */
    nextStep: () => void;
    /** Go back one step */
    prevStep: () => void;
    /** Skip the whole tutorial immediately */
    skipTutorial: () => void;
    /** Reset completion state so tutorial shows again (for Settings replay) */
    resetTutorial: () => Promise<void>;
    /** Check if tutorial is active and on a specific screen */
    shouldShowOnScreen: (screenId: TutorialStep['screenId']) => boolean;
}

const TutorialContext = createContext<TutorialContextType | undefined>(undefined);

export const TutorialProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [activeStepIndex, setActiveStepIndex] = useState(0);
    const [isVisible, setIsVisible] = useState(false);
    const [isCompleted, setIsCompleted] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);
    const hasAutoStartedRef = useRef(false);

    // Load persisted completion state on mount
    useEffect(() => {
        const load = async () => {
            try {
                const val = await AsyncStorage.getItem(STORAGE_KEY);
                setIsCompleted(val === 'true');
            } catch {
                // If storage fails, treat as not completed
            } finally {
                setIsLoaded(true);
            }
        };
        load();
    }, []);

    const persist = useCallback(async (completed: boolean) => {
        try {
            await AsyncStorage.setItem(STORAGE_KEY, completed ? 'true' : 'false');
        } catch {
            // non-fatal
        }
    }, []);

    const startTutorial = useCallback(() => {
        hasAutoStartedRef.current = true;
        setActiveStepIndex(0);
        setIsVisible(true);
    }, []);

    // Fail-safe: auto-start for users who have not completed the tutorial.
    useEffect(() => {
        if (!isLoaded || isCompleted || hasAutoStartedRef.current) return;
        hasAutoStartedRef.current = true;
        setActiveStepIndex(0);
        setIsVisible(true);
    }, [isLoaded, isCompleted]);

    const nextStep = useCallback(() => {
        setActiveStepIndex(prev => {
            const next = prev + 1;
            if (next >= TOTAL_STEPS) {
                // Finished all steps
                setIsVisible(false);
                setIsCompleted(true);
                persist(true);
                return prev;
            }
            return next;
        });
    }, [persist]);

    const prevStep = useCallback(() => {
        setActiveStepIndex(prev => Math.max(0, prev - 1));
    }, []);

    const skipTutorial = useCallback(() => {
        setIsVisible(false);
        setIsCompleted(true);
        persist(true);
    }, [persist]);

    const resetTutorial = useCallback(async () => {
        try {
            await AsyncStorage.removeItem(STORAGE_KEY);
        } catch {
            // non-fatal
        }
        hasAutoStartedRef.current = false;
        setIsCompleted(false);
        setActiveStepIndex(0);
        setIsVisible(false);
    }, []);

    const shouldShowOnScreen = useCallback(
        (screenId: TutorialStep['screenId']): boolean => {
            if (!isVisible || !isLoaded) return false;
            const step = TUTORIAL_STEPS[activeStepIndex];
            return step?.screenId === screenId;
        },
        [isVisible, isLoaded, activeStepIndex]
    );

    const activeStep = isVisible ? TUTORIAL_STEPS[activeStepIndex] ?? null : null;

    return (
        <TutorialContext.Provider
            value={{
                activeStepIndex,
                activeStep,
                isVisible,
                totalSteps: TOTAL_STEPS,
                isCompleted,
                isLoaded,
                startTutorial,
                nextStep,
                prevStep,
                skipTutorial,
                resetTutorial,
                shouldShowOnScreen,
            }}
        >
            {children}
        </TutorialContext.Provider>
    );
};

export const useTutorialContext = (): TutorialContextType => {
    const ctx = useContext(TutorialContext);
    if (!ctx) throw new Error('useTutorialContext must be used within a TutorialProvider');
    return ctx;
};
