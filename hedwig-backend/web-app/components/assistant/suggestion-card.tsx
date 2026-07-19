'use client';

import { useState } from 'react';
import {
  CheckCircle,
  Warning,
} from '@/components/ui/lucide-icons';
import { cn } from '@/lib/utils';
import type { AssistantSuggestion } from '@/lib/types/assistant';
import { SUGGESTION_META, getConfidenceBadge, getEntityBadges } from './suggestion-meta';

interface SuggestionCardProps {
  suggestion: AssistantSuggestion;
  onReview: (s: AssistantSuggestion) => void;
  onQuickReject: (id: string) => void;
}

export function SuggestionCard({ suggestion, onReview, onQuickReject }: SuggestionCardProps) {
  const [rejecting, setRejecting] = useState(false);
  const cfg = SUGGESTION_META[suggestion.type] ?? SUGGESTION_META.invoice_reminder;
  const Icon = cfg.icon;
  const confidence = getConfidenceBadge(suggestion.confidenceScore);
  const badges = getEntityBadges(suggestion);
  const actions = Array.isArray(suggestion.actions) ? suggestion.actions : [];
  const primaryActionLabel = actions[0]?.label || 'Review';

  const handleReject = async () => {
    setRejecting(true);
    await fetch(`/api/assistant/suggestions/${suggestion.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'dismissed' }),
    }).catch(() => {});
    onQuickReject(suggestion.id);
  };

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 transition-shadow hover:shadow-sm">
      <div className="flex items-start gap-3">
        <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', cfg.bg)}>
          <Icon className={cn('h-4 w-4', cfg.color)} weight="fill" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-medium text-[var(--color-text-tertiary)]">{cfg.label}</span>
            <span className="inline-flex items-center rounded-full bg-[var(--color-surface-tertiary)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-text-tertiary)]">
              {confidence.label}
            </span>
          </div>

          <p className="mt-1 text-[13px] font-medium leading-snug text-[var(--color-text-secondary)]">{suggestion.title}</p>
          <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-[var(--color-text-tertiary)]">{suggestion.description}</p>

          {badges.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {badges.slice(0, 3).map((badge) => (
                <span key={badge} className="inline-flex items-center rounded-md bg-[var(--color-background)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-text-secondary)]">
                  {badge}
                </span>
              ))}
            </div>
          )}

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => onReview(suggestion)}
              className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-primary)] px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-[var(--color-primary-dark)]"
            >
              <CheckCircle className="h-3 w-3" weight="bold" />
              {primaryActionLabel}
            </button>
            <button
              type="button"
              onClick={handleReject}
              disabled={rejecting}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-transparent px-3 py-1.5 text-[12px] font-semibold text-[var(--color-text-tertiary)] transition-colors hover:border-[var(--color-danger-soft)] hover:text-[var(--color-danger)] disabled:opacity-50"
            >
              <Warning className="h-3 w-3" />
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
