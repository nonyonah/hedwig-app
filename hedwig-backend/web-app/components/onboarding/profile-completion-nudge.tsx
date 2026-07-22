'use client';

import Link from 'next/link';
import { usePostHog } from 'posthog-js/react';
import { useState } from 'react';
import { User, X, ArrowRight } from '@/components/ui/lucide-icons';
import { Button } from '@/components/ui/button';

const DISMISS_STORAGE_KEY = 'hedwig_profile_nudge_dismissed';

export function ProfileCompletionNudge({
  userKey,
  firstName,
  lastName,
}: {
  userKey: string;
  firstName: string;
  lastName: string;
}) {
  const posthog = usePostHog();
  const storageKey = `${DISMISS_STORAGE_KEY}:${userKey}`;
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === 'true';
    } catch {
      return false;
    }
  });

  const nameComplete = firstName.trim() && lastName.trim();
  if (nameComplete || dismissed) return null;

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-accent-soft)]">
            <User className="h-4 w-4 text-[var(--color-primary)]" weight="bold" />
          </div>
          <div>
            <p className="text-[14px] font-semibold text-[var(--color-foreground)]">Complete your profile</p>
            <p className="text-[12px] text-[var(--color-text-tertiary)]">
              Add your name so we know who you are. Add your phone number so we can help faster.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              try { localStorage.setItem(storageKey, 'true'); } catch {}
              setDismissed(true);
              posthog?.capture?.('profile_nudge_dismissed', {});
            }}
            className="h-8 w-8 rounded-lg p-0 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
          >
            <X className="h-3.5 w-3.5" weight="bold" />
          </Button>
          <Button
            variant="default"
            size="sm"
            className="create-btn"
            asChild
            onClick={() => posthog?.capture?.('profile_nudge_completed', {})}
          >
            <Link href="/settings">
              Complete
              <ArrowRight className="ml-1 h-3 w-3" weight="bold" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
