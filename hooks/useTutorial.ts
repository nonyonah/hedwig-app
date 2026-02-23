import { useCallback } from 'react';
import { useTutorialContext } from '../context/TutorialContext';
import type { TutorialStep } from '../constants/tutorialSteps';

/**
 * Public API for controlling and reading tutorial state from any screen.
 *
 * Usage:
 *   const { shouldShowOnScreen, startTutorial, resetTutorial } = useTutorial();
 */
export function useTutorial() {
    const ctx = useTutorialContext();

    /**
     * Trigger the tutorial to start from the beginning.
     * Typically called on first launch after auth.
     */
    const startTutorial = useCallback(() => {
        ctx.startTutorial();
    }, [ctx]);

    /**
     * Reset completion state (clear AsyncStorage flag) and optionally restart.
     * Call from Settings "Replay tutorial" row.
     */
    const replayTutorial = useCallback(async () => {
        await ctx.resetTutorial();
        ctx.startTutorial();
    }, [ctx]);

    return {
        /** Whether the tutorial is currently active and showing */
        isVisible: ctx.isVisible,
        /** Whether the tutorial has been completed or skipped */
        isCompleted: ctx.isCompleted,
        /** Whether AsyncStorage has been read — safe to gate first-launch logic on this */
        isLoaded: ctx.isLoaded,
        /** The current 0-based step index */
        activeStepIndex: ctx.activeStepIndex,
        /** The current step data (null when tutorial not visible) */
        activeStep: ctx.activeStep,
        /** Total number of steps */
        totalSteps: ctx.totalSteps,
        /** Returns true when tutorial is active and the current step belongs to the given screen */
        shouldShowOnScreen: ctx.shouldShowOnScreen,
        /** Navigate to the next step (or finish) */
        nextStep: ctx.nextStep,
        /** Navigate to the previous step */
        prevStep: ctx.prevStep,
        /** Skip the entire tutorial */
        skipTutorial: ctx.skipTutorial,
        /** Start tutorial from step 1 */
        startTutorial,
        /** Reset and restart — for Settings "Replay walkthrough" */
        replayTutorial,
    };
}
