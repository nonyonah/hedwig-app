'use client';

import { useEffect } from 'react';
import { usePostHog } from 'posthog-js/react';
import { Button } from '@/components/ui/button';
import { X, CalendarBlank, Sparkle } from '@/components/ui/lucide-icons';
import { useWorkspaceContext } from '@/lib/workspace/workspace-context';
import { hedwigApi } from '@/lib/api/client';
import {
  CALENDLY_DEMO_URL,
  DEMO_BOOKED_LOCALSTORAGE_KEY,
  WELCOME_DEMO_MODAL_DISMISSED_KEY,
} from '@/lib/demo';

/**
 * One-time welcome modal shown to brand-new users right after signup.
 * Dismissible, non-blocking, and only appears once (state persisted to
 * localStorage). "Book a demo" opens Calendly in a new tab and marks the
 * user as booked so the reminder email is suppressed.
 */
export function WelcomeDemoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const posthog = usePostHog();
  const { accessToken } = useWorkspaceContext();

  useEffect(() => {
    if (!open) return;
    posthog?.capture?.('welcome_demo_modal_shown');
  }, [open, posthog]);

  if (!open) return null;

  const handleBookDemo = () => {
    posthog?.capture?.('welcome_demo_modal_cta_clicked');
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DEMO_BOOKED_LOCALSTORAGE_KEY, '1');
      window.open(CALENDLY_DEMO_URL, '_blank', 'noopener,noreferrer');
    }
    if (accessToken) {
      hedwigApi.demoBooked({ accessToken }).catch(() => {});
    }
    onClose();
  };

  const handleMaybeLater = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(WELCOME_DEMO_MODAL_DISMISSED_KEY, '1');
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[var(--color-foreground)]/30 px-4 backdrop-blur-[2px]">
      <div className="relative w-full max-w-[400px] overflow-hidden rounded-[28px] bg-[var(--color-surface)] shadow-[0_28px_100px_rgba(24,29,39,0.24)] ring-1 ring-black/5">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleMaybeLater}
          aria-label="Close welcome"
          className="absolute right-4 top-4 z-10 h-8 w-8 rounded-full bg-[var(--color-surface)]/75 text-[var(--color-text-muted)] shadow-sm hover:bg-[var(--color-surface)] hover:text-[var(--color-text-secondary)]"
        >
          <X className="h-3.5 w-3.5" weight="bold" />
        </Button>

        <div className="relative flex h-[176px] items-center justify-center overflow-hidden bg-[var(--color-surface-secondary)]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_18%,rgba(37,99,235,0.18),transparent_38%),radial-gradient(circle_at_78%_12%,rgba(22,163,74,0.12),transparent_30%)]" />
          <div className="relative flex h-[68px] w-[68px] items-center justify-center rounded-[22px] bg-[var(--color-surface)] shadow-[0_18px_50px_rgba(24,29,39,0.15)] ring-1 ring-black/5">
            <Sparkle className="h-7 w-7 text-[var(--color-primary)]" weight="fill" />
          </div>
        </div>

        <div className="px-7 pb-6 pt-6 text-center">
          <h2 className="text-[22px] font-bold tracking-[-0.03em] text-[var(--color-foreground)]">
            Welcome to Hedwig 👋
          </h2>
          <p className="mx-auto mt-2 max-w-[320px] text-[14px] leading-6 text-[var(--color-text-tertiary)]">
            Your workspace is ready. Want a quick tour? Book a 15-minute demo and I&rsquo;ll show
            you around — payments, invoicing, and bookkeeping.
          </p>

          <Button
            variant="default"
            size="lg"
            onClick={handleBookDemo}
            className="create-btn mt-6 w-full rounded-xl"
          >
            <CalendarBlank className="h-4 w-4" weight="bold" />
            Book a demo
          </Button>
          <button
            type="button"
            onClick={handleMaybeLater}
            className="mt-3 w-full rounded-xl py-2 text-[13px] font-semibold text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-foreground)]"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
