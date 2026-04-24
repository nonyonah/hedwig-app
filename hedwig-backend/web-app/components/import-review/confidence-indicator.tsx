'use client';

import type { ConfidenceTier } from '@/lib/types/import-review';

const toneByTier: Record<ConfidenceTier, { label: string; pill: string; bar: string; helper: string }> = {
  high: {
    label: 'High confidence',
    pill: 'bg-[#ecfdf3] text-[#027a48] ring-1 ring-[#abefc6]',
    bar: 'bg-[#12b76a]',
    helper: 'Signals are aligned, but approval is still required.',
  },
  medium: {
    label: 'Medium confidence',
    pill: 'bg-[#fffaeb] text-[#b54708] ring-1 ring-[#fedf89]',
    bar: 'bg-[#f79009]',
    helper: 'Looks plausible, but you should review the match.',
  },
  low: {
    label: 'Low confidence',
    pill: 'bg-[#fef3f2] text-[#b42318] ring-1 ring-[#fecdca]',
    bar: 'bg-[#f04438]',
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
    <div className="rounded-2xl bg-[#f9fafb] p-3">
      <div className="flex items-center justify-between gap-3">
        <span className={`inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold ${tone.pill}`}>
          {tone.label}
        </span>
        <span className="text-[12px] font-semibold text-[#181d27]">{pct}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e9eaeb]">
        <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-[12px] leading-5 text-[#717680]">{tone.helper}</p>
    </div>
  );
}
