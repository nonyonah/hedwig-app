'use client';

import { useEffect, useState } from 'react';
import { usePostHog } from 'posthog-js/react';
import { Alert } from '@heroui/react';
import { Button } from '@/components/ui/button';
import { X, CalendarBlank } from '@/components/ui/lucide-icons';
import { useWorkspaceContext } from '@/lib/workspace/workspace-context';
import { hedwigApi } from '@/lib/api/client';
import {
  CALENDLY_DEMO_URL,
  DEMO_BOOKED_LOCALSTORAGE_KEY,
  DEMO_BANNER_DISMISSED_KEY,
} from '@/lib/demo';

/**
 * Small dismissible banner shown on the dashboard to logged-in users who
 * haven't booked a demo. Hidden while the welcome modal is the active
 * surface (`suppressed`), permanently hidden once dismissed or booked.
 */
export function DemoBanner({ suppressed = false }: { suppressed?: boolean }) {
  const posthog = usePostHog();
  const { accessToken } = useWorkspaceContext();
  const [hidden, setHidden] = useState(false);

  const shouldHide = suppressed || hidden;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const dismissed = window.localStorage.getItem(DEMO_BANNER_DISMISSED_KEY) === '1';
    const booked = window.localStorage.getItem(DEMO_BOOKED_LOCALSTORAGE_KEY) === '1';
    if (dismissed || booked) setHidden(true);
  }, []);

  useEffect(() => {
    if (!shouldHide) {
      posthog?.capture?.('dashboard_demo_banner_shown');
    }
  }, [shouldHide, posthog]);

  if (shouldHide) return null;

  const handleBookDemo = () => {
    posthog?.capture?.('dashboard_demo_banner_clicked');
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DEMO_BOOKED_LOCALSTORAGE_KEY, '1');
      window.open(CALENDLY_DEMO_URL, '_blank', 'noopener,noreferrer');
    }
    if (accessToken) {
      hedwigApi.demoBooked({ accessToken }).catch(() => {});
    }
    setHidden(true);
  };

  const handleDismiss = () => {
    posthog?.capture?.('dashboard_demo_banner_dismissed');
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DEMO_BANNER_DISMISSED_KEY, '1');
    }
    setHidden(true);
  };

  return (
    <div className="mb-6">
      <Alert status="accent">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>Get the most out of Hedwig</Alert.Title>
          <Alert.Description>
            Book a 15-minute demo and I&rsquo;ll show you around — payments, invoicing, and
            bookkeeping.
          </Alert.Description>
          <div className="mt-3 flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={handleBookDemo}>
              <CalendarBlank className="h-3.5 w-3.5" weight="bold" />
              Book a demo
            </Button>
            <Button variant="ghost" size="sm" onClick={handleDismiss}>
              Dismiss
            </Button>
          </div>
        </Alert.Content>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss demo banner"
          className="shrink-0 rounded-md p-1 text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-surface-secondary)] hover:text-[var(--color-foreground)]"
        >
          <X className="h-4 w-4" weight="bold" />
        </button>
      </Alert>
    </div>
  );
}
