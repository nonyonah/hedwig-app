'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { WEB_TOTAL_STEPS, WEB_TUTORIAL_STEPS } from './tutorial-steps';
import type { WebTutorialStep } from './tutorial-steps';

const STORAGE_KEY = 'hedwig_web_tutorial_v1_completed';

interface TutorialContextType {
  activeStepIndex: number;
  activeStep: WebTutorialStep | null;
  isVisible: boolean;
  totalSteps: number;
  /** True when tutorial is active AND current pathname matches the step's route */
  shouldShow: boolean;
  nextStep: () => void;
  prevStep: () => void;
  skipTutorial: () => void;
  resetTutorial: () => void;
}

const TutorialContext = createContext<TutorialContextType | undefined>(undefined);

export function TutorialProvider({
  children,
  isDemo = false,
}: {
  children: React.ReactNode;
  isDemo?: boolean;
}) {
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (isDemo) {
      // Always show tutorial for demo sessions
      const t = setTimeout(() => setIsVisible(true), 900);
      return () => clearTimeout(t);
    }
    // Real users: only show if not yet completed
    const completed = typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEY) === 'true';
    if (!completed) {
      const t = setTimeout(() => setIsVisible(true), 900);
      return () => clearTimeout(t);
    }
  }, [isDemo]);

  const markComplete = useCallback(() => {
    if (!isDemo) localStorage.setItem(STORAGE_KEY, 'true');
  }, [isDemo]);

  const nextStep = useCallback(() => {
    const next = activeStepIndex + 1;
    if (next >= WEB_TOTAL_STEPS) {
      setIsVisible(false);
      markComplete();
      return;
    }
    const nextRoute = WEB_TUTORIAL_STEPS[next].route;
    const currentRoute = WEB_TUTORIAL_STEPS[activeStepIndex].route;
    setActiveStepIndex(next);
    if (nextRoute !== currentRoute) {
      router.push(nextRoute);
    }
  }, [activeStepIndex, markComplete, router]);

  const prevStep = useCallback(() => {
    const prev = Math.max(0, activeStepIndex - 1);
    const prevRoute = WEB_TUTORIAL_STEPS[prev].route;
    const currentRoute = WEB_TUTORIAL_STEPS[activeStepIndex].route;
    setActiveStepIndex(prev);
    if (prevRoute !== currentRoute) {
      router.push(prevRoute);
    }
  }, [activeStepIndex, router]);

  const skipTutorial = useCallback(() => {
    setIsVisible(false);
    markComplete();
  }, [markComplete]);

  const resetTutorial = useCallback(() => {
    if (!isDemo) localStorage.removeItem(STORAGE_KEY);
    setActiveStepIndex(0);
    setIsVisible(true);
    router.push(WEB_TUTORIAL_STEPS[0].route);
  }, [isDemo, router]);

  const activeStep = isVisible ? WEB_TUTORIAL_STEPS[activeStepIndex] ?? null : null;
  const shouldShow = Boolean(
    isVisible && activeStep && pathname.startsWith(activeStep.route)
  );

  return (
    <TutorialContext.Provider
      value={{
        activeStepIndex,
        activeStep,
        isVisible,
        totalSteps: WEB_TOTAL_STEPS,
        shouldShow,
        nextStep,
        prevStep,
        skipTutorial,
        resetTutorial,
      }}
    >
      {children}
    </TutorialContext.Provider>
  );
}

export function useTutorial() {
  const ctx = useContext(TutorialContext);
  if (!ctx) throw new Error('useTutorial must be used within TutorialProvider');
  return ctx;
}
