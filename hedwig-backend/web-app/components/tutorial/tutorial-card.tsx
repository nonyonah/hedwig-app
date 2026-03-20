'use client';

import { useEffect, useState } from 'react';
import { useTutorial } from './tutorial-provider';

export function TutorialCard() {
  const { activeStep, activeStepIndex, totalSteps, shouldShow, nextStep, prevStep, skipTutorial } = useTutorial();
  const [visible, setVisible] = useState(false);

  // Animate in/out
  useEffect(() => {
    if (shouldShow) {
      const t = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(t);
    } else {
      setVisible(false);
    }
  }, [shouldShow, activeStepIndex]);

  if (!shouldShow && !visible) return null;

  const isFirst = activeStepIndex === 0;
  const isLast = activeStepIndex === totalSteps - 1;
  const step = activeStepIndex + 1;
  const position = activeStep?.position ?? 'center';

  const positionClass =
    position === 'top'
      ? 'top-20'
      : position === 'bottom'
        ? 'bottom-8'
        : 'top-1/2 -translate-y-1/2';

  return (
    // Overlay — pointer-events-none so users can still see/interact with background
    <div className="pointer-events-none fixed inset-0 z-50">
      {/* Dim backdrop — also pointer-events-none so it doesn't block clicks */}
      <div
        className="absolute inset-0 bg-black/40 transition-opacity duration-200"
        style={{ opacity: visible ? 1 : 0 }}
      />

      {/* Card */}
      <div
        className={`pointer-events-auto absolute left-1/2 w-full max-w-md -translate-x-1/2 px-4 ${positionClass}`}
        style={{
          opacity: visible ? 1 : 0,
          transform: `translateX(-50%) translateY(${visible ? '0px' : '12px'})${position === 'center' ? ' translateY(calc(-50% + 0px))' : ''}`,
          transition: 'opacity 220ms ease, transform 220ms ease',
        }}
      >
        <div className="overflow-hidden rounded-2xl bg-white shadow-[0_16px_48px_rgba(0,0,0,0.18)] ring-1 ring-[#e9eaeb]">
          {/* Brand accent bar */}
          <div className="h-[3px] w-full bg-[#2563eb]" />

          {/* Step indicator + Skip */}
          <div className="flex items-center justify-between px-5 pt-4">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a4a7ae]">
              {step} of {totalSteps}
            </span>
            <button
              onClick={skipTutorial}
              className="text-[13px] font-medium text-[#717680] transition-colors hover:text-[#181d27]"
            >
              Skip
            </button>
          </div>

          {/* Progress bar */}
          <div className="mx-5 mt-3 h-1 overflow-hidden rounded-full bg-[#f2f4f7]">
            <div
              className="h-full rounded-full bg-[#2563eb] transition-all duration-300"
              style={{ width: `${(step / totalSteps) * 100}%` }}
            />
          </div>

          {/* Content */}
          <div className="px-5 pb-2 pt-4">
            <h3 className="text-[17px] font-bold tracking-[-0.03em] text-[#181d27]">
              {activeStep?.title}
            </h3>
            <p className="mt-2 text-[14px] leading-[1.7] text-[#717680]">
              {activeStep?.body}
            </p>
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between px-5 pb-5 pt-4">
            <button
              onClick={prevStep}
              disabled={isFirst}
              className="inline-flex h-9 items-center justify-center rounded-full border border-[#d5d7da] px-5 text-[13px] font-semibold text-[#344054] transition-all hover:border-[#c0c3c9] hover:bg-[#f9fafb] disabled:cursor-not-allowed disabled:opacity-30"
            >
              Back
            </button>
            <button
              onClick={nextStep}
              className="inline-flex h-9 items-center justify-center rounded-full bg-[#2563eb] px-6 text-[13px] font-semibold text-white shadow-[0_4px_12px_rgba(37,99,235,0.22)] transition-all hover:bg-[#1d4ed8] hover:shadow-[0_6px_16px_rgba(37,99,235,0.3)]"
            >
              {isLast ? 'Done' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
