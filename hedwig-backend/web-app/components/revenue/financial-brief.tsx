'use client';

import { useEffect, useState } from 'react';
import { Alert } from '@heroui/react';
import { X } from '@/components/ui/lucide-icons';
import { hedwigApi } from '@/lib/api/client';

function stripMarkdown(text: string): string {
  return text.replace(/\*\*(.*?)\*\*/g, '$1');
}

function getDismissKey(mode: 'brief' | 'narrative', range: string): string {
  const month = new Date().toISOString().slice(0, 7);
  return `hedwig:brief-dismissed:${mode}:${range}:${month}`;
}

/**
 * Merged Financial Brief (Alert design from Reports, dismissible, no metrics).
 * - `brief` mode: revenue page — AI headline from /api/revenue/brief.
 * - `narrative` mode: reports screen — narrative from /api/revenue/ledger/narrative.
 */
export function FinancialBrief({
  accessToken,
  range = '30d',
  mode = 'brief',
}: {
  accessToken: string | null;
  range?: string;
  mode?: 'brief' | 'narrative';
}) {
  const [text, setText] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const dismissKey = getDismissKey(mode, range);

  useEffect(() => {
    let active = true;
    setText(null);
    if (typeof window !== 'undefined' && localStorage.getItem(dismissKey)) {
      setDismissed(true);
      return;
    }
    const load =
      mode === 'brief'
        ? hedwigApi
            .revenueBrief(range, { accessToken: accessToken ?? undefined })
            .then((data) => (data.display && data.headline.length > 0 ? data.headline : null))
        : hedwigApi
            .ledgerNarrative(range, { accessToken: accessToken ?? undefined })
            .then((data) => (data.narrative ? stripMarkdown(data.narrative) : null));
    load
      .then((value) => {
        if (active) setText(value);
      })
      .catch(() => {
        if (active) setText(null);
      });
    return () => {
      active = false;
    };
  }, [mode, range, accessToken, dismissKey]);

  if (dismissed || text === null) return null;

  return (
    <div className="relative">
      <Alert status="accent">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Description>{text}</Alert.Description>
        </Alert.Content>
      </Alert>
      <button
        type="button"
        aria-label="Dismiss brief"
        onClick={() => {
          setDismissed(true);
          try {
            localStorage.setItem(dismissKey, '1');
          } catch {}
        }}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-background)] hover:text-[var(--color-foreground)]"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
