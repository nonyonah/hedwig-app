'use client';

import { CheckCircle, WarningCircle } from '@/components/ui/lucide-icons';
import type { ExistingMatchCandidate } from '@/lib/types/import-review';
import { ConfidenceIndicator } from './confidence-indicator';

export function ExistingMatchList({
  candidates,
  selectedId,
  onSelect,
}: {
  candidates: ExistingMatchCandidate[];
  selectedId?: string;
  onSelect: (candidateId: string) => void;
}) {
  if (!candidates.length) {
    return (
      <div className="rounded-2xl border border-dashed border-[#d5d7da] bg-[#fcfcfd] px-4 py-4 text-[12px] text-[#717680]">
        No existing alternatives were found for this suggestion.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {candidates.map((candidate) => {
        const selected = candidate.id === selectedId;
        return (
          <button
            key={candidate.id}
            type="button"
            onClick={() => onSelect(candidate.id)}
            className={`w-full rounded-2xl border p-4 text-left transition ${
              selected
                ? 'border-[#84caff] bg-[#eff8ff] shadow-sm'
                : 'border-[#e9eaeb] bg-white hover:border-[#d0d5dd] hover:bg-[#fcfcfd]'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-[13px] font-semibold text-[#181d27]">{candidate.name}</p>
                  {selected ? <CheckCircle className="h-4 w-4 text-[#2563eb]" /> : null}
                </div>
                {candidate.subtitle ? <p className="mt-1 text-[12px] text-[#717680]">{candidate.subtitle}</p> : null}
              </div>
              <ConfidenceIndicator score={candidate.similarity_score} tier={candidate.confidence_tier} compact />
            </div>

            <p className="mt-3 text-[12px] leading-5 text-[#414651]">{candidate.reason_summary}</p>

            {candidate.conflict_labels?.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {candidate.conflict_labels.map((label) => (
                  <span
                    key={label}
                    className="inline-flex items-center gap-1 rounded-full bg-[#fffaeb] px-2 py-1 text-[10px] font-semibold text-[#b54708] ring-1 ring-[#fedf89]"
                  >
                    <WarningCircle className="h-3 w-3" />
                    {label}
                  </span>
                ))}
              </div>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
