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
      <div className="rounded-2xl border border-dashed border-[var(--color-border-input)] bg-[var(--color-background)] px-4 py-4 text-[12px] text-[var(--color-text-tertiary)]">
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
                ? 'border-[var(--color-accent-soft)] bg-[var(--color-accent-soft)] shadow-sm'
                : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-border-input)] hover:bg-[var(--color-background)]'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-[13px] font-semibold text-[var(--color-foreground)]">{candidate.name}</p>
                  {selected ? <CheckCircle className="h-4 w-4 text-[var(--color-accent)]" /> : null}
                </div>
                {candidate.subtitle ? <p className="mt-1 text-[12px] text-[var(--color-text-tertiary)]">{candidate.subtitle}</p> : null}
              </div>
              <ConfidenceIndicator score={candidate.similarity_score} tier={candidate.confidence_tier} compact />
            </div>

            <p className="mt-3 text-[12px] leading-5 text-[var(--color-text-secondary)]">{candidate.reason_summary}</p>

            {candidate.conflict_labels?.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {candidate.conflict_labels.map((label) => (
                  <span
                    key={label}
                    className="inline-flex items-center gap-1 rounded-full bg-[var(--color-warning-soft)] px-2 py-1 text-[10px] font-semibold text-[var(--color-warning)] ring-1 ring-[var(--color-warning-soft)]"
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
