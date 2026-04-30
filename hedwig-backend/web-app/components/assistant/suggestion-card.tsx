'use client';

import { useState } from 'react';
import {
  CheckCircle,
  Warning,
} from '@/components/ui/lucide-icons';
import { cn } from '@/lib/utils';
import type { AssistantSuggestion } from '@/lib/types/assistant';
import { SUGGESTION_META, getConfidenceBadge, getEntityBadges, getPriorityBadge } from './suggestion-meta';

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
  const priority = getPriorityBadge(suggestion.priority);
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
    <div className="rounded-xl border border-[#e9eaeb] bg-white p-3 transition-shadow hover:shadow-sm">
      <div className="flex items-start gap-3">
        <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', cfg.bg)}>
          <Icon className={cn('h-4 w-4', cfg.color)} weight="fill" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cn('text-[10px] font-bold uppercase tracking-wider', cfg.color)}>{cfg.label}</span>
            <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold', confidence.color)}>
              {confidence.label}
            </span>
            <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold', priority.color)}>
              {priority.label}
            </span>
          </div>

          <p className="mt-1 text-[13px] font-semibold leading-snug text-[#181d27]">{suggestion.title}</p>
          <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-[#717680]">{suggestion.description}</p>

          {badges.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {badges.slice(0, 3).map((badge) => (
                <span key={badge} className="inline-flex items-center rounded-md bg-[#f9fafb] px-2 py-0.5 text-[11px] font-medium text-[#414651]">
                  {badge}
                </span>
              ))}
            </div>
          )}

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => onReview(suggestion)}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#2563eb] px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-[#1d4ed8]"
            >
              <CheckCircle className="h-3 w-3" weight="bold" />
              {primaryActionLabel}
            </button>
            <button
              type="button"
              onClick={handleReject}
              disabled={rejecting}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#e9eaeb] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#717680] transition-colors hover:bg-[#fef3f2] hover:text-[#b42318] hover:border-[#fecdca] disabled:opacity-50"
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
