'use client';

import type { ConfidenceTier } from '@/lib/types/import-review';

const toneByTier: Record<ConfidenceTier, { label: string; pill: string; bar: string; helper: string }> = {
  high: {
    label: 'High confidence',
    pill: 'bg-[var(--color-success-soft)] text-[var(--color-success)] ring-1 ring-[var(--color-success-soft)]',
    bar: 'bg-[var(--color-success)]',
    helper: 'Signals are aligned, but approval is still required.',
  },
  medium: {
    label: 'Medium confidence',
    pill: 'bg-[var(--color-warning-soft)] text-[var(--color-warning)] ring-1 ring-[var(--color-warning-soft)]',
    bar: 'bg-[var(--color-warning)]',
    helper: 'Looks plausible, but you should review the match.',
  },
  low: {
    label: 'Low confidence',
    pill: 'bg-[var(--color-danger-soft)] text-[var(--color-danger)] ring-1 ring-[var(--color-danger-soft)]',
    bar: 'bg-[var(--color-danger)]',
    helper: 'Manual review is strongly recommended.',
  },
};

export function ConfidenceIndicator({
  score,
  tier,
  compact = false,
}: {
  score: number;
  tier: ConfidenceTier;
  compact?: boolean;
}) {
  const tone = toneByTier[tier];
  const pct = Math.round(score * 100);

  if (compact) {
    return (
      <span className={`inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold ${tone.pill}`}>
        {tone.label} · {pct}%
      </span>
    );
  }

  return (
    <div className="rounded-2xl bg-[var(--color-background)] p-3">
      <div className="flex items-center justify-between gap-3">
        <span className={`inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold ${tone.pill}`}>
          {tone.label}
        </span>
        <span className="text-[12px] font-semibold text-[var(--color-foreground)]">{pct}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--color-border)]">
        <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-[12px] leading-5 text-[var(--color-text-tertiary)]">{tone.helper}</p>
    </div>
  );
}
