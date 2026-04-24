'use client';

import { useState } from 'react';
import { Info } from '@/components/ui/lucide-icons';
import type { SuggestedEntity } from '@/lib/types/import-review';

export function SuggestionReasonPanel({ suggestion }: { suggestion: SuggestedEntity }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-[#e9eaeb] bg-[#fcfcfd]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white ring-1 ring-[#e9eaeb]">
            <Info className="h-4 w-4 text-[#717680]" />
          </span>
          <div>
            <p className="text-[12px] font-semibold text-[#181d27]">Why this suggestion?</p>
            <p className="text-[12px] text-[#717680]">{suggestion.reason_summary}</p>
          </div>
        </div>
        <span className="text-[11px] font-semibold text-[#2563eb]">{open ? 'Hide details' : 'Show details'}</span>
      </button>

      {open && (
        <div className="border-t border-[#e9eaeb] px-4 py-4">
          <ul className="space-y-2 text-[12px] leading-5 text-[#414651]">
            {suggestion.reason_details.map((detail) => (
              <li key={detail} className="rounded-xl bg-white px-3 py-2 ring-1 ring-[#f2f4f7]">
                {detail}
              </li>
            ))}
          </ul>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {suggestion.source_signals.map((signal) => (
              <div key={signal.id} className="rounded-xl bg-white px-3 py-2 ring-1 ring-[#f2f4f7]">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#a4a7ae]">{signal.label}</p>
                <p className="mt-1 text-[12px] font-medium text-[#181d27]">{signal.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
